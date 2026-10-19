'use strict';

/**
 * 生成 README 用的界面截图。
 *
 *   node_modules/electron/dist/electron.exe scripts/capture-screenshots.js --disable-gpu --no-sandbox
 *
 * 脱敏方式：截图用的配置是纯虚构的演示数据，只引用 Windows 系统自带程序，
 * 不含任何真实用户名、个人目录、已安装软件或历史记录。图标取自系统自带 exe，
 * 因此截图里不会出现用户自己的文件。
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');

// 只用 Windows 自带程序，路径不含用户名
const SYSTEM = process.env.SystemRoot || 'C:\\Windows';

const demoItems = [
  { id: 'demo-1', tabId: 'tab-1', name: '文件资源管理器', path: path.join(SYSTEM, 'explorer.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-2', tabId: 'tab-1', name: '命令提示符', path: path.join(SYSTEM, 'System32', 'cmd.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-3', tabId: 'tab-1', name: '记事本', path: path.join(SYSTEM, 'System32', 'notepad.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-4', tabId: 'tab-1', name: '画图', path: path.join(SYSTEM, 'System32', 'mspaint.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-5', tabId: 'tab-1', name: '计算器', path: path.join(SYSTEM, 'System32', 'calc.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-6', tabId: 'tab-1', name: '任务管理器', path: path.join(SYSTEM, 'System32', 'Taskmgr.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-7', tabId: 'tab-1', name: '控制面板', path: path.join(SYSTEM, 'System32', 'control.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-8', tabId: 'tab-1', name: '注册表编辑器', path: path.join(SYSTEM, 'regedit.exe'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-9', tabId: 'tab-1', name: '设备管理器', path: path.join(SYSTEM, 'System32', 'devmgmt.msc'), args: '', icon: '', runAsAdmin: false },
  { id: 'demo-10', tabId: 'tab-1', name: '系统设置', path: path.join(SYSTEM, 'System32', 'SystemSettings.exe'), args: '', icon: '', runAsAdmin: false }
];

const demoConfig = {
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
    columns: 5,
    opacity: 85,
    hideNames: false,
    tabHover: false,
    tabScroll: false,
    tabKeys: false,
    styleMode: 'original',
    borderRadius: '12px',
    bgColor: '#1e1e1e',
    accentColor: '#e04f35'
  },
  tabs: [
    { id: 'tab-1', name: '常用' },
    { id: 'tab-2', name: '系统工具' },
    { id: 'tab-3', name: '开发' }
  ],
  items: demoItems
};

ipcMain.handle('get-config', () => demoConfig);
ipcMain.handle('save-config', () => ({ success: true }));
ipcMain.handle('get-file-icon', async (event, filePath) => {
  try {
    const icon = await app.getFileIcon(filePath, { size: 'large' });
    const url = icon.toDataURL();
    if (url && url.length > 200) return url;
  } catch (err) {
    /* 回退到占位图标 */
  }
  return 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"><rect width="24" height="24" rx="5" fill="#3a3a3a"/><circle cx="12" cy="12" r="4" fill="#8a8a8a"/></svg>`
  ).toString('base64');
});
ipcMain.handle('check-paths', (event, paths) => paths.map(() => true));
ipcMain.handle('launch-item', () => ({ success: true }));
ipcMain.handle('select-file', () => null);
ipcMain.handle('select-folder', () => null);
ipcMain.handle('update-autostart', () => ({ success: true }));
ipcMain.handle('register-shortcut', () => ({ success: true }));
ipcMain.handle('hide-window', () => ({ success: true }));
ipcMain.handle('close-app', () => ({ success: true }));
ipcMain.handle('center-window', () => ({ success: true }));
ipcMain.handle('export-config', () => null);
ipcMain.handle('import-config', () => null);
ipcMain.handle('confirm-import-config', () => ({ success: true, applied: false }));
ipcMain.handle('get-folder-files', () => ({ success: true, files: [] }));
ipcMain.handle('resolve-shortcut', () => ({ target: '', args: '', cwd: '', iconPath: '' }));
ipcMain.handle('open-settings-window', () => undefined);

async function capture(win, pageFile, outFile, size) {
  win.setContentSize(size.width, size.height);
  await win.loadFile(path.join(root, pageFile));
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const image = await win.webContents.capturePage();
  fs.writeFileSync(outFile, image.toPNG());
  console.log('已保存', outFile, image.getSize());
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  // 复用同一个窗口：销毁再新建会让 file:// 加载偶发 ERR_FAILED
  const win = new BrowserWindow({
    width: 800,
    height: 480,
    show: false,
    backgroundColor: '#0f0f12',
    webPreferences: {
      preload: path.join(root, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  try {
    await capture(win, 'renderer/index.html', path.join(outDir, 'panel.png'), { width: 800, height: 480 });
    await capture(win, 'renderer/settings.html', path.join(outDir, 'settings.png'), { width: 760, height: 560 });
    app.exit(0);
  } catch (err) {
    console.error('截图失败', err);
    app.exit(1);
  }
});

setTimeout(() => app.exit(1), 40000);
