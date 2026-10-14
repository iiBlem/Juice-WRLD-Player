import { useCallback, useEffect, useState } from 'react';
import ConfirmPopover from './ConfirmPopover';
import { usePlayerStore } from '../state/player';
import type { Track } from '../types/track';
import TrackMenu from './TrackMenu';
import PlaylistActions from './PlaylistActions';
import './PlaylistView.css';

export default function PlaylistView() {
  const playlist = usePlayerStore(state => state.playlists.find(item => item.id === state.activePlaylistId));
  const knownTracks = usePlayerStore(state => state.knownTracks);
  usePlayerStore(state => state.knownTracksVersion);
  const resolving = usePlayerStore(state => state.tracksResolving);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const active = usePlayerStore(state => state.bulkDownload?.active ?? false);
  const [confirming, setConfirming] = useState(false);
  const cancel = useCallback(() => setConfirming(false), []);
  useEffect(() => { setConfirming(false); }, [playlist?.id, active]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  if (!playlist) return <section className="playlist-view">Playlist not found.</section>;
  const tracks = playlist.trackIds.map(id => knownTracks.get(id)).filter((track): track is Track => track !== undefined);
  const canPlay = tracks.some(track => track.audioUrl !== null);
  function rename() { if (playlist && !playlist.reserved) { setName(playlist.name); setRenamingId(playlist.id); } }
  function play(shuffle: boolean) {
    if (!playlist) return;
    const state = usePlayerStore.getState();
    if (state.shuffle !== shuffle) state.toggleShuffle();
    state.playPlaylist(playlist.id);
  }
  return <section className="playlist-view" aria-label={playlist.name}>
    <header className="playlist-heading glass-panel">
      {renamingId === playlist.id && !playlist.reserved ? <form className="playlist-title-form" onSubmit={event => {
        event.preventDefault();
        if (name.trim()) { usePlayerStore.getState().renamePlaylist(playlist.id, name); setRenamingId(null); }
      }} onKeyDown={event => { if (event.key === 'Escape') setRenamingId(null); }}>
        <input autoFocus aria-label="Playlist name" value={name} onChange={event => setName(event.target.value)} />
        <button type="submit" disabled={!name.trim()}>Save</button>
      </form> : <h1 onDoubleClick={rename}>{playlist.name}</h1>}
      <p>{playlist.trackIds.length} tracks</p>
      <div className="playlist-controls">
        <button type="button" className="playlist-play-all" disabled={!canPlay} onClick={() => play(false)}>Play All</button>
        <button type="button" disabled={!canPlay} onClick={() => play(true)}>Shuffle</button>
        <div className="download-anchor playlist-download">
          <button type="button" className="download-button" disabled={active || !playlist.trackIds.length}
            title={active ? 'Download in progress' : 'Download this playlist'}
            aria-haspopup="dialog" aria-expanded={confirming} onClick={() => setConfirming(!confirming)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" /></svg>
            Download Playlist
          </button>
          {confirming && <ConfirmPopover message="Download all playable tracks in this playlist?" confirmLabel="Download"
            onCancel={cancel} onConfirm={() => { cancel(); void usePlayerStore.getState().startBulkDownload('playlist'); }} />}
        </div>
        <PlaylistActions playlist={playlist} onRename={rename} showButton />
      </div>
    </header>
    {!playlist.trackIds.length ? <p className="playlist-empty">This playlist is empty. Add songs from the track list via the three-dot menu.</p>
      : <div className="playlist-rows">
        {playlist.trackIds.map((id, index) => {
          const track = knownTracks.get(id);
          if (!track) return <div className="playlist-row playlist-unavailable" key={id}>
            <span className="playlist-index">{index + 1}</span>
            <span className="playlist-thumb">{resolving.has(id) ? <span className="playlist-spinner" role="status" aria-label="Loading track" /> : <span aria-hidden="true">♫</span>}</span>
            <div className="playlist-track-text"><span>Track not loaded</span><small>{resolving.has(id) ? 'Loading track…' : 'Track could not be loaded'}</small></div>
          </div>;
          const unavailable = track.audioUrl === null;
          const liked = usePlayerStore.getState().isLiked(id);
          const duration = track.durationSeconds;
          const playTrack = () => { if (!unavailable) usePlayerStore.getState().playPlaylist(playlist.id, id); };
          return <div key={id} className={`playlist-row${unavailable ? ' playlist-unavailable' : ''}${currentTrack?.trackId === id ? ' current' : ''}`}
            onClick={playTrack}>
            <span className="playlist-index">{index + 1}</span>
            {track.imageUrl ? <img className="playlist-thumb" src={track.imageUrl} alt="" loading="lazy" /> : <span className="playlist-thumb" aria-hidden="true">♫</span>}
            <div className="playlist-track-text">
              <button type="button" disabled={unavailable} title={track.title} onClick={event => { event.stopPropagation(); playTrack(); }}>{track.title}</button>
              <small title={track.author}>{track.author}</small>
            </div>
            <span className="playlist-category" title={track.category}>{track.category}</span>
            <span className="playlist-duration">{duration === null ? '—' : `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`}</span>
            <button type="button" className={`track-icon-button heart${liked ? ' liked' : ''}`} aria-pressed={liked}
              aria-label={`${liked ? 'Unlike' : 'Like'} ${track.title}`} onClick={event => {
                event.stopPropagation(); usePlayerStore.getState().toggleLiked(id);
              }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7">
                <path d="M12 21S3 15 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 13-9 13Z" />
              </svg>
            </button>
            <TrackMenu track={track} playlistId={playlist.id} />
          </div>;
        })}
      </div>}
  </section>;
}
