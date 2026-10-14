import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { open, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync } from 'node:fs';
import type { Playlist } from '../src/types/playlist';

let window: BrowserWindow | null = null;
const downloadDestinations = new Map<string, string>();

function downloadFolder(subfolder: unknown, destination?: unknown): string {
  if (destination !== undefined) {
    const directory = typeof destination === 'string' && downloadDestinations.get(destination);
    if (!directory) throw new Error('Invalid download destination');
    return directory;
  }
  const music = app.getPath('music');
  const downloads = join(music, 'Juice WRLD');
  const existing = existsSync(music) ? readdirSync(music).find(name => name.toLowerCase() === 'juice wrld') : undefined;
  if (existing && existing !== 'Juice WRLD') renameSync(join(music, existing), downloads);
  mkdirSync(downloads, { recursive: true });
  if (subfolder === undefined) return downloads;
  if (typeof subfolder !== 'string') throw new Error('Invalid download subfolder');
  const folder = subfolder.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 100).replace(/[. ]+$/, '');
  if (!folder || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folder)) {
    throw new Error('Invalid download subfolder');
  }
  const directory = join(downloads, folder);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function downloadName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid download filename');
  const name = value.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 200).replace(/[. ]+$/, '');
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    ? `track-${name || 'audio.mp3'}` : name;
}

async function saveDownload(source: () => Readable, suggestedName: string, directory: string) {
  let path = join(directory, suggestedName);
  let file;
  for (let suffix = 0; ; suffix++) {
    try { file = await open(path, 'wx'); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      path = join(directory, `${suggestedName.replace(/\.mp3$/i, '')} (${suffix + 1}).mp3`);
    }
  }
  try {
    await pipeline(source(), file.createWriteStream());
    return { path };
  } catch (error) {
    await file.close().catch(() => {});
    await unlink(path).catch(() => {});
    throw error;
  }
}

function validPlaylists(value: unknown): value is Playlist[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(playlist => {
    if (!playlist || typeof playlist !== 'object' || typeof playlist.id !== 'string' || !playlist.id
      || ids.has(playlist.id) || typeof playlist.name !== 'string' || !playlist.name.trim()
      || typeof playlist.reserved !== 'boolean'
      || playlist.reserved !== (playlist.id === 'liked-songs')
      || (playlist.reserved && playlist.name !== 'Liked Songs')
      || !Array.isArray(playlist.trackIds)
      || !playlist.trackIds.every((id: unknown) => typeof id === 'string' && /^(vault|juiceapi):.+$/.test(id))
      || new Set(playlist.trackIds).size !== playlist.trackIds.length
      || !Number.isFinite(playlist.createdAt) || playlist.createdAt < 0
      || (playlist.coverUrl !== undefined && typeof playlist.coverUrl !== 'string')) return false;
    ids.add(playlist.id);
    return true;
  });
}

