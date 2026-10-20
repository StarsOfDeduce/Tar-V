'use strict';

/**
 * 安全相关纯函数单元测试。
 * 运行：node test/security.test.js
 */

const assert = require('assert');
const { parseWindowsArgs, quoteForCreateProcess, quoteForCmdArg, buildCmdCommandLine } = require('../lib/args');
const { psQuote, encodeCommand, buildProcessStartScript, buildIconExtractScript } = require('../lib/powershell');
const { isInside, hasTraversal, createDirAuthorizer } = require('../lib/path-guard');
const { validateConfig } = require('../lib/config-schema');
const { selectConfiguredLaunch } = require('../lib/launch-policy');
const { isTrustedIpcEvent, hardenRendererWindow } = require('../lib/security-boundary');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

// ---------------------------------------------------------------- args
console.log('\n[parseWindowsArgs]');

test('空输入返回空数组', () => {
  assert.deepStrictEqual(parseWindowsArgs(''), []);
  assert.deepStrictEqual(parseWindowsArgs('   '), []);
  assert.deepStrictEqual(parseWindowsArgs(undefined), []);
  assert.deepStrictEqual(parseWindowsArgs(null), []);
});

test('普通多参数拆分', () => {
  assert.deepStrictEqual(parseWindowsArgs('--a 1 --b 2'), ['--a', '1', '--b', '2']);
});

test('连续空白折叠', () => {
  assert.deepStrictEqual(parseWindowsArgs('  a   b\t\tc  '), ['a', 'b', 'c']);
});

test('引号包裹的空格保留', () => {
  assert.deepStrictEqual(parseWindowsArgs('"C:\\Program Files\\a.exe"'), ['C:\\Program Files\\a.exe']);
});

test('explorer /select 形式', () => {
  assert.deepStrictEqual(parseWindowsArgs('/select,"C:\\Program Files\\a.exe"'), ['/select,C:\\Program Files\\a.exe']);
});

test('等号后引号', () => {
  assert.deepStrictEqual(parseWindowsArgs('--flag="a b"'), ['--flag=a b']);
});

test('引号内双引号转义为字面引号', () => {
  assert.deepStrictEqual(parseWindowsArgs('"a""b"'), ['a"b']);
});

test('反斜杠不吞字符', () => {
  assert.deepStrictEqual(parseWindowsArgs('C:\\dir\\sub'), ['C:\\dir\\sub']);
});

test('末尾反斜杠 + 闭合引号', () => {
  assert.deepStrictEqual(parseWindowsArgs('"C:\\dir\\\\"'), ['C:\\dir\\']);
});

test('命令注入载荷被当作普通参数', () => {
  const payload = '& calc.exe';
  assert.deepStrictEqual(parseWindowsArgs(payload), ['&', 'calc.exe']);
});

test('管道与重定向不被特殊处理', () => {
  assert.deepStrictEqual(parseWindowsArgs('a | b > c'), ['a', '|', 'b', '>', 'c']);
});

test('quoteForCreateProcess 往返一致', () => {
  const cases = [
    'plain',
    'A B C',
    'C:\\Program Files\\App\\a.exe',
    '& echo PWNED',
    'a"b',
    'ends with backslash\\',
    'ends with backslash\\ and space ',
    '',
    'a\\\\"b'
  ];
  for (const value of cases) {
    const encoded = quoteForCreateProcess(value);
    assert.deepStrictEqual(
      parseWindowsArgs(encoded),
      [value],
      `往返失败: ${JSON.stringify(value)} -> ${JSON.stringify(encoded)}`
    );
  }
});

test('quoteForCmdArg 整体加引号并转义元字符', () => {
  assert.strictEqual(quoteForCmdArg('--v'), '"--v"');
  assert.strictEqual(quoteForCmdArg('a&b'), '"a^&b"');
  assert.strictEqual(quoteForCmdArg('a"b'), '"a^"b"');
  assert.strictEqual(quoteForCmdArg('a^b'), '"a^^b"');
});

test('quoteForCmdArg 拒绝 cmd 环境变量与延迟展开符', () => {
  assert.throws(() => quoteForCmdArg('%PATH%'), /%/);
  assert.throws(() => quoteForCmdArg('!payload!'), /!/);
  assert.throws(() => buildCmdCommandLine('C:\\%TEMP%\\x.bat', []), /%/);
});

test('buildCmdCommandLine 外层再包一层引号', () => {
  const line = buildCmdCommandLine('C:\\a b\\x.bat', ['--x', 'A B']);
  assert.strictEqual(line, '""C:\\a b\\x.bat" "--x" "A B""');
});

