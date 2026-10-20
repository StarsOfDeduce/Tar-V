'use strict';

/**
 * 渲染层冒烟测试（需要在 Electron 中运行）：
 *
 *   npm run test:renderer
 *
 * 目的：验证在「沙箱开启 + 严格 CSP」之后，页面仍能正常加载、preload 桥接可用、
 * 本地字体生效、控制台没有 CSP 违规。
 *
 * 这里注册了主进程 IPC 的最小桩实现，让渲染层脚本能完整跑一遍初始化流程。
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { isTrustedIpcEvent, hardenRendererWindow } = require('../lib/security-boundary');

const root = path.join(__dirname, '..');
const resultPath = path.join(root, 'test', 'renderer-smoke-result.json');

const pageErrors = [];
let testWindow = null;
let activeTrustedUrl = '';

const stubConfig = {
  settings: {
    language: 'zh',
    autostart: false,
    hotkey: 'Alt+Q',
    autoHideOnLaunch: true,
    autoHideOnBlur: true,
    pressEscToHide: true,
    clickMode: 'single',
    popupPos: 'center',
    keepCentered: true,
    columns: 8,
    opacity: 85,
    hideNames: false,
    tabHover: false,
    tabScroll: false,
    tabKeys: false,
    styleMode: 'original',
    borderRadius: '8px',
    bgColor: '#1e1e1e'
  },
  tabs: [{ id: 'tab-1', name: '常用' }],
  items: [
    { id: 'i1', tabId: 'tab-1', name: '命令提示符', path: 'cmd.exe', args: '', icon: '', runAsAdmin: false },
    {
      id: 'xss-item',
      tabId: 'tab-1',
      name: '<img id="tar-v-xss-marker" src=x onerror="window.__tarVXss=true">',
      path: 'C:\\missing\\\"><img id="tar-v-path-xss-marker" src=x>',
      args: '',
      icon: '',
      runAsAdmin: false
    }
  ]
};

const ICON_STUB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const stubs = {
  'get-config': () => stubConfig,
  'save-config': () => ({ success: true }),
  'get-file-icon': () => ICON_STUB,
  'launch-item': () => ({ success: true }),
  'show-item-in-folder': () => ({ success: true }),
  'select-file': () => null,
  'select-folder': () => null,
  'update-autostart': () => ({ success: true }),
  'register-shortcut': () => ({ success: true }),
  'check-paths': (event, paths) => paths.map(() => false),
  'hide-window': () => ({ success: true }),
  'close-app': () => ({ success: true }),
  'center-window': () => ({ success: true }),
  'export-config': () => null,
  'import-config': () => null,
  'confirm-import-config': () => ({ success: true, applied: false }),
  'get-folder-files': () => ({ success: true, files: [] }),
  'resolve-shortcut': () => ({ target: '', args: '', cwd: '', iconPath: '' }),
  'open-settings-window': () => undefined
};

for (const [channel, handler] of Object.entries(stubs)) {
  ipcMain.handle(channel, (event, ...args) => {
    const allowed = testWindow
      ? [{ webContents: testWindow.webContents, url: activeTrustedUrl }]
      : [];
    if (!isTrustedIpcEvent(event, allowed)) {
      throw new Error(`IPC source rejected during smoke test: ${channel}`);
    }
    return handler(event, ...args);
  });
}

function finish(payload) {
  try {
    fs.writeFileSync(resultPath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.error('写入结果失败', err);
  }
  console.log(JSON.stringify(payload));
  app.exit(payload.ok ? 0 : 1);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 480,
    webPreferences: {
      preload: path.join(root, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  testWindow = win;

  let messages = [];

  win.webContents.on('console-message', (...args) => {
    const first = args[0];
    if (first && typeof first === 'object' && 'message' in first) {
      messages.push({ level: first.level, message: first.message });
    } else {
      messages.push({ level: args[1], message: args[2] });
    }
  });

  win.webContents.on('render-process-gone', (event, details) => {
    pageErrors.push('render-process-gone: ' + JSON.stringify(details));
  });

  const pages = [
    { file: 'renderer/index.html', label: 'index' },
    { file: 'renderer/settings.html', label: 'settings' }
  ];
  const pageResults = [];

  for (const page of pages) {
    messages = [];
    try {
      const pagePath = path.join(root, page.file);
      activeTrustedUrl = pathToFileURL(pagePath).href;
      hardenRendererWindow(win, activeTrustedUrl);
      await win.loadFile(pagePath);
      await new Promise((r) => setTimeout(r, 1200));

      const checks = await win.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        let deadPathEscaped = true;
        if (${JSON.stringify(page.label)} === 'settings') {
          document.getElementById('btn-scan-paths').click();
          await new Promise((resolve) => setTimeout(resolve, 100));
          const pathName = document.querySelector('.path-item-row .path-name');
          deadPathEscaped = !!pathName &&
            pathName.textContent.includes('<img id="tar-v-xss-marker"') &&
            !document.getElementById('tar-v-xss-marker') &&
            !document.getElementById('tar-v-path-xss-marker') &&
            window.__tarVXss !== true;
        }
        return {
          hasApi: typeof window.api === 'object' && window.api !== null,
          hasRequire: typeof window.require !== 'undefined',
          hasProcess: typeof window.process !== 'undefined',
          hasModule: typeof window.module !== 'undefined',
          cspMeta: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
          interLoaded: document.fonts.check('16px Inter'),
          title: document.title,
          deadPathEscaped,
          popupBlocked: window.open('https://example.com/') === null
        };
      })()`);

      await win.webContents.executeJavaScript("window.location.href = 'https://example.com/'; true");
      await new Promise((r) => setTimeout(r, 100));
      checks.navigationBlocked = win.webContents.getURL() === activeTrustedUrl;

      const snapshot = messages.slice();
      const cspViolations = snapshot.filter((m) =>
        /Content Security Policy|Refused to/i.test(String(m.message))
      );
      const errorMessages = snapshot
        .filter((m) => {
          const level = typeof m.level === 'number' ? m.level : String(m.level);
          return level === 3 || level === 'error';
        })
        .map((m) => m.message);

      pageResults.push({
        page: page.label,
        checks,
        cspViolations,
        errorMessages,
        consoleCount: snapshot.length
      });
    } catch (err) {
      pageErrors.push(`${page.label} exception: ` + err.message);
    }
  }

  const allGood = pageResults.length === pages.length && pageResults.every((r) =>
    r.checks && r.checks.hasApi && !r.checks.hasRequire && !r.checks.hasProcess &&
    !r.checks.hasModule && r.checks.cspMeta && r.checks.interLoaded && r.checks.deadPathEscaped &&
    r.checks.popupBlocked && r.checks.navigationBlocked &&
    r.cspViolations.length === 0 && r.errorMessages.length === 0
  );

  finish({
    ok: allGood && pageErrors.length === 0,
    pages: pageResults,
    pageErrors
  });
});

setTimeout(() => finish({ ok: false, pageErrors: ['timeout'] }), 25000);
