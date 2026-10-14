const AUTH_PROTOCOL = 'vaultshell';
const AUTH_CALLBACK = `${AUTH_PROTOCOL}://auth/callback`;
const SUPABASE_AUTH_ORIGIN = 'https://qfsysguoaxbwhjeqkwat.supabase.co';
const OAUTH_PROVIDER_REDIRECTS = {
  google: { origin: 'https://accounts.google.com', path: '/o/oauth2/v2/auth' },
  discord: { origin: 'https://discord.com', path: '/api/oauth2/authorize' },
};

const parseUrl = (value) => {
  try {
    return new URL(String(value || ''));
  } catch {
    return null;
  }
};

const normalizeAuthCallback = (value) => {
  const url = parseUrl(value);
  if (!url || url.protocol !== `${AUTH_PROTOCOL}:` || url.host !== 'auth' || url.pathname !== '/callback') return null;
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) return null;
  return url.toString();
};

const findAuthCallback = (commandLine = []) => {
  for (const argument of commandLine) {
    const callback = normalizeAuthCallback(argument);
    if (callback) return callback;
  }
  return null;
};

const isAllowedOAuthStartUrl = (value) => {
  const url = parseUrl(value);
  return Boolean(
    url
    && url.origin === SUPABASE_AUTH_ORIGIN
    && url.pathname === '/auth/v1/authorize'
    && ['google', 'discord'].includes(url.searchParams.get('provider') || '')
  );
};

const normalizeOAuthProviderRedirect = (value, provider) => {
  const url = parseUrl(value);
  const allowed = OAUTH_PROVIDER_REDIRECTS[provider];
  if (!url || !allowed || url.origin !== allowed.origin || url.pathname !== allowed.path) return null;
  return url.toString();
};

module.exports = {
  AUTH_CALLBACK,
  AUTH_PROTOCOL,
  findAuthCallback,
  isAllowedOAuthStartUrl,
  normalizeAuthCallback,
  normalizeOAuthProviderRedirect,
};
