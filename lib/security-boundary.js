'use strict';

/**
 * Electron 渲染器的信任边界。
 *
 * 只有指定 BrowserWindow 的顶层主帧，且当前 URL 与预期本地页面完全
 * 一致时，才可调用对应 IPC。这样即使某个窗口意外导航到外部页面，
 * preload 也不会把本地权限交给该页面。
 */
function isTrustedIpcEvent(event, allowedRenderers) {
  if (!event || !event.sender || !event.senderFrame) return false;

  const sender = event.sender;
  if (sender.mainFrame && event.senderFrame !== sender.mainFrame) return false;

  const frameUrl = event.senderFrame.url;
  const senderUrl = typeof sender.getURL === 'function' ? sender.getURL() : '';

  return (allowedRenderers || []).some(({ webContents, url }) => (
    webContents === sender &&
    typeof url === 'string' &&
    frameUrl === url &&
    senderUrl === url
  ));
}

/** 禁止弹出新窗口和离开预期本地页面的导航。 */
function hardenRendererWindow(browserWindow, trustedUrl) {
  const contents = browserWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const blockUnexpectedNavigation = (event, targetUrl) => {
    if (targetUrl !== trustedUrl) event.preventDefault();
  };

  contents.on('will-navigate', blockUnexpectedNavigation);
  contents.on('will-redirect', blockUnexpectedNavigation);
}

module.exports = { isTrustedIpcEvent, hardenRendererWindow };
