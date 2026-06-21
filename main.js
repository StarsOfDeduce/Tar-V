const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let win = null;
let settingsWin = null; // Independent Settings Window
let tray = null;
let currentConfig = null;

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
      sandbox: false // Sandbox MUST be false to allow access to file.path in drag and drop files
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
      sandbox: false
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

// Helper to extract PE icon using PowerShell and .NET System.Drawing
function extractIconWithPowerShell(targetPath) {
  return new Promise((resolve, reject) => {
    const escapedPath = targetPath.replace(/'/g, "''"); // escape single quotes for powershell
    const psScript = `
      Add-Type -AssemblyName System.Drawing;
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escapedPath}');
      if ($icon) {
        $bitmap = $icon.ToBitmap();
        $stream = New-Object System.IO.MemoryStream;
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png);
        $bytes = $stream.ToArray();
        $base64 = [Convert]::ToBase64String($bytes);
        Write-Output $base64;
      }
    `;
    
    const command = psScript.replace(/\n/g, ' ').trim();
    exec(`powershell -Command "${command}"`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Get high-res icon for a path
ipcMain.handle('get-file-icon', async (event, filePath) => {
  if (!filePath) return FALLBACK_ICONS.file;
  
  // Handle URLs
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return FALLBACK_ICONS.web;
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

  return iconUrl;
});

// Launch item
ipcMain.handle('launch-item', async (event, filePath, args, runAsAdmin) => {
  if (!filePath) {
    return { success: false, error: '启动路径为空' };
  }
  const config = loadConfig();
  
  try {
    // Handle Web URLs
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      await shell.openExternal(filePath);
      if (config.settings.autoHideOnLaunch) {
        hideWindow();
      }
      return { success: true };
    }

    // Standard Files and Commands
    const cleanPath = resolveAbsolutePath(filePath);
    const isRelativeOrSystem = !path.isAbsolute(cleanPath) && !fs.existsSync(cleanPath);
    
    if (!isRelativeOrSystem && !fs.existsSync(cleanPath)) {
      throw new Error(`路径不存在: "${cleanPath}"`);
    }

    if (runAsAdmin) {
      await new Promise((resolve, reject) => {
        // PowerShell verb RunAs to request admin rights
        const escapedPath = cleanPath.replace(/"/g, '`"');
        const escapedArgs = args ? args.replace(/"/g, '`"') : '';
        const command = `Start-Process "${escapedPath}" ${args ? `-ArgumentList "${escapedArgs}"` : ''} -Verb RunAs`;
        
        exec(`powershell -Command "${command}"`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } else {
      if (args) {
        // Launch with arguments using spawn in detached mode
        const child = spawn(cleanPath, [args], {
          detached: true,
          stdio: 'ignore',
          shell: true
        });
        child.unref();
      } else {
        // Launch using shell open
        const err = await shell.openPath(cleanPath);
        if (err) {
          // Fallback to start cmd if shell fails (e.g. system directories or commands)
          await new Promise((resolve, reject) => {
            exec(`start "" "${cleanPath}"`, { shell: true }, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
        }
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
  return paths.map(p => {
    if (!p) return false;
    if (p.startsWith('http://') || p.startsWith('https://')) return true;
    
    // Relative / System commands like cmd.exe or explorer.exe
    if (!path.isAbsolute(p)) {
      return true; // We default to true for system command references to avoid delete scan errors
    }
    
    return fs.existsSync(p);
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

// Import Config
ipcMain.handle('import-config', async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender) || win;
  const result = await dialog.showOpenDialog(senderWindow, {
    title: '导入配置文件',
    filters: [{ name: 'JSON 配置文件', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    const newConfig = JSON.parse(data);
    
    if (!newConfig.settings || !Array.isArray(newConfig.tabs) || !Array.isArray(newConfig.items)) {
      throw new Error('无效的配置文件格式！必须包含 settings、tabs 和 items 字段。');
    }

    saveConfigSync(newConfig);
    
    // Apply key settings immediately
    registerGlobalShortcut(newConfig.settings.hotkey);
    app.setLoginItemSettings({
      openAtLogin: newConfig.settings.autostart,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
    
    // Refresh web contents
    win.reload();
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('show-import-success');
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Get all files inside a folder (non-recursive) for batch importing
ipcMain.handle('get-folder-files', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath);
    const result = [];
    
    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const stat = fs.statSync(fullPath);
      
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

// Resolve windows .lnk shortcuts target
ipcMain.handle('resolve-shortcut', (event, filePath) => {
  if (filePath && filePath.toLowerCase().endsWith('.lnk')) {
    try {
      const shortcut = shell.readShortcutLink(filePath);
      return {
        target: shortcut.target || filePath,
        args: shortcut.args || '',
        cwd: shortcut.cwd || ''
      };
    } catch (err) {
      console.error('Failed to resolve shortcut link:', err);
      return { target: filePath || '', args: '', cwd: '' };
    }
  }
  return { target: filePath || '', args: '', cwd: '' };
});
