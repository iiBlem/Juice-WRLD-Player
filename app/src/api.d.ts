import type { Playlist } from './types/playlist';

declare global {
  interface Window {
    api: {
      windowMinimize(): void;
      windowMaximizeToggle(): void;
      windowClose(): void;
      isWindowMaximized(): Promise<boolean>;
      onWindowMaximizedChanged(cb: (isMax: boolean) => void): () => void;
      chooseDownloadFolder(): Promise<string | null>;
      releaseDownloadFolder(destination: string): Promise<void>;
      version(): Promise<string>;
      vaultFetch(url: string, opts?: { method?: 'GET' | 'POST'; body?: string }): Promise<{ ok: boolean; status: number; body: string }>;
      vaultDownload(url: string, suggestedName: string, subfolder?: string, destination?: string): Promise<{ path: string }>;
      saveBlob(bytes: Uint8Array, suggestedName: string, subfolder?: string, destination?: string): Promise<{ path: string }>;
      loadPlaylists(): Promise<Playlist[] | null>;
      savePlaylists(playlists: Playlist[]): Promise<{ ok: boolean }>;
    };
  }
}
