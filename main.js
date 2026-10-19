const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { parseWindowsArgs } = require('./lib/args');
const {
  runEncodedPowerShell,
  startProcess,
  buildIconExtractScript
} = require('./lib/powershell');
const { launchBatchFile } = require('./lib/launch');
const { createDirAuthorizer, hasTraversal } = require('./lib/path-guard');
const { validateConfig } = require('./lib/config-schema');

let win = null;
let settingsWin = null; // Independent Settings Window
let tray = null;
let currentConfig = null;

// 待确认的导入配置：校验通过后先暂存，等用户在界面上二次确认再应用
let pendingImport = null;

// 会话级目录授权表：只有用户通过系统对话框亲自选择的目录才允许被枚举
const dirAuthorizer = createDirAuthorizer([app.getPath('userData')]);

// Base64 verified 16x16 PNG for System Tray (Windows requires raster formats like PNG/ICO, SVG fails in shell tray)
const TRAY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAd0lEQVQ4T6WTwREAIAgDscRO7MQS7sQSVsAHF05y8EnkLyHAEhKcc855GQeICJd1gIiI3AAR4bIOEBGRGyAiXNYBIiJyA0SEyzpARETuiWdmzszsNzOzZ+bMnvh95q98f/n+8tP5P50vIvx0vjOzZ2b2mxm/z/wB5j57AgvUTjIAAAAASUVORK5CYII=';

const FALLBACK_ICONS = {
  file: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2FhYSIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij48cGF0aCBkPSJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgyMTZhMiAyIDAgMCAwIDItMlY4eiIvPjxwYXRoIGQ9Ik0xNCAydjZoNnoiIGZpbGw9IiNmZmYiIG9wYWNpdHk9IjAuMyIvPjwvc3ZnPg==',
  folder: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2U4YTg3YyIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij48cGF0aCBkPSJNMTAgNEg0Yy0xLjEgMC0xLjk5LjktMS45OSAyTDIgMThjMCAxLjEuOSAyIDIgMmgxNmMxLjEgMCAyLS45IDItMlY4YzAtMS4xLS45LTItMi0yaC04eiIvPjwvc3ZnPg==',
  web: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzQ2OGFmZiIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij48cGF0aCBkPSJNMTQgMmgyYTIgMiAwIDAgMSAyIDJ2MTJhMiAyIDAgMCAxLTIgMmgtMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMnpNMTIgMTlVNWwtNiA3em0tMy42My01LjMyTDkgMTMuNjNsLTEuNjMtMS42M0w2IDEyLjAybDEuMzctMS4zOHoiLz48L3N2Zz4='
};

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Ensure config exists
function loadConfig() {
  if (currentConfig) return currentConfig;
  
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      currentConfig = JSON.parse(data);
    } catch (e) {
      console.error('Failed to load config, resetting to default', e);
    }
  }
  
  if (!currentConfig) {
    currentConfig = {
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
      tabs: [
        { id: 'tab-1', name: '常用' },
        { id: 'tab-2', name: '游戏' },
        { id: 'tab-3', name: '工具' }
      ],
      items: [
        { id: 'default-cmd', tabId: 'tab-1', name: '命令提示符', path: 'cmd.exe', args: '', icon: '', runAsAdmin: false },
        { id: 'default-explorer', tabId: 'tab-1', name: '文件资源管理器', path: 'explorer.exe', args: '', icon: '', runAsAdmin: false }
      ]
    };
    saveConfigSync(currentConfig);
  }
  return currentConfig;
}

let saveConfigDebounceTimeout = null;
function saveConfigDebounced(config, delay = 500) {
  currentConfig = config;
  if (saveConfigDebounceTimeout) clearTimeout(saveConfigDebounceTimeout);
  saveConfigDebounceTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save config debounced', e);
    }
  }, delay);
}

function saveConfigSync(config) {
  if (saveConfigDebounceTimeout) {
    clearTimeout(saveConfigDebounceTimeout);
    saveConfigDebounceTimeout = null;
  }
  currentConfig = config;
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config sync', e);
  }
}

