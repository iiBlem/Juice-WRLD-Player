const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
async function capture(name, url) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(25000)});
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    const record = {capturedAt: new Date().toISOString(), request: {method: 'GET', url}, status: response.status, finalUrl: response.url, headers: Object.fromEntries(response.headers), body};
    fs.writeFileSync(path.join(root, name + '.json'), JSON.stringify(record, null, 2));
    console.log(name, response.status, typeof body === 'string' ? body.slice(0,140) : JSON.stringify(body).slice(0,450));
    return record;
  } catch (error) {
    const record = {capturedAt: new Date().toISOString(), request: {method:'GET',url}, error: String(error)};
    fs.writeFileSync(path.join(root, name + '.json'), JSON.stringify(record,null,2));
    console.log(name, record.error);
    return record;
  }
}
module.exports = {capture};
if (require.main === module) (async () => {
  await capture('site', 'https://juicewrldapi.com/');
  const tree = await capture('wrapper-tree', 'https://api.github.com/repos/HackinHood/juicewrld-api-wrapper/git/trees/main?recursive=1');
  if (tree.status === 200) {
    console.log('WRAPPER COMMIT',tree.body.sha);
    for (const item of tree.body.tree.filter(i => i.path.endsWith('.py') || ['API_ENDPOINTS.md','README.md'].includes(i.path))) {
      const record = await capture('wrapper-' + item.path.replace(/\//g,'-'), 'https://raw.githubusercontent.com/HackinHood/juicewrld-api-wrapper/' + tree.body.sha + '/' + item.path);
      if (record.status === 200) fs.writeFileSync(path.join(root,'wrapper-' + item.path.replace(/\//g,'-')), record.body);
    }
  }
  for (const [name,route] of [['overview','/juicewrld/'],['categories','/juicewrld/categories/'],['eras','/juicewrld/eras/'],['songs-first','/juicewrld/songs/?category=unreleased&page=1&page_size=2'],['player-first','/juicewrld/player/songs/?page=1&page_size=2']]) {
    await capture(name, 'https://juicewrldapi.com' + route);
  }
})();
