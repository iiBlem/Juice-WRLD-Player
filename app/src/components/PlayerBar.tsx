import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../state/player';
import './PlayerBar.css';

function formatTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function Icon({ name }: { name: 'shuffle' | 'prev' | 'next' | 'play' | 'pause' | 'repeat' | 'queue' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === 'shuffle' && <><path d="M3 6h3c5 0 7 12 12 12h3M3 18h3c2 0 3-2 4-4M14 9c1-2 2-3 4-3h3" /><path d="m18 3 3 3-3 3m0 6 3 3-3 3" /></>}
      {name === 'prev' && <><path d="M5 5v14" /><path d="m19 5-11 7 11 7Z" /></>}
      {name === 'next' && <><path d="M19 5v14" /><path d="m5 5 11 7-11 7Z" /></>}
      {name === 'play' && <path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none" />}
      {name === 'pause' && <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>}
      {name === 'repeat' && <><path d="M4 10V8a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M20 14v2a3 3 0 0 1-3 3H4m3 3-3-3 3-3" /></>}
      {name === 'queue' && <path d="M4 6h16M4 12h16M4 18h16" />}
    </svg>
  );
}

function SeekIcon({ forward }: { forward?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <g transform={forward ? 'translate(24 0) scale(-1 1)' : undefined}>
        <path d="M5 6a9 9 0 1 1-2 9M5 2v5H1" />
      </g>
      <text x="12" y="15" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">10</text>
    </svg>
  );
}

export default function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const position = usePlayerStore(state => state.position);
  const duration = usePlayerStore(state => state.duration);
  const shuffle = usePlayerStore(state => state.shuffle);
  const repeat = usePlayerStore(state => state.repeat);
  const queueOpen = usePlayerStore(state => state.queueOpen);
  const audioUrl = currentTrack?.audioUrl ?? undefined;
  const trackId = currentTrack?.trackId;
  const actions = usePlayerStore.getState;
  const playable = Boolean(audioUrl);
  const canSeek = playable && Number.isFinite(duration) && duration > 0;

  useEffect(() => {
    audioRef.current?.load();
  }, [audioUrl, trackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying && audioUrl) void audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying, audioUrl, trackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || !Number.isFinite(audio.duration)) return;
    // Store resets restart repeat-one and same-track playback; timeupdate already matches the element.
    if (Math.abs(audio.currentTime - position) > 0.5) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, position));
      if (actions().isPlaying && audio.paused) void audio.play().catch(() => {});
    }
  }, [position, audioUrl, trackId]);

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
    actions().setPosition(audio.currentTime);
  }

  return (
    <footer className="player-bar glass-panel" aria-label="Music player">
      <audio ref={audioRef} src={audioUrl} preload="metadata"
        onTimeUpdate={event => actions().setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={event => actions().setDuration(event.currentTarget.duration)}
        onEnded={() => actions().next()} />
      <div className="player-track">
        {currentTrack?.imageUrl
          ? <img className="player-artwork" src={currentTrack.imageUrl} alt="" />
          : <div className="player-artwork player-artwork-empty" aria-hidden="true">♪</div>}
        <div className="player-track-text">
          <div className="player-title" title={currentTrack?.title}>{currentTrack?.title ?? 'No track selected'}</div>
          <div className="player-author">{currentTrack?.author ?? ''}</div>
        </div>
      </div>
      <div className="player-controls">
        <div className="player-transport">
          <button type="button" className={shuffle ? 'active' : ''} aria-label="Shuffle" aria-pressed={shuffle} onClick={() => actions().toggleShuffle()}><Icon name="shuffle" /></button>
          <button type="button" aria-label="Previous track" disabled={!playable} onClick={() => actions().prev()}><Icon name="prev" /></button>
          <button type="button" aria-label="Rewind 10 seconds" disabled={!canSeek} onClick={() => seek((audioRef.current?.currentTime ?? 0) - 10)}><SeekIcon /></button>
          <button type="button" className="player-play" aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!playable} onClick={() => actions().togglePlay()}><Icon name={isPlaying ? 'pause' : 'play'} /></button>
          <button type="button" aria-label="Forward 10 seconds" disabled={!canSeek} onClick={() => seek((audioRef.current?.currentTime ?? 0) + 10)}><SeekIcon forward /></button>
          <button type="button" aria-label="Next track" disabled={!playable} onClick={() => actions().next()}><Icon name="next" /></button>
          <button type="button" className={`player-repeat ${repeat !== 'off' ? 'active' : ''}`} aria-label={`Repeat: ${repeat}`} aria-pressed={repeat !== 'off'} onClick={() => actions().cycleRepeat()}>
            <Icon name="repeat" />{repeat === 'one' && <span className="player-repeat-badge">1</span>}
          </button>
          <button type="button" aria-label="Toggle queue" aria-pressed={queueOpen} onClick={() => actions().toggleQueue()}><Icon name="queue" /></button>
        </div>
        <button type="button" className="player-progress" role="slider" aria-label="Playback position"
          aria-valuemin={0} aria-valuemax={canSeek ? duration : 0} aria-valuenow={canSeek ? Math.min(duration, Math.max(0, position)) : 0}
          aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`} disabled={!canSeek}
          onClick={event => {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (bounds.width > 0) seek(((event.clientX - bounds.left) / bounds.width) * duration);
          }}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            seek(event.key === 'Home' ? 0 : event.key === 'End' ? duration : position + (event.key === 'ArrowRight' ? 5 : -5));
          }}>
          <span className="player-progress-track"><span className="player-progress-fill" style={{ width: `${canSeek ? Math.min(100, Math.max(0, position / duration * 100)) : 0}%` }} /></span>
        </button>
      </div>
      <div className="player-time">{formatTime(position)} / {formatTime(duration)}</div>
    </footer>
  );
}