// Center window on active monitor
function showWindowCentered() {
  if (!win) return;
  
  const config = loadConfig();
  const popupPos = config.settings.popupPos || 'center';
  
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = activeDisplay.workArea;
  const [winWidth, winHeight] = win.getSize();
  
  let winX, winY;
  
  if (popupPos === 'cursor') {
    winX = Math.round(cursorPoint.x - winWidth / 2);
    winY = Math.round(cursorPoint.y - winHeight / 2);
    
    // Boundary check within active screen
    if (winX < x) winX = x;
    if (winX + winWidth > x + width) winX = x + width - winWidth;
    if (winY < y) winY = y;
    if (winY + winHeight > y + height) winY = y + height - winHeight;
  } else {
    winX = Math.round(x + (width - winWidth) / 2);
    winY = Math.round(y + (height - winHeight) / 2);
  }
  
  win.setPosition(winX, winY);
  win.show();
  win.focus();
  win.webContents.send('window-show');
}

function hideWindow() {
  if (win) {
    win.hide();
    win.webContents.send('window-hide');
  }
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) {
    hideWindow();
  } else {
    showWindowCentered();
  }
}

function createWindow() {
  const config = loadConfig();
  const width = config.settings.windowSize?.width || 800;
  const height = config.settings.windowSize?.height || 480;
  
  win = new BrowserWindow({
    width: width,
    height: height,
    minWidth: 400,
    minHeight: 240,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // 沙箱开启后渲染进程与 preload 运行在受限环境，无法直接触达 Node.js。
      // 拖放文件的真实路径通过 preload 里的 webUtils.getPathForFile 获取，
      // 不再依赖被沙箱移除的 File.path，因此功能不受影响。
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.on('resize', () => {
    const [w, h] = win.getSize();
    const cfg = loadConfig();
    if (!cfg.settings.windowSize) {
      cfg.settings.windowSize = {};
    }
    cfg.settings.windowSize.width = w;
    cfg.settings.windowSize.height = h;
    saveConfigDebounced(cfg, 500);
  });

  win.on('close', () => {
    const cfg = loadConfig();
    saveConfigSync(cfg);
  });

  win.once('ready-to-show', () => {
    const isHiddenStartup = process.argv.includes('--hidden');
    if (!isHiddenStartup) {
      showWindowCentered();
    }
  });

  win.on('blur', () => {
    const cfg = loadConfig();
    if (cfg.settings.autoHideOnBlur) {
      // Do not hide launcher window if settings window is active/focused (Req 24)
      if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isFocused()) {
        return;
      }
      hideWindow();
    }
  });

  // Register shortcut on startup
  registerGlobalShortcut(config.settings.hotkey);

  win.on('closed', () => {
    win = null;
  });
}

function registerGlobalShortcut(accelerator) {
  globalShortcut.unregisterAll();
  if (!accelerator) return;
  
  try {
    const ret = globalShortcut.register(accelerator, () => {
      toggleWindow();
    });
    if (!ret) {
      console.error(`Registration failed for shortcut: ${accelerator}`);
    }
  } catch (e) {
    console.error(`Invalid shortcut string: ${accelerator}`, e);
  }
}

function getTrayIcon() {
  const exeDir = path.dirname(app.getPath('exe'));
  
  // 1. Check next to executable (portable mode)
  const exeDirIco = path.join(exeDir, 'tray.ico');
  if (fs.existsSync(exeDirIco)) {
    try {
      return nativeImage.createFromPath(exeDirIco);
    } catch (e) {
      console.error('Failed to load tray.ico next to exe:', e);
    }
  }
  
  const exeDirPng = path.join(exeDir, 'tray.png');
  if (fs.existsSync(exeDirPng)) {
    try {
      return nativeImage.createFromPath(exeDirPng);
    } catch (e) {
      console.error('Failed to load tray.png next to exe:', e);
    }
  }

  // 2. Check in project root/asar directory
  const localIco = path.join(__dirname, 'tray.ico');
  if (fs.existsSync(localIco)) {
    try {
      return nativeImage.createFromPath(localIco);
    } catch (e) {
      console.error('Failed to load local tray.ico:', e);
    }
  }
  
  const localPng = path.join(__dirname, 'tray.png');
  if (fs.existsSync(localPng)) {
    try {
      return nativeImage.createFromPath(localPng);
    } catch (e) {
      console.error('Failed to load local tray.png:', e);
    }
  }

  // 3. Fallback to Base64 PNG
  return nativeImage.createFromBuffer(Buffer.from(TRAY_PNG_BASE64, 'base64')).resize({ width: 16, height: 16 });
}

function createTray() {
  const trayIcon = getTrayIcon();
  
  tray = new Tray(trayIcon);
  tray.setToolTip('Tar V 快捷启动');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏面板', click: () => toggleWindow() },
    { type: 'separator' },
    { label: '退出 Tar V', click: () => {
      app.isQuiting = true;
      app.quit();
    }}
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    toggleWindow();
  });
}

