const fs = require('node:fs');
const text = fs.readFileSync(__dirname+'/site-index.js','utf8');
const pattern = process.argv[2] || '/juicewrld/|files/download|files/browse|recording_session|song.path|songPath';
for (const match of text.matchAll(new RegExp(pattern,'g'))) {
  console.log(match.index,text.slice(Math.max(0,match.index-160),match.index+450));
}
