import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '../types/track';
import { usePlayerStore } from '../state/player';
import { sortTracks, type SortMode } from '../lib/sortTracks';
import TrackMenu from './TrackMenu';
import './TrackList.css';

export function extractFeatures(track: Track): string {
  const raw = track.raw && typeof track.raw === 'object' ? track.raw as Record<string, unknown> : {};
  const author = track.serverId === 'vault' ? raw.author : raw.credited_artists;
  if (typeof author !== 'string' || !/\&|\bfeat\.|\bft\.|\bwith\b/i.test(author)) return 'N/A';
  return author.replace(/\bJuice\s+WRLD\b/gi, '').replace(/\b(?:feat\.|ft\.|with\b)/gi, '')
    .replace(/^[\s&,()]+|[\s&,()]+$/g, '').trim() || 'N/A';
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function Artwork({ track }: { track: Track }) {
  return track.imageUrl ? <img src={track.imageUrl} alt="" loading="lazy" />
    : <span className="track-initials">{track.title.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span>;
}

export default function TrackList() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const tracks = usePlayerStore(state => state.tracks);
  const total = usePlayerStore(state => state.tracksTotal);
  const loading = usePlayerStore(state => state.isLoadingTracks);
  const error = usePlayerStore(state => state.tracksError);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const counts = usePlayerStore(state => state.playCounts);
  const snapshot = usePlayerStore(state => state.mostPlayedSnapshot);
  usePlayerStore(state => state.playlists);
  const playlistsLoaded = usePlayerStore(state => state.playlistsLoaded);
  usePlayerStore(state => state.knownTracksVersion);
  const hasMore = usePlayerStore(state => state.tracksHasMore);
  const sortedTracks = useMemo(() => sortTracks(tracks, sortMode, snapshot), [tracks, sortMode, snapshot]);
  const sentinel = useRef<HTMLDivElement>(null);
  const scrollAnchor = useRef<{ id: string; top: number } | null>(null);
  useEffect(() => usePlayerStore.subscribe((state, previous) => {
    if (state.tracks.length <= previous.tracks.length || !previous.tracks.length
      || !previous.tracks.every((track, i) => state.tracks[i]?.trackId === track.trackId)) return;
    const main = sentinel.current?.closest('main');
    if (!main) return;
    const bounds = main.getBoundingClientRect();
    const visible = Array.from(main.querySelectorAll<HTMLElement>('[data-track-id]')).find(element => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > bounds.top && rect.top < bounds.bottom;
    });
    if (visible) scrollAnchor.current = { id: visible.dataset.trackId!, top: visible.getBoundingClientRect().top };
  }), []);
  useLayoutEffect(() => {
    const anchor = scrollAnchor.current;
    scrollAnchor.current = null;
    const main = sentinel.current?.closest('main');
    if (!anchor || !main) return;
    const element = Array.from(main.querySelectorAll<HTMLElement>('[data-track-id]'))
      .find(item => item.dataset.trackId === anchor.id);
    if (element) main.scrollTop += element.getBoundingClientRect().top - anchor.top;
  }, [sortedTracks]);
  useEffect(() => {
    if (!sentinel.current || !hasMore || loading || error) return;
    const observer = new IntersectionObserver(entries => {
      const state = usePlayerStore.getState();
      if (entries.some(entry => entry.isIntersecting) && state.tracksHasMore && !state.isLoadingTracks) {
        void state.loadMore();
      }
    }, { threshold: 0.1 });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, error, tracks.length]);

  function heart(track: Track) {
    const liked = usePlayerStore.getState().isLiked(track.trackId);
    return <button type="button" className={`track-icon-button heart${liked ? ' liked' : ''}`}
      aria-label={`${liked ? 'Unlike' : 'Like'} ${track.title}`} aria-pressed={liked} disabled={!playlistsLoaded}
      onClick={event => { event.stopPropagation(); usePlayerStore.getState().toggleLiked(track.trackId); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7">
        <path d="M12 21S3 15 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 13-9 13Z" />
      </svg>
    </button>;
  }
  function play(track: Track) {
    if (track.audioUrl !== null) usePlayerStore.getState().playTrack(track, sortedTracks);
  }
  return <section className="track-list" aria-label="Tracks">
    <div className="track-toolbar glass-panel">
      <span aria-live="polite">{loading && !tracks.length ? 'Loading…' : `${(total ?? tracks.length).toLocaleString()} tracks`}</span>
      <label className="sort-control">Sort <select value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}>
        <option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option>
        <option value="duration-asc">Duration short–long</option><option value="duration-desc">Duration long–short</option>
        <option value="most-played">Most played</option>
      </select></label>
      <div className="view-toggle" aria-label="Track view">
        <button type="button" aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></svg>
        </button>
        <button type="button" aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h3v3H3zM9 4h12v3H9zM3 11h3v3H3zM9 11h12v3H9zM3 18h3v3H3zM9 18h12v3H9z" /></svg>
        </button>
      </div>
    </div>
    {error && <div className="track-message" role="alert">{error}</div>}
    {!loading && !error && !tracks.length && <div className="track-message">No tracks in this category.</div>}
    <div className={viewMode === 'grid' ? 'track-grid' : 'track-rows'} aria-busy={loading}>
      {sortedTracks.map((track, index) => {
        const active = currentTrack?.trackId === track.trackId;
        const unavailable = track.audioUrl === null;
        return <div key={track.trackId} className={`track-${viewMode === 'grid' ? 'card' : 'row'}${active ? ' current' : ''}${unavailable ? ' unavailable' : ''}`}
          data-track-id={track.trackId} data-play-count={counts[track.trackId] ?? 0} onClick={() => play(track)}>
          {viewMode === 'list' && <span className="track-index">{active && isPlaying
            ? <span className="playing-bars" aria-label="Playing"><i /><i /><i /></span> : index + 1}</span>}
          <div className="track-artwork"><Artwork track={track} />
            {viewMode === 'grid' && <div className="track-overlay">
              {!unavailable && <button type="button" className="track-play" aria-label={`Play ${track.title}`}
                onClick={event => { event.stopPropagation(); play(track); }}>▶</button>}
              <div className="overlay-heart">{heart(track)}</div><div className="overlay-menu"><TrackMenu track={track} /></div>
            </div>}
          </div>
          <div className="track-text">
            <button type="button" className="track-title" title={track.title} disabled={unavailable}
              onClick={event => { event.stopPropagation(); play(track); }}>{track.title}</button>
            <span className="track-author" title={track.author}>{track.author}</span>
          </div>
          {viewMode === 'list' && <>
            <span className="track-category">{track.category}</span><span className="track-features">{extractFeatures(track)}</span>
            <span className="track-duration">{formatDuration(track.durationSeconds)}</span>{heart(track)}<TrackMenu track={track} />
          </>}
        </div>;
      })}
      {loading && Array.from({ length: viewMode === 'grid' ? 6 : 8 }, (_, i) =>
        <div key={`skeleton-${i}`} className={`track-skeleton ${viewMode} shimmer`} aria-hidden="true" />)}
    </div>
    <div ref={sentinel} className="track-sentinel" aria-hidden="true" />
  </section>;
}
