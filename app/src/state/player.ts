import { create } from 'zustand';
import type { ServerAdapter, Category, Era } from '../types/adapter';
import type { Track, ServerId } from '../types/track';
import { vaultAdapter } from '../adapters/vault';
import { juiceapiAdapter } from '../adapters/juiceapi';
import type { Playlist } from '../types/playlist';
import { LIKED_SONGS_ID, loadPlaylists, savePlaylists, makePlaylistId } from '../lib/playlistStorage';

export const SNAPSHOT_INTERVAL_MS = 1.5 * 24 * 60 * 60 * 1000;

function readSaved(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

function persist(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.warn(`Could not persist ${key}`, error); }
}

function readCounts(key: string): Record<string, number> {
  const value = readSaved(key);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, count]) =>
    Number.isSafeInteger(count) && count >= 0));
}

const savedTimestamp = readSaved('juice-player-last-snapshot-at');

interface PlayerState {
  bulkDownload: {
    active: boolean; total: number; completed: number; failed: number;
    currentTrackTitle: string; scopeLabel: string; cancelled: boolean; error?: string;
  } | null;
  startBulkDownload(scope: 'category' | 'server' | 'playlist'): Promise<void>;
  cancelBulkDownload(): void;
  clearBulkDownload(): void;
  theme: 'red' | 'charcoal';
  setTheme(theme: 'red' | 'charcoal'): void;
  searchQuery: string;
  isSearching: boolean;
  setSearchQuery(query: string): void;
  serverId: ServerId;
  adapters: Record<ServerId, ServerAdapter>;
  categories: Category[];
  eras: Era[];
  selectedCategory: string | null;
  selectedEra: string | null;
  tracks: Track[];
  tracksTotal: number | null;
  tracksHasMore: boolean;
  isLoadingTracks: boolean;
  tracksError: string | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  queue: Track[];
  queueIndex: number;
  shuffle: boolean;
  shuffleOrder: number[];
  shuffleCursor: number;
  repeat: 'off' | 'all' | 'one';
  queueOpen: boolean;
  playCounts: Record<string, number>;
  mostPlayedSnapshot: Record<string, number>;
  lastSnapshotAt: number;
  playlists: Playlist[];
  playlistsLoaded: boolean;
  activeView: 'browse' | 'playlist';
  activePlaylistId: string | null;
  knownTracks: Map<string, Track>;
  knownTracksVersion: number;
  tracksResolving: Set<string>;
  resolvePlaylistTracks(playlistId: string): Promise<void>;
  openPlaylist(id: string): void;
  closePlaylist(): void;
  playPlaylist(id: string, startTrackId?: string): void;
  loadPlaylists(): Promise<void>;
  createPlaylist(name: string): Playlist;
  renamePlaylist(id: string, name: string): void;
  deletePlaylist(id: string): void;
  addTrackToPlaylist(playlistId: string, trackId: string): void;
  removeTrackFromPlaylist(playlistId: string, trackId: string): void;
  getPlaylist(id: string): Playlist | undefined;
  incrementPlayCount(trackId: string): void;
  takeMostPlayedSnapshot(): void;
  toggleLiked(trackId: string): void;
  isLiked(trackId: string): boolean;
  downloadTrack(trackId: string): Promise<void>;
  switchServer(id: ServerId): Promise<void>;
  loadCategories(): Promise<void>;
  loadEras(): Promise<void>;
  loadCategory(category: string, era?: string | null): Promise<void>;
  loadMore(): Promise<void>;
  search(query: string): Promise<void>;
  selectCategory(category: string): Promise<void>;
  selectEra(era: string | null): Promise<void>;
  playTrack(track: Track, queueContext?: Track[]): void;
  addToQueue(track: Track): void;
  jumpToQueueIndex(index: number): void;
  removeFromQueue(index: number): void;
  reorderQueue(fromIndex: number, toIndex: number): void;
  togglePlay(): void;
  next(): void;
  prev(): void;
  setPosition(seconds: number): void;
  setDuration(seconds: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  toggleQueue(): void;
  markUnavailable(trackId: string): void;
}

function shufflePermutation(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function findIndexByTrackId(arr: Track[], trackId: string): number {
  return arr.findIndex(track => track.trackId === trackId);
}

const cleared = {
  searchQuery: '', isSearching: false,
  categories: [], eras: [], selectedCategory: null, selectedEra: null,
  tracks: [], tracksTotal: null, tracksHasMore: false, isLoadingTracks: false,
  tracksError: null, currentTrack: null, isPlaying: false, position: 0,
  duration: 0, queue: [], queueIndex: -1, shuffleOrder: [], shuffleCursor: 0,
};

export const usePlayerStore = create<PlayerState>((set, get) => {
  // Ignore responses overtaken by a server swap or a newer catalog request.
  let serverVersion = 0;
  let catalogVersion = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let theme: 'red' | 'charcoal' = 'red';
  try { if (localStorage.getItem('juice-player-theme') === 'charcoal') theme = 'charcoal'; } catch { /* Use the default when storage is unavailable. */ }
  document.documentElement.setAttribute('data-theme', theme);
  const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
  let playlistLoad: Promise<void> | undefined;
  let playlistWrites = Promise.resolve();
  const resolutionJobs = new Map<string, Promise<void>>();
  const resolutionLanes = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  let resolutionLane = 0;
  let playlistPlayVersion = 0;

  function resolveTrack(trackId: string, serverId: ServerId, providerId: string): Promise<void> {
    const existing = resolutionJobs.get(trackId);
    if (existing) return existing;
    set({ tracksResolving: new Set([...get().tracksResolving, trackId]) });
    const lane = resolutionLane++ % resolutionLanes.length;
    const job = resolutionLanes[lane].then(async () => {
      const track = await get().adapters[serverId].fetchTrackById(providerId);
      if (track && track.trackId === trackId && track.serverId === serverId && !get().knownTracks.has(trackId)) {
        set({ knownTracks: new Map(get().knownTracks).set(trackId, track), knownTracksVersion: get().knownTracksVersion + 1 });
      }
    }).catch(error => console.error(`Could not resolve ${trackId}:`, error)).finally(() => {
      resolutionJobs.delete(trackId);
      const tracksResolving = new Set(get().tracksResolving);
      tracksResolving.delete(trackId);
      set({ tracksResolving });
    });
    resolutionJobs.set(trackId, job);
    resolutionLanes[lane] = job;
    return job;
  }

  function updatePlaylists(update: (playlists: Playlist[]) => Playlist[]) {
    if (!get().playlistsLoaded) throw new Error('Playlists are not loaded yet');
    const previous = get().playlists;
    const playlists = update(previous);
    if (playlists === previous) return;
    set({ playlists });
    // Serialize whole-file snapshots so an older save cannot overwrite a newer one.
    playlistWrites = playlistWrites.then(() => savePlaylists(playlists))
      .catch(error => console.error('Playlist save failed:', error));
  }

  function playlistName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Playlist name cannot be empty');
    return trimmed;
  }

  function rememberTracks(tracks: Track[]) {
    const knownTracks = new Map(get().knownTracks);
    for (const track of tracks) knownTracks.set(track.trackId, track);
    return knownTracks;
  }

  async function loadCategories() {
    const version = serverVersion;
    const { serverId, adapters } = get();
    try {
      const categories = await adapters[serverId].listCategories();
      if (version !== serverVersion) return;
      set({ categories });
      if (get().selectedCategory === null && categories.length) {
        set({ selectedCategory: categories[0].value });
        if (!get().isSearching) await get().loadCategory(categories[0].value);
      }
    } catch (error) {
      if (version === serverVersion) set({ tracksError: errorMessage(error) });
    }
  }

  async function loadTracks(category: string, era?: string | null, query?: string) {
    const version = ++catalogVersion;
    const { serverId, adapters } = get();
    set({ tracks: [], tracksTotal: null, tracksHasMore: false, tracksError: null, isLoadingTracks: true });
    try {
      const page = query !== undefined
        ? await adapters[serverId].search(query, 0, 50)
        : await adapters[serverId].fetchCategory(category, 0, 50, { era: era ?? undefined });
      if (version !== catalogVersion) return;
      set({ tracks: page.items, knownTracks: rememberTracks(page.items), knownTracksVersion: get().knownTracksVersion + 1, tracksTotal: page.total, tracksHasMore: page.hasMore,
        isLoadingTracks: false,
        ...(query === undefined ? { selectedCategory: category, selectedEra: era ?? null } : {}),
      });
    } catch (error) {
      if (version === catalogVersion) set({ tracksError: errorMessage(error), isLoadingTracks: false });
    }
  }

  function move(step: number) {
    playlistPlayVersion++;
    const state = get();
    const { queue, shuffle, shuffleOrder } = state;
    if (!queue.length) return;
    if (state.repeat === 'one' && state.currentTrack?.audioUrl != null) {
      set({ position: 0, isPlaying: true });
      return;
    }
    let index = state.queueIndex;
    let cursor = state.shuffleCursor;
    for (let tries = 0; tries < queue.length; tries++) {
      const candidate = (shuffle ? cursor : index) + step;
      if (state.repeat === 'off' && (candidate < 0 || candidate >= queue.length)) {
        set({ isPlaying: false, position: step > 0 ? state.duration : 0 });
        return;
      }
      if (shuffle) {
        cursor = (cursor + step + queue.length) % queue.length;
        index = shuffleOrder[cursor];
      } else {
        index = (index + step + queue.length) % queue.length;
      }
      const track = queue[index];
      if (track?.audioUrl != null) {
        set({ queueIndex: index, shuffleCursor: cursor, currentTrack: track,
          position: 0, duration: track.durationSeconds ?? 0 });
        return;
      }
    }
    set({ isPlaying: false });
  }

  function queueShuffle(queue: Track[], queueIndex: number, cursor: number) {
    if (!get().shuffle) return { shuffleOrder: [], shuffleCursor: 0 };
    const shuffleOrder = shufflePermutation(queue.length);
    if (queueIndex < 0) return { shuffleOrder, shuffleCursor: -1 };
    const shuffleCursor = Math.min(Math.max(0, cursor), queue.length - 1);
    const current = shuffleOrder.indexOf(queueIndex);
    [shuffleOrder[current], shuffleOrder[shuffleCursor]] = [shuffleOrder[shuffleCursor], shuffleOrder[current]];
    return { shuffleOrder, shuffleCursor };
  }

  return {
    ...cleared,
    bulkDownload: null,
    async startBulkDownload(scope) {
      const state = get();
      if (state.bulkDownload?.active) return;
      const adapter = state.adapters[state.serverId];
      const playlist = scope === 'playlist' ? state.getPlaylist(state.activePlaylistId ?? '') : undefined;
      const playlistTrackIds = playlist ? [...playlist.trackIds] : [];
      const categories = scope === 'server' ? [...state.categories]
        : state.categories.filter(category => category.value === state.selectedCategory);
      if (scope === 'playlist' ? !playlistTrackIds.length : !categories.length) return;
      const scopeLabel = playlist ? `Playlist - ${playlist.name}`
        : `${adapter.displayName} - ${scope === 'server' ? 'All' : categories[0].label}`;
      const job = { active: true, total: 0, completed: 0, failed: 0,
        currentTrackTitle: 'Choose a download folder…', scopeLabel, cancelled: false };
      const update = (changes: Partial<NonNullable<PlayerState['bulkDownload']>>) =>
        set({ bulkDownload: { ...get().bulkDownload!, ...changes } });
      set({ bulkDownload: job });
      let destination: string | null = null;
      try {
        destination = await window.api.chooseDownloadFolder();
        if (!destination) { set({ bulkDownload: null }); return; }
        update({ currentTrackTitle: '' });
        const tracks = new Map<string, Track>();
        if (playlist) {
          for (const id of playlistTrackIds) {
            if (get().bulkDownload?.cancelled) break;
            const match = /^(vault|juiceapi):(\d+)$/.exec(id);
            if (!state.knownTracks.has(id) && match) await resolveTrack(id, match[1] as ServerId, match[2]);
            const track = state.knownTracks.get(id) ?? get().knownTracks.get(id);
            if (track?.audioUrl != null) tracks.set(id, track);
          }
        }
        for (const category of playlist ? [] : categories) {
          let offset = 0;
          while (!get().bulkDownload?.cancelled) {
            const page = await adapter.fetchCategory(category.value, offset, 50);
            for (const track of page.items) {
              if (track.audioUrl !== null) tracks.set(track.trackId, track);
            }
            if (!page.hasMore) break;
            if (!page.items.length) throw new Error('Catalog returned an empty page with more pages remaining');
            offset += page.items.length;
          }
          if (get().bulkDownload?.cancelled) break;
        }
        update({ total: tracks.size });
        let attempted = 0;
        for (const track of tracks.values()) {
          if (get().bulkDownload?.cancelled) break;
          if (attempted++) await new Promise(resolve => setTimeout(resolve, 200));
          if (get().bulkDownload?.cancelled) break;
          update({ currentTrackTitle: track.title });
          try {
            await state.adapters[track.serverId].downloadTrack(track, undefined, destination);
            update({ completed: get().bulkDownload!.completed + 1 });
          } catch {
            update({ failed: get().bulkDownload!.failed + 1 });
          }
        }
      } catch (error) {
        update({ error: errorMessage(error) });
      } finally {
        if (destination) {
          await window.api.releaseDownloadFolder(destination).catch(error => console.error('Download folder release failed:', error));
        }
        if (get().bulkDownload) update({ active: false });
      }
    },
    cancelBulkDownload() {
      const job = get().bulkDownload;
      if (job?.active) set({ bulkDownload: { ...job, cancelled: true } });
    },
    clearBulkDownload() {
      if (!get().bulkDownload?.active) set({ bulkDownload: null });
    },
    theme,
    setTheme(theme) {
      set({ theme });
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem('juice-player-theme', theme); }
      catch (error) { console.warn('Could not persist theme:', error); }
    },
    setSearchQuery(searchQuery) {
      clearTimeout(searchTimer);
      catalogVersion++;
      const query = searchQuery.trim();
      set({ searchQuery, isSearching: !!query, activeView: 'browse', activePlaylistId: null,
        tracks: [], tracksTotal: null, tracksHasMore: false, tracksError: null, isLoadingTracks: !!query });
      if (!query) {
        const { selectedCategory, selectedEra } = get();
        if (selectedCategory !== null) void get().loadCategory(selectedCategory, selectedEra);
        return;
      }
      searchTimer = setTimeout(() => { void get().search(query); }, 300);
    },
    serverId: 'juiceapi',
    adapters: { vault: vaultAdapter, juiceapi: juiceapiAdapter },
    shuffle: false,
    repeat: 'off',
    queueOpen: false,
    playCounts: readCounts('juice-player-play-counts'),
    mostPlayedSnapshot: readCounts('juice-player-most-played-snapshot'),
    lastSnapshotAt: typeof savedTimestamp === 'number' && Number.isFinite(savedTimestamp) && savedTimestamp >= 0
      ? Math.min(savedTimestamp, Date.now()) : 0,
    playlists: [],
    playlistsLoaded: false,
    activeView: 'browse',
    activePlaylistId: null,
    knownTracks: new Map(),
    knownTracksVersion: 0,
    tracksResolving: new Set(),
    async resolvePlaylistTracks(playlistId) {
      const playlist = get().getPlaylist(playlistId);
      if (!playlist) return;
      const grouped: Record<ServerId, string[]> = { vault: [], juiceapi: [] };
      for (const id of playlist.trackIds) {
        if (get().knownTracks.has(id)) continue;
        const match = /^(vault|juiceapi):(\d+)$/.exec(id);
        if (match) grouped[match[1] as ServerId].push(id);
      }
      await Promise.all((['vault', 'juiceapi'] as const).flatMap(serverId =>
        grouped[serverId].map(id => resolveTrack(id, serverId, id.slice(id.indexOf(':') + 1)))));
    },
    openPlaylist(id) {
      if (get().getPlaylist(id)) {
        set({ activeView: 'playlist', activePlaylistId: id });
        void get().resolvePlaylistTracks(id);
      }
    },
    closePlaylist: () => set({ activeView: 'browse', activePlaylistId: null }),
    playPlaylist(id, startTrackId) {
      const playlist = get().getPlaylist(id);
      if (!playlist) return;
      const version = ++playlistPlayVersion;
      function start() {
        if (version !== playlistPlayVersion) return;
        const state = get();
        const current = state.getPlaylist(id);
        if (!current) return;
        const tracks = current.trackIds.map(trackId => state.knownTracks.get(trackId))
          .filter((track): track is Track => track !== undefined);
        const first = tracks.find(track => track.audioUrl !== null && (!startTrackId || track.trackId === startTrackId));
        if (first) state.playTrack(first, tracks);
      }
      const resolution = get().resolvePlaylistTracks(id);
      if (playlist.trackIds.every(trackId => get().knownTracks.has(trackId))) start();
      else void resolution.then(start);
    },
    loadPlaylists() {
      if (get().playlistsLoaded) return Promise.resolve();
      if (playlistLoad) return playlistLoad;
      playlistLoad = (async () => {
        let playlists = await loadPlaylists();
        const oldLikes = readSaved('juice-player-liked');
        if (Array.isArray(oldLikes)) {
          const validIds = oldLikes.filter((id): id is string => typeof id === 'string' && /^(vault|juiceapi):.+$/.test(id));
          playlists = playlists.map(playlist => playlist.id === LIKED_SONGS_ID
            ? { ...playlist, trackIds: [...new Set([...playlist.trackIds, ...validIds])] } : playlist);
        }
        await savePlaylists(playlists);
        set({ playlists, playlistsLoaded: true });
        try { localStorage.removeItem('juice-player-liked'); }
        catch (error) { console.warn('Could not remove legacy likes key:', error); }
      })().finally(() => { playlistLoad = undefined; });
      return playlistLoad;
    },
    createPlaylist(name) {
      const playlist: Playlist = { id: makePlaylistId(), name: playlistName(name), reserved: false, createdAt: Date.now(), trackIds: [] };
      updatePlaylists(playlists => [...playlists, playlist]);
      return playlist;
    },
    renamePlaylist(id, name) {
      const playlist = get().getPlaylist(id);
      if (!playlist || playlist.reserved) return;
      const trimmed = playlistName(name);
      updatePlaylists(playlists => playlists.map(item => item.id === id ? { ...item, name: trimmed } : item));
    },
    deletePlaylist(id) {
      const playlist = get().getPlaylist(id);
      if (!playlist || playlist.reserved) return;
      updatePlaylists(playlists => playlists.filter(item => item.id !== id));
      if (get().activePlaylistId === id) get().closePlaylist();
    },
    addTrackToPlaylist(playlistId, trackId) {
      if (!/^(vault|juiceapi):.+$/.test(trackId)) throw new Error('Invalid track identity');
      updatePlaylists(playlists => {
        const playlist = playlists.find(item => item.id === playlistId);
        if (!playlist) throw new Error(`Playlist not found: ${playlistId}`);
        if (playlist.trackIds.includes(trackId)) return playlists;
        return playlists.map(item => item.id === playlistId ? { ...item, trackIds: [...item.trackIds, trackId] } : item);
      });
    },
    removeTrackFromPlaylist(playlistId, trackId) {
      updatePlaylists(playlists => {
        const playlist = playlists.find(item => item.id === playlistId);
        if (!playlist) throw new Error(`Playlist not found: ${playlistId}`);
        if (!playlist.trackIds.includes(trackId)) return playlists;
        return playlists.map(item => item.id === playlistId ? { ...item, trackIds: item.trackIds.filter(id => id !== trackId) } : item);
      });
    },
    getPlaylist: id => get().playlists.find(playlist => playlist.id === id),
    incrementPlayCount(trackId) {
      const playCounts = { ...get().playCounts, [trackId]: (get().playCounts[trackId] ?? 0) + 1 };
      set({ playCounts });
      persist('juice-player-play-counts', playCounts);
    },
    takeMostPlayedSnapshot() {
      const mostPlayedSnapshot = { ...get().playCounts };
      const lastSnapshotAt = Date.now();
      set({ mostPlayedSnapshot, lastSnapshotAt });
      persist('juice-player-most-played-snapshot', mostPlayedSnapshot);
      persist('juice-player-last-snapshot-at', lastSnapshotAt);
    },
    toggleLiked(trackId) {
      if (get().isLiked(trackId)) get().removeTrackFromPlaylist(LIKED_SONGS_ID, trackId);
      else get().addTrackToPlaylist(LIKED_SONGS_ID, trackId);
    },
    isLiked: trackId => get().getPlaylist(LIKED_SONGS_ID)?.trackIds.includes(trackId) ?? false,
    async downloadTrack(trackId) {
      const state = get();
      const track = state.knownTracks.get(trackId) ?? [...state.tracks, ...state.queue].find(item => item.trackId === trackId);
      if (!track) throw new Error(`Track not found: ${trackId}`);
      await state.adapters[track.serverId].downloadTrack(track);
    },
    async switchServer(id) {
      if (id === get().serverId) return;
      clearTimeout(searchTimer);
      serverVersion++;
      catalogVersion++;
      playlistPlayVersion++;
      set({ ...cleared, serverId: id, activeView: 'browse', activePlaylistId: null });
      await Promise.all([loadCategories(), get().loadEras()]);
    },
    loadCategories: () => loadCategories(),
    async loadEras() {
      const version = serverVersion;
      const { serverId, adapters } = get();
      try {
        const eras = await adapters[serverId].listEras?.() ?? [];
        if (version === serverVersion) set({ eras });
      } catch {
        if (version === serverVersion) set({ eras: [] });
      }
    },
    loadCategory: (category, era) => {
      clearTimeout(searchTimer);
      set({ searchQuery: '', isSearching: false });
      return loadTracks(category, era);
    },
    async loadMore() {
      const state = get();
      if (!state.tracksHasMore || state.isLoadingTracks || (!state.isSearching && state.selectedCategory === null)) return;
      const version = ++catalogVersion;
      set({ isLoadingTracks: true, tracksError: null });
      try {
        const page = state.isSearching
          ? await state.adapters[state.serverId].search(state.searchQuery.trim(), state.tracks.length, 50)
          : await state.adapters[state.serverId].fetchCategory(
            state.selectedCategory!, state.tracks.length, 50, { era: state.selectedEra ?? undefined });
        if (version !== catalogVersion) return;
        const knownTracks = rememberTracks(page.items);
        set(current => ({ tracks: [...current.tracks, ...page.items], knownTracks, knownTracksVersion: current.knownTracksVersion + 1, tracksTotal: page.total,
          tracksHasMore: page.items.length > 0 && page.hasMore, isLoadingTracks: false }));
      } catch (error) {
        if (version === catalogVersion) set({ tracksError: errorMessage(error), isLoadingTracks: false });
      }
    },
    search: query => {
      clearTimeout(searchTimer);
      set({ searchQuery: query, isSearching: true });
      return loadTracks('', undefined, query);
    },
    async selectCategory(category) {
      if (category === get().selectedCategory) return;
      await get().loadCategory(category, get().selectedEra);
    },
    async selectEra(era) {
      set({ selectedEra: era });
      const category = get().selectedCategory;
      if (category !== null) await get().loadCategory(category, era);
    },
    playTrack(track, queueContext) {
      if (track.audioUrl === null) return;
      playlistPlayVersion++;
      const state = get();
      let queue = queueContext ?? (state.queue.length ? state.queue : state.tracks);
      if (findIndexByTrackId(queue, track.trackId) === -1) queue = [...queue, track];
      const queueIndex = findIndexByTrackId(queue, track.trackId);
      const shuffleOrder = state.shuffle ? [queueIndex, ...shufflePermutation(queue.length).filter(index => index !== queueIndex)] : [];
      set({ queue, queueIndex, currentTrack: track, knownTracks: rememberTracks(queue), knownTracksVersion: get().knownTracksVersion + 1, isPlaying: true, position: 0,
        duration: track.durationSeconds ?? 0, shuffleOrder,
        shuffleCursor: state.shuffle ? shuffleOrder.indexOf(queueIndex) : 0 });
      if (state.currentTrack?.trackId !== track.trackId) get().incrementPlayCount(track.trackId);
    },
    addToQueue(track) {
      if (track.audioUrl === null) return;
      const state = get();
      const insertAt = state.queueIndex + 1;
      const queue = [...state.queue];
      queue.splice(insertAt, 0, track);
      const shuffleOrder = state.shuffleOrder.map(index => index >= insertAt ? index + 1 : index);
      if (state.shuffle) shuffleOrder.splice(state.currentTrack ? state.shuffleCursor + 1 : 0, 0, insertAt);
      set({ queue, shuffleOrder, shuffleCursor: state.currentTrack ? state.shuffleCursor : -1 });
    },
    jumpToQueueIndex(index) {
      const state = get();
      if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) return;
      const track = state.queue[index];
      if (track.audioUrl === null) return;
      playlistPlayVersion++;
      set({ queueIndex: index, currentTrack: track, position: 0,
        duration: track.durationSeconds ?? 0, isPlaying: true, ...queueShuffle(state.queue, index, 0) });
      if (state.currentTrack?.trackId !== track.trackId) get().incrementPlayCount(track.trackId);
    },
    removeFromQueue(index) {
      const state = get();
      if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) return;
      const queue = state.queue.filter((_, entry) => entry !== index);
      let queueIndex = state.queueIndex;
      if (index < queueIndex) queueIndex--;
      else if (index === queueIndex && queueIndex >= queue.length) queueIndex = -1;
      playlistPlayVersion++;
      set({ queue, queueIndex, ...queueShuffle(queue, queueIndex, state.shuffleCursor),
        ...(!queue.length ? { currentTrack: null, isPlaying: false, position: 0, duration: 0, queueIndex: -1 } : {}) });
    },
    reorderQueue(fromIndex, toIndex) {
      const state = get();
      if (![fromIndex, toIndex].every(index => Number.isInteger(index) && index >= 0 && index < state.queue.length)
        || fromIndex === toIndex) return;
      const queue = [...state.queue];
      const [track] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, track);
      let queueIndex = state.queueIndex;
      if (queueIndex === fromIndex) queueIndex = toIndex;
      else if (fromIndex < queueIndex && toIndex >= queueIndex) queueIndex--;
      else if (fromIndex > queueIndex && toIndex <= queueIndex) queueIndex++;
      set({ queue, queueIndex, ...queueShuffle(queue, queueIndex, state.shuffleCursor) });
    },
    togglePlay() {
      playlistPlayVersion++;
      if (get().currentTrack) set(state => ({ isPlaying: !state.isPlaying }));
    },
    next: () => move(1),
    prev: () => move(-1),
    cycleRepeat() {
      set(state => ({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' }));
    },
    toggleQueue() {
      set(state => ({ queueOpen: !state.queueOpen }));
    },
    setPosition: position => set({ position }),
    setDuration: duration => set({ duration }),
    toggleShuffle() {
      const { shuffle, queue, queueIndex } = get();
      const shuffleOrder = shuffle ? [] : shufflePermutation(queue.length);
      set({ shuffle: !shuffle, shuffleOrder,
        shuffleCursor: shuffle ? 0 : Math.max(0, shuffleOrder.indexOf(queueIndex)) });
    },
    markUnavailable(trackId) {
      const unavailable = (track: Track) => track.trackId === trackId ? { ...track, audioUrl: null } : track;
      const state = get();
      const knownTracks = new Map(state.knownTracks);
      const known = knownTracks.get(trackId);
      if (known) knownTracks.set(trackId, unavailable(known));
      set({ tracks: state.tracks.map(unavailable), queue: state.queue.map(unavailable), knownTracks, knownTracksVersion: state.knownTracksVersion + 1,
        currentTrack: state.currentTrack ? unavailable(state.currentTrack) : null });
      if (state.currentTrack?.trackId === trackId) get().next();
    },
  };
});

export type { PlayerState };

Promise.resolve().then(() => usePlayerStore.getState().loadPlaylists())
  .catch(error => console.error('Playlist load failed:', error));

export function getAllPlaylistsWithTracks(playlists: Playlist[], allKnownTracks: Map<string, Track>): { playlist: Playlist; tracks: Track[] }[] {
  return playlists.map(playlist => ({ playlist, tracks: playlist.trackIds
    .map(id => allKnownTracks.get(id)).filter((track): track is Track => track !== undefined) }));
}

if (Date.now() - usePlayerStore.getState().lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
  Promise.resolve().then(() => usePlayerStore.getState().takeMostPlayedSnapshot());
}

export function initSnapshotTimer(): () => void {
  let timer: ReturnType<typeof setTimeout>;
  function schedule() {
    const remaining = Math.max(0, SNAPSHOT_INTERVAL_MS - (Date.now() - usePlayerStore.getState().lastSnapshotAt));
    timer = setTimeout(() => {
      // Initialization or a manual snapshot may have moved the deadline.
      if (Date.now() - usePlayerStore.getState().lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
        usePlayerStore.getState().takeMostPlayedSnapshot();
      }
      schedule();
    }, remaining);
  }
  schedule();
  return () => clearTimeout(timer);
}
