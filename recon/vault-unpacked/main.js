const {installOffline,OFFLINE}=require('./offlineElectron');
let offlineRuntime;
﻿const { app, BrowserWindow, shell, Menu, nativeImage, ipcMain, dialog } = require('electron');
const { net } = require('electron');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { DiscordPresence } = require('./discordPresence');
const {
  AUTH_PROTOCOL,
  findAuthCallback,
  isAllowedOAuthStartUrl,
  normalizeAuthCallback,
  normalizeOAuthProviderRedirect,
} = require('./oauthProtocol');

const APP_URL = 'https://juicewrldvault.com';
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_ID = 'com.juicewrldvault.desktop';
const APP_VERSION = app.getVersion();
const APP_DISPLAY_NAME = 'Juice WRLD Vault';
const USER_DATA_FOLDER_NAME = 'JuiceWRLDVault';
const TITLE_BAR_COLOR = '#050505';
const DISCORD_CLIENT_ID_FILE = path.join(__dirname, 'assets', 'discord-client-id.txt');

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.disableWebInstaller = true;
if (process.platform === 'win32') {
  // Unsigned builds cannot pass publisher verification; updates still use latest.yml SHA512 validation.
  autoUpdater.verifyUpdateCodeSignature = async () => null;
}
const parseUrl = (url) => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const isAppUrl = (url) => {
  const parsed = parseUrl(url);
  return Boolean(parsed && parsed.origin === APP_ORIGIN);
};

const openSafeExternal = (url) => {
  const parsed = parseUrl(url);
  if (!parsed) return;
  if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return;
  shell.openExternal(parsed.toString());
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const logDesktopEvent = (message, error) => {
  try {
    const detail = error ? ` ${error.stack || error.message || error}` : '';
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'desktop.log'),
      `[${new Date().toISOString()}] ${message}${detail}\n`,
      'utf8'
    );
  } catch {
    // Logging must never block app launch.
  }
};

const readDiscordClientId = () => {
  const envClientId = String(process.env.JWV_DISCORD_CLIENT_ID || '').trim();
  if (envClientId) return envClientId;

  try {
    if (fs.existsSync(DISCORD_CLIENT_ID_FILE)) {
      return fs.readFileSync(DISCORD_CLIENT_ID_FILE, 'utf8').trim();
    }
  } catch (error) {
    logDesktopEvent('Could not read Discord client ID file.', error);
  }

  return '';
};

const clearDesktopWebStorage = async (win) => {
  try {
    await win.webContents.session.clearCache();
    await win.webContents.session.clearStorageData({
      origin: APP_ORIGIN,
      storages: ['serviceworkers', 'cachestorage']
    });
    logDesktopEvent('Cleared desktop web cache and service workers before launch.');
  } catch (error) {
    logDesktopEvent('Desktop web cache cleanup failed.', error);
  }
};

const showLoadFailurePage = (win, details) => {
  if (!win || win.isDestroyed()) return;
  const message = escapeHtml(details?.errorDescription || 'Could not load Juice WRLD Vault.');
  const code = escapeHtml(details?.errorCode ? `Error ${details.errorCode}` : 'Load error');
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Juice WRLD Vault</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050505; color: #fff; font-family: Inter, Segoe UI, Arial, sans-serif; }
    main { width: min(520px, calc(100vw - 48px)); }
    p { color: rgba(255,255,255,.68); line-height: 1.55; }
    button, a { display: inline-flex; height: 44px; align-items: center; justify-content: center; border-radius: 8px; padding: 0 18px; font-weight: 800; text-decoration: none; }
    button { border: 0; background: #fff; color: #050505; cursor: pointer; }
    a { margin-left: 10px; color: #fff; border: 1px solid rgba(255,255,255,.16); }
    small { display: block; margin-top: 18px; color: rgba(255,255,255,.38); }
  </style>
</head>
<body>
  <main>
    <h1>Juice WRLD Vault could not load.</h1>
    <p>The desktop app cleared its cached site files. Try reloading once; if it still fails, open the website in your browser while the app updates.</p>
    <button onclick="location.href='${APP_URL}'">Retry</button>
    <a href="${APP_URL}">Open browser</a>
    <small>${code}: ${message}</small>
  </main>
</body>
</html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => {
    logDesktopEvent('Desktop load failure page failed.', error);
  });
};

let discordPresence = null;
let mainWindow = null;
let pendingAuthCallback = null;
let updateCheckPromise = null;
let updateState = {
  status: 'idle',
  currentVersion: APP_VERSION
};

const getDiscordPresence = () => {
  if (!discordPresence) {
    discordPresence = new DiscordPresence({
      clientId: readDiscordClientId(),
      appVersion: APP_VERSION,
      log: logDesktopEvent
    });
  }
  return discordPresence;
};

const setUpdateState = (patch) => {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: APP_VERSION,
    updatedAt: new Date().toISOString()
  };
  log.info('Desktop updater state', updateState);
};

const serializeUpdateInfo = (info) => ({
  version: info?.version || null,
  releaseDate: info?.releaseDate || null,
  releaseName: info?.releaseName || null
});

