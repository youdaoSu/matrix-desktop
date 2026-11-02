// Actual encrypted files with deterministic races at the encryption boundary.
// Every file is disposable; no browser, real profile or platform traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const io=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-write-guard-')),file=path.join(directory,'contacts.json'),key=crypto.randomBytes(32),codec=cipher(key,'synthetic/contacts');
let checks=0,decodes=0,protects=0,race=null;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},bad=fn=>{assert.throws(fn,/原文件保留/);checks++;};
const release=io.configureEncryptedWorkspace({directory,codecFor:()=>({unprotect:bytes=>{decodes++;return codec.unprotect(bytes);},protect:text=>{protects++;const bytes=codec.protect(text);race?.();return bytes;}})});
const old={version:1,records:[{name:'隔离联系人',notes:'中文合成'.repeat(10000)}]},next={...old,version:2},original=codec.protect(JSON.stringify(old));
const restore=()=>{race=null;fs.writeFileSync(file,original);decodes=0;protects=0;};
try{
 restore();io.write(file,next,{expected:old});eq(decodes,1);eq(protects,1);eq(io.read(file),next);eq(fs.readFileSync(file).subarray(0,5).toString(),'YXOP2');
 restore();bad(()=>io.write(file,next,{expected:{version:9}}));eq(fs.readFileSync(file),original);eq(decodes,1);eq(protects,0);
 // Corrupt ORIGINAL data must still be authenticated, never overwritten.
 const corrupt=Buffer.from(original);corrupt[corrupt.length-1]^=1;fs.writeFileSync(file,corrupt);decodes=0;bad(()=>io.write(file,next));eq(decodes,1);eq(fs.readFileSync(file),corrupt);
 // Current bytes are compared even if the replacement cannot be decrypted.
 for(const replacement of [corrupt,Buffer.from('invalid ciphertext'),codec.protect(JSON.stringify({version:99})),Buffer.alloc(0)]){
  restore();race=()=>fs.writeFileSync(file,replacement);bad(()=>io.write(file,next));eq(decodes,1);eq(fs.readFileSync(file),replacement);eq(fs.readdirSync(directory).some(n=>n.endsWith('.tmp')),false);
 }
 restore();race=()=>fs.unlinkSync(file);bad(()=>io.write(file,next));eq(fs.existsSync(file),false);eq(decodes,1);
 race=()=>fs.writeFileSync(file,original);decodes=0;bad(()=>io.write(file,next));eq(fs.readFileSync(file),original);eq(decodes,0);
 // Replacing a regular file with a directory is rejected without traversal.
 restore();const retained=path.join(directory,'retained.bin');race=()=>{fs.renameSync(file,retained);fs.mkdirSync(file);};bad(()=>io.write(file,next));eq(fs.statSync(file).isDirectory(),true);eq(fs.readFileSync(retained),original);fs.rmdirSync(file);fs.unlinkSync(retained);
 // No decoded state persists between separate reads/writes; tampering after a
 // successful transaction must be detected again on the next operation.
 restore();io.write(file,next);const latest=fs.readFileSync(file);latest[latest.length-1]^=1;fs.writeFileSync(file,latest);bad(()=>io.read(file));bad(()=>io.write(file,old));eq(fs.readFileSync(file),latest);eq(fs.readdirSync(directory).some(n=>n.endsWith('.tmp')),false);
 console.log(JSON.stringify({encryptedWriteGuardChecks:checks,originalAuthenticated:true,unchangedEncryptedBytesChecked:true,replacementDeletionCreationAndDirectoryRaceRefused:true,oneDecodePerUpdate:true,noDecodedCache:true,realPlatformActions:0}));
}finally{release();key.fill(0);assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yuanxiao-write-guard-'));fs.rmSync(directory,{recursive:true,force:true});}
