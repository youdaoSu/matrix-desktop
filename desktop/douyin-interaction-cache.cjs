// Only validated native collector results enter this cache. No renderer writes,
// credentials, notification state or process-local continuation tokens are saved.
const fs = require('node:fs'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const MAX = 32 * 1024 * 1024;
const {mergePlayback}=require('./work-playback.cjs');
function createInteractionCache({ directory, scope, protect, unprotect, io = fs }) {
  const key = createHash('sha256').update(scope).digest('hex'), file = path.join(directory, key + '.bin');
  let state = { version: 1, scope: key, records: [], works: [], complete: false };
  let recordIndex,workIndex,directoryIndex;
  const failed = stage => Error(`抖音互动缓存${stage}失败；原有缓存保留，未当作没有记录`);
  let readStage = 'prepare';
  try {
    io.mkdirSync(directory, { recursive: true });
    readStage = 'stat';
    let stat;
    try { stat = io.lstatSync(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (stat) {
      readStage = 'file';
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX + 4096) throw failed('校验');
      readStage = 'read'; const bytes = io.readFileSync(file);
      readStage = 'decrypt'; const plaintext = unprotect(bytes);
      readStage = 'json'; const value = JSON.parse(plaintext);
      readStage = 'validate';
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw failed('校验');
      if (value.version !== 1 || value.scope !== key || !Array.isArray(value.records) || value.records.length > 50000 || !Array.isArray(value.works) || value.works.length > 5000 || typeof value.complete !== 'boolean') throw failed('校验');
      state = value;
    }
  } catch (error) {
    // Report fixed stages only; neither native paths/crypto exceptions nor any
    // decrypted cache fields may become an IPC error or UI tooltip.
    const code = ['EACCES','EPERM','ENOENT','EIO','EBUSY','EMFILE','ENFILE','ENOSPC','ENOTDIR','EISDIR'].includes(error?.code) ? error.code : 'unknown';
    const detail = ['prepare','stat','read'].includes(readStage) ? '/' + code : '';
    throw Error(`${failed('读取或解密').message}（${readStage}${detail}）`);
  }
  const persist = next => {
    const text=JSON.stringify(next);
    if(next.records.length>50000||next.works.length>5000||Buffer.byteLength(text)>MAX)throw failed('容量校验');
    // A changed durable scalar or collection size proves inequality without
    // serializing the entire old archive again. Preserve the exact no-write
    // comparison for same-time/same-size edits (avatars, actions, progress).
    // No plaintext copy is retained, and encryption/atomic replacement below
    // remain unchanged. A newer observation must still be durably written.
    const changed=next.capturedAt!==state.capturedAt||next.complete!==state.complete||next.records.length!==state.records.length||next.works.length!==state.works.length;
    if(!changed&&text===JSON.stringify(state))return;
    let fd;const temporary=path.join(directory,key+'.'+randomUUID()+'.tmp');let created=false,stage='encrypt';
    try{
      const bytes=protect(text);stage='open';fd=io.openSync(temporary,'wx',0o600);created=true;
      stage='write';io.writeFileSync(fd,bytes);stage='flush';io.fsyncSync(fd);stage='close';io.closeSync(fd);fd=undefined;
      stage='replace';io.renameSync(temporary,file);state=next;recordIndex=undefined;workIndex=undefined;directoryIndex=undefined;
    }catch(error){const code=typeof error?.code==='string'&&/^[A-Z0-9_]{1,24}$/.test(error.code)?error.code:'unknown';throw Error(`${failed('保存').message}（${stage}/${code}）`);}
    finally{if(fd!==undefined)try{io.closeSync(fd);}catch{}if(created&&io.existsSync(temporary))try{io.unlinkSync(temporary);}catch{}}
  };
  return {
    get: () => structuredClone(state),
    panelSync:()=>state.followerPanelSync?structuredClone(state.followerPanelSync):undefined,
    findRecord(platformId,workId){if(!recordIndex)recordIndex=new Map(state.records.map(row=>[(row.workId||'')+'/'+row.platformId,row]));const row=recordIndex.get((workId||'')+'/'+platformId);return row?structuredClone(row):undefined;},
    findWork(platformId){if(!workIndex)workIndex=new Map(state.works.map(work=>[work.platformId,work]));const work=workIndex.get(platformId);return work?structuredClone(work):undefined;},
    directorySlice({offset=0,limit=50,query='',ids}={}){
      if(!Number.isSafeInteger(offset)||offset<0||offset>50000||!Number.isInteger(limit)||limit<1||limit>50||typeof query!=='string'||query.length>100||ids!==undefined&&(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^MS4w[A-Za-z0-9_-]{1,250}$/.test(id))))throw Error('粉丝目录读取参数无效');
      if(!directoryIndex){
        directoryIndex=new Map();const duplicate=new Set();
        for(const row of state.records){
          if(row.workId||row.isCurrentFollower===false||typeof row.authorProfileUrl!=='string'||typeof row.firstObservedAt!=='string'||!Number.isFinite(Date.parse(row.firstObservedAt)))continue;
          const match=/^https:\/\/www\.douyin\.com\/user\/(MS4w[A-Za-z0-9_-]{1,250})$/.exec(row.authorProfileUrl);
          if(!match||typeof row.platformUserId!=='string'||!/^[1-9]\d{0,18}$/.test(row.platformUserId)||row.platformId!==row.platformUserId)continue;
          if(directoryIndex.has(match[1])){duplicate.add(match[1]);continue;}directoryIndex.set(match[1],row);
        }
        for(const id of duplicate)directoryIndex.delete(id);
      }
      const project=([id,row])=>({id,uid:row.platformUserId,name:typeof row.author==='string'?row.author.slice(0,200):'',profileUrl:row.authorProfileUrl,firstSeenAt:row.firstObservedAt});
      if(ids){const items=ids.map(id=>{const row=directoryIndex.get(id);if(!row)throw Error('所选粉丝不在当前可核验目录，未替换为其他用户');return project([id,row]);});return{items,total:directoryIndex.size,capturedAt:state.capturedAt,complete:state.followerRosterVerified===true};}
      const needle=query.trim().toLocaleLowerCase(),items=[];let total=0;
      for(const entry of directoryIndex){const row=entry[1];if(needle&&!String(row.author||'').toLocaleLowerCase().includes(needle)&&!row.platformUserId.includes(needle))continue;if(total>=offset&&items.length<limit)items.push(project(entry));total++;}
      return{items,total,offset,limit,capturedAt:state.capturedAt,complete:state.followerRosterVerified===true};
    },
    supplementFollowerAvatar(recordId,expected,urls){
      const target=require('./douyin-follower-avatar.cjs').followerAvatarTarget,media=require('./douyin-inbox-media.cjs').mediaUrl;
      const current=this.findRecord(recordId),before=target(expected),after=target(current);
      if(!before||!after||before.uid!==after.uid||before.secUid!==after.secUid)throw Error('粉丝记录已变化，补读头像未保存');
      if(!Array.isArray(urls)||!urls.length||urls.length>4||urls.some(value=>media(value)!==value))throw Error('补读头像地址未通过校验');
      if(current.avatarUrl||current.avatarUrls?.length)return current;
      const updated={...current,avatarUrl:urls[0],avatarUrls:[...new Set(urls)]};delete updated.avatarReadHint;
      // Profile enrichment is not evidence of current follower membership.
      // Preserve all roster flags, cursor/progress and observation timestamps.
      persist({...state,records:state.records.map(row=>!row.workId&&row.platformId===recordId?updated:row)});
      return structuredClone(updated);
    },
    action(id, value) {
      if (value === undefined) return structuredClone(state.actions?.[id]);
      if (Object.keys(state.actions || {}).length >= 2000 && !state.actions?.[id]) throw failed('操作回执容量校验');
      this.merge({ records: [], works: [], complete: state.complete, action: { id, value } });
    },
    merge(page) {
      // An omitted attachment field in a lighter poll is not an attachment
      // deletion. Preserve it only for this exact account/work/comment/author
      // and unchanged body; an explicit images field or changed body wins.
      if(page.kind==='comments'){
        recordIndex ||= new Map(state.records.map(row=>[(row.workId||'')+'/'+row.platformId,row]));
        page={...page,records:page.records.map(row=>{
          const previous=recordIndex.get((row.workId||'')+'/'+row.platformId);
          if(Object.hasOwn(row,'images')||!previous?.images?.length||row.platformUserId!==previous.platformUserId||row.content!==previous.content)return row;
          // Keep existing property order so unchanged lightweight polls still
          // hit the byte-identical no-write fast path.
          const restored={};for(const key of [...new Set([...Object.keys(previous),...Object.keys(row)])]){if(key==='images')restored.images=structuredClone(previous.images);else if(key!=='imageReadHint'&&Object.hasOwn(row,key))restored[key]=row[key];}return restored;
        })};
      }
      // A successful idle comment poll is not a new archive. Checking time and
      // process-local pagination counters must not re-encrypt a large unchanged
      // history. Retain the timestamp of the last durable content snapshot.
      // Follower observations and explicit action receipts are never skipped.
      if (page.kind === 'comments' && page.action === undefined && page.complete === state.complete && page.progress?.worksCatalogComplete === state.progress?.worksCatalogComplete && page.progress?.catalogReadError === state.progress?.catalogReadError) {
        recordIndex ||= new Map(state.records.map(row => [(row.workId || '') + '/' + row.platformId, row]));
        workIndex ||= new Map(state.works.map(work => [work.platformId, work]));
        const sameRecords = page.records.every(row => JSON.stringify(recordIndex.get((row.workId || '') + '/' + row.platformId)) === JSON.stringify(row));
        const sameWorks = (page.works || []).every(work => {
          const previous = workIndex.get(work.platformId);
          return previous && JSON.stringify(previous) === JSON.stringify({ ...previous, ...work, ...(Object.hasOwn(work,'readError')||Object.hasOwn(work,'readComplete')?{readError:work.readError,readComplete:work.readComplete}:{}) });
        });
        if (sameRecords && sameWorks) return { records: page.records.map(row => structuredClone(recordIndex.get((row.workId || '') + '/' + row.platformId))), works: (page.works || []).map(work => structuredClone(workIndex.get(work.platformId))) };
      }
      const records = new Map(state.records.map(r => [(r.workId || '') + '/' + r.platformId, r]));
      const capturedAt=typeof page.capturedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(page.capturedAt)&&Number.isFinite(Date.parse(page.capturedAt))?page.capturedAt:undefined;
      for (const row of page.records) {
        const id=(row.workId || '') + '/' + row.platformId,previous=records.get(id);
        const preservedAvatar=page.kind==='followers'&&!row.avatarUrl&&!row.avatarUrls?.length&&(previous?.avatarUrl||previous?.avatarUrls?.length)?{avatarUrl:previous.avatarUrl,avatarUrls:previous.avatarUrls}:{};
        const details={};
        if(page.kind==='followers'&&previous?.platformUserId===row.platformUserId&&row.followerDetailState){
          const state={...row.followerDetailState};
          if(['missing','invalid'].includes(state.signature)&&previous.content){details.content=previous.content;state.signature='cached';}
          if(['missing','invalid'].includes(state.followTime)&&previous.displayTime){details.displayTime=previous.displayTime;state.followTime='cached';}
          details.followerDetailState=state;
        }
        records.set(id,page.kind==='followers'?{...row,...preservedAvatar,...details,isCurrentFollower:true,firstObservedAt:previous?.firstObservedAt||(!previous?capturedAt:undefined),lastObservedAt:capturedAt||previous?.lastObservedAt,membershipCheckedAt:capturedAt||previous?.membershipCheckedAt}:row);
      }
      // A page end alone is not a full-roster proof. Keep historical members;
      // only a stable exact owner count plus a matching regular roster may
      // hide absent members from the current-list view, never delete history.
      if (page.kind==='followers'&&page.complete&&page.followerRosterVerified===true&&Array.isArray(page.currentFollowerIds)) {
        const current = new Set(page.currentFollowerIds);
        for (const [id, row] of records) records.set(id,{...row,isCurrentFollower:current.has(row.platformId),membershipCheckedAt:capturedAt||row.membershipCheckedAt});
      }
      const works = new Map(state.works.map(w => [w.platformId, w]));
      for (const work of page.works || []) {const previous=works.get(work.platformId);works.set(work.platformId,mergePlayback(previous,{ ...work, ...(Object.hasOwn(work,'readError')||Object.hasOwn(work,'readComplete')?{readError:work.readError,readComplete:work.readComplete}:{}) }));}
      const managed=page.kind==='followers'&&state.followerPanelSync&&page.followerPanelSync===undefined;
      const next = { ...state, records: [...records.values()], works: [...works.values()], complete: managed?state.complete:page.complete, capturedAt: page.capturedAt ?? state.capturedAt, progress: page.progress ?? state.progress, ...(page.kind==='followers'?{followerRosterVerified:managed?state.followerRosterVerified:page.followerRosterVerified===true}:{}),...(page.followerPanelSync?{followerPanelSync:structuredClone(page.followerPanelSync)}:{}), ...(page.action ? { actions: { ...state.actions, [page.action.id]: page.action.value } } : {}) };
      persist(next);
      return {records:page.records.map(row=>structuredClone(records.get((row.workId||'')+'/'+row.platformId))),works:(page.works||[]).map(work=>structuredClone(works.get(work.platformId)))};
    },
  };
}
module.exports = { createInteractionCache };