autoUpdater.on('checking-for-update', () => {
  setUpdateState({ status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  setUpdateState({
    status: 'available',
    update: serializeUpdateInfo(info)
  });
});

autoUpdater.on('update-not-available', (info) => {
  setUpdateState({
    status: 'current',
    update: serializeUpdateInfo(info)
  });
});

autoUpdater.on('download-progress', (progress) => {
  setUpdateState({
    status: 'downloading',
    progress: {
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred || 0,
      total: progress.total || 0,
      bytesPerSecond: progress.bytesPerSecond || 0
    }
  });
});

autoUpdater.on('update-downloaded', (info) => {
  setUpdateState({
    status: 'downloaded',
    update: serializeUpdateInfo(info)
  });
});

autoUpdater.on('error', (error) => {
  setUpdateState({
    status: 'error',
    error: error.message || String(error)
  });
});

const checkForUpdates = async ({ manual = false } = {}) => {
  // Preview Mac and Linux packages have no published platform update feed.
  if (process.platform === 'linux') {
    if (manual) {
      await dialog.showMessageBox({ type: 'info', title: 'Juice WRLD Vault', message: 'Linux updates are installed manually.', detail: 'Download the latest Linux package from juicewrldvault.com/download when a new version is available.' });
    }
    return { ok: true, skipped: true, reason: 'manual-linux-download', currentVersion: APP_VERSION };
  }
  if (process.platform === 'darwin') {
    if (manual) {
      await dialog.showMessageBox({ type: 'info', title: 'Juice WRLD Vault', message: 'Mac updates are installed manually.', detail: 'Download the latest Mac installer from juicewrldvault.com/download when a new version is available.' });
    }
    return { ok: true, skipped: true, reason: 'manual-macos-download', currentVersion: APP_VERSION };
  }
  if (!app.isPackaged) {
    return {
      ok: true,
      skipped: true,
      reason: 'not-packaged',
      currentVersion: APP_VERSION
    };
  }

  if (updateCheckPromise) return updateCheckPromise;

  setUpdateState({ status: manual ? 'manual-checking' : 'checking', error: null });

  updateCheckPromise = new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      autoUpdater.removeListener('update-available', onUpdateAvailable);
      autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
      autoUpdater.removeListener('update-downloaded', onUpdateDownloaded);
      autoUpdater.removeListener('error', onUpdateError);
    };

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const onUpdateAvailable = (info) => {
      setUpdateState({
        status: 'downloading',
        update: serializeUpdateInfo(info)
      });
      autoUpdater.downloadUpdate().catch(onUpdateError);
    };

    const onUpdateNotAvailable = (info) => {
      settle(resolve, {
        ok: true,
        upToDate: true,
        currentVersion: APP_VERSION,
        status: 'current',
        update: serializeUpdateInfo(info)
      });
    };

    const onUpdateDownloaded = (info) => {
      setUpdateState({
        status: 'installing',
        update: serializeUpdateInfo(info)
      });
      setTimeout(() => {
        try {
          autoUpdater.quitAndInstall(false, true);
        } catch (error) {
          setUpdateState({ status: 'install-error', error: error.message || String(error) });
          logDesktopEvent('Desktop update install failed.', error);
        }
      }, 1200);
      settle(resolve, {
        ok: true,
        readyToInstall: true,
        currentVersion: APP_VERSION,
        status: 'installing',
        update: serializeUpdateInfo(info)
      });
    };

    const onUpdateError = (error) => {
      setUpdateState({
        status: 'error',
        error: error.message || String(error)
      });
      settle(reject, error);
    };

    autoUpdater.once('update-available', onUpdateAvailable);
    autoUpdater.once('update-not-available', onUpdateNotAvailable);
    autoUpdater.once('update-downloaded', onUpdateDownloaded);
    autoUpdater.once('error', onUpdateError);
    autoUpdater.checkForUpdates().catch(onUpdateError);
  })
    .catch((error) => ({
      ok: false,
      currentVersion: APP_VERSION,
      error: error.message || String(error)
    }))
    .finally(() => {
      updateCheckPromise = null;
    });

  return updateCheckPromise;
};

