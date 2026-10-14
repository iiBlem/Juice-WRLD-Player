const fs = require('node:fs');
const {capture} = require('./probe-surface.cjs');
(async () => {
  for (const file of ['ApiDocsPage.3a0a78fb.js', 'PlayerPage.492daf5a.js', 'FileBrowserPage.21ba79fd.js']) {
    const record = await capture('frontend-' + file, 'https://juicewrldapi.com/assets/' + file);
    if (record.status === 200) fs.writeFileSync(require('node:path').join(__dirname, file), record.body);
  }
  await capture('eras-page2', 'https://juicewrldapi.com/juicewrld/eras/?page=2');
  await capture('browse-search', 'https://juicewrldapi.com/juicewrld/files/browse/?path=Compilation&search=2MININHELL');
})();
