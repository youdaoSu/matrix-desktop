// Public emoji metadata only. Never uses Electron sessions, account tokens,
// cookies, website SDKs, unread endpoints or arbitrary caller-supplied URLs.
const catalogUrl='https://www.douyin.com/aweme/v1/web/emoji/list?device_platform=webapp&aid=6383&channel=channel_pc_web&publish_video_strategy_type=2&need_all=true';
function normalizePublicEmoji(value){
  if(value?.status_code!==0||!Array.isArray(value.emoji_list)||value.emoji_list.length>2000)throw Error('表情目录结构未识别');
  const entries=[],seen=new Set();
  for(const item of value.emoji_list){
    const name=item?.display_name,url=item?.emoji_url?.url_list?.[0];
    if(typeof name!=='string'||!/^\[[^\[\]\r\n<>\u0000-\u001f]{1,24}\]$/.test(name)||typeof url!=='string'||url.length>4096||seen.has(name))continue;
    try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!/(?:^|\.)(?:douyinpic\.com|douyinstatic\.com|byteimg\.com|bytetos\.com|pstatp\.com)$/.test(parsed.hostname))continue;entries.push({name,img:parsed.href});seen.add(name);}catch{}
  }
  if(!entries.length)throw Error('表情目录暂无可用资源');return entries;
}
function registerPublicEmoji({ipcMain,getWindow,fetchImpl=globalThis.fetch,now=Date.now}){
  let saved,pending,expires=0;
  const read=async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetchImpl(catalogUrl,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok||!response.body||Number(response.headers.get('content-length')||0)>2*1024*1024)throw Error();
      const reader=response.body.getReader(),parts=[];let bytes=0;
      try{while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>2*1024*1024){await reader.cancel();throw Error();}parts.push(Buffer.from(item.value));}}finally{reader.releaseLock();}
      saved={entries:normalizePublicEmoji(JSON.parse(Buffer.concat(parts,bytes).toString('utf8')))};expires=now()+86400000;return saved;
    }catch{expires=now()+60000;return saved||{error:'公开表情目录暂不可用，保留原文及已有目录'};}
    finally{clearTimeout(timer);}
  };
  ipcMain.handle('matrix:douyin-public-emoji',async event=>{
    const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents)return{error:'只允许远效主窗口读取公开表情目录'};
    if(now()<expires)return saved||{error:'公开表情目录暂不可用，保留原文及已有目录'};
    pending ||= read().finally(()=>{pending=undefined;});return pending;
  });
}
module.exports={registerPublicEmoji,normalizePublicEmoji,catalogUrl};
