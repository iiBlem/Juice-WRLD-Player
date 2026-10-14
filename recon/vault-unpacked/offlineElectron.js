const {protocol,ipcMain,net}=require('electron');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs/promises');
const path=require('node:path');
const {OfflineStore}=require('./offlineStore');
const OFFLINE='jwv-offline://library/';
protocol.registerSchemesAsPrivileged([{scheme:'jwv-offline',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
function installOffline(app,getWindow,origin){
 const store=new OfflineStore(path.join(app.getPath('userData'),'offline-v1'),origin,(url,options)=>net.fetch(url,options));
 protocol.handle('jwv-offline',async request=>{
  const u=new URL(request.url);
  if(u.host!=='library')return new Response('Not found',{status:404});
  try{
   if(u.pathname.startsWith('/media/')){
    const item=await store.media(decodeURIComponent(u.pathname.slice(7)));
    const size=(await fs.stat(item.path)).size;
    let start=0,end=size-1,status=200;
    const range=request.headers.get('range');
    if(range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!match || (!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
      if(!match[1])start=Math.max(0,size-Number(match[2]));
      else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
      status=206;
    }
    const headers={'Content-Type':item.mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'};
    if(status===206)headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
    const body=request.method==='HEAD'?null:require('node:stream').Readable.toWeb(require('node:fs').createReadStream(item.path,{start,end}));
    return new Response(body,{status,headers});
   }
   const files={'/':'offline.html','/offline-ui.js':'offline-ui.js','/offline.css':'offline.css'};
   const file=files[u.pathname];if(!file)return new Response('Not found',{status:404});
   return new Response(await fs.readFile(path.join(__dirname,file)),{headers:{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}});
  }catch{return new Response('Download unavailable',{status:404});}
 });
 ipcMain.handle('offline:invoke',async(event,action,args={})=>{
  const frame=event.senderFrame;
  const url=frame?.url || '';
  if(frame!==event.sender.mainFrame || !(url.startsWith(OFFLINE) || new URL(url).origin===origin))throw new Error('Offline library requires a trusted app window.');
  switch(action){
   case 'list':return store.list();
   case 'download':return store.enqueue(args);
   case 'remove':return store.remove(args.id);
   case 'artwork':return store.artwork(args.id,args.artwork);
   case 'removePlaylist':return store.removePlaylist(args.id);
   case 'media':await store.media(args.id);return {url:OFFLINE+'media/'+encodeURIComponent(args.id)};
   case 'open': await getWindow()?.loadURL(OFFLINE);return {};
   case 'online':await getWindow()?.loadURL(origin);return {};
   default:throw new Error('Unknown offline operation.');
  }
 });
 return {open:win=>win.loadURL(OFFLINE),store};
}
module.exports={installOffline,OFFLINE};
