// Settings Window Logic for Tar V
let config = null;
let originalConfigStr = '';
let deadItemsList = [];

// Dictionary for multi-language translation (Req 34)
const TRANSLATIONS = {
  zh: {
    sidebarGeneral: "常规",
    sidebarAppearance: "外观",
    sidebarPreferences: "偏好",
    sidebarHotkeys: "唤出与收起",
    sidebarTabs: "切换标签",
    sidebarCommonApps: "常用软件",
    sidebarMaintenance: "维护",
    sidebarImport: "备份与恢复",
    
    titleGeneral: "常规设置",
    titleAppearance: "外观设置",
    titlePreferences: "偏好设置",
    titleHotkeys: "唤出与收起",
    titleTabs: "切换标签",
    titleCommonApps: "常用软件设置",
    titleMaintenance: "维护服务",
    titleImport: "备份与恢复",

    winCmdTitle: "命令提示符 (cmd.exe)",
    winCmdDesc: "Windows 命令行工具",
    winExplorerTitle: "文件资源管理器 (explorer.exe)",
    winExplorerDesc: "文件和文件夹浏览工具",
    winTaskmgrTitle: "任务管理器 (taskmgr.exe)",
    winTaskmgrDesc: "查看系统运行进程与性能监测",
    winCalcTitle: "计算器 (calc.exe)",
    winCalcDesc: "Windows 内置计算器",
    winNotepadTitle: "记事本 (notepad.exe)",
    winNotepadDesc: "简易文本编辑器",
    winControlTitle: "控制面板 (control.exe)",
    winControlDesc: "管理系统设置和控制面板选项",
    winRegeditTitle: "注册表编辑器 (regedit.exe)",
    winRegeditDesc: "查看及修改 Windows 注册表配置",
    winDevmgmtTitle: "设备管理器 (devmgmt.msc)",
    winDevmgmtDesc: "查看并管理硬件设备和驱动程序",

    btnSave: "保存修改",
    btnCancel: "取消",
    btnConfirm: "确定",

    opt_lang_title: "语言",
    opt_lang_desc: "选择界面的显示语言",
    opt_autostart_title: "开机自启动",
    opt_autostart_desc: "Windows 系统登录后自动运行 Tar V",
    opt_search_title: "显示搜索框",
    opt_search_desc: "开启或关闭主界面右上角的搜索框",
    
    opt_style_title: "界面风格",
    opt_style_desc: "切换主面板的主题风格模式",
    style_dark: "深色模式",
    style_light: "浅色模式",
    style_system: "跟随系统",
    opt_cols_title: "网格列数",
    opt_cols_desc: "主面板中每行显示的快捷图标列数 (6 - 12)",
    opt_bg_title: "背景基色",
    opt_bg_desc: "选择或输入面板的基础背景色",
    opt_accent_title: "高亮主题色",
    opt_accent_desc: "修改按钮、激活标签和边框的高亮颜色",
    opt_opacity_title: "面板背景不透明度",
    opt_opacity_desc: "调整主窗口背景透明度 (30% - 100%, 仅对非纯色模式有效)",
    opt_radius_title: "圆角大小",
    opt_radius_desc: "调整主窗口四角的圆角程度",
    radius_none: "直角 (0px)",
    radius_small: "小圆角 (4px)",
    radius_medium: "中圆角 (8px)",
    radius_large: "大圆角 (12px)",
    opt_hidenames_title: "隐藏项目名称",
    opt_hidenames_desc: "仅显示图标，隐藏快捷方式名称",
    opt_fstab_title: "标签页字体大小",
    opt_fstab_desc: "控制主界面分组标签文本字号 (10px - 24px)",
    opt_fsitem_title: "快捷项字体大小",
    opt_fsitem_desc: "控制主界面快捷项名称文本字号 (10px - 24px)",
    opt_fssettings_title: "设置中心字体大小",
    opt_fssettings_desc: "控制本设置页面内所有文本字号 (10px - 24px)",

    opt_click_title: "项目启动点击模式",
    opt_click_desc: "运行快捷项需要的鼠标点击次数",
    click_single: "单击运行",
    click_double: "双击运行",
    opt_drag_title: "图标拖动模式",
    opt_drag_desc: "在主界面拖动图标调整顺序时的行为",
    drag_sort: "排序式拖动 (插入)",
    drag_swap: "交换式拖动 (对调)",
    opt_autohide_launch_title: "启动项目后自动收起",
    opt_autohide_launch_desc: "当运行某个快捷项后，自动关闭 Tar V 窗口",
    opt_autohide_blur_title: "失去焦点自动收起",
    opt_autohide_blur_desc: "点击窗口外部或切换到其他应用时，自动收起面板",

    opt_hotkey_title: "键盘快捷键唤出面板",
    opt_hotkey_desc: "按下该快捷键可以快速切换面板显示与隐藏",
    hotkey_placeholder: "点击录制快捷键",
    hotkey_tip: "支持 Alt, Ctrl, Shift 组合键",
    opt_esc_title: "按下 ESC 键收起面板",
    opt_esc_desc: "当面板处于显示状态时，按 ESC 键隐藏",
    opt_pos_title: "面板唤出位置",
    opt_pos_desc: "选择呼出面板时的放置逻辑",
    pos_center: "屏幕中央",
    pos_cursor: "跟随鼠标屏幕",

    opt_tabhover_title: "通过鼠标悬停切换标签",
    opt_tabhover_desc: "鼠标移至顶部标签上方停留 200ms 后自动切换",
    opt_tabscroll_title: "通过鼠标滚轮切换标签",
    opt_tabscroll_desc: "在顶部标签栏上滚动鼠标滚轮可在标签间快速切换",
    opt_tabkeys_title: "通过键盘数字键切换标签",
    opt_tabkeys_desc: "按数字键 1-9 快速选择前 9 个分组标签页",

    opt_repair_title: "修复并重载图标",
    opt_repair_desc: "重新提取并刷新所有快捷启动项目的图标缓存。",
    opt_sort_title: "按名称排序全部项",
    opt_sort_desc: "对所有标签下的快捷项按拼音与字母进行升序排列。",
    opt_clean_title: "清理全部重复项",
    opt_clean_desc: "扫描并删除所有指向相同目标路径的重复快捷方式。",
    opt_cleanpaths_title: "清理全部失效项",
    opt_cleanpaths_desc: "检测并清理所有已经不存在的本地文件或文件夹快捷路径。",
    opt_empty_title: "清理空标签",
    opt_empty_desc: "扫描并直接删除任何不含快捷图标的分组标签页。",
    maintenance_run: "执行",
    maintenance_scan: "扫描检测",
    maintenance_clean: "一键清理",
    status_dead: "失效",
    msg_reloading: "重载中...",
    msg_scanning: "检测中...",
    msg_scan_progress: "正在扫描检测本地路径...",
    msg_scan_no_local: "无需要检测的本地路径。",
    msg_scan_clean: "检测完毕，未发现失效快捷项！",
    msg_clean_done: "失效项目清理完成！",
    msg_repair_success: "快捷启动图标已成功重载并刷新缓存！",
    msg_repair_fail: "图标重载失败: ",
    msg_sort_success: "已对所有分组下的项目进行字母升序排列！",
    msg_dup_success: "重复项清理完成！共移除了 {count} 个重复的快捷方式。",
    msg_empty_success: "清理空标签完成！共删除了 {count} 个空标签。",

    opt_export_title: "备份配置文件",
    opt_export_desc: "将当前的标签、快捷项及个人偏好设置导出为 `.json` 文件。",
    opt_import_title: "恢复配置文件",
    opt_import_desc: "从已备份的 JSON 配置文件恢复所有项目。",
    btn_export: "导出数据",
    btn_import: "导入数据",
    msg_export_success: "配置数据已成功备份至:\n{path}",
    msg_export_fail: "导出配置失败: ",
    msg_import_success: "备份配置已成功导入！软件将自动重载应用设置。",
    msg_import_fail: "导入配置失败: "
  },
  en: {
    sidebarGeneral: "General",
    sidebarAppearance: "Appearance",
    sidebarPreferences: "Preferences",
    sidebarHotkeys: "Shortcuts",
    sidebarTabs: "Tabs",
    sidebarCommonApps: "Common Apps",
    sidebarMaintenance: "Maintenance",
    sidebarImport: "Backup",
    
    titleGeneral: "General Settings",
    titleAppearance: "Appearance Settings",
    titlePreferences: "Preferences",
    titleHotkeys: "Show & Hide",
    titleTabs: "Tab Switching",
    titleCommonApps: "Common Windows Apps",
    titleMaintenance: "Maintenance",
    titleImport: "Backup & Restore",

    winCmdTitle: "Command Prompt (cmd.exe)",
    winCmdDesc: "Windows command-line interpreter utility",
    winExplorerTitle: "File Explorer (explorer.exe)",
    winExplorerDesc: "File manager and explorer helper",
    winTaskmgrTitle: "Task Manager (taskmgr.exe)",
    winTaskmgrDesc: "Monitor system performance and processes",
    winCalcTitle: "Calculator (calc.exe)",
    winCalcDesc: "Built-in Windows math calculator",
    winNotepadTitle: "Notepad (notepad.exe)",
    winNotepadDesc: "Simple plain-text text editor",
    winControlTitle: "Control Panel (control.exe)",
    winControlDesc: "Access legacy Windows settings and config",
    winRegeditTitle: "Registry Editor (regedit.exe)",
    winRegeditDesc: "Browse and configure system registry settings",
    winDevmgmtTitle: "Device Manager (devmgmt.msc)",
    winDevmgmtDesc: "Manage hardware components and drivers",

    btnSave: "Save Changes",
    btnCancel: "Cancel",
    btnConfirm: "Confirm",

    opt_lang_title: "Language",
    opt_lang_desc: "Select the display language for the user interface",
    opt_autostart_title: "Auto-start on Boot",
    opt_autostart_desc: "Run Tar V automatically after Windows system starts",
    opt_search_title: "Show Search Bar",
    opt_search_desc: "Turn on/off the search bar in the top-right of main interface",
    
    opt_style_title: "Theme Mode",
    opt_style_desc: "Toggle color theme styling modes for the panels",
    style_dark: "Dark Mode",
    style_light: "Light Mode",
    style_system: "Follow System",
    opt_cols_title: "Columns Count",
    opt_cols_desc: "Columns of shortcut icons displayed per row in main panel (6 - 12)",
    opt_bg_title: "Base Background Color",
    opt_bg_desc: "Select or input base background hex color",
    opt_accent_title: "Accent Color",
    opt_accent_desc: "Modify accent colors for buttons, active tags, and borders",
    opt_opacity_title: "Background Opacity",
    opt_opacity_desc: "Adjust background opacity level (30% - 100%)",
    opt_radius_title: "Border Radius",
    opt_radius_desc: "Adjust rounded corners of launcher window panels",
    radius_none: "Straight (0px)",
    radius_small: "Small (4px)",
    radius_medium: "Medium (8px)",
    radius_large: "Large (12px)",
    opt_hidenames_title: "Hide Shortcuts Name",
    opt_hidenames_desc: "Display icons only and hide labels of all shortcut items",
    opt_fstab_title: "Tabs Font Size",
    opt_fstab_desc: "Control text size of category tabs on top (10px - 24px)",
    opt_fsitem_title: "Shortcuts Font Size",
    opt_fsitem_desc: "Control text size of shortcut item labels (10px - 24px)",
    opt_fssettings_title: "Settings Font Size",
    opt_fssettings_desc: "Control font size for text inside settings center (10px - 24px)",

    opt_click_title: "Item Launch Mode",
    opt_click_desc: "Number of mouse clicks required to run a shortcut item",
    click_single: "Single Click",
    click_double: "Double Click",
    opt_drag_title: "Icon Drag Mode",
    opt_drag_desc: "Behavior when dragging icons to reorder on the main panel",
    drag_sort: "Sorting Drag (Insert)",
    drag_swap: "Swapping Drag (Exchange)",
    opt_autohide_launch_title: "Auto Hide on Launch",
    opt_autohide_launch_desc: "Automatically hide Tar V launcher window after running any item",
    opt_autohide_blur_title: "Auto Hide on Blur",
    opt_autohide_blur_desc: "Automatically hide launcher window when losing focus or clicking outside",

    opt_hotkey_title: "Global Toggle Shortcut",
    opt_hotkey_desc: "Press this hotkey combination to quickly show or hide Tar V",
    hotkey_placeholder: "Click to record shortcut",
    hotkey_tip: "Supports Alt, Ctrl, Shift modifiers",
    opt_esc_title: "Hide on Escape",
    opt_esc_desc: "Hide launcher panel when pressing the ESC key",
    opt_pos_title: "Launcher Position",
    opt_pos_desc: "Determine screen position logic when launching panel",
    pos_center: "Screen Center",
    pos_cursor: "Follow Mouse Cursor",

    opt_tabhover_title: "Switch on Mouse Hover",
    opt_tabhover_desc: "Automatically switch tabs after hovering cursor over category for 200ms",
    opt_tabscroll_title: "Switch on Mouse Wheel",
    opt_tabscroll_desc: "Scroll mouse wheel over top tab bar to cycle through categories",
    opt_tabkeys_title: "Switch on Keyboard Numbers",
    opt_tabkeys_desc: "Press number keys 1-9 to quickly select corresponding tab groups",

    opt_repair_title: "Repair Icons Cache",
    opt_repair_desc: "Re-extract and refresh cached icons for all startup shortcuts.",
    opt_sort_title: "Sort All Alphabetically",
    opt_sort_desc: "Sort all shortcuts under categories in ascending alphabetical order.",
    opt_clean_title: "Clean Duplicate Shortcuts",
    opt_clean_desc: "Scan and remove duplicate entries pointing to same folder/file path.",
    opt_cleanpaths_title: "Clean Dead Paths",
    opt_cleanpaths_desc: "Scan and remove shortcuts pointing to files or folders that no longer exist.",
    opt_empty_title: "Clean Empty Tab Groups",
    opt_empty_desc: "Remove any tab groups that contain no shortcut items.",
    maintenance_run: "Run",
    maintenance_scan: "Scan",
    maintenance_clean: "Clean All",
    status_dead: "Dead",
    msg_reloading: "Reloading...",
    msg_scanning: "Scanning...",
    msg_scan_progress: "Scanning local paths for dead entries...",
    msg_scan_no_local: "No local paths require scanning.",
    msg_scan_clean: "Scan complete. No dead shortcut paths found!",
    msg_clean_done: "Dead paths cleanup completed!",
    msg_repair_success: "Shortcut icons rebuilt and refreshed successfully!",
    msg_repair_fail: "Icon repair failed: ",
    msg_sort_success: "Successfully sorted shortcuts under all tabs alphabetically!",
    msg_dup_success: "Duplicates clean up complete! Removed {count} duplicate items.",
    msg_empty_success: "Empty tabs clean up complete! Removed {count} empty categories.",

    opt_export_title: "Backup Settings Data",
    opt_export_desc: "Export tabs, shortcuts list, and personal preferences to a `.json` backup file.",
    opt_import_title: "Restore Settings Data",
    opt_import_desc: "Restore launcher configurations from a previously exported backup JSON.",
    btn_export: "Export",
    btn_import: "Import",
    msg_export_success: "Backup exported successfully to:\n{path}",
    msg_export_fail: "Export backup failed: ",
    msg_import_success: "Configurations imported successfully! Reloading application settings.",
    msg_import_fail: "Import backup failed: "
  }
};

