const fs = require('node:fs');
const files = fs.readdirSync('recon/vault-web').filter(f => f.endsWith('.js') && (!process.argv[3] || f.startsWith(process.argv[3])));
for (const file of files) {
  const text = fs.readFileSync('recon/vault-web/' + file, 'utf8');
  const pattern = process.argv[2];
  if (pattern) {
    const re = new RegExp(pattern, 'g');
    for (const match of text.matchAll(re)) console.log(file + ':' + match.index + '\n' + text.slice(Math.max(0, match.index - 250), match.index + 700) + '\n');
  } else {
    const urls = [...new Set([...text.matchAll(/https?:\/\/[^\s"'`<>\\]+|\/api\/[A-Za-z0-9_/?=&.${}:-]+/g)].map(m => m[0]))];
    if (urls.length) console.log(file + '\n' + urls.join('\n'));
  }
}
