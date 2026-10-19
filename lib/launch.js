'use strict';

const { spawn } = require('child_process');
const { buildCmdCommandLine } = require('./args');
const { startProcessRaw } = require('./powershell');

/**
 * 启动 .bat / .cmd。
 *
 * 批处理不是 PE 可执行文件，必须由 cmd.exe 承载，因此无法完全绕开 cmd 的
 * 解析阶段。这里把参数按 cmd 规则转义后拼成一条命令串（每个参数整体加引号，
 * 内部引号写 `^"`，元字符加 `^`），再以 `cmd /d /s /c` 执行。
 *
 * 该方案已用真实注入载荷验证：不会执行额外命令，参数也能原样到达批处理。
 */
async function launchBatchFile(batchPath, argList, { runAsAdmin = false } = {}) {
  const commandLine = buildCmdCommandLine(batchPath, argList);
  const comspec = process.env.ComSpec || 'cmd.exe';

  if (runAsAdmin) {
    // 提权场景无法直接 spawn，交给 ShellExecute（Verb=RunAs）
    await startProcessRaw(comspec, `/d /s /c ${commandLine}`, { elevate: true });
    return;
  }

  const child = spawn(comspec, ['/d', '/s', '/c', commandLine], {
    detached: true,
    stdio: 'ignore',
    shell: false,
    windowsHide: true,
    windowsVerbatimArguments: true
  });
  child.on('error', (err) => console.error('Launch failed (batch):', err));
  child.unref();
}

module.exports = { launchBatchFile };