// Single Instance Lock
const additionalData = { myKey: 'tar-v-launcher' };
const gotTheLock = app.requestSingleInstanceLock(additionalData);

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    // Focus instance
    if (win) {
      showWindowCentered();
    }
  });

  app.whenReady().then(() => {
    loadConfig();
    createWindow();
    createTray();
    
    // Set auto-start initially
    app.setLoginItemSettings({
      openAtLogin: currentConfig.settings.autostart,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Helper function to resolve environment variables and relative system commands to their absolute paths on Windows
function resolveAbsolutePath(filePath) {
  if (!filePath) return '';
  
  let cleanPath = filePath.trim();
  if (cleanPath.startsWith('"') && cleanPath.endsWith('"')) {
    cleanPath = cleanPath.slice(1, -1);
  }
  
  // Expand environment variables (e.g. %SystemRoot% or %USERPROFILE%)
  cleanPath = cleanPath.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
  
  if (path.isAbsolute(cleanPath)) {
    return cleanPath;
  }
  
  // Check standard Windows System32 and Windows directories
  const sysDir = process.env.SystemRoot || 'C:\\Windows';
  const pathsToCheck = [
    path.join(sysDir, 'System32', cleanPath),
    path.join(sysDir, 'system32', cleanPath + '.exe'),
    path.join(sysDir, cleanPath),
    path.join(sysDir, cleanPath + '.exe'),
  ];
  
  for (const p of pathsToCheck) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  // Fallback: search within system PATH environment directories
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);
  for (const dir of pathDirs) {
    const fullPath1 = path.join(dir, cleanPath);
    if (fs.existsSync(fullPath1)) return fullPath1;
    const fullPath2 = path.join(dir, cleanPath + '.exe');
    if (fs.existsSync(fullPath2)) return fullPath2;
  }
  
  return cleanPath;
}

// --- IPC IPC IPC ---

// Get config
ipcMain.handle('get-config', () => {
  return loadConfig();
});

// Save config
ipcMain.handle('save-config', (event, newConfig) => {
  const current = loadConfig();
  // Preserve window sizing configuration (Req 36)
  if (!newConfig.settings) newConfig.settings = {};
  if (current.settings && current.settings.windowSize) {
    newConfig.settings.windowSize = current.settings.windowSize;
  }
  if (current.settings && current.settings.settingsWindowSize) {
    newConfig.settings.settingsWindowSize = current.settings.settingsWindowSize;
  }
  
  saveConfigSync(newConfig);
  // Notify the main window to update its view instantly
  if (win && !win.isDestroyed()) {
    win.webContents.send('config-updated', newConfig);
  }
  return { success: true };
});

// Open separate independent settings window
ipcMain.handle('open-settings-window', () => {
  if (settingsWin) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.focus();
    return;
  }
  
  const config = loadConfig();
  const settingsWidth = config.settings.settingsWindowSize?.width || 720;
  const settingsHeight = config.settings.settingsWindowSize?.height || 520;
  
  settingsWin = new BrowserWindow({
    width: settingsWidth,
    height: settingsHeight,
    minWidth: 480,
    minHeight: 360,
    frame: true, // Standard window frame so it can be resized/moved easily
    title: 'Tar V - 设置',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  
  // Keep settings window centered on resize (Req 27) and remember size (Req 30)
  let resizeTimeout = null;
  settingsWin.on('resize', () => {
    const [w, h] = settingsWin.getSize();
    const cfg = loadConfig();
    if (!cfg.settings.settingsWindowSize) {
      cfg.settings.settingsWindowSize = {};
    }
    cfg.settings.settingsWindowSize.width = w;
    cfg.settings.settingsWindowSize.height = h;
    saveConfigDebounced(cfg, 500);

    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.center();
      }
    }, 150);
  });
  
  settingsWin.on('close', () => {
    const cfg = loadConfig();
    saveConfigSync(cfg);
  });
  
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
});

// In-memory icon cache to optimize icon loading speed
const iconCache = new Map();

// Concurrency queue for PowerShell icon extraction to prevent system freezing
let activePowerShellCount = 0;
const powershellQueue = [];

function runNextPowerShell() {
  if (powershellQueue.length === 0 || activePowerShellCount >= 3) {
    return;
  }
  
  activePowerShellCount++;
  const { task, resolve, reject } = powershellQueue.shift();
  
  task()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      activePowerShellCount--;
      runNextPowerShell();
    });
}

