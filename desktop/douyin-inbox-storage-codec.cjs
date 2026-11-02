// Compression precedes the existing OS encryption. No keys or plaintext files.
const {gzip,gunzip,gunzipSync}=require('node:zlib');
const LIMIT=64*1024*1024-4096,PREFIX='YXINBOX-GZIP-1\n';
async function encodeArchiveText(text){
 const size=Buffer.byteLength(text);if(size>LIMIT)throw Error('Chat archive exceeds decoded limit');
 if(size<512*1024)return text;
 const compressed=await new Promise((resolve,reject)=>gzip(text,{level:1},(error,bytes)=>error?reject(error):resolve(bytes)));
 // Incompressible data retains the legacy representation, avoiding expansion.
 if(PREFIX.length+Math.ceil(compressed.length/3)*4>=size*.9)return text;
 return PREFIX+compressed.toString('base64');
}
function decodeArchiveText(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>LIMIT)throw Error('Invalid chat archive size');
 if(!text.startsWith(PREFIX))return text;
 const encoded=text.slice(PREFIX.length);
 if(!encoded||encoded.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('Invalid compressed chat archive');
 const compressed=Buffer.from(encoded,'base64');if(compressed.toString('base64')!==encoded)throw Error('Noncanonical compressed chat archive');
 return gunzipSync(compressed,{maxOutputLength:LIMIT}).toString('utf8');
}
module.exports={encodeArchiveText,decodeArchiveText,LIMIT,PREFIX};

const zip=text=>new Promise((resolve,reject)=>gzip(text,{level:1},(e,b)=>e?reject(e):resolve(b)));
const unzip=bytes=>new Promise((resolve,reject)=>gunzip(bytes,{maxOutputLength:LIMIT},(e,b)=>e?reject(e):resolve(b)));
function createStateEncoder({maxCacheBytes=8*1024*1024,blockRecords=256,compress=zip}={}){
 if(!Number.isSafeInteger(maxCacheBytes)||maxCacheBytes<0||maxCacheBytes>8*1024*1024||!Number.isSafeInteger(blockRecords)||blockRecords<1||blockRecords>256)throw Error('Invalid archive cache bounds');
 let cache=new Map(),cacheBytes=0;
 async function encode(state,guard=()=>{}){
  guard();const members=[],candidate=new Map();let decodedBytes=0,compressedBytes=0,budget=0,literals='',first=true,serializedRecords=0,reusedRecords=0;
  const count=bytes=>{decodedBytes+=bytes;if(decodedBytes>LIMIT)throw Error('Chat archive exceeds decoded limit');};
  const literal=text=>{count(Buffer.byteLength(text));literals+=text;};
  const append=bytes=>{members.push(bytes);compressedBytes+=bytes.length;};
  const flush=async()=>{if(!literals)return;const text=literals;literals='';append(await compress(text));guard();};
  literal('{');
  for(const name of Object.keys(state)){
   const value=state[name];if(value===undefined)continue;
   literal((first?'':',')+JSON.stringify(name)+':');first=false;
   if((name==='messages'||name==='people')&&value){
    literal('{');await flush();
    const prior=cache.get(name),blocks=[];let complete=true;
    if(prior?.source===value&&prior.complete){
     for(const block of prior.blocks){
      count(block.decodedBytes);append(block.bytes);reusedRecords+=block.keys.length;
      if(budget+block.cost<=maxCacheBytes){budget+=block.cost;blocks.push(block);}else{complete=false;blocks.push(undefined);}
     }
    }else{
     const keys=Object.keys(value);let emitted=false;
     for(let offset=0,index=0;offset<keys.length;offset+=blockRecords,index++){
      const ids=keys.slice(offset,offset+blockRecords),records=ids.map(id=>value[id]),old=prior?.blocks[index];
      let block;
      if(old&&old.leading===emitted&&old.keys.length===ids.length&&ids.every((id,n)=>id===old.keys[n]&&records[n]===old.records[n])){block=old;reusedRecords+=ids.length;}
      else{
       const parts=[];let leading=emitted;
       for(let n=0;n<ids.length;n++){
        const text=JSON.stringify(records[n]);serializedRecords++;
        if(text!==undefined){parts.push((leading?',':'')+JSON.stringify(ids[n])+':'+text);leading=true;}
       }
       const text=parts.join(''),decoded=Buffer.byteLength(text);
       if(decodedBytes+decoded>LIMIT)throw Error('Chat archive exceeds decoded limit');
       const bytes=await compress(text);guard();
       block={keys:ids,records,leading:emitted,emitted:leading,decodedBytes:decoded,bytes,cost:bytes.length+ids.reduce((total,id)=>total+32+id.length*2,0)};
      }
      emitted=block.emitted;count(block.decodedBytes);append(block.bytes);
      if(budget+block.cost<=maxCacheBytes){budget+=block.cost;blocks.push(block);}else{complete=false;blocks.push(undefined);}
     }
    }
    candidate.set(name,{source:value,blocks,complete});literal('}');
   }else literal(JSON.stringify(value));
  }
  literal('}');await flush();guard();
  const combined=Buffer.concat(members,compressedBytes);
  let text;
  if(decodedBytes<512*1024||PREFIX.length+Math.ceil(compressedBytes/3)*4>=decodedBytes*.9){text=(await unzip(combined)).toString('utf8');guard();}
  else text=PREFIX+combined.toString('base64');
  // Only a durable transaction may publish its cache. Failure leaves the old
  // state/cache intact, matching store fsync/rename/ACK semantics.
  return {text,stats:{serializedRecords,reusedRecords,decodedBytes,compressedBytes,cacheBytes:budget},commit(){cache=candidate;cacheBytes=budget;}};
 }
 return {encode,clear(){cache=new Map();cacheBytes=0;},stats:()=>({cacheBytes})};
}
module.exports.createStateEncoder=createStateEncoder;
