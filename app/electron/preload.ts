import { contextBridge, ipcRenderer } from 'electron';
import type { Playlist } from '../src/types/playlist';

contextBridge.exposeInMainWorld('api', {
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximizeToggle: () => ipcRenderer.send('window-maximize-toggle'),
  windowClose: () => ipcRenderer.send('window-close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChanged: (cb: (isMax: boolean) => void) => {
    const listener = (_: unknown, isMax: boolean) => cb(isMax);
    ipcRenderer.on('window-maximized-changed', listener);
    return () => ipcRenderer.removeListener('window-maximized-changed', listener);
  },
  chooseDownloadFolder: (): Promise<string | null> => ipcRenderer.invoke('download-folder-choose'),
  releaseDownloadFolder: (destination: string): Promise<void> => ipcRenderer.invoke('download-folder-release', destination),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  vaultFetch: (url: string, opts?: { method?: 'GET' | 'POST'; body?: string }): Promise<{ ok: boolean; status: number; body: string }> =>
    ipcRenderer.invoke('vault-fetch', url, opts),
  vaultDownload: (url: string, suggestedName: string, subfolder?: string, destination?: string): Promise<{ path: string }> =>
    ipcRenderer.invoke('vault-download', { url, suggestedName, subfolder, destination }),
  saveBlob: (bytes: Uint8Array, suggestedName: string, subfolder?: string, destination?: string): Promise<{ path: string }> =>
    ipcRenderer.invoke('save-blob', { bytes, suggestedName, subfolder, destination }),
  loadPlaylists: (): Promise<Playlist[] | null> => ipcRenderer.invoke('playlists-load'),
  savePlaylists: (playlists: Playlist[]): Promise<{ ok: boolean }> => ipcRenderer.invoke('playlists-save', playlists)
});