function translateUI() {
  const lang = config.settings.language || 'zh';
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;

  // Sidebar items
  const setSidebarText = (tab, text) => {
    const el = document.querySelector(`.sidebar-item[data-tab="${tab}"] span`);
    if (el) el.textContent = text;
  };
  setSidebarText("settings-general", t.sidebarGeneral);
  setSidebarText("settings-appearance", t.sidebarAppearance);
  setSidebarText("settings-preferences", t.sidebarPreferences);
  setSidebarText("settings-hotkeys", t.sidebarHotkeys);
  setSidebarText("settings-tabs", t.sidebarTabs);
  setSidebarText("settings-common-apps", t.sidebarCommonApps);
  setSidebarText("settings-maintenance", t.sidebarMaintenance);
  setSidebarText("settings-import", t.sidebarImport);

  // Section titles
  const setSecTitle = (id, text) => {
    const el = document.querySelector(`#${id} h2`);
    if (el) el.textContent = text;
  };
  setSecTitle("settings-general", t.titleGeneral);
  setSecTitle("settings-appearance", t.titleAppearance);
  setSecTitle("settings-preferences", t.titlePreferences);
  setSecTitle("settings-hotkeys", t.titleHotkeys);
  setSecTitle("settings-tabs", t.titleTabs);
  setSecTitle("settings-common-apps", t.titleCommonApps);
  setSecTitle("settings-maintenance", t.titleMaintenance);
  setSecTitle("settings-import", t.titleImport);

  // Footer buttons
  const btnSave = document.getElementById('btn-settings-save');
  if (btnSave) btnSave.textContent = t.btnSave;
  const btnCancel = document.getElementById('btn-settings-cancel');
  if (btnCancel) btnCancel.textContent = t.btnCancel;

  // Translation helper for setting rows using proximity matching
  const setTranslation = (elementId, titleKey, descKey) => {
    const inputEl = document.getElementById(elementId);
    if (!inputEl) return;
    const row = inputEl.closest('.setting-row');
    if (!row) return;
    const elTitle = row.querySelector('.setting-title');
    const elDesc = row.querySelector('.setting-desc');
    if (elTitle && t[titleKey]) elTitle.textContent = t[titleKey];
    if (elDesc && t[descKey]) elDesc.textContent = t[descKey];
  };

  setTranslation('opt-language', 'opt_lang_title', 'opt_lang_desc');
  setTranslation('opt-autostart', 'opt_autostart_title', 'opt_autostart_desc');
  setTranslation('opt-show-search', 'opt_search_title', 'opt_search_desc');
  setTranslation('opt-style-mode', 'opt_style_title', 'opt_style_desc');
  setTranslation('opt-columns', 'opt_cols_title', 'opt_cols_desc');
  setTranslation('opt-bg-color', 'opt_bg_title', 'opt_bg_desc');
  setTranslation('opt-accent-color', 'opt_accent_title', 'opt_accent_desc');
  setTranslation('opt-opacity', 'opt_opacity_title', 'opt_opacity_desc');
  setTranslation('opt-radius', 'opt_radius_title', 'opt_radius_desc');
  setTranslation('opt-hide-names', 'opt_hidenames_title', 'opt_hidenames_desc');
  setTranslation('opt-font-size-tab', 'opt_fstab_title', 'opt_fstab_desc');
  setTranslation('opt-font-size-item', 'opt_fsitem_title', 'opt_fsitem_desc');
  setTranslation('opt-font-size-settings', 'opt_fssettings_title', 'opt_fssettings_desc');
  setTranslation('opt-click-mode', 'opt_click_title', 'opt_click_desc');
  setTranslation('opt-drag-mode', 'opt_drag_title', 'opt_drag_desc');
  setTranslation('opt-autohide-launch', 'opt_autohide_launch_title', 'opt_autohide_launch_desc');
  setTranslation('opt-autohide-blur', 'opt_autohide_blur_title', 'opt_autohide_blur_desc');
  setTranslation('opt-hotkey', 'opt_hotkey_title', 'opt_hotkey_desc');
  setTranslation('opt-esc-hide', 'opt_esc_title', 'opt_esc_desc');
  setTranslation('opt-popup-pos', 'opt_pos_title', 'opt_pos_desc');
  setTranslation('opt-tab-hover', 'opt_tabhover_title', 'opt_tabhover_desc');
  setTranslation('opt-tab-scroll', 'opt_tabscroll_title', 'opt_tabscroll_desc');
  setTranslation('opt-tab-keys', 'opt_tabkeys_title', 'opt_tabkeys_desc');
  setTranslation('btn-repair-icons', 'opt_repair_title', 'opt_repair_desc');
  setTranslation('btn-sort-all-items', 'opt_sort_title', 'opt_sort_desc');
  setTranslation('btn-clean-duplicates', 'opt_clean_title', 'opt_clean_desc');
  setTranslation('btn-scan-paths', 'opt_cleanpaths_title', 'opt_cleanpaths_desc');
  setTranslation('btn-clean-empty-tabs', 'opt_empty_title', 'opt_empty_desc');
  setTranslation('btn-export-config', 'opt_export_title', 'opt_export_desc');
  setTranslation('btn-import-config', 'opt_import_title', 'opt_import_desc');

  // Option actions dropdown contents translation
  const translateDropdown = (selectId, valueMap) => {
    const select = document.getElementById(selectId);
    if (!select) return;
    Array.from(select.options).forEach(opt => {
      if (valueMap[opt.value]) {
        opt.textContent = valueMap[opt.value];
      }
    });
  };

  translateDropdown('opt-style-mode', {
    dark: t.style_dark,
    light: t.style_light,
    system: t.style_system
  });

  translateDropdown('opt-radius', {
    '0px': t.radius_none,
    '4px': t.radius_small,
    '8px': t.radius_medium,
    '12px': t.radius_large
  });

  translateDropdown('opt-click-mode', {
    single: t.click_single,
    double: t.click_double
  });

  translateDropdown('opt-drag-mode', {
    sort: t.drag_sort,
    swap: t.drag_swap
  });

  translateDropdown('opt-popup-pos', {
    center: t.pos_center,
    cursor: t.pos_cursor
  });

  // Columns dropdown
  const colsSelect = document.getElementById('opt-columns');
  if (colsSelect) {
    Array.from(colsSelect.options).forEach(opt => {
      const num = opt.value;
      opt.textContent = lang === 'en' ? `${num} Columns` : `${num} 列`;
    });
  }

  // Buttons translation in action rows
  const setBtnText = (btnId, key) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.textContent = t[key];
  };

  setBtnText('btn-repair-icons', 'maintenance_run');
  setBtnText('btn-sort-all-items', 'maintenance_run');
  setBtnText('btn-clean-duplicates', 'maintenance_run');
  setBtnText('btn-scan-paths', 'maintenance_scan');
  setBtnText('btn-clean-paths', 'maintenance_clean');
  setBtnText('btn-clean-empty-tabs', 'maintenance_run');
  setBtnText('btn-export-config', 'btn_export');
  setBtnText('btn-import-config', 'btn_import');

  // Miscellaneous inputs / placeholders / tooltips
  if (optHotkey) optHotkey.placeholder = t.hotkey_placeholder;
  const hotkeyTip = document.querySelector('.hotkey-tip');
  if (hotkeyTip) hotkeyTip.textContent = t.hotkey_tip;

  // Dialog modals
  const dialogCancelBtn = document.getElementById('dialog-cancel-btn');
  if (dialogCancelBtn) dialogCancelBtn.textContent = t.btnCancel;
  const dialogConfirmBtn = document.getElementById('dialog-confirm-btn');
  if (dialogConfirmBtn) dialogConfirmBtn.textContent = t.btnConfirm;
  const promptCancelBtn = document.getElementById('prompt-cancel-btn');
  if (promptCancelBtn) promptCancelBtn.textContent = t.btnCancel;
  const promptConfirmBtn = document.getElementById('prompt-confirm-btn');
  if (promptConfirmBtn) promptConfirmBtn.textContent = t.btnConfirm;

  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setElText("lbl-win-cmd", t.winCmdTitle);
  setElText("desc-win-cmd", t.winCmdDesc);
  setElText("lbl-win-explorer", t.winExplorerTitle);
  setElText("desc-win-explorer", t.winExplorerDesc);
  setElText("lbl-win-taskmgr", t.winTaskmgrTitle);
  setElText("desc-win-taskmgr", t.winTaskmgrDesc);
  setElText("lbl-win-calc", t.winCalcTitle);
  setElText("desc-win-calc", t.winCalcDesc);
  setElText("lbl-win-notepad", t.winNotepadTitle);
  setElText("desc-win-notepad", t.winNotepadDesc);
  setElText("lbl-win-control", t.winControlTitle);
  setElText("desc-win-control", t.winControlDesc);
  setElText("lbl-win-regedit", t.winRegeditTitle);
  setElText("desc-win-regedit", t.winRegeditDesc);
  setElText("lbl-win-devmgmt", t.winDevmgmtTitle);
  setElText("desc-win-devmgmt", t.winDevmgmtDesc);

  // Initialize custom HTML selects (Req 41)
  initCustomSelects();
}