app.whenReady().then(async () => {
  window = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build/icon.png'),
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      nodeIntegration: false
    }
  });
  window.setMenu(null);
  ipcMain.on('window-minimize', event => {
    if (event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame) window.minimize();
  });
  ipcMain.on('window-maximize-toggle', event => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.on('window-close', event => {
    if (event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame) window.close();
  });
  ipcMain.handle('window-is-maximized', event => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
    return window.isMaximized();
  });
  window.on('maximize', () => window?.webContents.send('window-maximized-changed', true));
  window.on('unmaximize', () => window?.webContents.send('window-maximized-changed', false));
  ipcMain.handle('download-folder-choose', async event => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown download request sender');
    }
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose bulk download folder', defaultPath: app.getPath('music'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const destination = randomUUID();
    downloadDestinations.set(destination, result.filePaths[0]);
    return destination;
  });
  ipcMain.handle('download-folder-release', (event, destination: unknown) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown download request sender');
    }
    if (typeof destination !== 'string') throw new Error('Invalid download destination');
    downloadDestinations.delete(destination);
  });
  ipcMain.handle('playlists-load', event => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown playlist request sender');
    }
    const file = join(app.getPath('userData'), 'playlists.json');
    if (!existsSync(file)) return null;
    try {
      const playlists: unknown = JSON.parse(readFileSync(file, 'utf8'));
      return validPlaylists(playlists) ? playlists : null;
    } catch { return null; }
  });
  ipcMain.handle('playlists-save', (event, playlists: unknown) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown playlist request sender');
    }
    if (!validPlaylists(playlists) || !playlists.some(playlist => playlist.id === 'liked-songs')) {
      throw new Error('Invalid playlists');
    }
    const file = join(app.getPath('userData'), 'playlists.json');
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(playlists, null, 2), 'utf8');
    renameSync(tmp, file);
    return { ok: true };
  });
  ipcMain.handle('app:version', event => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown version request sender');
    }
    return app.getVersion();
  });
  ipcMain.handle('vault-fetch', async (event, url: string, opts?: unknown) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown Vault request sender');
    }
    const allowed = ['https://juicewrldvault.com', 'https://media.juicewrldvault.com'];
    let parsed: URL;
    try {
      if (typeof url !== 'string') throw new Error('Invalid URL');
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }
    if (!allowed.includes(parsed.origin)) throw new Error(`Blocked origin: ${parsed.origin}`);
    if (parsed.username || parsed.password) throw new Error('URL credentials are not allowed');
    if (opts !== undefined && (!opts || typeof opts !== 'object' || Array.isArray(opts))) throw new Error('Invalid fetch options');
    const { method = 'GET', body } = (opts ?? {}) as { method?: unknown; body?: unknown };
    if (method !== 'GET' && method !== 'POST') throw new Error('Unsupported fetch method');
    if (method === 'GET' && body !== undefined) throw new Error('GET body is not allowed');
    if (method === 'POST') {
      if (parsed.href !== 'https://juicewrldvault.com/api/player/queue-songs') throw new Error('Blocked POST endpoint');
      if (typeof body !== 'string' || body.length > 65536) throw new Error('Invalid queue body');
      const payload = JSON.parse(body);
      if (!payload || !Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > 100
        || payload.ids.some((id: unknown) => typeof id !== 'string' || !/^\d+$/.test(id))) throw new Error('Invalid queue IDs');
    }
    const response = await fetch(url, { redirect: 'error', method, body: body as string | undefined,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined });
    const text = await response.text();
    return { ok: response.ok, status: response.status, body: text };
  });
  ipcMain.handle('vault-download', async (event, request: unknown) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown Vault request sender');
    }
    if (!request || typeof request !== 'object') throw new Error('Invalid download request');
    const { url, suggestedName, subfolder, destination } = request as { url: unknown; suggestedName: unknown; subfolder?: unknown; destination?: unknown };
    if (typeof url !== 'string') throw new Error('Invalid URL');
    const parsed = new URL(url);
    if (!['https://juicewrldvault.com', 'https://media.juicewrldvault.com'].includes(parsed.origin)
      || parsed.username || parsed.password) throw new Error(`Blocked origin: ${parsed.origin}`);
    if (typeof suggestedName !== 'string' || !suggestedName || suggestedName.length > 200
      || /[\\/:*?"<>|\x00-\x1f]/.test(suggestedName) || /[. ]$/.test(suggestedName)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(suggestedName)) {
      throw new Error('Invalid download filename');
    }
    const directory = downloadFolder(subfolder, destination);
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok || !response.body
      || !/^(audio\/|application\/octet-stream)/i.test(response.headers.get('content-type') || '')) {
      throw new Error(`Vault download HTTP ${response.status}: expected audio`);
    }
    return saveDownload(() => Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), suggestedName, directory);
  });
  ipcMain.handle('save-blob', async (event, request: unknown) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Unknown download request sender');
    }
    if (!request || typeof request !== 'object') throw new Error('Invalid download request');
    const { bytes, suggestedName, subfolder, destination } = request as { bytes: unknown; suggestedName: unknown; subfolder?: unknown; destination?: unknown };
    if (!(bytes instanceof Uint8Array) && !(Array.isArray(bytes)
      && bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255))) {
      throw new Error('Invalid download bytes');
    }
    const name = downloadName(suggestedName);
    const directory = downloadFolder(subfolder, destination);
    return saveDownload(() => Readable.from([Buffer.from(bytes)]), name, directory);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}).catch(error => { console.error(error); app.exit(1); });

app.on('window-all-closed', () => app.quit());
