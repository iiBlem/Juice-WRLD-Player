const fs = require('node:fs');
for (const file of fs.readdirSync('recon/vault-web').filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync('recon/vault-web/' + file, 'utf8');
  const payloads = [...html.matchAll(/self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)/g)].map(m => JSON.parse(m[1])[1]).join('');
  fs.writeFileSync('recon/vault-web/' + file.replace('.html', '.rsc.txt'), payloads);
  console.log(file, [...payloads.matchAll(/"category":"([^"]+)"/g)].map(m => m[1]).filter((v,i,a) => a.indexOf(v) === i));
  console.log([...payloads.matchAll(/"subcategory":"([^"]*)"/g)].map(m => m[1]).filter((v,i,a) => a.indexOf(v) === i));
}
