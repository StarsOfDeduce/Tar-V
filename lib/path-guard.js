'use strict';

const path = require('path');

/**
 * 路径边界工具。
 *
 * 用于给 IPC 接口加上"只能访问用户明确授权过的目录"这道边界，
 * 避免渲染层被利用后可以枚举或读取任意路径。
 */

/** 规范化路径（解析 `.`、`..`、重复分隔符）。 */
function normalize(targetPath) {
  return path.resolve(targetPath);
}

/** child 是否位于 parent 之内（含相等）。Windows 下大小写不敏感。 */
function isInside(child, parent) {
  const normalizedChild = normalize(child);
  const normalizedParent = normalize(parent);
  const relative = path.relative(normalizedParent, normalizedChild);
  if (relative === '') return true;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** 是否包含 `..` 段（用于快速拒绝明显的穿越尝试）。 */
function hasTraversal(targetPath) {
  if (typeof targetPath !== 'string') return true;
  return targetPath.split(/[\\/]+/).some((segment) => segment === '..');
}

/**
 * 会话级目录授权表。
 *
 * 只记录用户通过系统对话框亲自选择的目录（以及应用数据目录），
 * 渲染层无法自行扩充，因此不能用来绕过边界。
 */
function createDirAuthorizer(seedDirs = []) {
  const allowed = new Set();
  for (const dir of seedDirs) {
    if (dir && typeof dir === 'string') allowed.add(normalize(dir));
  }

  return {
    allow(dir) {
      if (dir && typeof dir === 'string') allowed.add(normalize(dir));
    },
    /** 允许访问该路径本身，或该路径所在目录（用于"选中某个文件"）。 */
    allowParentOf(filePath) {
      if (filePath && typeof filePath === 'string') allowed.add(normalize(path.dirname(filePath)));
    },
    isAllowed(targetPath) {
      if (typeof targetPath !== 'string' || targetPath.length === 0) return false;
      if (!path.isAbsolute(targetPath)) return false;
      if (hasTraversal(targetPath)) return false;
      const normalized = normalize(targetPath);
      for (const dir of allowed) {
        if (isInside(normalized, dir)) return true;
      }
      return false;
    },
    list() {
      return Array.from(allowed);
    }
  };
}

module.exports = { normalize, isInside, hasTraversal, createDirAuthorizer };
