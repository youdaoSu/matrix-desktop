const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const MAX_BYTES = 64 * 1024 * 1024;
const {createStateEncoder,decodeArchiveText}=require('./douyin-inbox-storage-codec.cjs');
const failureCode = error => ['EACCES', 'EPERM', 'EBUSY', 'EEXIST', 'ENOSPC', 'EIO', 'ENOENT', 'EINVAL', 'EMFILE', 'ENAMETOOLONG'].includes(error?.code) ? error.code : 'UNKNOWN';
function createStore({ directory, scope, protect, unprotect, fileSystem = fs, asyncEngine = false }) {
  const key = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  try { fileSystem.mkdirSync(directory, { recursive: true }); }
  catch (error) { throw Error(`抖音聊天存档目录准备失败（prepare/${failureCode(error)}）；原数据未改动`); }
  const file = path.join(directory, key + '.bin');
  let state = { version: 1, scope: key, threads: {}, messages: {}, init: { cursor: '0', done: false }, strangers: { cursor: '0', done: false }, frontier: {}, revision: 0 };
  let eventArchive;
  if (fileSystem.existsSync(file)) {
    if (fileSystem.statSync(file).size > MAX_BYTES) throw Error('抖音本机聊天存档过大，已停止而未覆盖原数据');
    let encrypted, plaintext;
    try { encrypted = fileSystem.readFileSync(file); }
    catch (error) { throw Error(`抖音本机聊天存档读取失败（read/${failureCode(error)}），原文件未改动`); }
    try { plaintext = unprotect(encrypted); }
    catch { throw Error('抖音本机聊天存档解密失败（decrypt）；请尝试本人从桌面正常打开远效，原文件未改动'); }
    try { const parsed = JSON.parse(decodeArchiveText(plaintext)); if (parsed.version !== 1 || parsed.scope !== key || !parsed.threads || !parsed.messages || !parsed.frontier || !Number.isSafeInteger(parsed.revision)) throw Error(); state = parsed; }
    catch { throw Error('抖音本机聊天存档格式校验失败（validate），原文件已保留'); }
  }
  const engineKeys=new Set(['threads','messages','people','protocolEvents','frontier','init','strangers','outbox','lastSendAt']);
  const mapKeys=new Set(['messages','people']);
  const shallowEqual=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&a[key]===b[key]);};
  let tail=Promise.resolve(),pending=0;const encoder=createStateEncoder();
  function prepareEngine(change, keys) {
      if(!Array.isArray(keys)||new Set(keys).size!==keys.length||keys.some(name=>!engineKeys.has(name)))throw Error('聊天存档事务字段无效');
      const allowed=new Set(keys),next={...state};
      for(const name of keys)next[name]=mapKeys.has(name)&&state[name]?{...state[name]}:name==='protocolEvents'&&state[name]?[...state[name]]:structuredClone(state[name]);
      change(next);
      for(const name of new Set([...Object.keys(state),...Object.keys(next)]))if(!allowed.has(name)&&next[name]!==state[name])throw Error('聊天存档事务超出字段范围');
      let changed=false;
      for(const name of keys){const same=mapKeys.has(name)||name==='protocolEvents'?shallowEqual(state[name],next[name]):JSON.stringify(state[name])===JSON.stringify(next[name]);if(same)next[name]=state[name];else changed=true;}
      return changed?next:undefined;
  }
  async function prepareEngineAsync(change,keys,guard){
    if(!Array.isArray(keys)||new Set(keys).size!==keys.length||keys.some(name=>!engineKeys.has(name)))throw Error('聊天存档事务字段无效');
    const allowed=new Set(keys),next={...state};let at=performance.now();
    const yieldTurn=async()=>{await new Promise(resolve=>setImmediate(resolve));guard();at=performance.now();};
    async function copyRecords(value,deep){
      const result={},ids=Object.keys(value);
      for(let n=0;n<ids.length;n++){
        const id=ids[n],record=deep?structuredClone(value[id]):value[id];
        if(id==='__proto__')Object.defineProperty(result,id,{value:record,enumerable:true,writable:true,configurable:true});else result[id]=record;
        if((n&255)===255&&performance.now()-at>=4)await yieldTurn();
      }
      return result;
    }
    for(const name of keys){
      guard();const value=state[name];
      if(value&&(mapKeys.has(name)||name==='threads'&&!Array.isArray(value)))next[name]=await copyRecords(value,!mapKeys.has(name));
      else next[name]=name==='protocolEvents'&&value?[...value]:structuredClone(value);
    }
    guard();change(next);
    for(const name of new Set([...Object.keys(state),...Object.keys(next)]))if(!allowed.has(name)&&next[name]!==state[name])throw Error('聊天存档事务超出字段范围');
    let changed=false;
    for(const name of keys){
      const a=state[name],b=next[name];let same=a===b;
      if(!same&&(mapKeys.has(name)||name==='threads')&&a&&b&&typeof a==='object'&&typeof b==='object'){
        const ids=Object.keys(a),other=Object.keys(b);same=ids.length===other.length;
        for(let n=0;same&&n<ids.length;n++){
          const id=ids[n];same=name==='threads'?id===other[n]&&JSON.stringify(a[id])===JSON.stringify(b[id]):Object.hasOwn(b,id)&&a[id]===b[id];
          if((n&255)===255&&performance.now()-at>=4)await yieldTurn();
        }
      }else if(!same)same=name==='protocolEvents'?shallowEqual(a,b):JSON.stringify(a)===JSON.stringify(b);
      if(same)next[name]=state[name];else changed=true;
    }
    guard();return changed?next:undefined;
  }
  function validateCount(next){if(Object.keys(next.threads).length>5000||Object.keys(next.messages).length>50000)throw Error('抖音本机聊天达到本轮安全容量，已暂停；不会标记为历史完整');}
  const ioAsync=(method,...args)=>new Promise((resolve,reject)=>fileSystem[method](...args,(error,value)=>error?reject(error):resolve(value)));
  // Immutable record blocks reuse bounded compressed bytes. Existing decoder,
  // OS encryption/key and JSON order remain unchanged; no plaintext files or
  // early ACK. Cache publication follows the durable atomic replacement.
  async function persistAsync(next,guard){
    next.revision=state.revision+1;validateCount(next);
    let bytes,prepared;
    try{prepared=await encoder.encode(next,guard);}catch(error){guard();if(/decoded limit/.test(error.message))throw Error('抖音聊天存档达到安全容量，历史仍未完整');throw Error('抖音聊天存档压缩失败（compress）；原文件未改动，未推进同步游标或确认推送');}
    guard();
    try{bytes=protect(prepared.text);}catch{throw Error('抖音聊天存档加密失败（encrypt）；原文件未改动，未推进同步游标或确认推送');}
    guard();const temp=path.join(directory,`${key}.${randomUUID()}.tmp`);let fd,created=false,stage='open';
    try{
      fd=await ioAsync('open',temp,'wx',0o600);created=true;
      stage='write';await ioAsync('writeFile',fd,bytes);
      stage='flush';await ioAsync('fsync',fd);
      stage='close';await ioAsync('close',fd);fd=undefined;
      guard();stage='replace';await ioAsync('rename',temp,file);state=next;prepared.commit();
    }catch(error){
      if(fd!==undefined)try{await ioAsync('close',fd);}catch{}
      if(created)try{await ioAsync('unlink',temp);}catch{}
      throw Error(`抖音聊天存档写入失败（${stage}/${failureCode(error)}）；未推进同步游标或确认推送`);
    }
    return state;
  }
  function persist(next) {
      next.revision=state.revision+1;
      if (Object.keys(next.threads).length > 5000 || Object.keys(next.messages).length > 50000) throw Error('抖音本机聊天达到本轮安全容量，已暂停；不会标记为历史完整');
      const text = JSON.stringify(next); if (Buffer.byteLength(text) > MAX_BYTES - 4096) throw Error('抖音本机聊天存档达到安全容量，历史仍未完整');
      let bytes;
      try{bytes=protect(text);}catch{throw Error('抖音聊天存档加密失败（encrypt）；原文件未改动，未推进同步游标或确认推送');}
      const temp = path.join(directory, `${key}.${randomUUID()}.tmp`); let fd, stage = 'open';
      try { fd = fileSystem.openSync(temp, 'wx', 0o600); stage = 'write'; fileSystem.writeFileSync(fd, bytes); stage = 'flush'; fileSystem.fsyncSync(fd); stage = 'close'; fileSystem.closeSync(fd); fd = undefined; stage = 'replace'; fileSystem.renameSync(temp, file); state = next;encoder.clear(); }
      catch (error) { if (fd !== undefined) { try { fileSystem.closeSync(fd); } catch {} } try { fileSystem.unlinkSync(temp); } catch {} throw Error(`抖音聊天存档写入失败（${stage}/${failureCode(error)}）；未推进同步游标或确认推送`); }
      return state;
  }
  return {
    get: () => state,
    preserveEvent(event){eventArchive ||= require('./douyin-protocol-archive.cjs').createProtocolArchive({directory,key,protect,unprotect,fileSystem});return eventArchive.append(event);},
    eventCount:()=>eventArchive?.count()||0,
    commit(change) {
      if(pending)throw Error('聊天存档正在保存，请等待当前事务完成');
      const next=structuredClone(state);change(next);
      if(JSON.stringify(next)===JSON.stringify(state))return state;
      return persist(next);
    },
    // Internal engine recipes replace message/person/event records rather than
    // mutating their contents. The generic commit above remains fully cloned.
    commitEngine(change, keys) {
      if(pending)throw Error('聊天存档正在保存，请等待当前事务完成');
      const next=prepareEngine(change,keys);return next?persist(next):state;
    },
    ...(asyncEngine?{commitEngineAsync(change,keys,guard=()=>{}){
      if(pending>=128)return Promise.reject(Error('聊天存档保存队列已满，未确认推送'));
      pending++;
      const result=tail.then(async()=>{guard();const next=await prepareEngineAsync(change,keys,guard);return next?persistAsync(next,guard):state;});
      tail=result.then(()=>{pending--;},()=>{pending--;});return result;
    }}:{}),
    drain:()=>tail,
  };
}
module.exports = { createStore };