function initCustomSelects() {
  const selects = document.querySelectorAll('select.dropdown-style');
  selects.forEach(select => {
    let container = select.parentElement;
    if (!container.classList.contains('custom-select-container')) {
      container = document.createElement('div');
      container.className = 'custom-select-container';
      select.parentNode.insertBefore(container, select);
      container.appendChild(select);
    }
    
    const oldTrigger = container.querySelector('.custom-select-trigger');
    if (oldTrigger) oldTrigger.remove();
    const oldOptions = container.querySelector('.custom-select-options');
    if (oldOptions) oldOptions.remove();
    
    select.style.display = 'none';
    
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger dropdown-style';
    
    const selectedOpt = select.options[select.selectedIndex] || select.options[0];
    trigger.textContent = selectedOpt ? selectedOpt.textContent : '';
    container.appendChild(trigger);
    
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'custom-select-options';
    
    Array.from(select.options).forEach((opt, idx) => {
      const optDiv = document.createElement('div');
      optDiv.className = 'custom-select-option';
      if (opt.selected) {
        optDiv.classList.add('selected');
      }
      optDiv.textContent = opt.textContent;
      optDiv.dataset.value = opt.value;
      optDiv.dataset.index = idx;
      
      optDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = opt.value;
        const event = new Event('change', { bubbles: true });
        select.dispatchEvent(event);
        
        trigger.textContent = opt.textContent;
        optionsContainer.querySelectorAll('.custom-select-option').forEach(child => {
          child.classList.remove('selected');
        });
        optDiv.classList.add('selected');
        optionsContainer.classList.remove('active');
      });
      optionsContainer.appendChild(optDiv);
    });
    
    container.appendChild(optionsContainer);
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-select-options').forEach(el => {
        if (el !== optionsContainer) el.classList.remove('active');
      });
      optionsContainer.classList.toggle('active');
    });
  });
}

