import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Playlist } from '../types/playlist';
import { usePlayerStore } from '../state/player';
import './PlaylistActions.css';

export default function PlaylistActions({ playlist, onRename, children, showButton = false }: {
  playlist: Playlist; onRename(): void; children?: ReactNode; showButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="playlist-actions" ref={ref} onContextMenu={event => {
    event.preventDefault();
    if (!playlist.reserved) setOpen(true);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation(); setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }}>
    {children}
    {showButton && !playlist.reserved && <button type="button" className="playlist-action-trigger"
      aria-label={`Options for ${playlist.name}`} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(!open)}>•••</button>}
    {open && !playlist.reserved && <div className="playlist-action-menu glass-panel" role="menu" aria-label="Playlist actions">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onRename(); }}>Rename</button>
      <button type="button" role="menuitem" onClick={() => {
        setOpen(false); usePlayerStore.getState().deletePlaylist(playlist.id);
      }}>Delete</button>
    </div>}
  </div>;
}
