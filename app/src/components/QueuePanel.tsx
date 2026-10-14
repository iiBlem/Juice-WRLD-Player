import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../state/player';
import type { Track } from '../types/track';
import './QueuePanel.css';

export default function QueuePanel() {
  const open = usePlayerStore(state => state.queueOpen);
  const queue = usePlayerStore(state => state.queue);
  const queueIndex = usePlayerStore(state => state.queueIndex);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const panel = useRef<HTMLElement>(null);
  const armed = useRef<number | null>(null);
  const source = useRef<{ index: number; queue: Track[] } | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    source.current = null;
    armed.current = null;
    setTarget(null);
    if (open) panel.current?.querySelector<HTMLButtonElement>('.queue-close')?.focus();
  }, [open]);
  function close() {
    usePlayerStore.getState().toggleQueue();
    document.querySelector<HTMLButtonElement>('[aria-label="Toggle queue"]')?.focus();
  }
  if (!open) return null;
  return <aside ref={panel} className="queue-panel glass-panel" aria-label="Queue" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  }}>
    <header className="queue-heading">
      <h2>Queue ({queue.length} tracks)</h2>
      <button type="button" className="queue-close" aria-label="Close queue" onClick={close}>×</button>
    </header>
    {!queue.length ? <p className="queue-empty">Queue is empty.</p> : <ol className="queue-list">
      {queue.map((track, index) => {
        const current = index === queueIndex && track.trackId === currentTrack?.trackId;
        const duration = track.durationSeconds;
        return <li key={`${track.trackId}:${index}`} draggable
          className={`queue-row${current ? ' current' : ''}${target === index ? ' drop-target' : ''}`}
          onClick={() => { if (!current) usePlayerStore.getState().jumpToQueueIndex(index); }}
          onMouseDown={event => {
            armed.current = event.target instanceof Element && event.target.closest('[data-queue-drag-handle]') ? index : null;
          }}
          onDragStart={event => {
            if (armed.current !== index) { event.preventDefault(); return; }
            source.current = { index, queue };
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
          }}
          onDragOver={event => {
            if (source.current?.queue !== queue) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setTarget(index);
          }}
          onDragLeave={event => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTarget(null);
          }}
          onDrop={event => {
            event.preventDefault();
            if (source.current?.queue === usePlayerStore.getState().queue) {
              usePlayerStore.getState().reorderQueue(source.current.index, index);
            }
            source.current = null; armed.current = null; setTarget(null);
          }}
          onDragEnd={() => { source.current = null; armed.current = null; setTarget(null); }}>
          <button type="button" className="queue-drag" data-queue-drag-handle
            aria-label={`Reorder ${track.title}`} title="Drag to reorder; Alt+Up or Alt+Down with keyboard"
            onClick={event => event.stopPropagation()} onKeyDown={event => {
              if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault(); event.stopPropagation();
              const to = index + (event.key === 'ArrowUp' ? -1 : 1);
              usePlayerStore.getState().reorderQueue(index, to);
              if (to >= 0 && to < queue.length) requestAnimationFrame(() => panel.current?.querySelectorAll<HTMLButtonElement>('.queue-drag')[to]?.focus());
            }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20m-13-7 3-3 3 3m-6 14 3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3" /></svg>
          </button>
          <button type="button" className="queue-track" disabled={track.audioUrl === null}
            aria-label={`Play ${track.title}`} aria-current={current ? 'true' : undefined}>
            <span className="queue-index" aria-hidden="true">{current && isPlaying ? '▶' : index + 1}</span>
            {track.imageUrl ? <img src={track.imageUrl} alt="" draggable={false} loading="lazy" />
              : <span className="queue-thumb" aria-hidden="true">♫</span>}
            <span className="queue-text"><strong title={track.title}>{track.title}</strong><small title={track.author}>{track.author}</small></span>
            <span className="queue-duration">{duration === null || !Number.isFinite(duration) ? '—'
              : `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`}</span>
          </button>
          <button type="button" className="queue-remove" aria-label={`Remove ${track.title} from queue`}
            onClick={event => { event.stopPropagation(); usePlayerStore.getState().removeFromQueue(index); }}>×</button>
        </li>;
      })}
    </ol>}
  </aside>;
}
