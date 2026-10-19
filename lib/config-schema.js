'use strict';

/**
 * 配置导入校验。
 *
 * 导入的 JSON 属于不可信输入：它可以直接改写启动项、自启动、全局热键，
 * 也就是能把任意程序塞进启动面板并以管理员身份运行。旧实现 parse 完
 * 就直接 saveConfig + 立刻应用 hotkey/autostart，等于给了恶意配置文件
 * 一个静默生效的入口。
 *
 * 这里做三件事：
 *   1. 字段与类型白名单校验（未知字段直接拒绝，避免夹带）
 *   2. 长度与取值上限（避免超长字段撑爆界面或配置文件）
 *   3. 生成"危险变更摘要"，交给界面二次确认后才应用
 */

const MAX_NAME = 128;
const MAX_PATH = 2048;
const MAX_ARGS = 1024;
const MAX_ICON = 512 * 1024;
const MAX_ID = 128;
const MAX_TABS = 64;
const MAX_ITEMS = 5000;

const SETTING_TYPES = {
  language: 'string',
  autostart: 'boolean',
  hotkey: 'string',
  autoHideOnLaunch: 'boolean',
  autoHideOnBlur: 'boolean',
  pressEscToHide: 'boolean',
  clickMode: 'string',
  popupPos: 'string',
  keepCentered: 'boolean',
  columns: 'number',
  opacity: 'number',
  hideNames: 'boolean',
  tabHover: 'boolean',
  tabScroll: 'boolean',
  tabKeys: 'boolean',
  styleMode: 'string',
  borderRadius: 'string',
  bgColor: 'string',
  accentColor: 'string',
  dragMode: 'string',
  fontSizeItem: 'number',
  fontSizeSettings: 'number',
  fontSizeTab: 'number',
  showSearch: 'boolean',
  windowSize: 'object',
  settingsWindowSize: 'object'
};

const ITEM_FIELDS = ['id', 'tabId', 'name', 'path', 'args', 'runAsAdmin', 'icon'];
const TAB_FIELDS = ['id', 'name'];
const TOP_FIELDS = ['settings', 'tabs', 'items'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkString(value, label, maxLength, errors, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    errors.push(`${label} 必须是字符串`);
    return false;
  }
  if (!allowEmpty && value.length === 0) {
    errors.push(`${label} 不能为空`);
    return false;
  }
  if (value.length > maxLength) {
    errors.push(`${label} 超过长度上限 ${maxLength}`);
    return false;
  }
  return true;
}

/**
 * 校验并规范化导入的配置。
 * @returns {{ok: boolean, errors: string[], warnings: string[], value?: object, summary: string[]}}
 */