const createWindow = () => {
  const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'juicewrldvault.ico' : 'juicewrldvault.png');
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: '',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: TITLE_BAR_COLOR,
    autoHideMenuBar: true,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--jwv-version=${APP_VERSION}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]) : null);
  win.once('ready-to-show', () => win.show());
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  }, 2500);
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} JuiceWRLDVaultDesktop/${APP_VERSION}`);
  win.setTitle('');

  let loadFailureVisible = false;
  win.webContents.on('did-finish-load', () => {
    if (isAppUrl(win.webContents.getURL())) loadFailureVisible = false;
    if (pendingAuthCallback && isAppUrl(win.webContents.getURL())) {
      win.webContents.send('desktop:oauth-callback', pendingAuthCallback);
    }
  });
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    if (!validatedURL || !isAppUrl(validatedURL)) return;
    logDesktopEvent('Desktop app failed to load site.', { message: `${errorCode}: ${errorDescription} (${validatedURL})` });
    if (loadFailureVisible) return;
    loadFailureVisible = true;
    offlineRuntime.open(win).catch(() => showLoadFailurePage(win, { errorCode, errorDescription }));
  });

  clearDesktopWebStorage(win).finally(() => {
    if (!win.isDestroyed()) win.loadURL(APP_URL);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      win.loadURL(url);
      return { action: 'deny' };
    }
    openSafeExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url) || url.startsWith(OFFLINE)) return;
    event.preventDefault();
    openSafeExternal(url);
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
};

app.setName(APP_DISPLAY_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_FOLDER_NAME));

const registerAuthProtocol = () => {
  if (process.defaultApp && process.argv[1]) {
    return app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
  return app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
};

const resolveOAuthProviderUrl = async (authorizeUrl) => {
  const startUrl = parseUrl(authorizeUrl);
  const provider = startUrl?.searchParams.get('provider') || '';
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = net.request({ method: 'GET', url: authorizeUrl, redirect: 'manual' });
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      finish(() => {
        request.abort();
        reject(new Error('The sign-in service took too long to respond.'));
      });
    }, 15000);

    request.on('redirect', (statusCode, method, providerUrl) => {
      finish(() => {
        request.abort();
        if (![301, 302, 303, 307, 308].includes(statusCode)) {
          reject(new Error('The sign-in service returned an invalid redirect.'));
          return;
        }
        const safeProviderUrl = normalizeOAuthProviderRedirect(providerUrl, provider);
        if (!safeProviderUrl) {
          reject(new Error('The sign-in service returned an unexpected browser destination.'));
          return;
        }
        resolve(safeProviderUrl);
      });
    });
    request.on('response', () => {
      finish(() => reject(new Error('The sign-in service did not return a browser redirect.')));
    });
    request.on('error', () => {
      finish(() => reject(new Error('The sign-in service could not be reached.')));
    });
    request.end();
  });
};

const handleAuthCallback = (rawUrl) => {
  const callback = normalizeAuthCallback(rawUrl);
  if (!callback) return false;
  pendingAuthCallback = callback;
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (isAppUrl(win.webContents.getURL())) win.webContents.send('desktop:oauth-callback', callback);
  }
  logDesktopEvent('Received desktop OAuth callback.');
  return true;
};

registerAuthProtocol();
app.on('open-url', (event, url) => {
  if (!normalizeAuthCallback(url)) return;
  event.preventDefault();
  handleAuthCallback(url);
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    const callback = findAuthCallback(commandLine);
    if (callback) handleAuthCallback(callback);
    const win = mainWindow || BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

ipcMain.on('window:minimize', (event) => {
  if (!isAppUrl(event.senderFrame?.url || '') && !(event.senderFrame?.url || '').startsWith(OFFLINE)) return;
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window:maximize', (event) => {
  if (!isAppUrl(event.senderFrame?.url || '') && !(event.senderFrame?.url || '').startsWith(OFFLINE)) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window:close', (event) => {
  if (!isAppUrl(event.senderFrame?.url || '') && !(event.senderFrame?.url || '').startsWith(OFFLINE)) return;
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle('desktop:update', (event) => {
  if (!isAppUrl(event.senderFrame?.url || '')) {
    throw new Error(`Desktop update can only be started from ${APP_DISPLAY_NAME}.`);
  }
  return checkForUpdates({ manual: true });
});

ipcMain.handle('desktop:oauth-open', async (event, url) => {
  if (!isAppUrl(event.senderFrame?.url || '')) throw new Error('Desktop sign-in requires the Juice WRLD Vault app.');
  if (typeof url !== 'string' || url.length > 4096 || !isAllowedOAuthStartUrl(url)) {
    throw new Error('The desktop sign-in URL was rejected.');
  }
  const providerUrl = await resolveOAuthProviderUrl(url);
  await shell.openExternal(providerUrl);
  logDesktopEvent('Opened desktop OAuth provider in the system browser.');
  return { ok: true };
});

ipcMain.handle('desktop:oauth-pending', (event) => {
  if (!isAppUrl(event.senderFrame?.url || '')) return null;
  const callback = pendingAuthCallback;
  pendingAuthCallback = null;
  return callback;
});

ipcMain.on('discord-presence:update', (event, activity) => {
  if (!isAppUrl(event.senderFrame?.url || '') && !(event.senderFrame?.url || '').startsWith(OFFLINE)) return;
  getDiscordPresence().setActivity(activity);
});

ipcMain.on('discord-presence:clear', (event) => {
  if (!isAppUrl(event.senderFrame?.url || '') && !(event.senderFrame?.url || '').startsWith(OFFLINE)) return;
  getDiscordPresence().clearActivity();
});

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    offlineRuntime=installOffline(app,()=>mainWindow,APP_ORIGIN);
    const launchCallback = findAuthCallback(process.argv);
    if (launchCallback) pendingAuthCallback = launchCallback;
    createWindow();
    setTimeout(() => {
      checkForUpdates().catch((error) => {
        logDesktopEvent('Desktop update check failed.', error);
      });
    }, 3500);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  if (discordPresence) discordPresence.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
