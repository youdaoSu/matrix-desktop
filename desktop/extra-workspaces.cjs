const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {writeLocalJson}=require('./local-json-store.cjs');
const catalog=require('./account-platforms.json');
function publicUrl(value){
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.search||url.hash)throw Error();
    const host=url.hostname.toLowerCase();if(!host.includes('.')||/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)||/[\[\]:]/.test(host)||/\.(?:local|internal)$/.test(host))throw Error();
    return url;
  }catch{throw Error('请填写不含账号凭据或参数的公开 HTTPS 平台地址');}
}
function registerExtraWorkspaces({ipcMain,getWindow,authenticate,userData,prepareSession}){
  const file=path.join(userData,'additional-platform-workspaces.json');
  const read=()=>{if(!fs.existsSync(file))return [];try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(data))throw Error();return data;}catch{throw Error('更多平台工作区记录无法读取，未覆盖原数据，请恢复备份或联系维护');}};
  const save=items=>{try{writeLocalJson(file,items);}catch{throw Error('工作区记录保存失败，未认定账号绑定成功；已有恢复副本时会保留，请检查本机数据目录后重试');}};
  ipcMain.handle('matrix:extra-workspaces',async(event,input)=>{try{
    const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents)throw Error('只允许远效主窗口管理平台工作区');
    const auth=await authenticate(input?.accessToken),items=read(),owned=items.filter(item=>item.ownerId===auth.userId);
    const dto=({ownerId,...item})=>item;
    if(input.command==='list')return {items:owned.map(dto)};
    if(input.command==='add'){
      const provider=catalog.find(item=>item.id===input.provider);if(!provider||provider.core||provider.pending)throw Error('该平台尚待专门适配，请查看目录中的真实接入状态');
      const name=String(input.name||'').trim().slice(0,80),remark=String(input.remark||'').trim().slice(0,160);if(!name)throw Error('请填写便于区分的工作区名称');
      if(owned.length>=100)throw Error('更多平台工作区最多保存 100 个');
      const url=publicUrl(provider.custom?input.url:provider.url);const now=new Date().toISOString();
      const item={id:randomUUID(),ownerId:auth.userId,provider:provider.id,label:provider.label,name,remark,sessionId:randomUUID(),url:url.href,domain:provider.domain||url.hostname,createdAt:now,updatedAt:now,loginStatus:'not_verified'};
      save([...items,item]);return {item:dto(item)};
    }
    const item=owned.find(item=>item.id===input.id);if(!item)throw Error('工作区不存在或不属于当前用户');
    if(input.command==='open'){publicUrl(item.url);return {item:dto(item),session:prepareSession(item)};}
    throw Error('不支持的工作区操作');
  }catch(error){return {error:error instanceof Error?error.message:'工作区操作失败'};}});
}
module.exports={catalog,publicUrl,registerExtraWorkspaces};
