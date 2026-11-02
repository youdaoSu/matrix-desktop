const assert=require('node:assert/strict'),{gzipSync}=require('node:zlib'),{randomBytes}=require('node:crypto');
const {encodeArchiveText,decodeArchiveText,PREFIX,LIMIT}=require('../desktop/douyin-inbox-storage-codec.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 const small='{"legacy":"unchanged"}';eq(await encodeArchiveText(small),small);eq(decodeArchiveText(small),small);
 const large=JSON.stringify({messages:Array.from({length:2000},(_,i)=>({id:String(i),text:'Synthetic repeated message. '.repeat(30)}))});
 const encoded=await encodeArchiveText(large);eq(encoded.startsWith(PREFIX),true);eq(decodeArchiveText(encoded),large);assert(Buffer.byteLength(encoded)<Buffer.byteLength(large)/5);checks++;
 const random=JSON.stringify({data:randomBytes(800000).toString('base64')});eq(await encodeArchiveText(random),random);
 for(const bad of ['', 'Z===', 'not!base64', 'H4sI']){assert.throws(()=>decodeArchiveText(PREFIX+bad));checks++;}
 const damaged=Buffer.from(encoded.slice(PREFIX.length),'base64');damaged[damaged.length-5]^=1;assert.throws(()=>decodeArchiveText(PREFIX+damaged.toString('base64')));checks++;
 // Bounded expansion is enforced by native zlib before an oversized output is returned.
 const bomb=gzipSync(Buffer.alloc(LIMIT+1,65),{level:1});assert.throws(()=>decodeArchiveText(PREFIX+bomb.toString('base64')));checks++;
 await assert.rejects(()=>encodeArchiveText('x'.repeat(LIMIT+1)));checks++;
 console.log(JSON.stringify({checks,legacyReadable:true,exactRoundTrip:true,incompressibleNotExpanded:true,corruptionRejected:true,decodedLimitEnforced:true,realProfileTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
