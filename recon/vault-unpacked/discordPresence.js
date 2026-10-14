const net = require('net');
const crypto = require('crypto');

const DISCORD_IPC_OPCODE = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4
};

const DEFAULT_LARGE_IMAGE_KEY = 'juicewrldvault';
const ACTIVITY_TYPE_LISTENING = 2;
const MAX_TEXT_LENGTH = 128;

const truncateText = (value) => {
  const text = String(value || '').trim();
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH - 1).trim();
};

const isValidClientId = (value) => /^\d{15,25}$/.test(String(value || '').trim());

const isTrustedImageUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return [
      'juicewrldvault.com',
      'media.juicewrldvault.com',
      'qfsysguoaxbwhjeqkwat.supabase.co'
    ].includes(url.hostname);
  } catch {
    return false;
  }
};

const imageAsset = (value, fallback) => {
  const raw = String(value || '').trim();
  if (isTrustedImageUrl(raw)) return raw;
  return truncateText(raw || fallback);
};

const toDiscordTimestampSeconds = (value) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return Math.round(timestamp > 100000000000 ? timestamp / 1000 : timestamp);
};

const getIpcPath = (index) => {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${index}`;
  const runtimeDir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return `${runtimeDir.replace(/\/$/, '')}/discord-ipc-${index}`;
};

const encodePacket = (opcode, payload = {}) => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(opcode, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
};

const decodePackets = (buffer) => {
  const packets = [];
  let offset = 0;

  while (buffer.length - offset >= 8) {
    const opcode = buffer.readInt32LE(offset);
    const length = buffer.readInt32LE(offset + 4);
    const packetEnd = offset + 8 + length;

    if (buffer.length < packetEnd) break;

    const raw = buffer.slice(offset + 8, packetEnd).toString('utf8');
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    packets.push({ opcode, payload });
    offset = packetEnd;
  }

  return { packets, remaining: buffer.slice(offset) };
};

class DiscordPresence {
  constructor({ clientId, appVersion, log }) {
    this.clientId = String(clientId || '').trim();
    this.appVersion = appVersion;
    this.log = typeof log === 'function' ? log : () => {};
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.connected = false;
    this.connecting = false;
    this.pendingActivity = null;
    this.lastActivityKey = '';
    this.reconnectTimer = null;
  }

  isConfigured() {
    return isValidClientId(this.clientId);
  }

  connect() {
    if (!this.isConfigured() || this.connected || this.connecting) return;
    this.connecting = true;
    this.tryIpcPath(0);
  }

  tryIpcPath(index) {
    if (index > 9) {
      this.connecting = false;
      this.log('Discord RPC unavailable. Is Discord running?');
      return;
    }

    const socket = net.createConnection(getIpcPath(index));
    let settled = false;

    const fail = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      this.tryIpcPath(index + 1);
    };

    socket.once('error', fail);
    socket.once('connect', () => {
      if (settled) return;
      settled = true;
      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      this.connecting = false;
      this.connected = false;
      this.attachSocketHandlers(socket);
      this.write(DISCORD_IPC_OPCODE.HANDSHAKE, { v: 1, client_id: this.clientId });
    });
  }

  attachSocketHandlers(socket) {
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const { packets, remaining } = decodePackets(this.buffer);
      this.buffer = remaining;

      for (const packet of packets) {
        this.handlePacket(packet);
      }
    });

    socket.on('close', () => {
      this.connected = false;
      this.connecting = false;
      this.socket = null;
      this.buffer = Buffer.alloc(0);
    });

    socket.on('error', (error) => {
      this.log('Discord RPC socket error.', error);
    });
  }

  handlePacket(packet) {
    if (packet.opcode === DISCORD_IPC_OPCODE.PING) {
      this.write(DISCORD_IPC_OPCODE.PONG, packet.payload || {});
      return;
    }

    if (packet.payload?.cmd === 'DISPATCH' && packet.payload?.evt === 'READY') {
      this.connected = true;
      this.log('Discord RPC connected.');
      if (this.pendingActivity) this.sendActivity(this.pendingActivity);
      return;
    }

    if (packet.payload?.evt === 'ERROR') {
      this.log('Discord RPC returned an error.', new Error(JSON.stringify(packet.payload.data || packet.payload)));
    }
  }

  write(opcode, payload) {
    if (!this.socket || this.socket.destroyed) return;
    this.socket.write(encodePacket(opcode, payload));
  }

  setActivity(activity) {
    if (!this.isConfigured()) return;

    const normalized = this.normalizeActivity(activity);
    if (!normalized) {
      this.clearActivity();
      return;
    }

    const key = JSON.stringify(normalized);
    if (key === this.lastActivityKey) return;

    this.pendingActivity = normalized;
    this.lastActivityKey = key;

    if (!this.connected) {
      this.connect();
      return;
    }

    this.sendActivity(normalized);
  }

  normalizeActivity(activity) {
    const title = truncateText(activity?.title || activity?.details);
    if (!title) return null;

    const artist = truncateText(activity?.artist || activity?.state || 'Juice WRLD');
    const songUrl = String(activity?.url || '').startsWith('https://juicewrldvault.com/')
      ? String(activity.url)
      : 'https://juicewrldvault.com';
    const activityName = title;
    const details = title;
    const largeImage = imageAsset(activity?.coverImageUrl || activity?.largeImageUrl || activity?.largeImageKey, DEFAULT_LARGE_IMAGE_KEY);
    const now = Date.now();
    const durationMs = Number(activity?.durationMs) || 0;
    const positionMs = Math.max(0, Number(activity?.positionMs) || 0);
    const durationSeconds = durationMs > 0 ? Math.max(1, Math.round(durationMs / 1000)) : 0;
    const suppliedStartedAt = Number(activity?.startedAt);
    const startedAtMs = positionMs > 0
      ? now - positionMs
      : (Number.isFinite(suppliedStartedAt) && suppliedStartedAt > 0 ? suppliedStartedAt : now);
    const startedAtSeconds = toDiscordTimestampSeconds(startedAtMs);
    const timestamps = {};

    if (startedAtSeconds > 0 && durationSeconds > 0) {
      timestamps.start = startedAtSeconds;
      timestamps.end = startedAtSeconds + durationSeconds;
    } else {
      timestamps.start = startedAtSeconds || Math.round(now / 1000);
    }

    return {
      name: activityName,
      type: ACTIVITY_TYPE_LISTENING,
      details,
      state: artist,
      details_url: songUrl,
      timestamps,
      assets: {
        large_image: largeImage,
        large_url: songUrl
      },
      buttons: [
        {
          label: 'Listen on Juice WRLD Vault',
          url: songUrl
        }
      ],
      instance: false
    };
  }

  sendActivity(activity) {
    this.write(DISCORD_IPC_OPCODE.FRAME, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity
      },
      nonce: crypto.randomUUID()
    });
  }

  clearActivity() {
    this.pendingActivity = null;
    this.lastActivityKey = '';

    if (!this.connected) return;

    this.write(DISCORD_IPC_OPCODE.FRAME, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: null
      },
      nonce: crypto.randomUUID()
    });
  }

  destroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.clearActivity();
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
  }
}

module.exports = {
  DiscordPresence,
  isValidClientId
};