// ---------------------------------------------------------------- powershell
console.log('\n[lib/powershell]');

test('psQuote 转义单引号', () => {
  assert.strictEqual(psQuote("a'b"), "'a''b'");
  assert.strictEqual(psQuote('C:\\x\\y'), "'C:\\x\\y'");
});

test('psQuote 让注入载荷失效', () => {
  const payload = "x'; Start-Process calc.exe; '";
  const quoted = psQuote(payload);
  // 单引号必须全部成对，否则会提前闭合字符串
  const inner = quoted.slice(1, -1);
  assert.strictEqual(inner.includes("'"), true);
  assert.strictEqual(/(^|[^'])'([^']|$)/.test(inner), false, '存在落单的单引号');
});

test('encodeCommand 输出 UTF-16LE Base64', () => {
  const script = 'Write-Output 1';
  const decoded = Buffer.from(encodeCommand(script), 'base64').toString('utf16le');
  assert.strictEqual(decoded, script);
});

test('buildProcessStartScript 使用 ProcessStartInfo 原始参数串', () => {
  const script = buildProcessStartScript('C:\\a b\\x.exe', '--x "a b"');
  assert.ok(script.includes("$psi.FileName = 'C:\\a b\\x.exe'"));
  assert.ok(script.includes('$psi.Arguments = \'--x "a b"\''));
  assert.ok(!script.includes('RunAs'), '非提权不应带 RunAs');
});

test('buildProcessStartScript 提权模式带 RunAs', () => {
  const script = buildProcessStartScript('C:\\x.exe', '', { elevate: true });
  assert.ok(script.includes("$psi.Verb = 'RunAs'"));
});

test('buildProcessStartScript 对文件名中的单引号做转义', () => {
  const script = buildProcessStartScript("C:\\a'b\\x.exe", '');
  assert.ok(script.includes("'C:\\a''b\\x.exe'"));
});

test('buildIconExtractScript 路径被单引号包裹', () => {
  const script = buildIconExtractScript("C:\\a'b\\x.exe");
  assert.ok(script.includes("'C:\\a''b\\x.exe'"));
});

// ---------------------------------------------------------------- path-guard
console.log('\n[lib/path-guard]');

test('isInside 基本包含关系', () => {
  assert.strictEqual(isInside('C:\\a\\b\\c', 'C:\\a'), true);
  assert.strictEqual(isInside('C:\\a', 'C:\\a'), true);
  assert.strictEqual(isInside('C:\\ab', 'C:\\a'), false);
});

test('isInside 大小写不敏感', () => {
  assert.strictEqual(isInside('c:\\A\\B', 'C:\\a'), true);
});

test('isInside 拒绝兄弟目录', () => {
  assert.strictEqual(isInside('C:\\a\\..\\b', 'C:\\a'), false);
});

test('hasTraversal 识别 ..', () => {
  assert.strictEqual(hasTraversal('C:\\a\\..\\b'), true);
  assert.strictEqual(hasTraversal('C:\\a\\b'), false);
});

test('authorizer 只放行授权目录', () => {
  const auth = createDirAuthorizer(['C:\\Users\\me\\Pictures']);
  assert.strictEqual(auth.isAllowed('C:\\Users\\me\\Pictures\\a.png'), true);
  assert.strictEqual(auth.isAllowed('C:\\Windows\\System32'), false);
  assert.strictEqual(auth.isAllowed('C:\\Users\\me\\Pictures\\..\\..\\Windows'), false);
  assert.strictEqual(auth.isAllowed('relative\\path'), false);
});

test('authorizer allowParentOf 放行所选文件所在目录', () => {
  const auth = createDirAuthorizer();
  auth.allowParentOf('D:\\Games\\foo.lnk');
  assert.strictEqual(auth.isAllowed('D:\\Games\\bar.lnk'), true);
  assert.strictEqual(auth.isAllowed('D:\\Other\\bar.lnk'), false);
});

// ---------------------------------------------------------------- config-schema
console.log('\n[lib/config-schema]');

const baseConfig = () => ({
  settings: { language: 'zh', autostart: false, hotkey: 'Alt+Q', columns: 8, opacity: 85 },
  tabs: [{ id: 'tab-1', name: '常用' }],
  items: [
    { id: 'i1', tabId: 'tab-1', name: 'cmd', path: 'cmd.exe', args: '', runAsAdmin: false, icon: '' }
  ]
});

test('合法配置通过', () => {
  const result = validateConfig(baseConfig());
  assert.strictEqual(result.ok, true, result.errors.join('; '));
  assert.strictEqual(result.value.items.length, 1);
});

test('未知顶层字段被拒绝', () => {
  const cfg = baseConfig();
  cfg.evil = true;
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('evil')));
});

test('items 未知字段被拒绝', () => {
  const cfg = baseConfig();
  cfg.items[0].preload = 'evil.js';
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
});

test('tabId 悬空被拒绝', () => {
  const cfg = baseConfig();
  cfg.items[0].tabId = 'nope';
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
});

test('超长字段被拒绝', () => {
  const cfg = baseConfig();
  cfg.items[0].name = 'x'.repeat(200);
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
});

test('类型错误被拒绝', () => {
  const cfg = baseConfig();
  cfg.settings.autostart = 'yes';
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
});

test('columns 越界被拒绝', () => {
  const cfg = baseConfig();
  cfg.settings.columns = 999;
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
});

test('未知 settings 键被拒绝', () => {
  const cfg = baseConfig();
  cfg.settings.mystery = 1;
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('mystery')));
});

test('自启动与管理员项进入摘要', () => {
  const cfg = baseConfig();
  cfg.settings.autostart = true;
  cfg.items[0].runAsAdmin = true;
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, true);
  assert.ok(result.summary.some((line) => line.includes('自启动')));
  assert.ok(result.summary.some((line) => line.includes('管理员')));
});