function queuePowerShell(task) {
  return new Promise((resolve, reject) => {
    powershellQueue.push({ task, resolve, reject });
    runNextPowerShell();
  });
}

// Helper to extract PE icon using PowerShell and .NET System.Drawing
function extractIconWithPowerShell(targetPath) {
  return queuePowerShell(async () => {
    // 脚本以 Base64 传入（-EncodedCommand），不经过 cmd.exe，也不拼接命令字符串，
    // 因此路径中的引号、反引号、分号等字符都无法跳出参数边界。
    const result = await runEncodedPowerShell(buildIconExtractScript(targetPath));
    if (result.code !== 0) {
      throw new Error(result.stderr || `PowerShell 退出码 ${result.code}`);
    }
    return result.stdout;
  });
}

// Get high-res icon for a path
ipcMain.handle('get-file-icon', async (event, filePath, forceRefresh = false) => {
  if (!filePath) return FALLBACK_ICONS.file;
  
  // Handle URLs
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return FALLBACK_ICONS.web;
  }

  // Check cache unless a force refresh is requested (e.g. from maintenance UI)
  if (!forceRefresh && iconCache.has(filePath)) {
    return iconCache.get(filePath);
  }

  // Resolve environment variables and path commands to get native icon
  const cleanPath = resolveAbsolutePath(filePath);

  let isDir = false;
  try {
    if (fs.existsSync(cleanPath) && fs.statSync(cleanPath).isDirectory()) {
      isDir = true;
    }
  } catch (e) {}

  let iconUrl = '';
  try {
    // Attempt to extract system file/folder icon via Electron native API (Req 25)
    const icon = await app.getFileIcon(cleanPath, { size: 'large' });
    iconUrl = icon.toDataURL();
  } catch (err) {
    try {
      const icon = await app.getFileIcon(cleanPath, { size: 'normal' });
      iconUrl = icon.toDataURL();
    } catch (err2) {
      iconUrl = isDir ? FALLBACK_ICONS.folder : FALLBACK_ICONS.file;
    }
  }

  // Fallback to PowerShell if the returned icon is the generic exe placeholder on Windows
  const isGeneric = !iconUrl || 
                    iconUrl === FALLBACK_ICONS.file ||
                    (iconUrl.length >= 1200 && iconUrl.length <= 1300) || 
                    iconUrl.includes('iVBORw0KGgoAAAQCAYAAAAgCAY');
  
  if (isGeneric && !isDir && fs.existsSync(cleanPath) && cleanPath.toLowerCase().endsWith('.exe')) {
    try {
      const base64 = await extractIconWithPowerShell(cleanPath);
      if (base64) {
        iconUrl = `data:image/png;base64,${base64}`;
      }
    } catch (err) {
      console.error('PowerShell icon extraction failed for:', cleanPath, err.message);
    }
  }

  // Save to cache
  iconCache.set(filePath, iconUrl);

  return iconUrl;
});