// Global click handler to dismiss custom dropdowns
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-select-options').forEach(el => {
    el.classList.remove('active');
  });
});

// DOM Elements
const sidebarItems = document.querySelectorAll('.sidebar-item');
const settingsSections = document.querySelectorAll('.settings-section');

// Settings Inputs
const optLanguage = document.getElementById('opt-language');
const optAutostart = document.getElementById('opt-autostart');
const optShowSearch = document.getElementById('opt-show-search');
const optColumns = document.getElementById('opt-columns');
const optStyleMode = document.getElementById('opt-style-mode');
const optRadius = document.getElementById('opt-radius');
const optBgColor = document.getElementById('opt-bg-color');
const optBgColorPicker = document.getElementById('opt-bg-color-picker');
const optAccentColor = document.getElementById('opt-accent-color');
const optAccentColorPicker = document.getElementById('opt-accent-color-picker');
const optOpacity = document.getElementById('opt-opacity');
const optOpacityVal = document.getElementById('opt-opacity-val');
const optHideNames = document.getElementById('opt-hide-names');

// Font size sliders
const optFontSizeTab = document.getElementById('opt-font-size-tab');
const optFontSizeTabVal = document.getElementById('opt-font-size-tab-val');
const optFontSizeItem = document.getElementById('opt-font-size-item');
const optFontSizeItemVal = document.getElementById('opt-font-size-item-val');
const optFontSizeSettings = document.getElementById('opt-font-size-settings');
const optFontSizeSettingsVal = document.getElementById('opt-font-size-settings-val');

