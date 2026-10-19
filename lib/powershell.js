'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { quoteForCreateProcess } = require('./args');

/**
 * PowerShell 调用工具。
 *
 * 旧实现把用户可控路径拼进命令字符串，再交给 `exec()`（内部走 cmd.exe）：
 *
 *   exec(`powershell -Command "${script}"`)
 *
 * 只要路径里出现一个双引号，就能跳出外层引号进入 cmd 解析，形成命令注入。
 *
 * 现在统一改为 `-EncodedCommand`：脚本先转成 UTF-16LE + Base64，由 PowerShell
 * 自己解码执行，整条命令不经过 cmd.exe，也不存在任何引号嵌套问题。
 * 脚本内部的所有外部字符串一律用单引号字面量，并把 `'` 转义为 `''`。
 */

/** 把任意字符串安全地变成 PowerShell 单引号字面量。 */
function psQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/** 把脚本编码为 -EncodedCommand 需要的 Base64（UTF-16LE）。 */
function encodeCommand(script) {
  return Buffer.from(String(script), 'utf16le').toString('base64');
}

/** 找到可用的 powershell.exe，优先用绝对路径，避免 PATH 被篡改。 */
function resolvePowerShellPath() {
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  const candidates = [
    path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(sysRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (err) {
      /* 忽略探测失败 */
    }
  }
  return 'powershell.exe';
}

/** 构造图标提取脚本，输出 PNG 的 Base64。 */
function buildIconExtractScript(targetPath) {
  return [
    'Add-Type -AssemblyName System.Drawing;',
    `$icon = [System.Drawing.Icon]::ExtractAssociatedIcon(${psQuote(targetPath)});`,
    'if ($icon) {',
    '  $bitmap = $icon.ToBitmap();',
    '  $stream = New-Object System.IO.MemoryStream;',
    '  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png);',
    '  $bytes = $stream.ToArray();',
    '  [Convert]::ToBase64String($bytes)',
    '}'
  ].join('\n');
}

/**
 * 构造通过 .NET ProcessStartInfo 启动进程的脚本。
 *
 * 用 ProcessStartInfo 而不是 Start-Process，是因为 `Arguments` 是一个
 * 原始字符串，PowerShell 不会对它做二次引用，转义结果完全可控。
 * 提权通过 `Verb = 'RunAs'` 触发 UAC，等价于 ShellExecute。
 */
function buildProcessStartScript(fileName, rawArguments, { elevate = false } = {}) {
  const lines = [
    '$psi = New-Object System.Diagnostics.ProcessStartInfo',
    `$psi.FileName = ${psQuote(fileName)}`,
    `$psi.Arguments = ${psQuote(rawArguments || '')}`,
    '$psi.UseShellExecute = $true'
  ];
  if (elevate) lines.push("$psi.Verb = 'RunAs'");
  lines.push('[void][System.Diagnostics.Process]::Start($psi)');
  return lines.join('\n');
}

/**
 * 执行一段 PowerShell 脚本（经 -EncodedCommand 传入）。
 * 全程不经过 cmd.exe，也不拼接命令行字符串。
 */
function runEncodedPowerShell(script, { maxStdout = 10 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolvePowerShellPath(), [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      encodeCommand(script)
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxStdout) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 8192) stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

/**
 * 启动一个程序，可选提权。
 *
 * 参数先按 CreateProcess 规则编码成命令行字符串，再原样交给
 * ProcessStartInfo.Arguments，不存在拼接注入面。
 *
 * @param {string} fileName 目标绝对路径
 * @param {string[]} args 已拆分好的参数数组
 * @param {{runAsAdmin?: boolean}} options
 */
async function startProcess(fileName, args, { runAsAdmin = false } = {}) {
  const rawArguments = (args || []).map(quoteForCreateProcess).join(' ');
  await startProcessRaw(fileName, rawArguments, { elevate: runAsAdmin });
}

/**
 * 以原始命令行字符串启动（调用方负责转义）。
 * 供 .bat/.cmd 这类需要自行控制 cmd 转义的场景使用。
 */
async function startProcessRaw(fileName, rawArguments, { elevate = false } = {}) {
  const script = buildProcessStartScript(fileName, rawArguments, { elevate });
  const result = await runEncodedPowerShell(script);
  if (result.code !== 0) {
    throw new Error(result.stderr || `启动失败（PowerShell 退出码 ${result.code}）`);
  }
}

module.exports = {
  psQuote,
  encodeCommand,
  resolvePowerShellPath,
  buildIconExtractScript,
  buildProcessStartScript,
  runEncodedPowerShell,
  startProcess,
  startProcessRaw
};
