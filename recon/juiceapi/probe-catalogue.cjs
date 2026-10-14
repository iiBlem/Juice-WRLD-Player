const {capture} = require('./probe-surface.cjs');
const fs = require('node:fs');
(async () => {
  for (const category of ['recording_session','released','unsurfaced']) {
    const record = await capture('category-' + category, 'https://juicewrldapi.com/juicewrld/songs/?' + new URLSearchParams({category,page:'1',page_size:'1'}));
    const song = record.body?.results?.[0];
    console.log('CATEGORY',category,{count:record.body?.count,fields:song?Object.keys(song):[],id:song?.id,public_id:song?.public_id,name:song?.name,path:song?.path,length:song?.length});
  }
  const first = require('./songs-first.json').body.results[0];
  for (const [name,route] of [
    ['detail-internal-id','/juicewrld/songs/'+first.id+'/'],
    ['detail-public-id','/juicewrld/songs/'+first.public_id+'/'],
    ['search','/juicewrld/songs/?search=2MININHELL&page=1&page_size=2'],
    ['era-name','/juicewrld/songs/?category=unreleased&era=jute&page=1&page_size=1'],
    ['era-id','/juicewrld/songs/?category=unreleased&era=101&page=1&page_size=1'],
    ['songs-page2','/juicewrld/songs/?category=unreleased&page=2&page_size=2'],
    ['songs-offset','/juicewrld/songs/?category=unreleased&offset=1&limit=1'],
    ['file-info','/juicewrld/files/info/?'+new URLSearchParams({path:first.path})],
    ['docs','/docs'],['app-config','/app-config.js'],['site-index-js','/assets/index.a2647ba9.js'],
  ]) {
    const record = await capture(name,'https://juicewrldapi.com'+route);
    if (name==='site-index-js' && record.status===200) fs.writeFileSync(__dirname+'/site-index.js',record.body);
    if (record.body?.results) console.log(name,'count',record.body.count,'returned',record.body.results.length,'IDs',record.body.results.slice(0,3).map(s=>s.id));
  }
})();
