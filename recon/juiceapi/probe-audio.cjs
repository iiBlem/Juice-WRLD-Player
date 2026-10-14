const fs = require('node:fs');
(async () => {
  const track = require('./detail-internal-id.json').body;
  if (!track.path) throw new Error('Selected track has no audio path');
  const url = new URL('https://juicewrldapi.com/juicewrld/files/download/');
  url.searchParams.set('path', track.path);
  const headers = {Range:'bytes=0-63', Origin:'http://localhost:5173'};
  const response = await fetch(url, {headers, signal:AbortSignal.timeout(25000)});
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (received < 64) {
    const {done,value} = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value)); received += value.byteLength;
  }
  await reader.cancel();
  const bytes = Buffer.concat(chunks).subarray(0,64);
  const record = {
    capturedAt:new Date().toISOString(), track:{id:track.id,public_id:track.public_id,name:track.name,path:track.path},
    request:{method:'GET',url:url.toString(),headers},status:response.status,statusText:response.statusText,
    finalUrl:response.url,redirected:response.redirected,headers:Object.fromEntries(response.headers),
    firstBytesHex:bytes.toString('hex'),firstBytesBase64:bytes.toString('base64'),
    firstBytesAscii:bytes.toString('latin1').replace(/[^\x20-\x7e]/g,'.'),capturedBytes:bytes.length,
    deliveredBytesBeforeCancel:received,
  };
  fs.writeFileSync(__dirname+'/audio-range.json',JSON.stringify(record,null,2));
  console.log(JSON.stringify(record,null,2));
})();