// Preferences, Hotkeys, Tabs
const optClickMode = document.getElementById('opt-click-mode');
const optDragMode = document.getElementById('opt-drag-mode');
const optAutohideLaunch = document.getElementById('opt-autohide-launch');
const optAutohideBlur = document.getElementById('opt-autohide-blur');
const optHotkey = document.getElementById('opt-hotkey');
const optEscHide = document.getElementById('opt-esc-hide');
const optPopupPos = document.getElementById('opt-popup-pos');
const optTabHover = document.getElementById('opt-tab-hover');
const optTabScroll = document.getElementById('opt-tab-scroll');
const optTabKeys = document.getElementById('opt-tab-keys');

// Footer Actions
const btnSettingsSave = document.getElementById('btn-settings-save');
const btnSettingsCancel = document.getElementById('btn-settings-cancel');

// Maintenance Buttons
const btnRepairIcons = document.getElementById('btn-repair-icons');
const btnSortAllItems = document.getElementById('btn-sort-all-items');
const btnCleanDuplicates = document.getElementById('btn-clean-duplicates');
const btnScanPaths = document.getElementById('btn-scan-paths');
const btnCleanPaths = document.getElementById('btn-clean-paths');
const pathCheckResults = document.getElementById('path-check-results');
const btnCleanEmptyTabs = document.getElementById('btn-clean-empty-tabs');

// Import / Export
const btnExportConfig = document.getElementById('btn-export-config');
const btnImportConfig = document.getElementById('btn-import-config');

// Custom dialog modals
function showCustomAlert(message) {
  return new Promise((resolve) => {
    const dialogModal = document.getElementById('dialog-modal');
    const dialogMessage = document.getElementById('dialog-message');
    const confirmBtn = document.getElementById('dialog-confirm-btn');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const closeX = document.getElementById('dialog-close-x');
    
    dialogMessage.textContent = message;
    cancelBtn.style.display = 'none';
    dialogModal.style.display = 'flex';
    
    const cleanUp = () => {
      dialogModal.style.display = 'none';
      cancelBtn.style.display = 'inline-block';
      confirmBtn.removeEventListener('click', onConfirm);
      closeX.removeEventListener('click', onConfirm);
      resolve();
    };
    
    const onConfirm = () => cleanUp();
    confirmBtn.addEventListener('click', onConfirm);
    closeX.addEventListener('click', onConfirm);
  });
}

function showCustomConfirm(message) {
  return new Promise((resolve) => {
    const dialogModal = document.getElementById('dialog-modal');
    const dialogMessage = document.getElementById('dialog-message');
    const confirmBtn = document.getElementById('dialog-confirm-btn');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const closeX = document.getElementById('dialog-close-x');
    
    dialogMessage.textContent = message;
    cancelBtn.style.display = 'inline-block';
    dialogModal.style.display = 'flex';
    
    const cleanUp = (value) => {
      dialogModal.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeX.removeEventListener('click', onCancel);
      resolve(value);
    };
    
    const onConfirm = () => cleanUp(true);
    const onCancel = () => cleanUp(false);
    
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeX.addEventListener('click', onCancel);
  });
}

// Initialize the settings page
async function init() {
  config = await window.api.getConfig();
  
  // Ensure default values for new settings keys
  mergeDefaultSettings();
  
  originalConfigStr = JSON.stringify(config);
  
  initFormValues();
  translateUI(); // Apply English/Chinese UI translations dynamically (Req 34)
  applyAppearanceSettings();
  setupEventListeners();

  // Listen to OS system color theme preferences in system theme mode (Req 35)
  const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeMediaQuery.addEventListener('change', () => {
    if (config.settings.styleMode === 'system') {
      applyAppearanceSettings();
    }
  });
}

