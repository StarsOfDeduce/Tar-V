'use strict';

const path = require('path');

function decodeShortcutBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return String(buffer || '');
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8');
}

function expandEnvironment(value, env = process.env) {
  return String(value || '').replace(/%([^%]+)%/g, (match, name) => {
    const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key ? env[key] : match;
  });
}

function stripOuterQuotes(value) {
  const clean = String(value || '').trim();
  if (clean.length >= 2 && clean.startsWith('"') && clean.endsWith('"')) {
    return clean.slice(1, -1);
  }
  return clean;
}

function parseIconLocation(rawValue, explicitIndex, env = process.env) {
  let iconPath = stripOuterQuotes(expandEnvironment(rawValue, env));
  let iconIndex = Number.isInteger(explicitIndex) ? explicitIndex : 0;
  const match = iconPath.match(/^(.*),\s*(-?\d+)$/);
  if (match) {
    iconPath = stripOuterQuotes(match[1]);
    if (!Number.isInteger(explicitIndex)) iconIndex = Number.parseInt(match[2], 10);
  }
  return { iconPath, iconIndex };
}

function parseInternetShortcutBuffer(buffer, { sourcePath = '', env = process.env } = {}) {
  const text = decodeShortcutBuffer(buffer).replace(/^\uFEFF/, '');
  const values = new Map();
  let inInternetShortcut = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      inInternetShortcut = line.slice(1, -1).trim().toLowerCase() === 'internetshortcut';
      continue;
    }
    if (!inInternetShortcut) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    values.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }

  const explicitIndex = values.has('iconindex')
    ? Number.parseInt(values.get('iconindex'), 10)
    : undefined;
  const icon = parseIconLocation(
    values.get('iconfile') || '',
    Number.isInteger(explicitIndex) ? explicitIndex : undefined,
    env
  );

  return {
    target: values.get('url') || sourcePath,
    args: '',
    cwd: '',
    shortcutPath: sourcePath,
    iconPath: icon.iconPath,
    iconIndex: icon.iconIndex,
    kind: 'url'
  };
}

function normalizeShellShortcut(filePath, shortcut, env = process.env) {
  const icon = parseIconLocation(shortcut && shortcut.icon, shortcut && shortcut.iconIndex, env);
  return {
    target: (shortcut && shortcut.target) || filePath,
    args: (shortcut && shortcut.args) || '',
    cwd: (shortcut && shortcut.cwd) || '',
    shortcutPath: filePath,
    iconPath: icon.iconPath,
    iconIndex: icon.iconIndex,
    kind: 'lnk'
  };
}

function isProtocolTarget(value) {
  if (typeof value !== 'string') return false;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim());
}

function protocolName(value) {
  if (!isProtocolTarget(value)) return '';
  return value.slice(0, value.indexOf(':')).toLowerCase();
}

function steamAppId(value) {
  if (typeof value !== 'string') return '';
  const match = value.trim().match(/^steam:\/\/(?:run|rungameid)\/(\d+)/i);
  return match ? match[1] : '';
}

function isShortcutPath(value) {
  const extension = path.extname(String(value || '')).toLowerCase();
  return extension === '.lnk' || extension === '.url';
}

module.exports = {
  decodeShortcutBuffer,
  expandEnvironment,
  parseIconLocation,
  parseInternetShortcutBuffer,
  normalizeShellShortcut,
  isProtocolTarget,
  protocolName,
  steamAppId,
  isShortcutPath
};
