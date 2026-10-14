'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Transform, Readable } = require('node:stream');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
class OfflineStore {
  constructor(root, origin, fetcher = fetch) {
    this.root = root; this.origin = origin; this.fetcher = fetcher;
    this.jobs = new Map(); this.tasks = new Map(); this.tail = Promise.resolve(); this.writes=Promise.resolve(); this.enqueues=Promise.resolve();
  }
  file(id, ext) {
    if (!validId(id)) throw new Error('Invalid download ID.');
    return path.join(this.root, id + ext);
  }
  atomic(file, data) {
    const operation=this.writes.then(()=>this.writeAtomic(file,data));
    this.writes=operation.catch(()=>{}); return operation;
  }
  async writeAtomic(file, data) {
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
    await fs.rename(file + '.tmp', file);
  }
  async list() {
    await fs.mkdir(this.root, { recursive: true });
    const tracks = [], playlists = [];
    for (const name of await fs.readdir(this.root)) {
      if (!name.endsWith('.json')) continue;
      try {
        const record = JSON.parse(await fs.readFile(path.join(this.root, name), 'utf8'));
        if (name.endsWith('.playlist.json')) { playlists.push(record); continue; }
        const size = (await fs.stat(this.file(record.id, '.audio')).catch(() => ({ size: 0 }))).size;
        tracks.push({ ...record, status: size > 0 && size === record.bytes ? 'ready' : 'error',
          error: size === record.bytes ? '' : 'Download interrupted. Tap Retry.' });
      } catch { /* A malformed record cannot expose unrelated files. */ }
    }
    for (const job of this.jobs.values()) {
      const index = tracks.findIndex(t => t.id === job.id);
      if (index >= 0) tracks[index] = { ...tracks[index], ...job };
      else tracks.push({ ...job });
    }
    return { tracks: tracks.map(({ controller, ...t }) => t), playlists,
      bytes: tracks.reduce((n,t) => n + (t.status === 'ready' ? t.bytes || 0 : 0), 0) };
  }
  enqueue(input) {
    const result=this.enqueues.then(()=>this.enqueueNow(input));this.enqueues=result.catch(()=>{});return result;
  }
  async enqueueNow(input) {
    const records = Array.isArray(input.tracks) ? input.tracks : [];
    if (!records.length || records.length > 1000) throw new Error('Choose 1–1,000 songs.');
    const normalized = records.map(t => {
      if (!validId(t.id)) throw new Error('Invalid song ID.');
      return { id:t.id, title:String(t.title || 'Unknown track').slice(0,300),
        artist:String(t.artist || 'Juice WRLD').slice(0,300),
        lyrics:String(t.lyrics || '').slice(0,100000),
        artwork: /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t.artwork || '') && t.artwork.length <= 500000 ? t.artwork : '' };
    });
    if (input.playlist) {
      const p = input.playlist;
      await this.atomic(this.file(p.id, '.playlist.json'), {id:p.id, name:String(p.name || 'Playlist').slice(0,300), ids:normalized.map(t=>t.id)});
    }
    for (const track of normalized) {
      if (this.jobs.has(track.id) && ['queued','downloading'].includes(this.jobs.get(track.id).status)) continue;
      const existing = (await this.list()).tracks.find(t=>t.id === track.id && t.status === 'ready');
      if (existing) continue;
      const job = { ...track, status:'queued', received:0, bytes:0, controller:new AbortController() };
      await this.atomic(this.file(track.id,'.json'), track);
      this.jobs.set(track.id,job);
      this.tail = this.tail.then(()=>this.download(job)).catch(()=>{});
      this.tasks.set(track.id,this.tail);
    }
    return { queued:true };
  }
  async download(job) {
    if (job.controller.signal.aborted) return;
    job.status='downloading';
    let timer;
    try {
      timer=setTimeout(()=>job.controller.abort(), 300000);
      const response=await this.fetcher(this.origin+'/api/download-song?id='+encodeURIComponent(job.id)+'&delivery=native',
        {signal:job.controller.signal, redirect:'error'});
      const type=response.headers.get('content-type') || '';
      if (!response.ok || !response.body || !/^(audio\/|application\/octet-stream)/i.test(type)) throw new Error('Audio download failed.');
      const expected=Number(response.headers.get('content-length') || 0);
      if (expected > 512*1024*1024) throw new Error('This track exceeds the 512 MB download limit.');
      const { createWriteStream }=require('node:fs');
      const meter=new Transform({transform(chunk, enc, next) {
        job.received += chunk.length;
        next(job.received > 512*1024*1024 ? new Error('Track is too large.') : null,chunk);
      }});
      job.total=expected;
      await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(this.file(job.id,'.part'),{mode:0o600}),{signal:job.controller.signal});
      if (!job.received || (expected && expected!==job.received)) throw new Error('Download interrupted. Retry to finish.');
      await fs.rename(this.file(job.id,'.part'),this.file(job.id,'.audio'));
      const {controller,...record}=job;
      await this.atomic(this.file(job.id,'.json'),{...record,bytes:job.received,status:'ready',mime:type});
      job.bytes=job.received; job.status='ready'; job.mime=type;
    } catch (error) {
      job.status='error';job.error=job.controller.signal.aborted ? 'Download stopped. Tap Retry.' : String(error.message || 'Download failed.');
      await fs.rm(this.file(job.id,'.part'),{force:true}).catch(()=>{});
    } finally {clearTimeout(timer);}
  }
  async remove(id) {
    this.file(id,'.json');
    const job=this.jobs.get(id); if(job) job.controller.abort();
    if(job?.status==='downloading') await this.tasks.get(id);
    this.jobs.delete(id);
    for(const ext of ['.json','.audio','.part']) await fs.rm(this.file(id,ext),{force:true});
    return {removed:true};
  }
  async artwork(id, artwork) {
    if(typeof artwork!=='string' || artwork.length>500000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(artwork)) throw new Error('Invalid artwork.');
    const job=this.jobs.get(id);if(job)job.artwork=artwork;
    const operation=this.writes.then(async()=>{
      const record=JSON.parse(await fs.readFile(this.file(id,'.json'),'utf8'));record.artwork=artwork;
      await this.writeAtomic(this.file(id,'.json'),record);
    });this.writes=operation.catch(()=>{});await operation;return {};
  }
  async removePlaylist(id) { await fs.rm(this.file(id,'.playlist.json'),{force:true}); return {removed:true}; }
  async media(id) {
    const record=JSON.parse(await fs.readFile(this.file(id,'.json'),'utf8'));
    const stat=await fs.stat(this.file(id,'.audio'));
    if(!record.bytes || stat.size!==record.bytes) throw new Error('This download is incomplete.');
    return {path:this.file(id,'.audio'),mime:record.mime || 'audio/mpeg'};
  }
}
module.exports={OfflineStore,validId};
