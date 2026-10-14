// Recon examples only: prints catalogue metadata or a URL; never plays/downloads audio.
const {capture} = require('./probe-surface.cjs');
const base = 'https://juicewrldapi.com/juicewrld/';
(async () => {
  const mode = process.argv[2];
  if (!['category', 'search', 'audio'].includes(mode)) throw new Error('Usage: node examples.cjs category|search|audio');
  const route = mode === 'category' ? 'songs/?category=unreleased&page=1&page_size=2'
    : mode === 'search' ? 'songs/?search=2MININHELL&page=1&page_size=2' : 'songs/94316/';
  const record = await capture('example-' + mode, new URL(route, base).href);
  if (record.status !== 200) throw new Error('Request failed: ' + (record.status || record.error));
  if (mode === 'audio') {
    if (typeof record.body.path !== 'string' || !record.body.path.trim()) throw new Error('No playable audio path');
    const url = new URL('files/download/', base);
    url.searchParams.set('path', record.body.path);
    console.log(url.href);
  } else {
    console.log(JSON.stringify({count: record.body.count, next: record.body.next,
      results: record.body.results.map(({id, name, category, path}) => ({id, name, category, path}))}, null, 2));
  }
})().catch(error => {console.error(error.message); process.exitCode = 1;});