// 判断是否为"系统命令引用"（例如 cmd.exe 这类相对名），交给系统按 PATH 解析
function isSystemCommandRef(cleanPath) {
  return !path.isAbsolute(cleanPath) && !fs.existsSync(cleanPath);
}

// Launch item
ipcMain.handle('launch-item', async (event, filePath, args, runAsAdmin) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: '启动路径为空' };
  }
  const config = loadConfig();
  
  try {
    // Handle Web URLs
    if (/^https?:\/\//i.test(filePath)) {
      await shell.openExternal(filePath);
      if (config.settings.autoHideOnLaunch) {
        hideWindow();
      }
      return { success: true };
    }

    // Standard Files and Commands
    const cleanPath = resolveAbsolutePath(filePath);
    const isCommandRef = isSystemCommandRef(cleanPath);
    
    if (!isCommandRef && !fs.existsSync(cleanPath)) {
      throw new Error(`路径不存在: "${cleanPath}"`);
    }

    // 参数按 Windows 命令行规则拆分为数组，后续全程不经过任何 shell
    const argList = parseWindowsArgs(typeof args === 'string' ? args : '');
    const extension = path.extname(cleanPath).toLowerCase();
    const isBatchFile = extension === '.bat' || extension === '.cmd';

    if (isBatchFile) {
      // .bat / .cmd 需要命令解释器承载，参数按 cmd 规则转义后执行
      await launchBatchFile(cleanPath, argList, { runAsAdmin: runAsAdmin === true });
    } else if (runAsAdmin) {
      // 提权只能通过 ShellExecute 的 RunAs 动词，参数以 CreateProcess 规则编码
      await startProcess(cleanPath, argList, { runAsAdmin: true });
    } else if (argList.length > 0) {
      // 有参数：直接以进程方式启动，参数数组原样交给 CreateProcess
      const child = spawn(cleanPath, argList, {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: true
      });
      child.on('error', (err) => console.error('Launch failed (spawn):', err));
      child.unref();
    } else {
      // 无参数：优先交给系统外壳，保留文件关联行为
      const err = await shell.openPath(cleanPath);
      if (err) {
        // 外壳无法处理时（例如系统目录下的命令）退回直接启动进程
        const child = spawn(cleanPath, [], {
          detached: true,
          stdio: 'ignore',
          shell: false,
          windowsHide: true
        });
        child.on('error', (spawnErr) => console.error('Launch failed (fallback):', spawnErr));
        child.unref();
      }
    }

    if (config.settings.autoHideOnLaunch) {
      hideWindow();
    }
    return { success: true };
  } catch (error) {
    console.error('Launch failed:', error);
    return { success: false, error: error.message };
  }
});

// File chooser
ipcMain.handle('select-file', async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender) || win;
  const result = await dialog.showOpenDialog(senderWindow, {
    properties: ['openFile'],
    title: '选择快捷启动文件'
  });
  
  if (result.canceled || result.filePaths.length === 0) return null;

  // 用户亲自选中的文件所在目录，加入本次会话的授权范围
  dirAuthorizer.allowParentOf(result.filePaths[0]);
  return result.filePaths[0];
});

// Folder chooser
ipcMain.handle('select-folder', async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender) || win;
  const result = await dialog.showOpenDialog(senderWindow, {
    properties: ['openDirectory'],
    title: '选择快捷启动文件夹'
  });
  
  if (result.canceled || result.filePaths.length === 0) return null;

  // 只有用户亲自选择的目录才允许后续被枚举
  dirAuthorizer.allow(result.filePaths[0]);
  return result.filePaths[0];
});

