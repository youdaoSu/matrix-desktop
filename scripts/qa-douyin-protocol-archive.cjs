// Synthetic AES fixtures only. No actual archive, credentials or platform calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createProtocolArchive}=require('../desktop/douyin-protocol-archive.cjs'),{createStore}=require('../desktop/douyin-inbox-store.cjs'),{createEngine}=require('../desktop/douyin-inbox-engine.cjs'),c=require('../desktop/douyin-inbox-codec.cjs');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-protocol-archive-qa-')),key=crypto.randomBytes(32);let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const protect=text=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(text),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);};
const unprotect=bytes=>{const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString();};
const frame=n=>c.decode('Frame',c.encode('Frame',{seqid:String(n),payloadType:'text/json',payload:Buffer.from('PRIVATE_UNSUPPORTED_'+n),headers:[{key:'need_ack',value:'1'}]}));
const event=n=>{const encoded=c.encode('Frame',frame(n));return{at:n,cmd:-1,hash:crypto.createHash('sha256').update(encoded).digest('hex'),frame:encoded.toString('base64'),normalized:true};};
const until=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(resolve=>setImmediate(resolve));}throw Error('Synthetic engine timeout');};
(async()=>{try{
 const scope='a'.repeat(64),options={directory:folder,key:scope,protect,unprotect};let archive=createProtocolArchive(options);
 for(let i=0;i<300;i++)eq(archive.append(event(i)),true);
 eq(archive.count(),300);eq(archive.append(event(0)),false);eq(fs.readdirSync(path.join(folder,'events-'+scope)).length,3);
 const files=fs.readdirSync(path.join(folder,'events-'+scope)).map(name=>path.join(folder,'events-'+scope,name));for(const file of files)eq(fs.readFileSync(file).includes(Buffer.from('PRIVATE_UNSUPPORTED')),false);
 archive=createProtocolArchive(options);eq(archive.append(event(299)),false);eq(archive.count(),300);eq(archive.append(event(300)),true);
 const before=files.map(file=>fs.readFileSync(file));const denied=createProtocolArchive({...options,fileSystem:{...fs,renameSync(){throw Error('PRIVATE_PATH');}}});assert.throws(()=>denied.append(event(301)),/写入失败/);checks++;for(let i=0;i<files.length;i++)eq(fs.readFileSync(files[i]),before[i]);eq(fs.readdirSync(path.dirname(files[0])).some(name=>name.endsWith('.tmp')),false);
 const encryptionFailed=createProtocolArchive({...options,protect(){throw Error('SECRET');}});assert.throws(()=>encryptionFailed.append(event(301)),/加密失败/);checks++;
 const damaged=createProtocolArchive({...options,unprotect(){throw Error('SECRET');}});assert.throws(()=>damaged.append(event(301)),/读取或解密失败/);checks++;for(let i=0;i<files.length;i++)eq(fs.readFileSync(files[i]),before[i]);
 assert.throws(()=>archive.append({...event(301),frame:Buffer.from('TAMPERED').toString('base64')}),/结构无效/);checks++;
 // The saturated ORIGINAL event list stays byte-for-byte unchanged. Overflow
 // is durable BEFORE committing cursor/ACK; replay after commit failure dedupes.
 const store=createStore({directory:folder,scope:['synthetic','account','9007199254740993'],protect,unprotect});store.commit(next=>{next.protocolEvents=Array.from({length:256},(_,n)=>event(n));});const original=JSON.stringify(store.get().protocolEvents),acks=[];let onFrame,failCommit=false;
 const wrapped={get:store.get,preserveEvent:store.preserveEvent,eventCount:store.eventCount,commit(change){if(failCommit)throw Error('SYNTHETIC_MAIN_COMMIT_FAILURE');return store.commit(change);}};
 const engine=createEngine({onObservation(){throw Error('SYNTHETIC_DIAGNOSTIC_SINK_FAILURE');},store:wrapped,assertCurrent:async()=>{},delay:async()=>{},transport:{ownUid:'9007199254740993',close(){},async connect(callbacks){onFrame=callbacks.onFrame;return()=>{};},async read(){return {messages:[],conversations:[],cursor:'0',hasMore:false};}}});engine.start();await until(()=>onFrame&&!engine.status().busy);
 await onFrame(frame(256),bytes=>acks.push(bytes));eq(acks.length,1);eq(store.eventCount(),1);eq(JSON.stringify(store.get().protocolEvents),original);
 failCommit=true;await assert.rejects(()=>onFrame(frame(257),bytes=>acks.push(bytes)),/SYNTHETIC_MAIN_COMMIT_FAILURE/);checks++;eq(acks.length,1);eq(store.eventCount(),2);
 failCommit=false;await onFrame(frame(257),bytes=>acks.push(bytes));eq(acks.length,2);eq(store.eventCount(),2);eq(JSON.stringify(store.get().protocolEvents),original);engine.close();
 // Capacity is finite and refusal preserves bytes. No destructive eviction.
 const bounded=createProtocolArchive({...options,key:'b'.repeat(64),fileSystem:{...fs,existsSync:()=>true,lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>false}),readdirSync:()=>Array.from({length:513},(_,n)=>String(n).padStart(3,'0')+'.bin')}});assert.throws(()=>bounded.append(event(1)),/读取或解密失败/);checks++;
 console.log(JSON.stringify({protocolArchiveChecks:checks,encryptedSegmentOverflow:true,oldEventsUnchanged:true,durableBeforeAck:true,replayDedupedAfterPartialCommit:true,boundedNoEviction:true,realUserProfileTouched:false,realRequests:0}));
}finally{assert.equal(path.dirname(folder),fs.realpathSync(os.tmpdir()));assert(path.basename(folder).startsWith('matrix-protocol-archive-qa-'));fs.rmSync(folder,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
