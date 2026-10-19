'use strict';

/**
 * Windows 命令行参数解析与反向编码。
 *
 * 存在意义：配置里的 args 是用户填写的一整串字符串。旧实现把它交给
 * `spawn(cmd, [args], { shell: true })`，由 shell 二次解析，参数里的
 * `& | > < ^ "` 等字符会变成命令分隔符，形成命令注入。
 *
 * 现在分两条路径处理：
 *   - 普通可执行文件：parseWindowsArgs 拆成数组，用 shell:false 直接交给
 *     CreateProcess，参数不经过任何 shell。
 *   - .bat / .cmd：必须由 cmd.exe 承载，无法绕开 cmd 的解析，因此改用
 *     quoteForCmdArg 做 cmd 级转义（已用真实载荷验证）。
 */

/** 按 CommandLineToArgvW 规则把命令行字符串拆成参数数组。 */
function parseWindowsArgs(input) {
  if (typeof input !== 'string' || input.length === 0) return [];

  const args = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    // 跳过参数之间的空白
    while (i < n && isSpace(input[i])) i++;
    if (i >= n) break;

    let cur = '';
    let inQuotes = false;

    while (i < n) {
      const ch = input[i];

      if (!inQuotes && isSpace(ch)) break;

      if (ch === '\\') {
        // 连续反斜杠：2n 个 + 引号 => n 个反斜杠 + 引号作为分隔
        //             2n+1 个 + 引号 => n 个反斜杠 + 字面引号
        let backslashes = 0;
        while (i < n && input[i] === '\\') {
          backslashes++;
          i++;
        }
        if (i < n && input[i] === '"') {
          cur += '\\'.repeat(backslashes >> 1);
          if (backslashes & 1) {
            cur += '"';
            i++;
          }
        } else {
          cur += '\\'.repeat(backslashes);
        }
        continue;
      }

      if (ch === '"') {
        // 引号内的 "" 表示一个字面引号
        if (inQuotes && i + 1 < n && input[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i++;
        continue;
      }

      cur += ch;
      i++;
    }

    args.push(cur);
  }

  return args;
}

function isSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * 按 CreateProcess 规则把单个参数编码回命令行片段。
 * 满足 parseWindowsArgs(quoteForCreateProcess(a)) === [a]。
 */
function quoteForCreateProcess(arg) {
  const value = String(arg);
  if (value.length === 0) return '""';
  if (!/[\s"]/.test(value)) return value;

  let out = '"';
  let backslashes = 0;

  for (const ch of value) {
    if (ch === '\\') {
      backslashes++;
      continue;
    }
    if (ch === '"') {
      // 引号前需要 2n+1 个反斜杠：n 个还原 + 1 个转义引号
      out += '\\'.repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    out += '\\'.repeat(backslashes) + ch;
    backslashes = 0;
  }

  // 结尾的反斜杠需要翻倍，否则会转义收尾的引号
  out += '\\'.repeat(backslashes * 2) + '"';
  return out;
}

/**
 * 把单个参数编码成 cmd.exe 可安全解析的形式。
 *
 * cmd 的解析阶段比 CreateProcess 更早，`& | < > ( )` 会在引号外被当作
 * 命令分隔符，`"` 会结束当前引号段。实测结论：
 *   整体用双引号包裹，内部 `"` 写成 `^"`，元字符前加 `^`，可同时保证
 *   「不执行注入」与「参数原样到达批处理」。
 */
function quoteForCmdArg(arg) {
  const escaped = String(arg)
    .replace(/\^/g, '^^')
    .replace(/"/g, '^"')
    .replace(/([&|<>()])/g, '^$1');
  return '"' + escaped + '"';
}

/**
 * 构造 `cmd.exe /d /s /c` 需要的完整命令串。
 *
 * 外层再套一层引号是 /s 语义的要求：cmd 会剥掉最外层引号，
 * 内部剩余部分按原样解析。
 */
function buildCmdCommandLine(scriptPath, args) {
  const parts = ['"' + String(scriptPath) + '"'];
  for (const arg of args || []) {
    parts.push(quoteForCmdArg(arg));
  }
  return '"' + parts.join(' ') + '"';
}

module.exports = {
  parseWindowsArgs,
  quoteForCreateProcess,
  quoteForCmdArg,
  buildCmdCommandLine
};
