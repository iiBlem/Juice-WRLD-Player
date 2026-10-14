const fs = require('node:fs');
(async () => {
  const result = [];
  for (const category of ['unreleased','stem','studio-sessions','released','remasters','miscellaneous']) {
    const url = 'https://juicewrldvault.com/api/category-songs?' + new URLSearchParams({category,subcategory:'',offset:'0',limit:'1'});
    const response = await fetch(url);
    const body = await response.json();
    result.push({url,status:response.status,keys:Object.keys(body),songCount:body.songs?.length,hasMore:body.hasMore,sample:body.songs?.[0]});
  }
  const response = await fetch('https://qfsysguoaxbwhjeqkwat.supabase.co/rest/v1/songs?select=id,title,song_path,source_category&limit=1', {headers:{apikey:'sb_publishable_OiYQrcK3sy5BOC3Bw87g7Q_xlGhXibg'}});
  result.push({supabaseStatus:response.status,rows:await response.json()});
  fs.writeFileSync('recon/api-probes.json',JSON.stringify(result,null,2));
  console.log(result.map(({sample,...r})=>({...r,sample:sample?{id:sample.id,category:sample.source_category,path:sample.song_path}:undefined})));
})();
