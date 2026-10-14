const { contextBridge, ipcRenderer } = require('electron');

const APP_ORIGIN = 'https://juicewrldvault.com';

const getDesktopVersion = () => {
  const versionArg = process.argv.find((arg) => arg.startsWith('--jwv-version='));
  return versionArg ? versionArg.slice('--jwv-version='.length) : '0.0.0';
};

const isAppOrigin = () => {
  try {
    return window.location.origin === APP_ORIGIN;
  } catch {
    return false;
  }
};

const desktopApp = {
  isDesktop: true,
  version: getDesktopVersion(),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  update: () => ipcRenderer.invoke('desktop:update'),
  openOAuth: (url) => {
    if (typeof url !== 'string' || url.length > 4096) return Promise.reject(new Error('Invalid desktop sign-in URL.'));
    return ipcRenderer.invoke('desktop:oauth-open', url);
  },
  getPendingOAuthCallback: () => ipcRenderer.invoke('desktop:oauth-pending'),
  onOAuthCallback: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (event, url) => {
      if (typeof url === 'string' && url.length <= 4096) callback(url);
    };
    ipcRenderer.on('desktop:oauth-callback', listener);
    return () => ipcRenderer.removeListener('desktop:oauth-callback', listener);
  },
  setDiscordPresence: (activity) => {
    if (!isAppOrigin()) return;
    ipcRenderer.send('discord-presence:update', activity);
  },
  clearDiscordPresence: () => {
    if (!isAppOrigin()) return;
    ipcRenderer.send('discord-presence:clear');
  }
};

contextBridge.exposeInMainWorld('juiceWRLDVaultDesktop', desktopApp);
if (window.top === window && (isAppOrigin() || window.location.href.startsWith('jwv-offline://library/'))) {
  contextBridge.exposeInMainWorld('jwvOffline',{version:1,nativePlayback:false,invoke:(action,args)=>ipcRenderer.invoke('offline:invoke',action,args)});
}

let lastPresenceKey = '';
let lastStartedAt = 0;

const getActiveAudio = () => {
  const audioElements = Array.from(document.querySelectorAll('audio'));
  return audioElements.find((audio) => !audio.paused && !audio.ended) || null;
};

const getMediaSessionMetadata = () => {
  const metadata = navigator.mediaSession?.metadata;
  if (!metadata) return null;
  const artwork = Array.isArray(metadata.artwork)
    ? metadata.artwork.find((item) => String(item?.src || '').startsWith('https://'))
    : null;

  return {
    title: String(metadata.title || '').trim(),
    artist: String(metadata.artist || '').trim(),
    album: String(metadata.album || '').trim(),
    artworkUrl: String(artwork?.src || '').trim()
  };
};

const getSongUrl = () => {
  try {
    if (window.location.origin !== APP_ORIGIN) return APP_ORIGIN;
    if (window.location.pathname.startsWith('/song/')) return window.location.href;
  } catch {
    return APP_ORIGIN;
  }
  return APP_ORIGIN;
};

const updateDiscordPresenceFromPlayback = () => {
  if (!isAppOrigin()) return;

  const audio = getActiveAudio();
  if (!audio) {
    if (lastPresenceKey) {
      lastPresenceKey = '';
      lastStartedAt = 0;
      ipcRenderer.send('discord-presence:clear');
    }
    return;
  }

  const metadata = getMediaSessionMetadata();
  if (!metadata?.title || /^juicewrldvault$/i.test(metadata.title)) return;

  const now = Date.now();
  if (!lastStartedAt) lastStartedAt = now - Math.max(0, audio.currentTime || 0) * 1000;

  const activity = {
    name: metadata.title,
    title: metadata.title,
    artist: metadata.artist || metadata.album || 'Juice WRLD',
    url: getSongUrl(),
    durationMs: Number.isFinite(audio.duration) ? Math.floor(audio.duration * 1000) : 0,
    positionMs: Number.isFinite(audio.currentTime) ? Math.floor(audio.currentTime * 1000) : 0,
    startedAt: lastStartedAt,
    coverImageUrl: metadata.artworkUrl,
    largeImageKey: 'juicewrldvault',
    largeImageText: metadata.title
  };
  const presenceKey = JSON.stringify(activity);

  if (presenceKey === lastPresenceKey) return;
  lastPresenceKey = presenceKey;
  ipcRenderer.send('discord-presence:update', activity);
};

window.addEventListener('juicewrldvault:discord-presence', (event) => {
  if (!isAppOrigin()) return;
  const detail = event.detail || {};
  if (detail.clear) {
    lastPresenceKey = '';
    lastStartedAt = 0;
    ipcRenderer.send('discord-presence:clear');
    return;
  }
  ipcRenderer.send('discord-presence:update', detail);
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.juicewrldvaultDesktop = 'true';
  document.documentElement.dataset.juicewrldvaultDesktopVersion = desktopApp.version;

  document.addEventListener('play', () => {
    lastStartedAt = 0;
    setTimeout(updateDiscordPresenceFromPlayback, 250);
  }, true);

  document.addEventListener('pause', () => {
    setTimeout(updateDiscordPresenceFromPlayback, 250);
  }, true);

  document.addEventListener('ended', () => {
    lastPresenceKey = '';
    lastStartedAt = 0;
    ipcRenderer.send('discord-presence:clear');
  }, true);

  setInterval(updateDiscordPresenceFromPlayback, 5000);
});
