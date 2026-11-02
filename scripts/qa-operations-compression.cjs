// Isolated encrypted fixtures. No profile, browser, network, or send runtime.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const key=crypto.randomBytes(32),owner='isolated-owner',codec=cipher(key,owner),MAX=24*1024*1024;
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=fn=>{assert.throws(fn);checks++;};
function encrypt(body,version=1){const nonce=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,nonce);c.setAAD(Buffer.from(`yuanxiao-interactions-v${version}/`+owner));const encoded=Buffer.concat([c.update(body),c.final()]);return Buffer.concat([Buffer.from(`YXOP${version}`),nonce,c.getAuthTag(),encoded]);}
function forged(length,algorithm=1,raw=Buffer.alloc(100000,65)){const metadata=Buffer.alloc(5);metadata[0]=algorithm;metadata.writeUInt32LE(length,1);return encrypt(Buffer.concat([metadata,zlib.deflateRawSync(raw)]),2);}
for(const text of ['{}','中文'.repeat(4000),JSON.stringify({text:crypto.randomBytes(9000).toString('base64')})]){
 const bytes=codec.protect(text);eq(codec.unprotect(bytes),text);eq(codec.unprotect(encrypt(Buffer.from(text))),text);
 reject(()=>cipher(key,'another-owner').unprotect(bytes));reject(()=>cipher(crypto.randomBytes(32),owner).unprotect(bytes));
}
eq(codec.protect('{}').subarray(0,5).toString(),'YXOP1');
const encoded=codec.protect('historical synthetic text '.repeat(10000));eq(encoded.subarray(0,5).toString(),'YXOP2');
for(const index of [4,6,18,encoded.length-1]){const changed=Buffer.from(encoded);changed[index]^=1;reject(()=>codec.unprotect(changed));}
const downgrade=Buffer.from(encoded);downgrade.write('YXOP1');reject(()=>codec.unprotect(downgrade));
for(const bad of [forged(4096),forged(MAX+1),forged(100001),forged(100000,2),forged(4096,1,Buffer.alloc(4096,255)),encoded.subarray(0,30),Buffer.alloc(MAX+65)])reject(()=>codec.unprotect(bad));
reject(()=>codec.protect('x'.repeat(MAX+1)));reject(()=>codec.unprotect(encrypt(Buffer.alloc(MAX+1,65))));reject(()=>codec.protect(null));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-compression-')),account=crypto.randomUUID();let store,decodedReads=0;
try{
 const options={protect:codec.protect,unprotect:bytes=>{decodedReads++;return codec.unprotect(bytes);},getAccount:id=>({id,platform:'douyin',name:'synthetic'})};
 store=new InteractionStore(directory,options);
 let state=store._read();const at=new Date(Date.now()-60000).toISOString();
 state.messages=Array.from({length:5000},(_,i)=>({id:crypto.randomUUID(),accountId:account,platform:'douyin',channel:'dm',externalId:'synthetic-'+i,threadId:'thread-'+i%60,senderId:'synthetic-peer-'+i,senderName:'synthetic',text:'x'.repeat(100),receivedAt:at,isOwn:false,isGroup:false,historical:true,createdAt:at}));
 // Real legacy file is read, preserved semantically, and rewritten on a normal transaction.
 fs.writeFileSync(store.filePath,encrypt(Buffer.from(JSON.stringify(state))));store=new InteractionStore(directory,options);
 eq(store.snapshotForDisplay().totalMessages,5000);eq(fs.readFileSync(store.filePath).subarray(0,5).toString(),'YXOP2');
 decodedReads=0;store.snapshotForDisplay();store.snapshotForDisplay();eq(decodedReads,0);
 state=store._read();for(const message of state.messages)message.text='x'.repeat(2000);
 assert.ok(Buffer.byteLength(JSON.stringify(state))>8*1024*1024);store._write(state);state=null;
 decodedReads=0;eq(store.snapshotForDisplay().totalMessages,5000);eq(store.snapshotForDisplay().totalMessages,5000);eq(decodedReads,2);
 // The compressed byte size must not enlarge the retained decoded cache budget.
 const bytes=fs.readFileSync(store.filePath);assert.ok(bytes.length<8*1024*1024);checks++;
 store=new InteractionStore(directory,options);eq(store.snapshotForDisplay().totalMessages,5000);
 const bad=Buffer.from(fs.readFileSync(store.filePath));bad[bad.length-1]^=1;fs.writeFileSync(store.filePath,bad);
 reject(()=>store.snapshotForDisplay());eq(fs.readFileSync(store.filePath),bad);
 // Plaintext store capacity applies even to a very small compressed input.
 const oversized=codec.protect(' '.repeat(16*1024*1024+1));fs.writeFileSync(store.filePath,oversized);
 reject(()=>store.snapshotForDisplay());eq(fs.readFileSync(store.filePath),oversized);
 console.log(JSON.stringify({compressionChecks:checks,legacyCompatible:true,authenticatedBeforeDecode:true,decodedCacheBound:true,corruptionPreserved:true,realProfileTouched:false,platformCalls:0}));
}finally{
 key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(directory).startsWith('yuanxiao-compression-'));
 if(store&&fs.existsSync(store.filePath))fs.unlinkSync(store.filePath);fs.rmdirSync(directory);
}