function mergeDefaultSettings() {
  const defaults = {
    language: 'zh',
    autostart: false,
    hotkey: 'Alt+Q',
    autoHideOnLaunch: true,
    autoHideOnBlur: true,
    pressEscToHide: true,
    clickMode: 'single',
    dragMode: 'sort',
    popupPos: 'center',
    keepCentered: true,
    columns: 8,
    opacity: 85,
    hideNames: false,
    tabHover: false,
    tabScroll: false,
    tabKeys: false,
    styleMode: 'dark',
    borderRadius: '8px',
    bgColor: '#1e1e1e',
    accentColor: '#e04f35',
    showSearch: true,
    fontSizeTab: 14,
    fontSizeItem: 13,
    fontSizeSettings: 14
  };
  
  if (!config.settings) config.settings = {};
  for (const key in defaults) {
    if (config.settings[key] === undefined) {
      config.settings[key] = defaults[key];
    }
  }
  // Migrate old glass/liquid/original styles to dark (Req 35)
  if (config.settings.styleMode === 'glass' || config.settings.styleMode === 'liquid' || config.settings.styleMode === 'original') {
    config.settings.styleMode = 'dark';
  }
}

// Initialize form elements from config object
function initFormValues() {
  optLanguage.value = config.settings.language || 'zh';
  optAutostart.checked = config.settings.autostart;
  optShowSearch.checked = config.settings.showSearch !== false;
  optColumns.value = config.settings.columns || 8;
  optStyleMode.value = config.settings.styleMode || 'glass';
  optRadius.value = config.settings.borderRadius || '8px';
  optBgColor.value = config.settings.bgColor || '#1e1e1e';
  optBgColorPicker.value = config.settings.bgColor || '#1e1e1e';
  optAccentColor.value = config.settings.accentColor || '#e04f35';
  optAccentColorPicker.value = config.settings.accentColor || '#e04f35';
  
  const op = config.settings.opacity !== undefined ? config.settings.opacity : 85;
  optOpacity.value = op;
  optOpacityVal.textContent = op + '%';
  optHideNames.checked = config.settings.hideNames || false;

  // Font sizers
  const fsTab = config.settings.fontSizeTab || 14;
  optFontSizeTab.value = fsTab;
  optFontSizeTabVal.textContent = fsTab + 'px';

  const fsItem = config.settings.fontSizeItem || 13;
  optFontSizeItem.value = fsItem;
  optFontSizeItemVal.textContent = fsItem + 'px';

  const fsSettings = config.settings.fontSizeSettings || 14;
  optFontSizeSettings.value = fsSettings;
  optFontSizeSettingsVal.textContent = fsSettings + 'px';

  // Preferences, hotkeys, tabs
  optClickMode.value = config.settings.clickMode || 'single';
  optDragMode.value = config.settings.dragMode || 'sort';
  optAutohideLaunch.checked = config.settings.autoHideOnLaunch;
  optAutohideBlur.checked = config.settings.autoHideOnBlur;
  optHotkey.value = config.settings.hotkey;
  optEscHide.checked = config.settings.pressEscToHide;
  optPopupPos.value = config.settings.popupPos || 'center';
  optTabHover.checked = config.settings.tabHover || false;
  optTabScroll.checked = config.settings.tabScroll || false;
  optTabKeys.checked = config.settings.tabKeys || false;

  // Initialize Common Windows Software checkboxes
  const commonApps = [
    { id: 'win-app-cmd', path: 'cmd.exe' },
    { id: 'win-app-explorer', path: 'explorer.exe' },
    { id: 'win-app-taskmgr', path: 'taskmgr.exe' },
    { id: 'win-app-calc', path: 'calc.exe' },
    { id: 'win-app-notepad', path: 'notepad.exe' },
    { id: 'win-app-control', path: 'control.exe' },
    { id: 'win-app-regedit', path: 'regedit.exe' },
    { id: 'win-app-devmgmt', path: 'devmgmt.msc' }
  ];

  const commonTab = config.tabs.find(t => t.name === '常用' || t.name === 'Common');
  commonApps.forEach(app => {
    const el = document.getElementById(app.id);
    if (el) {
      if (commonTab) {
        const targetLower = app.path.toLowerCase();
        el.checked = config.items.some(item => 
          item.tabId === commonTab.id && 
          (item.path.toLowerCase() === targetLower || item.path.toLowerCase().endsWith('\\' + targetLower))
        );
      } else {
        el.checked = false;
      }
    }
  });
}

