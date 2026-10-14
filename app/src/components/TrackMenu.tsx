import { useEffect, useRef, useState } from 'react';
import type { Track } from '../types/track';
import { usePlayerStore } from '../state/player';
import './TrackMenu.css';

export default function TrackMenu({ track, playlistId }: { track: Track; playlistId?: string }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [playlistError, setPlaylistError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const liked = usePlayerStore(state => state.isLiked(track.trackId));
  const playlists = usePlayerStore(state => state.playlists);
  const playlistsLoaded = usePlayerStore(state => state.playlistsLoaded);
  const nameInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (creating) nameInput.current?.focus(); }, [creating]);
  useEffect(() => {
    if (!open) { setShowPlaylists(false); setCreating(false); setName(''); setPlaylistError(''); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>('.track-popover button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  function addToQueue() {
    usePlayerStore.getState().addToQueue(track);
    setFeedback('Queued to play next');
    setOpen(false);
  }
  async function download() {
    setDownloading(true);
    try { await usePlayerStore.getState().downloadTrack(track.trackId); console.log('Download complete:', track.title); }
    catch (error) { console.error('Download failed:', error); }
    finally { setDownloading(false); setOpen(false); }
  }
  function saveToPlaylist(id: string) {
    try {
      usePlayerStore.getState().addTrackToPlaylist(id, track.trackId);
      setFeedback('Saved to playlist');
      setOpen(false);
    } catch (error) { setPlaylistError(error instanceof Error ? error.message : String(error)); }
  }
  function createPlaylist() {
    if (!name.trim()) return;
    try {
      const playlist = usePlayerStore.getState().createPlaylist(name);
      saveToPlaylist(playlist.id);
    } catch (error) { setPlaylistError(error instanceof Error ? error.message : String(error)); }
  }
  return <div className={`track-menu${open ? ' open' : ''}`} ref={ref} onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    }}>
    <button type="button" ref={trigger} className="track-icon-button" aria-label={`Options for ${track.title}`}
      aria-expanded={open} onClick={() => { setFeedback(''); setOpen(!open); }}>•••</button>
    {feedback && <span className="track-menu-feedback glass-panel" role="status">{feedback}</span>}
    {open && <div className="track-popover glass-panel" aria-label={`Track actions for ${track.title}`}>
      <button type="button" disabled={track.audioUrl === null} onClick={addToQueue}>Add to queue</button>
      <button type="button" ref={saveButton} disabled={!playlistsLoaded} aria-expanded={showPlaylists}
        onClick={() => setShowPlaylists(!showPlaylists)}>Save to playlist</button>
      {showPlaylists && <div className="playlist-submenu" aria-label="Choose playlist">
        {playlists.filter(playlist => !playlist.reserved).map(playlist => <button key={playlist.id} type="button"
          onClick={() => saveToPlaylist(playlist.id)}>{playlist.name}</button>)}
        {!creating ? <button type="button" onClick={() => setCreating(true)}>+ New playlist...</button>
          : <form className="playlist-create-row" onSubmit={event => { event.preventDefault(); createPlaylist(); }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setCreating(false); setName(''); setPlaylistError(''); saveButton.current?.focus();
              }
            }}>
            <input ref={nameInput} aria-label="New playlist name" placeholder="Playlist name" value={name}
              onChange={event => setName(event.target.value)} />
            <button type="submit" disabled={!name.trim()}>Create</button>
          </form>}
        {playlistError && <small role="alert">{playlistError}</small>}
      </div>}
      <button type="button" disabled={track.audioUrl === null || downloading} onClick={() => void download()}>
        {downloading ? 'Downloading…' : 'Download'}</button>
      <button type="button" disabled={!playlistsLoaded} onClick={() => { usePlayerStore.getState().toggleLiked(track.trackId); setOpen(false); }}>
        {liked ? 'Remove from liked' : 'Add to liked'}</button>
      {playlistId && <button type="button" onClick={() => {
        usePlayerStore.getState().removeTrackFromPlaylist(playlistId, track.trackId); setOpen(false);
      }}>Remove from playlist</button>}
    </div>}
  </div>;
}