function validateConfig(raw) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['配置文件根节点必须是 JSON 对象'], warnings, summary: [] };
  }

  for (const key of Object.keys(raw)) {
    if (!TOP_FIELDS.includes(key)) errors.push(`存在未知顶层字段: ${key}`);
  }
  if (errors.length > 0) return { ok: false, errors, warnings, summary: [] };

  if (!isPlainObject(raw.settings)) errors.push('缺少 settings 对象');
  if (!Array.isArray(raw.tabs)) errors.push('缺少 tabs 数组');
  if (!Array.isArray(raw.items)) errors.push('缺少 items 数组');
  if (errors.length > 0) return { ok: false, errors, warnings, summary: [] };

  // ---- settings ----
  const settings = {};
  for (const [key, value] of Object.entries(raw.settings)) {
    const expected = SETTING_TYPES[key];
    if (!expected) {
      warnings.push(`忽略未知设置项: ${key}`);
      continue;
    }
    if (expected === 'object') {
      if (!isPlainObject(value)) {
        errors.push(`settings.${key} 必须是对象`);
        continue;
      }
      const cleaned = {};
      for (const sub of ['width', 'height']) {
        if (value[sub] === undefined) continue;
        if (typeof value[sub] !== 'number' || !Number.isFinite(value[sub])) {
          errors.push(`settings.${key}.${sub} 必须是数字`);
        } else if (value[sub] < 0 || value[sub] > 100000) {
          errors.push(`settings.${key}.${sub} 超出合理范围`);
        } else {
          cleaned[sub] = value[sub];
        }
      }
      settings[key] = cleaned;
      continue;
    }
    if (typeof value !== expected) {
      errors.push(`settings.${key} 类型应为 ${expected}`);
      continue;
    }
    if (expected === 'number' && !Number.isFinite(value)) {
      errors.push(`settings.${key} 不是有效数字`);
      continue;
    }
    if (expected === 'string' && value.length > 512) {
      errors.push(`settings.${key} 超过长度上限 512`);
      continue;
    }
    settings[key] = value;
  }

  if (typeof settings.columns === 'number' && (settings.columns < 1 || settings.columns > 32)) {
    errors.push('settings.columns 必须在 1-32 之间');
  }
  if (typeof settings.opacity === 'number' && (settings.opacity < 0 || settings.opacity > 100)) {
    errors.push('settings.opacity 必须在 0-100 之间');
  }

  // ---- tabs ----
  const tabs = [];
  if (raw.tabs.length > MAX_TABS) errors.push(`tabs 数量超过上限 ${MAX_TABS}`);
  raw.tabs.forEach((tab, index) => {
    const label = `tabs[${index}]`;
    if (!isPlainObject(tab)) {
      errors.push(`${label} 必须是对象`);
      return;
    }
    for (const key of Object.keys(tab)) {
      if (!TAB_FIELDS.includes(key)) errors.push(`${label} 存在未知字段: ${key}`);
    }
    if (!checkString(tab.id, `${label}.id`, MAX_ID, errors)) return;
    if (!checkString(tab.name, `${label}.name`, MAX_NAME, errors)) return;
    tabs.push({ id: tab.id, name: tab.name });
  });

  // ---- items ----
  const items = [];
  const tabIds = new Set(tabs.map((tab) => tab.id));
  if (raw.items.length > MAX_ITEMS) errors.push(`items 数量超过上限 ${MAX_ITEMS}`);
  raw.items.forEach((item, index) => {
    const label = `items[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`${label} 必须是对象`);
      return;
    }
    for (const key of Object.keys(item)) {
      if (!ITEM_FIELDS.includes(key)) errors.push(`${label} 存在未知字段: ${key}`);
    }
    if (!checkString(item.id, `${label}.id`, MAX_ID, errors)) return;
    if (!checkString(item.tabId, `${label}.tabId`, MAX_ID, errors)) return;
    if (!checkString(item.name, `${label}.name`, MAX_NAME, errors)) return;
    if (!checkString(item.path, `${label}.path`, MAX_PATH, errors)) return;
    if (item.args !== undefined && !checkString(item.args, `${label}.args`, MAX_ARGS, errors, { allowEmpty: true })) return;
    if (item.runAsAdmin !== undefined && typeof item.runAsAdmin !== 'boolean') {
      errors.push(`${label}.runAsAdmin 必须是布尔值`);
      return;
    }
    if (item.icon !== undefined && !checkString(item.icon, `${label}.icon`, MAX_ICON, errors, { allowEmpty: true })) return;
    if (!tabIds.has(item.tabId)) {
      errors.push(`${label}.tabId 指向不存在的分组: ${item.tabId}`);
      return;
    }
    items.push({
      id: item.id,
      tabId: item.tabId,
      name: item.name,
      path: item.path,
      args: item.args || '',
      runAsAdmin: item.runAsAdmin === true,
      icon: item.icon || ''
    });
  });

  if (errors.length > 0) return { ok: false, errors, warnings, summary: [] };

  // ---- 危险变更摘要 ----
  const summary = [];
  summary.push(`分组 ${tabs.length} 个，启动项 ${items.length} 个`);
  if (settings.autostart === true) summary.push('⚠ 开机自启动将被设为「开启」');
  if (typeof settings.hotkey === 'string' && settings.hotkey) {
    summary.push(`全局热键将被设为「${settings.hotkey}」`);
  }
  const adminItems = items.filter((item) => item.runAsAdmin);
  if (adminItems.length > 0) {
    summary.push(`⚠ ${adminItems.length} 个启动项将以管理员权限运行`);
    adminItems.slice(0, 5).forEach((item) => summary.push(`   · ${item.name} → ${item.path}`));
  }
  const withArgs = items.filter((item) => item.args);
  if (withArgs.length > 0) summary.push(`${withArgs.length} 个启动项带运行参数`);

  return {
    ok: true,
    errors,
    warnings,
    summary,
    value: { settings, tabs, items }
  };
}

module.exports = { validateConfig, SETTING_TYPES, ITEM_FIELDS, TAB_FIELDS };
