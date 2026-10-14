const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const results = [];
  for (const route of ['/unreleased', '/stem', '/studio-sessions', '/released', '/remasters', '/miscellaneous']) {
    const response = await fetch('https://juicewrldvault.com' + route);
    const html = await response.text();
    fs.writeFileSync('recon/vault-web/' + route.slice(1) + '.html', html);
    for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) {
      if (!match[1].startsWith('/_next/')) continue;
      const file = path.join('recon/vault-web', path.basename(match[1]));
      if (fs.existsSync(file)) continue;
      const asset = await fetch('https://juicewrldvault.com' + match[1]);
      if (!asset.ok) throw new Error('Asset fetch failed: ' + match[1]);
      fs.writeFileSync(file, await asset.text());
    }
    results.push({ route, status: response.status, htmlBytes: html.length });
  }
  const html = fs.readFileSync('recon/vault-web/index.html', 'utf8').replace(/\\"/g, '"');
  const songPath = html.match(/"song_path":"([^"]+)"/)[1];
  const audioUrl = 'https://media.juicewrldvault.com/songs/' + songPath;
  const response = await fetch(audioUrl, { headers: { Range: 'bytes=0-1023', Origin: 'http://localhost:5173' } });
  results.push({ audioUrl, status: response.status, headers: Object.fromEntries(response.headers), bytes: (await response.arrayBuffer()).byteLength });
  fs.writeFileSync('recon/public-probes.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