// Dynamically apply visual settings to this window in real-time
function applyAppearanceSettings() {
  const styleMode = config.settings.styleMode || 'dark';
  const radius = config.settings.borderRadius || '8px';
  const accentColor = config.settings.accentColor || '#e04f35';
  const opacity = config.settings.opacity !== undefined ? config.settings.opacity : 85;
  const alpha = opacity / 100;

  // Set theme background color with opacity (Req 35)
  let baseColor = { r: 30, g: 30, b: 30 }; // dark theme background
  if (styleMode === 'light' || (styleMode === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    baseColor = { r: 245, g: 245, b: 247 }; // light theme background
  }

  // Apply theme class to body
  document.body.classList.remove('light-theme', 'dark-theme');
  if (styleMode === 'light') {
    document.body.classList.add('light-theme');
  } else if (styleMode === 'dark') {
    document.body.classList.add('dark-theme');
  } else if (styleMode === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.add(isDark ? 'dark-theme' : 'light-theme');
  }

  // Apply accent color
  document.documentElement.style.setProperty('--accent', accentColor);
  document.documentElement.style.setProperty('--border-focus', accentColor);
  document.documentElement.style.setProperty('--accent-gradient', accentColor);
  document.documentElement.style.setProperty('--accent-light', lightenColor(accentColor, 15));

  // Apply background styles to container/body
  const container = document.querySelector('.settings-window-container') || document.body;
  if (container) {
    container.style.background = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`;
    container.style.backdropFilter = 'blur(20px)';
    container.style.webkitBackdropFilter = 'blur(20px)';
  }

  // Apply rounded corners container styling
  const winContainer = document.querySelector('.settings-window-container');
  if (winContainer) {
    winContainer.style.borderRadius = radius;
  }

  // Apply Font sizes
  const fsTab = config.settings.fontSizeTab || 14;
  const fsItem = config.settings.fontSizeItem || 13;
  const fsSettings = config.settings.fontSizeSettings || 14;

  document.documentElement.style.setProperty('--font-size-tab', `${fsTab}px`);
  document.documentElement.style.setProperty('--font-size-item', `${fsItem}px`);
  document.documentElement.style.setProperty('--font-size-settings', `${fsSettings}px`);

  // Dynamically update this settings window's content text sizes
  document.body.style.fontSize = `${fsSettings}px`;
  // Apply settings font size specifically to elements
  document.querySelectorAll('.setting-title').forEach(el => el.style.fontSize = `${fsSettings}px`);
  document.querySelectorAll('.setting-desc').forEach(el => el.style.fontSize = `${fsSettings - 3}px`);
  document.querySelectorAll('.sidebar-item').forEach(el => el.style.fontSize = `${fsSettings}px`);
  document.querySelectorAll('.custom-select-trigger').forEach(el => el.style.fontSize = `${fsSettings - 1}px`);
  document.querySelectorAll('.custom-select-option').forEach(el => el.style.fontSize = `${fsSettings - 1}px`);
}

function hexToRgb(hex) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 30, g: 30, b: 30 };
}

function lightenColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        G = (num >> 8 & 0x00FF) + amt,
        B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x100 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
}

// Bind form event listeners
function setupEventListeners() {
  // 1. Sidebar tab switching
  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      sidebarItems.forEach(i => i.classList.remove('active'));
      settingsSections.forEach(s => s.classList.remove('active'));

      item.classList.add('active');
      const targetSec = document.getElementById(item.dataset.tab);
      if (targetSec) targetSec.classList.add('active');
    });
  });

  // 2. Control input bindings
  optLanguage.addEventListener('change', (e) => {
    config.settings.language = e.target.value;
    translateUI();
  });

  optAutostart.addEventListener('change', (e) => {
    config.settings.autostart = e.target.checked;
  });

  optShowSearch.addEventListener('change', (e) => {
    config.settings.showSearch = e.target.checked;
  });

  optColumns.addEventListener('change', (e) => {
    config.settings.columns = parseInt(e.target.value);
  });

  optStyleMode.addEventListener('change', (e) => {
    config.settings.styleMode = e.target.value;
    applyAppearanceSettings();
  });

  optRadius.addEventListener('change', (e) => {
    config.settings.borderRadius = e.target.value;
    applyAppearanceSettings();
  });

  optBgColorPicker.addEventListener('input', (e) => {
    const val = e.target.value;
    optBgColor.value = val;
    config.settings.bgColor = val;
    applyAppearanceSettings();
  });

  optBgColor.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (/^#[0-9A-F]{6}$/i.test(val) || /^#[0-9A-F]{3}$/i.test(val)) {
      optBgColorPicker.value = val;
      config.settings.bgColor = val;
      applyAppearanceSettings();
    }
  });

  optAccentColorPicker.addEventListener('input', (e) => {
    const val = e.target.value;
    optAccentColor.value = val;
    config.settings.accentColor = val;
    applyAppearanceSettings();
  });

  optAccentColor.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (/^#[0-9A-F]{6}$/i.test(val) || /^#[0-9A-F]{3}$/i.test(val)) {
      optAccentColorPicker.value = val;
      config.settings.accentColor = val;
      applyAppearanceSettings();
    }
  });

  optOpacity.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    optOpacityVal.textContent = val + '%';
    config.settings.opacity = val;
    applyAppearanceSettings();
  });

  optHideNames.addEventListener('change', (e) => {
    config.settings.hideNames = e.target.checked;
  });

  // Font size slider listeners
  optFontSizeTab.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    optFontSizeTabVal.textContent = val + 'px';
    config.settings.fontSizeTab = val;
    applyAppearanceSettings();
  });

  optFontSizeItem.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    optFontSizeItemVal.textContent = val + 'px';
    config.settings.fontSizeItem = val;
    applyAppearanceSettings();
  });

  optFontSizeSettings.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    optFontSizeSettingsVal.textContent = val + 'px';
    config.settings.fontSizeSettings = val;
    applyAppearanceSettings();
  });

  // Click mode, autohides, hotkey, esc, popup pos
  optClickMode.addEventListener('change', (e) => {
    config.settings.clickMode = e.target.value;
  });

  optDragMode.addEventListener('change', (e) => {
    config.settings.dragMode = e.target.value;
  });

  optAutohideLaunch.addEventListener('change', (e) => {
    config.settings.autoHideOnLaunch = e.target.checked;
  });

  optAutohideBlur.addEventListener('change', (e) => {
    config.settings.autoHideOnBlur = e.target.checked;
  });

  optHotkey.addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const keys = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');

    if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift' && e.key !== 'Meta') {
      let keyName = e.key;
      
      if (keyName === ' ') keyName = 'Space';
      if (keyName.length === 1) keyName = keyName.toUpperCase();
      
      if (keyName === 'ArrowUp') keyName = 'Up';
      if (keyName === 'ArrowDown') keyName = 'Down';
      if (keyName === 'ArrowLeft') keyName = 'Left';
      if (keyName === 'ArrowRight') keyName = 'Right';

      keys.push(keyName);
      
      const accel = keys.join('+');
      optHotkey.value = accel;
      config.settings.hotkey = accel;
      optHotkey.blur();
    }
  });

  optEscHide.addEventListener('change', (e) => {
    config.settings.pressEscToHide = e.target.checked;
  });

  optPopupPos.addEventListener('change', (e) => {
    config.settings.popupPos = e.target.value;
    config.settings.keepCentered = (e.target.value === 'center');
  });

  optTabHover.addEventListener('change', (e) => {
    config.settings.tabHover = e.target.checked;
  });

  optTabScroll.addEventListener('change', (e) => {
    config.settings.tabScroll = e.target.checked;
  });

  optTabKeys.addEventListener('change', (e) => {
    config.settings.tabKeys = e.target.checked;
  });

  // 6. Common Windows Software toggling
  document.querySelectorAll('.common-app-checkbox').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const checkbox = e.target;
      const path = checkbox.dataset.path;
      const lang = config.settings.language || 'zh';
      const name = lang === 'zh' ? checkbox.dataset.name : checkbox.dataset.nameEn;
      
      const getOrCreateCommonTab = () => {
        let tab = config.tabs.find(t => t.name === '常用' || t.name === 'Common');
        if (tab) return tab.id;
        
        if (config.tabs.length > 0) return config.tabs[0].id;
        
        const newTabId = 'tab-' + Date.now();
        config.tabs.push({ id: newTabId, name: '常用' });
        return newTabId;
      };

      const commonTabId = getOrCreateCommonTab();
      const targetLower = path.toLowerCase();

      if (checkbox.checked) {
        // Add to config.items if not present
        const exists = config.items.some(item => 
          item.tabId === commonTabId && 
          (item.path.toLowerCase() === targetLower || item.path.toLowerCase().endsWith('\\' + targetLower))
        );
        if (!exists) {
          // Fetch system icon async
          checkbox.disabled = true;
          try {
            const iconDataUrl = await window.api.getFileIcon(path);
            config.items.push({
              id: 'win-app-' + path.replace('.', '-') + '-' + Date.now(),
              tabId: commonTabId,
              name: name,
              path: path,
              args: '',
              runAsAdmin: false,
              icon: iconDataUrl
            });
          } catch (err) {
            console.error('Failed to get icon for ' + path, err);
            // Fallback icon
            config.items.push({
              id: 'win-app-' + path.replace('.', '-') + '-' + Date.now(),
              tabId: commonTabId,
              name: name,
              path: path,
              args: '',
              runAsAdmin: false,
              icon: ''
            });
          } finally {
            checkbox.disabled = false;
          }
        }
      } else {
        // Remove from config.items
        config.items = config.items.filter(item => 
          !(item.tabId === commonTabId && 
            (item.path.toLowerCase() === targetLower || item.path.toLowerCase().endsWith('\\' + targetLower)))
        );
      }
    });
  });

  // Footer Save
  btnSettingsSave.addEventListener('click', async () => {
    await window.api.saveConfig(config);
    // Apply changes on systems side
    await window.api.updateAutostart(config.settings.autostart);
    await window.api.registerShortcut(config.settings.hotkey);
    
    // Close the settings window
    window.close();
  });

  // Footer Cancel
  btnSettingsCancel.addEventListener('click', () => {
    window.close();
  });

  // Maintenance Button Logic

  // 1. Repair and refresh all icons
  btnRepairIcons.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    
    btnRepairIcons.disabled = true;
    btnRepairIcons.textContent = t.msg_reloading;
    try {
      for (let i = 0; i < config.items.length; i++) {
        const item = config.items[i];
        item.icon = await window.api.getFileIcon(item.path);
      }
      await window.api.saveConfig(config);
      await showCustomAlert(t.msg_repair_success);
    } catch (err) {
      await showCustomAlert(t.msg_repair_fail + err.message);
    } finally {
      btnRepairIcons.disabled = false;
      btnRepairIcons.textContent = t.maintenance_run;
    }
  });

  // 2. Sort all items alphabetically
  btnSortAllItems.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    config.items.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    await window.api.saveConfig(config);
    await showCustomAlert(t.msg_sort_success);
  });

  // 3. Clean duplicate paths
  btnCleanDuplicates.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    const seen = new Set();
    const unique = [];
    config.items.forEach(item => {
      const key = `${item.tabId}:${item.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    });
    
    const count = config.items.length - unique.length;
    config.items = unique;
    await window.api.saveConfig(config);
    await showCustomAlert(t.msg_dup_success.replace('{count}', count));
  });

  // 4. Scan dead paths
  btnScanPaths.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    
    const absItems = config.items.filter(item => {
      return item.path && !item.path.startsWith('http://') && !item.path.startsWith('https://') && item.path.includes('\\');
    });

    if (absItems.length === 0) {
      pathCheckResults.innerHTML = `<div style="color: #10b981; padding: 4px;">${t.msg_scan_no_local}</div>`;
      pathCheckResults.style.display = 'block';
      return;
    }

    btnScanPaths.disabled = true;
    btnScanPaths.textContent = t.msg_scanning;
    pathCheckResults.innerHTML = `<div style="color: var(--text-secondary); padding: 4px;">${t.msg_scan_progress}</div>`;
    pathCheckResults.style.display = 'block';

    const paths = absItems.map(item => item.path);
    const exists = await window.api.checkPaths(paths);

    deadItemsList = [];
    pathCheckResults.innerHTML = '';

    absItems.forEach((item, idx) => {
      if (!exists[idx]) {
        deadItemsList.push(item);
        const r = document.createElement('div');
        r.className = 'path-item-row';
        r.innerHTML = `
          <span class="path-name" title="${item.path}">${item.name}</span>
          <span class="path-status">${t.status_dead}</span>
        `;
        pathCheckResults.appendChild(r);
      }
    });

    btnScanPaths.disabled = false;
    btnScanPaths.textContent = t.maintenance_scan;

    if (deadItemsList.length > 0) {
      btnCleanPaths.style.display = 'block';
    } else {
      pathCheckResults.innerHTML = `<div style="color: #10b981; padding: 4px;">${t.msg_scan_clean}</div>`;
      btnCleanPaths.style.display = 'none';
    }
  });

  // Clean scanned dead paths
  btnCleanPaths.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    
    if (deadItemsList.length === 0) return;

    const deadIds = new Set(deadItemsList.map(item => item.id));
    config.items = config.items.filter(item => !deadIds.has(item.id));

    await window.api.saveConfig(config);
    pathCheckResults.innerHTML = `<div style="color: #10b981; padding: 4px;">${t.msg_clean_done}</div>`;
    btnCleanPaths.style.display = 'none';
    deadItemsList = [];
  });

  // 5. Clean empty tabs
  btnCleanEmptyTabs.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    
    const usedTabIds = new Set(config.items.map(item => item.tabId));
    const originalCount = config.tabs.length;
    
    config.tabs = config.tabs.filter(tab => usedTabIds.has(tab.id));
    const removedCount = originalCount - config.tabs.length;

    await window.api.saveConfig(config);
    await showCustomAlert(t.msg_empty_success.replace('{count}', removedCount));
  });

  // Export config
  btnExportConfig.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    const res = await window.api.exportConfig();
    if (res && res.success) {
      await showCustomAlert(t.msg_export_success.replace('{path}', res.path));
    } else if (res) {
      await showCustomAlert(t.msg_export_fail + res.error);
    }
  });

  // Import config
  btnImportConfig.addEventListener('click', async () => {
    const lang = config.settings.language || 'zh';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
    const res = await window.api.importConfig();
    if (res && res.success) {
      window.close(); // Close settings window immediately (Req 37)
    } else if (res) {
      await showCustomAlert(t.msg_import_fail + res.error);
    }
  });
  
  // Close window on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.close();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
