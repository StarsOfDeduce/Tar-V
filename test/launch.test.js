'use strict';

/**
 * 启动链路集成测试：验证参数拆分、无 shell 启动、批处理转义的真实行为。
 * 运行：node test/launch.test.js
 *
 * 这里跑的是生产代码同一条路径（lib/args + lib/powershell + lib/launch），
 * 不依赖 Electron，因此可以直接执行。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { parseWindowsArgs, buildCmdCommandLine } = require('../lib/args');
const { psQuote, runEncodedPowerShell, startProcessRaw } = require('../lib/powershell');
const { launchBatchFile } = require('../lib/launch');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-v-test-'));
const nodeExe = process.execPath;
const comspec = process.env.ComSpec || 'cmd.exe';

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

/** 模拟用户在配置里写的一整串参数（每个参数用双引号包裹）。 */
function toConfigArgs(args) {
  return args.map((arg) => `"${String(arg).replace(/"/g, '""')}"`).join(' ');
}

let counter = 0;

/**
 * 走完整链路：配置字符串 -> parseWindowsArgs -> spawn(shell:false) -> 子进程 argv。
 * 返回子进程实际收到的参数数组。
 */
async function recordArgv(args) {
  const out = path.join(tmpDir, `argv-${counter++}.json`);
  const script = 'require("fs").writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))';
  const parsed = parseWindowsArgs(toConfigArgs([out, ...args]));

  await new Promise((resolve, reject) => {
    const child = spawn(nodeExe, ['-e', script, ...parsed], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore'
    });
    child.on('error', reject);
    child.on('close', resolve);
  });

  return JSON.parse(fs.readFileSync(out, 'utf-8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForFile(filePath, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (fs.existsSync(filePath)) return resolve(true);
      if (Date.now() - started > timeoutMs) return reject(new Error(`等待文件超时: ${filePath}`));
      setTimeout(tick, 50);
    };
    tick();
  });
}

(async () => {
  // ---------------------------------------------------------------- 参数传递
  console.log('\n[参数原样传递]');

  await test('带空格的参数保持完整', async () => {
    const args = ['A B C', 'plain'];
    assert.deepStrictEqual(await recordArgv(args), args);
  });

  await test('shell 元字符不被解释', async () => {
    const args = ['& echo PWNED'];
    assert.deepStrictEqual(await recordArgv(args), args);
  });

  await test('管道与分号作为普通字符', async () => {
    const args = ['a | b ; c > d'];
    assert.deepStrictEqual(await recordArgv(args), args);
  });

  await test('含反斜杠的 Windows 路径不被破坏', async () => {
    const args = ['C:\\Program Files\\App\\app.exe'];
    assert.deepStrictEqual(await recordArgv(args), args);
  });

  await test('多参数混合场景', async () => {
    const args = ['/select,"C:\\a b\\c.exe"', '--flag=x y', '普通参数'];
    assert.deepStrictEqual(await recordArgv(args), args);
  });

  // ---------------------------------------------------------------- PowerShell 编码
  console.log('\n[PowerShell 编码通道]');

  await test('单引号与分号在 PowerShell 字面量中保持原样', async () => {
    const payload = "C:\\a'b;c\\d";
    const result = await runEncodedPowerShell('Write-Output ' + psQuote(payload));
    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout, payload);
  });

  await test('PowerShell 注入载荷不会被执行', async () => {
    const marker = path.join(tmpDir, 'ps-pwned.txt');
    const payload = `x'; Set-Content -Path '${marker}' -Value 'pwned'; '`;
    const result = await runEncodedPowerShell('Write-Output ' + psQuote(payload));
    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout, payload);
    assert.strictEqual(fs.existsSync(marker), false, '注入载荷被执行了');
  });

  // ---------------------------------------------------------------- 批处理启动
  console.log('\n[.bat 启动链路]');

  const batDir = path.join(tmpDir, '有 空格 的目录');
  fs.mkdirSync(batDir, { recursive: true });
  const batPath = path.join(batDir, 'runner.bat');
  const argOut = path.join(batDir, 'arg.txt');
  const ranMarker = path.join(batDir, 'ran.txt');

  fs.writeFileSync(batPath, [
    '@echo off',
    'chcp 65001 >nul',
    '> "%~dp0ran.txt" echo ran',
    '> "%~dp0arg.txt" echo %~1',
    'exit /b 0',
    ''
  ].join('\r\n'));

  await test('.bat 能正常启动', async () => {
    await launchBatchFile(batPath, []);
    await waitForFile(ranMarker);
  });

  await test('.bat 普通参数原样到达', async () => {
    const expected = 'C:\\Program Files\\My App\\a.exe';
    fs.rmSync(argOut, { force: true });
    await launchBatchFile(batPath, [expected]);
    await waitForFile(argOut);
    const received = fs.readFileSync(argOut, 'utf-8').replace(/\r?\n$/, '');
    assert.strictEqual(received, expected);
  });

  await test('.bat 带引号的注入载荷不执行', async () => {
    const pwned = path.join(batDir, 'pwned1.txt');
    await launchBatchFile(batPath, [`& echo PWNED> "${pwned}"`]);
    await sleep(1200);
    assert.strictEqual(fs.existsSync(pwned), false, '参数中的命令被 cmd 解释了');
  });

  await test('.bat 无引号注入载荷不执行', async () => {
    const pwned = path.join(batDir, 'pwned2.txt');
    await launchBatchFile(batPath, [`& echo PWNED> ${pwned}`]);
    await sleep(1200);
    assert.strictEqual(fs.existsSync(pwned), false, '参数中的命令被 cmd 解释了');
  });

  await test('ProcessStartInfo 通道（提权路径）同样不执行注入', async () => {
    const pwned = path.join(batDir, 'pwned3.txt');
    const commandLine = buildCmdCommandLine(batPath, [`& echo PWNED> "${pwned}"`]);
    await startProcessRaw(comspec, `/d /s /c ${commandLine}`, { elevate: false });
    await sleep(1200);
    assert.strictEqual(fs.existsSync(pwned), false, '提权通道转义失效');
  });

  // ---------------------------------------------------------------- 汇总
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length > 0) process.exitCode = 1;
})();
