/* Shared, bundled offline UI. Never fetches the site or loads remote scripts. */
'use strict';
const $ = id => document.getElementById(id);
const api = (action, args={}) => window.jwvOffline.invoke(action,args);
let snapshot={tracks:[],playlists:[],bytes:0}, queue=[], index=-1, filter='', busy=false;
const audio=$('audio');
const nativePlayback=Boolean(window.jwvOffline.nativePlayback);
const message=error=>$('message').textContent=String(error?.message || error || '');
const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){message(e);}};
const seconds=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
const visible=()=>snapshot.tracks.filter(t=>(!filter || snapshot.playlists.find(p=>p.id===filter)?.ids.includes(t.id)) && (t.title+' '+t.artist).toLowerCase().includes($('search').value.toLowerCase()));
function render() {
  $('summary').textContent=snapshot.tracks.filter(t=>t.status==='ready').length+' songs downloaded · '+(snapshot.bytes/1048576).toFixed(1)+' MB';
  $('playlists').replaceChildren();
  const all=document.createElement('button');all.textContent='All songs';all.onclick=()=>{filter='';render();};$('playlists').append(all);
  for(const p of snapshot.playlists){const b=document.createElement('button');b.textContent=p.name;b.setAttribute('aria-pressed',String(filter===p.id));b.onclick=()=>{filter=p.id;render();};$('playlists').append(b);}
  $('tracks').replaceChildren();
  const tracks=visible();
  if(!tracks.length){const p=document.createElement('p');p.textContent='No downloaded songs here. Connect to Vault and choose Download for offline on a song or playlist.';$('tracks').append(p);}
  for(const t of tracks){
    const row=document.createElement('div');row.className='track';
    if(t.artwork?.startsWith('data:image/')){const img=document.createElement('img');img.src=t.artwork;img.alt='';row.append(img);}
    const name=document.createElement('div');name.className='name';const b=document.createElement('button'),strong=document.createElement('strong');strong.textContent=t.title;b.append(strong);b.disabled=t.status!=='ready';b.onclick=safe(()=>start(tracks.filter(t=>t.status==='ready'),t.id));name.append(b);
    const small=document.createElement('small');small.textContent=t.artist+' · '+(t.status==='ready'?'Downloaded':t.status==='error'?(t.error || 'Interrupted. Retry download.') : t.status==='downloading'?'Downloading '+(t.total?Math.floor(t.received/t.total*100)+'%':(t.received/1048576).toFixed(1)+' MB'):'Queued');name.append(small);row.append(name);
    if(t.status==='error'){const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=safe(async()=>{await api('download',{tracks:[t]});await refresh();});row.append(retry);}
    const remove=document.createElement('button');remove.textContent=['queued','downloading'].includes(t.status)?'Cancel':'Remove';remove.setAttribute('aria-label',remove.textContent+' '+t.title);remove.onclick=safe(async()=>{if(queue[index]?.id===t.id)await pause();await api('remove',{id:t.id});await refresh();});row.append(remove);$('tracks').append(row);
  }
}
async function refresh(){if(busy)return;busy=true;try{snapshot=await api('list');render();}finally{busy=false;}}
async function start(tracks,id){queue=tracks;index=Math.max(0,queue.findIndex(t=>t.id===id));await playIndex();}
async function playIndex(){
  const track=queue[index];if(!track)return;
  $('title').textContent=track.title+' — '+track.artist;$('lyrics').textContent=track.lyrics || 'No saved lyrics for this song.';
  if(nativePlayback){await api('play',{ids:queue.map(t=>t.id),index});}
  else{audio.src=(await api('media',{id:track.id})).url;await audio.play();
    if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist,artwork:track.artwork?[{src:track.artwork}]:[]});}
  }
  $('toggle').textContent='Pause';
}
async function pause(){if(nativePlayback)await api('pause');else audio.pause();$('toggle').textContent='Play';}
async function toggle(){if(nativePlayback){const s=await api('state');await api(s.playing?'pause':'resume');}else if(audio.paused){await audio.play();}else await pause();}
async function move(delta){if(index+delta>=0&&index+delta<queue.length){index+=delta;await playIndex();}}
$('play-all').onclick=safe(()=>start(visible().filter(t=>t.status==='ready')));
$('toggle').onclick=safe(toggle);$('previous').onclick=safe(()=>move(-1));$('next').onclick=safe(()=>move(1));
$('online').onclick=safe(async()=>{await pause();await api('online');});
$('search').oninput=render;
$('lyrics-toggle').onclick=()=>$('lyrics').hidden=!$('lyrics').hidden;
$('remove-all').onclick=safe(async()=>{
  const tracks=visible();if(!tracks.length)return;
  if(!confirm('Remove '+tracks.length+' downloads from this device? This does not delete songs or your online playlists.'))return;
  await pause();for(const t of tracks)await api('remove',{id:t.id});
  if(filter){await api('removePlaylist',{id:filter});filter='';}await refresh();
});
$('seek').onchange=safe(async()=>{const position=Number($('seek').value);if(nativePlayback)await api('seek',{seconds:position});else audio.currentTime=position;});
audio.onended=safe(()=>move(1));audio.onerror=()=>message('This downloaded file could not play. Remove it and download again.');
audio.onplay=()=>$('toggle').textContent='Pause';audio.onpause=()=>$('toggle').textContent='Play';
function position(s){$('seek').max=String(Number.isFinite(s.duration)?s.duration:0);$('seek').value=String(s.position||0);$('time').textContent=seconds(s.position)+' / '+seconds(s.duration);$('toggle').textContent=s.playing?'Pause':'Play';if(s.id){const t=snapshot.tracks.find(t=>t.id===s.id);if(t){index=queue.findIndex(t=>t.id===s.id);$('title').textContent=t.title+' — '+t.artist;$('lyrics').textContent=t.lyrics || 'No saved lyrics for this song.';}}}
audio.ontimeupdate=()=>position({duration:audio.duration,position:audio.currentTime,playing:!audio.paused});
if('mediaSession' in navigator&&!nativePlayback){for(const [key,fn] of Object.entries({play:()=>audio.play(),pause:()=>audio.pause(),nexttrack:()=>move(1),previoustrack:()=>move(-1),seekto:e=>{audio.currentTime=e.seekTime;}})){try{navigator.mediaSession.setActionHandler(key,safe(fn));}catch{}}}
setInterval(()=>{refresh().catch(message);if(nativePlayback)api('state').then(position).catch(message);},1500);
refresh().catch(message);
