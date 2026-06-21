const { contextBridge, ipcRenderer, webUtils } = require('electron');

let dropCallback = null;

// PRIVILEGED DOM Drag & Drop Orchestrator
// We bind drag/drop events in preload because:
// 1. We must prevent browser defaults on dragover to enable dropping in Chromium
// 2. Isolated renderers cannot access native file.path due to security serialization
// 3. Preload shares the DOM tree so we can toggle visual overlays directly
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  
  const settingsModal = document.getElementById('settings-modal');
  const editModal = document.getElementById('edit-modal');
  
  if (settingsModal && settingsModal.style.display === 'flex') return;
  if (editModal && editModal.style.display === 'flex') return;
  
  const dragOverlay = document.getElementById('drag-overlay');
  if (dragOverlay) {
    dragOverlay.classList.add('active');
  }
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  const dragOverlay = document.getElementById('drag-overlay');
  if (dragOverlay && (e.target === dragOverlay || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
    dragOverlay.classList.remove('active');
  }
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  const dragOverlay = document.getElementById('drag-overlay');
  if (dragOverlay) {
    dragOverlay.classList.remove('active');
  }
  
  if (dropCallback && e.dataTransfer && e.dataTransfer.files) {
    const fileList = Array.from(e.dataTransfer.files).map(file => {
      let filePath = '';
      try {
        filePath = webUtils.getPathForFile(file);
      } catch (err) {
        console.error('Failed to get path via webUtils:', err);
        filePath = file.path;
      }
      return {
        name: file.name,
        path: filePath
      };
    });
    dropCallback(fileList);
  }
});

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),
  launchItem: (filePath, args, runAsAdmin) => ipcRenderer.invoke('launch-item', filePath, args, runAsAdmin),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  updateAutostart: (enabled) => ipcRenderer.invoke('update-autostart', enabled),
  registerShortcut: (accelerator) => ipcRenderer.invoke('register-shortcut', accelerator),
  checkPaths: (paths) => ipcRenderer.invoke('check-paths', paths),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  closeApp: () => ipcRenderer.invoke('close-app'),
  centerWindow: () => ipcRenderer.invoke('center-window'),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
  getFolderFiles: (folderPath) => ipcRenderer.invoke('get-folder-files', folderPath),
  resolveShortcut: (filePath) => ipcRenderer.invoke('resolve-shortcut', filePath),
  
  // Custom Drag & Drop listener registration
  onFilesDropped: (callback) => {
    dropCallback = callback;
  },
  
  // Event listeners
  onWindowShow: (callback) => ipcRenderer.on('window-show', () => callback()),
  onWindowHide: (callback) => ipcRenderer.on('window-hide', () => callback()),
  
  // Independent Settings Window APIs
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', (event, newConfig) => callback(newConfig)),
  onImportSuccess: (callback) => ipcRenderer.on('show-import-success', () => callback())
});