test('runAsAdmin 强制布尔化', () => {
  const cfg = baseConfig();
  cfg.items[0].runAsAdmin = 'true';
  const result = validateConfig(cfg);
  assert.strictEqual(result.ok, false);
});

test('重复的 tab 和 item ID 被拒绝', () => {
  const duplicateTab = baseConfig();
  duplicateTab.tabs.push({ id: 'tab-1', name: '重复' });
  assert.strictEqual(validateConfig(duplicateTab).ok, false);

  const duplicateItem = baseConfig();
  duplicateItem.items.push({ ...duplicateItem.items[0] });
  assert.strictEqual(validateConfig(duplicateItem).ok, false);
});

// ---------------------------------------------------------------- launch-policy
console.log('\n[lib/launch-policy]');

test('启动时只从当前配置按 ID 取路径与参数', () => {
  const cfg = baseConfig();
  const result = selectConfiguredLaunch(cfg, 'i1');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.item, {
    id: 'i1', path: 'cmd.exe', args: '', runAsAdmin: false
  });
});

test('未声明或重复的启动项 ID 被拒绝', () => {
  const cfg = baseConfig();
  assert.strictEqual(selectConfiguredLaunch(cfg, 'missing').ok, false);
  cfg.items.push({ ...cfg.items[0] });
  assert.strictEqual(selectConfiguredLaunch(cfg, 'i1').ok, false);
});

test('只允许布尔类型的一次性管理员启动', () => {
  const cfg = baseConfig();
  assert.strictEqual(selectConfiguredLaunch(cfg, 'i1', 'true').ok, false);
  assert.strictEqual(selectConfiguredLaunch(cfg, 'i1', true).item.runAsAdmin, true);
});

// ---------------------------------------------------------------- security-boundary
console.log('\n[lib/security-boundary]');

test('IPC 只信任指定窗口的本地顶层主帧', () => {
  const url = 'file:///D:/Tar%20V/renderer/index.html';
  const frame = { url };
  const sender = { mainFrame: frame, getURL: () => url };
  const allowed = [{ webContents: sender, url }];

  assert.strictEqual(isTrustedIpcEvent({ sender, senderFrame: frame }, allowed), true);
  assert.strictEqual(isTrustedIpcEvent({
    sender: { mainFrame: frame, getURL: () => 'https://evil.example/' },
    senderFrame: frame
  }, allowed), false);
  assert.strictEqual(isTrustedIpcEvent({ sender, senderFrame: { url } }, allowed), false);
});

test('窗口硬化拒绝弹窗和外部导航', () => {
  const handlers = {};
  let openHandler = null;
  const browserWindow = {
    webContents: {
      setWindowOpenHandler: (handler) => { openHandler = handler; },
      on: (name, handler) => { handlers[name] = handler; }
    }
  };
  const trustedUrl = 'file:///D:/Tar%20V/renderer/index.html';
  hardenRendererWindow(browserWindow, trustedUrl);

  assert.deepStrictEqual(openHandler(), { action: 'deny' });
  let blocked = false;
  handlers['will-navigate']({ preventDefault: () => { blocked = true; } }, 'https://evil.example/');
  assert.strictEqual(blocked, true);

  blocked = false;
  handlers['will-navigate']({ preventDefault: () => { blocked = true; } }, trustedUrl);
  assert.strictEqual(blocked, false);
});

// ---------------------------------------------------------------- 汇总
console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  process.exitCode = 1;
}
