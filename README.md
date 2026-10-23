<p align="center">
  <img src="tray.png" width="96" alt="Tar V logo">
</p>

<h1 align="center">Tar V</h1>

<p align="center">
  <b>A polished, minimal launcher panel for Windows</b><br>
  <sub>Global hotkey · glass-inspired interface · groups · drag-and-drop organization</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.6-blue?style=flat-square" alt="Version 1.0.6">
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows" alt="Windows">
  <img src="https://img.shields.io/badge/framework-Electron-47848F?style=flat-square&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
</p>

## Preview

<p align="center">
  <img src="docs/screenshots/panel.png" width="720" alt="Tar V launcher panel">
  <br>
  <sub>Launcher panel with groups, search, and native Windows icons</sub>
</p>

<p align="center">
  <img src="docs/screenshots/settings.png" width="620" alt="Tar V settings">
  <br>
  <sub>Independent settings center with eight configuration areas</sub>
</p>

> The screenshots use built-in Windows applications as sample data and do not expose personal files or paths.

## Overview

Tar V is a glass-inspired launcher panel built specifically for Windows. It replaces a crowded desktop with a lightweight, highly configurable panel for applications, files, folders, URLs, and shortcuts.

Open the panel with a global hotkey, search or switch groups, and launch an item without returning to the desktop or Start menu.

## Features

### Appearance

- Dark, light, and system themes.
- Configurable background color, accent color, opacity, and corner radius.
- Adjustable grid width and independent font sizes for tabs, launcher items, and Settings.
- Optional hidden item labels for an icon-only layout.

### Native Windows items and icons

Tar V preserves icons for local files, folders, `.lnk` shortcuts, and `.url` shortcuts such as Steam games. Icon extraction is cached and scheduled through a bounded worker queue to keep the interface responsive.

### Drag-and-drop organization

- Drop files, folders, URLs, `.lnk` files, or `.url` files onto the panel to create items.
- Reorder cards by insertion or swap behavior.
- Drag group tabs to rearrange them.

### Search and batch management

- Filter launcher items immediately with fuzzy keyword matching.
- Select several items to delete them, edit launch arguments or elevation settings, or move them to another group.
- Sort all items, remove duplicates, scan for missing local targets, and delete empty groups.

### Eight-part settings center

| Area | Controls |
| :--- | :--- |
| **General** | Simplified Chinese / English, launch at sign-in, search-box visibility |
| **Appearance** | Theme, columns, colors, opacity, corners, labels, and font sizes |
| **Preferences** | Single/double-click launch, drag behavior, collapse after launch, collapse on blur |
| **Show and hide** | Global hotkey, `Esc` behavior, center-screen or pointer-relative placement |
| **Group switching** | Hover switching, global mouse wheel, number keys 1–9 |
| **Common apps** | One-click entries for built-in Windows tools |
| **Maintenance** | Icon repair, sorting, duplicate cleanup, missing-target cleanup, empty-group cleanup |
| **Backup and restore** | Export configuration to JSON or review and confirm an imported backup |

## Installation

Download the latest installer from [Releases](../../releases), then run `Tar V Setup 1.0.6.exe`.

The NSIS installer can create desktop and Start menu shortcuts, supports a custom installation directory, and registers Tar V with Windows uninstall settings.

## Security model

Tar V launches local programs, reads icons, and resolves shortcuts, so several features cross normal desktop security boundaries. The application constrains those capabilities as follows:

| Boundary | Control |
| :--- | :--- |
| **Launch arguments** | Parses arguments into an array and creates the process without a shell. Batch-file arguments use dedicated `cmd` escaping and reject `%` / `!` expansion payloads. |
| **Elevated launch** | Requests elevation through the Windows UAC interface and passes arguments literally rather than composing a shell command. |
| **PowerShell calls** | Uses `-EncodedCommand` and avoids a second `cmd.exe` parsing pass. |
| **Renderer isolation** | Enables `sandbox` and `contextIsolation`, disables `nodeIntegration`, and blocks external navigation and pop-ups. |
| **Content Security Policy** | Both renderer pages reject remote scripts, inline scripts, and inline event handlers. |
| **Fonts** | Bundles Inter locally instead of loading it from a CDN. |
| **Configuration import** | Applies a field and type allowlist, then shows a summary and requires confirmation for sensitive changes such as autostart, hotkeys, and elevated items. |
| **IPC** | Privileged handlers validate the source window, top-level frame, and local page URL. Launch requests contain an item ID; the main process reloads the path and arguments from validated configuration. |

To report a security issue, use a GitHub Security Advisory when available, or open an issue without publishing exploitable details.

## Development

Requirements:

- Windows 10 or 11
- Node.js LTS (Node.js 20 or later recommended)
- npm

```powershell
git clone https://github.com/StarsofDeduce/Tar-V.git
cd Tar-V
npm install
npm start
```

### Tests

```powershell
npm test
```

The Node.js test suite covers launch argument handling, `cmd` escaping, path boundaries, configuration validation, and injection-payload rejection.

Run the Electron renderer smoke test separately:

```powershell
npm run test:renderer
```

It verifies that both pages load under the sandbox and strict CSP, the preload bridge is available, local fonts load, and the console contains no CSP violations.

### Build and release audit

```powershell
npm run dist
npm run audit:release
```

The build writes an NSIS installer and unpacked application to `dist/`. The release audit scans packaged files for local build paths and common credential or personal-data patterns before publication.

| Output | Description |
| :--- | :--- |
| `dist/Tar V Setup 1.0.6.exe` | NSIS installer with desktop and Start menu shortcut options |
| `dist/win-unpacked/Tar V.exe` | Unpacked application used for local verification |

## Project structure

```text
Tar-V/
├── main.js                  # Electron main process, windows, tray, and IPC
├── preload.js               # narrow renderer bridge and drop-path resolution
├── lib/
│   ├── args.js              # command-line argument parsing and escaping
│   ├── config-schema.js     # configuration import validation
│   ├── launch-policy.js     # launch target and argument policy
│   ├── launch.js            # process launch flow
│   ├── path-guard.js        # filesystem boundary validation
│   ├── powershell.js        # encoded PowerShell invocation
│   └── security-boundary.js # renderer and IPC source validation
├── renderer/                # panel, settings, styles, scripts, and local fonts
├── test/                    # Node.js tests and Electron smoke tests
├── scripts/                 # release audit and development helpers
├── docs/screenshots/        # README screenshots
├── tray.png                 # application and tray icon
├── package.json             # scripts, dependencies, and builder configuration
└── LICENSE
```

## License

[MIT](LICENSE)

<p align="center">
  <sub>Made with care by <a href="https://github.com/StarsofDeduce">StarsOfDeduce</a></sub>
</p>
