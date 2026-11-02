const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes } = require('node:crypto');

const mimeTypes = { '.mp4':'video/mp4', '.mov':'video/quicktime', '.webm':'video/webm', '.mkv':'video/x-matroska', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
function byteRange(header, size) {
  if (!header) return { start:0, end:size-1, partial:false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || !match[1] && !match[2]) throw Error('Invalid range');
  const start = match[1] ? Number(match[1]) : Math.max(0,size-Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size-1,Number(match[2])) : size-1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || start>=size || end<start) throw Error('Invalid range');
  return { start, end, partial:true };
}
function createPublishPreview({ mediaStore, authenticate, getAppUrl, now = Date.now }) {
  const previews = new Map();
  let server, starting;
  const revoke = (id, sender) => {
    const item = previews.get(id);
    if (item && (sender === undefined || item.sender === sender)) { previews.delete(id); for (const stream of item.streams) stream.destroy(); }
  };
  const validate = saved => {
    if (!saved || !['image','video'].includes(saved.mediaType) || !Array.isArray(saved.paths) || !saved.paths.length || saved.paths.length > (saved.mediaType==='video'?1:9) || saved.paths.length!==saved.files?.length) throw Error('素材记录无效');
    return saved.paths.map((file,index) => {
      if (typeof file!=='string' || !path.isAbsolute(file)) throw Error('素材格式不支持');
      const metadata = saved.files[index], extension = path.extname(file).toLowerCase();
      if (!mimeTypes[extension] || (saved.mediaType==='image')!==mimeTypes[extension].startsWith('image/')) throw Error('素材格式不支持');
      try { const stat=fs.statSync(file); if(!stat.isFile() || !stat.size || stat.size!==metadata.size || stat.mtimeMs!==metadata.modified) throw Error('changed'); }
      catch { throw Error('原素材已移动或修改，预览不可用'); }
      return { path:file, name:path.basename(file), size:metadata.size, modified:metadata.modified, mime:mimeTypes[extension] };
    });
  };
  const start = async () => {
    if (starting) return starting;
    server = http.createServer(async (request,response) => {
      let fd;
      try {
        const origin = new URL(getAppUrl()).origin;
        let referrer; try { referrer=new URL(request.headers.referer).origin; } catch { /* Anonymous non-browser requests are denied. */ }
        if (request.headers.host!==`127.0.0.1:${server.address().port}` || request.headers.origin && request.headers.origin!==origin || referrer && referrer!==origin || !request.headers.origin && !referrer) { response.writeHead(403);response.end();return; }
        if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405);response.end();return; }
        const match = /^\/preview\/([A-Za-z0-9_-]{43})\/(\d{1,2})$/.exec(request.url || '');
        const preview = match && previews.get(match[1]), source=preview?.sources[Number(match?.[2])];
        if (!source || preview.expires<=now()) { if(preview)revoke(match[1]);response.writeHead(404);response.end();return; }
        if ((await authenticate(preview.accessToken)).userId!==preview.owner || !previews.has(match[1])) throw Error('unauthorized');
        fd=fs.openSync(source.path,'r');
        const stat=fs.fstatSync(fd);
        if(!stat.isFile() || stat.size!==source.size || stat.mtimeMs!==source.modified) throw Error('changed');
        let range;
        try { range=byteRange(request.headers.range,stat.size); }
        catch { fs.closeSync(fd);fd=undefined;response.writeHead(416,{'Content-Range':`bytes */${stat.size}`});response.end();return; }
        const headers={ 'Content-Type':source.mime, 'Content-Length':range.end-range.start+1, 'Accept-Ranges':'bytes', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Access-Control-Allow-Origin':origin, 'Vary':'Origin', 'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(source.name)}` };
        if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${stat.size}`;
        response.writeHead(range.partial?206:200,headers);
        if(request.method==='HEAD'){fs.closeSync(fd);fd=undefined;response.end();return;}
        const stream=fs.createReadStream(source.path,{fd,start:range.start,end:range.end,autoClose:true});fd=undefined;
        preview.streams.add(stream);stream.once('close',()=>preview.streams.delete(stream));stream.once('error',()=>response.destroy());response.once('close',()=>stream.destroy());stream.pipe(response);
      } catch { if(fd!==undefined)fs.closeSync(fd);if(!response.headersSent)response.writeHead(410);response.end(); }
    });
    starting = new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
    return starting;
  };
  return {
    async open(input,sender) {
      const auth=await authenticate(input.accessToken), stored=mediaStore.read(auth.userId,input.recoveryId);
      const media=validate(stored.media), covers=stored.covers.flatMap(cover=>validate(cover.selection).map(source=>({...source,index:cover.index})));
      if(covers.length>2)throw Error('封面记录无效');
      const port=await start();
      if((await authenticate(input.accessToken)).userId!==auth.userId)throw Error('登录用户已变化');
      // Dispose by preview ID: a late response from an old drawer must not revoke
      // a newer drawer's preview. Bounded capabilities never modify tasks/files.
      for(const [id,item] of previews)if(item.expires<=now())revoke(id);
      if([...previews.values()].filter(item=>item.sender===sender).length>=16)throw Error('预览数量过多，请关闭旧的预览后再试');
      const previewId=randomBytes(32).toString('base64url');
      previews.set(previewId,{owner:auth.userId,sender,accessToken:input.accessToken,expires:now()+15*60000,sources:[...media,...covers],streams:new Set()});
      const describe=(source,index)=>({name:source.name,size:source.size,url:`http://127.0.0.1:${port}/preview/${previewId}/${index}`});
      return {previewId,mediaType:stored.media.mediaType,files:media.map(describe),covers:covers.map((source,index)=>({...describe(source,media.length+index),index:source.index}))};
    },
    revoke,
    close(){for(const id of previews.keys())revoke(id);server?.closeAllConnections();server?.close();},
  };
}
function registerPublishPreview({ipcMain,getWindow,...options}) {
  const preview=createPublishPreview(options);
  ipcMain.handle('matrix:preview-publish-media',async(event,input)=>{
    try {if(event.sender.id!==getWindow()?.webContents.id)throw Error('仅允许远效主窗口查看素材');return await preview.open(input,event.sender.id);}
    catch(error){return{error:error.message};}
  });
  ipcMain.handle('matrix:close-publish-preview',async(event,input)=>{
    if(event.sender.id!==getWindow()?.webContents.id)return{error:'仅允许远效主窗口关闭预览'};
    preview.revoke(input?.previewId,event.sender.id);return{closed:true};
  });
  return preview;
}
module.exports={byteRange,createPublishPreview,registerPublishPreview};
