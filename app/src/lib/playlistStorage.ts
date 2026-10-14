import type { Playlist } from '../types/playlist';
import type { ServerId } from '../types/track';

export const LIKED_SONGS_ID = 'liked-songs';

export function makePlaylistId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadPlaylists(): Promise<Playlist[]> {
  const playlists = await window.api.loadPlaylists();
  if (!playlists?.length) return [{ id: LIKED_SONGS_ID, name: 'Liked Songs', reserved: true, trackIds: [], createdAt: Date.now() }];
  if (!playlists.some(playlist => playlist.id === LIKED_SONGS_ID)) {
    return [{ id: LIKED_SONGS_ID, name: 'Liked Songs', reserved: true, trackIds: [], createdAt: Date.now() }, ...playlists];
  }
  return playlists;
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  const result = await window.api.savePlaylists(playlists);
  if (!result.ok) throw new Error('Playlist save failed');
}

export function getPlaylistServerIds(playlist: Playlist): ServerId[] {
  return [...new Set(playlist.trackIds.map(id => id.split(':')[0]))]
    .filter((id): id is ServerId => id === 'vault' || id === 'juiceapi');
}
