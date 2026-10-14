const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const html = fs.readFileSync('recon/vault-web/index.html', 'utf8');
  const urls = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]).filter(u => u.startsWith('/_next/'));
  const manifest = [];
  for (const url of urls) {
    const response = await fetch(new URL(url, 'https://juicewrldvault.com'));
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    const file = path.basename(url);
    fs.writeFileSync(path.join('recon/vault-web', file), await response.text());
    manifest.push({ url, file });
  }
  if (!manifest.length) throw new Error('No public script assets found');
  fs.writeFileSync('recon/vault-web/manifest.json', JSON.stringify(manifest, null, 2));
  console.log(`Saved ${manifest.length} public scripts`);
})();