// Auto-start setting
ipcMain.handle('update-autostart', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: ['--hidden']
  });
  const config = loadConfig();
  config.settings.autostart = enabled;
  saveConfigSync(config);
  return { success: true };
});

// Change Global Hotkey
ipcMain.handle('register-shortcut', (event, accelerator) => {
  registerGlobalShortcut(accelerator);
  const config = loadConfig();
  config.settings.hotkey = accelerator;
  saveConfigSync(config);
  return { success: true };
});

// Check file paths existence
ipcMain.handle('check-paths', (event, paths) => {
  if (!Array.isArray(paths)) return [];

  // 只回答"当前配置里确实存在的启动项路径"，避免该接口被当作任意文件系统探测器
  const config = loadConfig();
  const knownPaths = new Set(
    (Array.isArray(config.items) ? config.items : [])
      .filter((item) => item && typeof item.path === 'string' && item.path.length > 0)
      .map((item) => path.resolve(item.path))
  );

  return paths.map((p) => {
    if (typeof p !== 'string' || p.length === 0) return false;
    if (/^https?:\/\//i.test(p)) return true;

    // 相对系统命令（如 cmd.exe）不做存在性探测，一律视为可用
    if (!path.isAbsolute(p)) return true;

    if (!knownPaths.has(path.resolve(p))) return false;

    try {
      return fs.existsSync(p);
    } catch (err) {
      return false;
    }
  });
});

ipcMain.handle('hide-window', () => {
  hideWindow();
  return { success: true };
});

ipcMain.handle('close-app', () => {
  app.isQuiting = true;
  app.quit();
});

ipcMain.handle('center-window', () => {
  showWindowCentered();
  return { success: true };
});

// Export Config
ipcMain.handle('export-config', async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender) || win;
  const result = await dialog.showSaveDialog(senderWindow, {
    title: '导出配置文件',
    defaultPath: path.join(app.getPath('downloads'), 'tar-v-config.json'),
    filters: [{ name: 'JSON 配置文件', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) return null;

  try {
    const config = loadConfig();
    fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Import Config — 第一步：读取 + 校验，暂存待确认
ipcMain.handle('import-config', async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender) || win;
  const result = await dialog.showOpenDialog(senderWindow, {
    title: '导入配置文件',
    filters: [{ name: 'JSON 配置文件', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  try {
    const fileStat = fs.statSync(result.filePaths[0]);
    if (fileStat.size > 8 * 1024 * 1024) {
      throw new Error('配置文件过大（上限 8MB）');
    }

    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    const parsed = JSON.parse(data);

    // 字段与类型白名单校验：未知字段、超长字段、悬空引用一律拒绝
    const validation = validateConfig(parsed);
    if (!validation.ok) {
      return { success: false, error: validation.errors.slice(0, 8).join('；') };
    }

    // 不落盘、不生效，先暂存等待用户二次确认
    pendingImport = { config: validation.value, sourcePath: result.filePaths[0] };

    return {
      success: true,
      requiresConfirmation: true,
      summary: validation.summary,
      warnings: validation.warnings
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Import Config — 第二步：用户确认后才真正应用
ipcMain.handle('confirm-import-config', async (event, accept) => {
  if (!pendingImport) {
    return { success: false, error: '没有待确认的导入配置' };
  }

  if (accept !== true) {
    pendingImport = null;
    return { success: true, applied: false };
  }

  const importedConfig = pendingImport.config;
  pendingImport = null;

  saveConfigSync(importedConfig);

  // 自启动与全局热键属于危险设置，只在确认后应用
  registerGlobalShortcut(importedConfig.settings.hotkey);
  app.setLoginItemSettings({
    openAtLogin: importedConfig.settings.autostart === true,
    path: app.getPath('exe'),
    args: ['--hidden']
  });

  if (win && !win.isDestroyed()) {
    win.reload();
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('show-import-success');
    });
  }
  return { success: true, applied: true };
});

// Get all files inside a folder (non-recursive) for batch importing
ipcMain.handle('get-folder-files', async (event, folderPath) => {
  try {
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
      return { success: false, error: '路径无效' };
    }
    if (!path.isAbsolute(folderPath)) {
      return { success: false, error: '只支持绝对路径' };
    }
    // 目录枚举是敏感操作：只允许用户通过「选择文件夹」对话框亲自授权过的目录
    if (!dirAuthorizer.isAllowed(folderPath)) {
      return { success: false, error: '该目录未获授权，请通过「文件夹」按钮重新选择' };
    }

    const folderStat = fs.statSync(folderPath);
    if (!folderStat.isDirectory()) {
      return { success: false, error: '目标不是文件夹' };
    }

    const files = fs.readdirSync(folderPath);
    const result = [];
    
    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (err) {
        continue; // 跳过无权限或已失效的条目
      }
      
      if (stat.isFile()) {
        result.push({
          name: file,
          path: fullPath
        });
      }
    }
    return { success: true, files: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Resolve windows .lnk and .url shortcuts target
ipcMain.handle('resolve-shortcut', (event, filePath) => {
  const fallback = { target: filePath || '', args: '', cwd: '', iconPath: '' };

  if (typeof filePath !== 'string' || filePath.length === 0) {
    return { target: '', args: '', cwd: '', iconPath: '' };
  }
  // 只解析真实存在的绝对路径，并拒绝路径穿越
  if (!path.isAbsolute(filePath) || hasTraversal(filePath)) {
    return fallback;
  }

  let fileStat;
  try {
    fileStat = fs.statSync(filePath);
  } catch (err) {
    return fallback;
  }
  if (!fileStat.isFile()) {
    return fallback;
  }

  const lowerPath = filePath.toLowerCase();
  
  if (lowerPath.endsWith('.lnk')) {
    try {
      const shortcut = shell.readShortcutLink(filePath);
      return {
        target: shortcut.target || filePath,
        args: shortcut.args || '',
        cwd: shortcut.cwd || '',
        iconPath: ''
      };
    } catch (err) {
      console.error('Failed to resolve shortcut link:', err);
      return { target: filePath, args: '', cwd: '', iconPath: '' };
    }
  }
  
  if (lowerPath.endsWith('.url')) {
    try {
      // .url 是纯文本文件，限制读取体积，避免被用来读取大文件
      if (fileStat.size > 64 * 1024) {
        return { target: filePath, args: '', cwd: '', iconPath: '' };
      }

      let content = '';
      const buffer = fs.readFileSync(filePath);
      // Detect UTF-16 LE BOM (0xFF 0xFE)
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        content = buffer.toString('utf16le');
      } else {
        content = buffer.toString('utf-8');
      }
      
      // Parse URL key
      const urlMatch = content.match(/URL=(.+)/i);
      const target = urlMatch ? urlMatch[1].trim() : filePath;
      
      // Parse IconFile key
      const iconFileMatch = content.match(/IconFile=(.+)/i);
      let iconPath = iconFileMatch ? iconFileMatch[1].trim() : '';
      
      // Expand environment variables in iconPath if any
      if (iconPath) {
        iconPath = iconPath.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
        if (iconPath.startsWith('"') && iconPath.endsWith('"')) {
          iconPath = iconPath.slice(1, -1);
        }
        // Strip index if present, e.g. "C:\path\to\icon.ico,0"
        const lastCommaIdx = iconPath.lastIndexOf(',');
        if (lastCommaIdx !== -1) {
          const suffix = iconPath.substring(lastCommaIdx + 1);
          if (/^-?\d+$/.test(suffix.trim())) {
            iconPath = iconPath.substring(0, lastCommaIdx).trim();
          }
        }
      }
      
      return {
        target: target,
        args: '',
        cwd: '',
        iconPath: iconPath
      };
    } catch (err) {
      console.error('Failed to resolve URL shortcut:', err);
      return { target: filePath, args: '', cwd: '', iconPath: '' };
    }
  }
  
  return { target: filePath, args: '', cwd: '', iconPath: '' };
});
