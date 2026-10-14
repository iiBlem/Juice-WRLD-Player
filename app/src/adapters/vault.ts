import type { Page, ServerAdapter } from '../types/adapter';
import type { Track } from '../types/track';
import { sanitizeFilename } from '../lib/sanitizeFilename';

async function fetchVia(url: string, opts?: { method?: 'GET' | 'POST'; body?: string }): Promise<{ ok: boolean; status: number; text: string }> {
  const bridge = typeof window !== 'undefined' ? window.api?.vaultFetch : undefined;
  if (typeof bridge === 'function') {
    const result = await bridge(url, opts);
    return { ok: result.ok, status: result.status, text: result.body };
  }
  const response = await fetch(url, { ...opts, headers: opts?.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

interface VaultSong {
  id: number | string;
  title?: string | null;
  author?: string | null;
  song_path?: string | null;
  image_path?: string | null;
  duration_seconds?: number | null;
  length?: string | null;
  source_category?: string | null;
  era?: unknown;
}

function parseLength(value: string | null | undefined): number | null {
  if (!value || !/^\d+(?::[0-5]\d){0,2}$/.test(value)) return null;
  const seconds = value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isFinite(seconds) ? seconds : null;
}

function mapTrack(record: unknown, category: string): Track {
  if (!record || typeof record !== 'object') throw new Error('Vault invalid song');
  const raw = record as VaultSong;
  if ((typeof raw.id !== 'string' && typeof raw.id !== 'number')
    || ['title', 'author', 'song_path', 'image_path', 'length', 'source_category'].some(key => {
      const value = (record as Record<string, unknown>)[key];
      return value != null && typeof value !== 'string';
    }) || (raw.duration_seconds != null
      && (typeof raw.duration_seconds !== 'number' || !Number.isFinite(raw.duration_seconds)))) {
    throw new Error('Vault invalid song fields');
  }
  return {
    serverId: 'vault',
    providerTrackId: String(raw.id),
    trackId: `vault:${String(raw.id)}`,
    title: raw.title || '(untitled)',
    author: raw.author || '',
    durationSeconds: raw.duration_seconds ?? parseLength(raw.length) ?? null,
    imageUrl: raw.image_path ? `https://media.juicewrldvault.com/images/${raw.image_path}` : null,
    // shortcut: only relative media paths are supported; expand when handling absolute URLs or session proxies.
    audioUrl: raw.song_path && raw.song_path.trim()
      ? `https://media.juicewrldvault.com/songs/${raw.song_path}` : null,
    category: raw.source_category || category,
    era: typeof raw.era === 'string' ? raw.era : undefined,
    raw,
  };
}

async function fetchSongs(url: URL, category: string): Promise<Page<Track>> {
  const response = await fetchVia(url.href);
  if (!response.ok) throw new Error(`Vault HTTP ${response.status}: ${url}`);
  const body = response.text;
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Vault invalid JSON (${url}): ${body.slice(0, 200)}`);
  }
  if (!data || !Array.isArray(data.songs) || typeof data.hasMore !== 'boolean'
    || typeof data.total !== 'number' || !Number.isFinite(data.total)) {
    throw new Error(`Vault invalid catalog response: ${url}`);
  }
  const items = data.songs.map((song: unknown) => mapTrack(song, category));
  return { items, total: data.total, hasMore: data.hasMore };
}

export const vaultAdapter: ServerAdapter = {
  id: 'vault',
  displayName: 'Vault',
  async listCategories() {
    return [
      { value: 'unreleased', label: 'Unreleased' },
      { value: 'stem', label: 'Stems' },
      { value: 'studio-sessions', label: 'Studio Sessions' },
      { value: 'released', label: 'Released' },
      { value: 'remasters', label: 'Remasters' },
      { value: 'miscellaneous', label: 'Miscellaneous' },
    ];
  },
  async fetchCategory(category, offset, limit, opts) {
    if (opts?.search) return vaultAdapter.search(opts.search, offset, limit);
    const url = new URL('https://juicewrldvault.com/api/category-songs');
    url.search = new URLSearchParams({
      category, subcategory: opts?.era ?? '', offset: String(offset), limit: String(limit),
    }).toString();
    return fetchSongs(url, category);
  },
  async search(query, offset, limit) {
    const url = new URL('https://juicewrldvault.com/api/search/songs');
    url.search = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) }).toString();
    return fetchSongs(url, '');
  },
  async fetchTrackById(providerTrackId) {
    if (!/^\d+$/.test(providerTrackId)) return null;
    try {
      const response = await fetchVia('https://juicewrldvault.com/api/player/queue-songs', {
        method: 'POST', body: JSON.stringify({ ids: [providerTrackId] }),
      });
      if (!response.ok) return null;
      const body = JSON.parse(response.text);
      const song = body?.songs?.[0] ?? (Array.isArray(body) ? body[0] : undefined);
      if (!song) return null;
      const track = mapTrack(song, '');
      return track.providerTrackId === providerTrackId ? track : null;
    } catch { return null; }
  },
  resolveAudioUrl(track) {
    return track.audioUrl;
  },
  async downloadTrack(track, subfolder, destination) {
    if (!track.audioUrl) throw new Error('Track has no audio');
    const url = new URL('https://juicewrldvault.com/api/download-song');
    url.searchParams.set('id', track.providerTrackId);
    url.searchParams.set('delivery', 'native');
    await window.api.vaultDownload(url.toString(), sanitizeFilename(`${track.title}.mp3`), subfolder, destination);
  },
  async getShufflePool(opts) {
    const url = new URL('https://juicewrldvault.com/api/songs/shuffle-pool');
    if (opts?.category) url.searchParams.set('category', opts.category);
    if (opts?.limit) url.searchParams.set('limit', String(opts.limit));
    const response = await fetchVia(url.href);
    if (!response.ok) throw new Error(`Vault shuffle HTTP ${response.status}: ${url}`);
    const body = JSON.parse(response.text);
    if (!body || !Array.isArray(body.ids)) throw new Error(`Vault invalid shuffle response: ${url}`);
    return body.ids.map(String);
  },
};

export default vaultAdapter;
