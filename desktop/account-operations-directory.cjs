'use strict';
// A bounded, ephemeral projection of the EXISTING native follower cache.
// Not a second scraper, not a follow event stream, and not send permission.
const clone=value=>structuredClone(value);
const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
class OperationsDirectory{
 constructor({studio,getBinding}){this.studio=studio;this.getBinding=getBinding;this.lists=new Map();}
 source(primaryId,readerId){
  const primary=this.studio.getAccount(primaryId),reader=this.studio.getAccount(readerId),list=this.lists.get(primaryId),p=this.getBinding(primaryId),r=this.getBinding(readerId);
  if(primary.platform!=='douyin'||reader.platform!=='douyin'||primary.role!=='primary'||reader.id!==primary.id&&(reader.role!=='member'||reader.primaryAccountId!==primary.id)||!list||!p||!r||JSON.stringify(p)!==JSON.stringify(list.primaryBinding))throw Error('目录归属、账号分工或已核验身份变化，请重新读取');
  return{primary,reader,primaryBinding:clone(p),readerBinding:clone(r)};
 }
 merge(input){
  const primary=this.studio.getAccount(input.primaryAccountId),binding=this.getBinding(primary.id);
  if(primary.platform!=='douyin'||primary.role!=='primary'||!binding||binding.identity!==input.ownerIdentity||!/^https:\/\/www\.douyin\.com\/user\/MS4w[A-Za-z0-9_-]{1,250}$/.test(input.ownerProfileUrl||'')||!Array.isArray(input.items)||input.items.length>50||!Number.isInteger(input.total)||input.total<0||input.total>50000)throw Error('原生粉丝目录投影未通过归属或容量核验');
  const old=this.lists.get(primary.id),same=old&&old.ownerProfileUrl===input.ownerProfileUrl&&JSON.stringify(old.primaryBinding)===JSON.stringify(binding),items=new Map(same?old.items.map(item=>[item.id,item]):[]),seen=new Set();
  for(const fan of input.items){if(!fan||typeof fan.id!=='string'||!/^MS4w[A-Za-z0-9_-]{1,250}$/.test(fan.id)||seen.has(fan.id)||fan.profileUrl!=='https://www.douyin.com/user/'+fan.id||typeof fan.uid!=='string'||!/^[1-9]\d{0,18}$/.test(fan.uid)||typeof fan.name!=='string'||fan.name.length>200||typeof fan.firstSeenAt!=='string'||!Number.isFinite(Date.parse(fan.firstSeenAt)))throw Error('粉丝主页、UID 或首次观察时间未同时核对');seen.add(fan.id);items.set(fan.id,clone(fan));}
  while(items.size>1000)items.delete(items.keys().next().value);
  const proof=input.nativeDirectoryProof;
  if(!proof||proof.kind!=='native-cache-v1'||proof.scopeHash!==hash(primary.binding)||typeof proof.verifiedAt!=='string'||!Number.isFinite(Date.parse(proof.verifiedAt))||proof.verifiedAt<binding.establishedAt)throw Error('原生目录缺少本轮绑定范围与核验时间，不会改写首次观察时间');
  const list={primaryAccountId:primary.id,platform:'douyin',source:'visible-followers',ownerIdentity:input.ownerIdentity,ownerProfileUrl:input.ownerProfileUrl,primaryBinding:clone(binding),nativeDirectoryProof:clone(proof),items:[...items.values()],total:input.total,complete:input.complete===true};this.lists.set(primary.id,list);return{...clone(input),items:clone(input.items)};
 }
 snapshot(){return clone([...this.lists.values()]);}
 validateSource({primaryAccountId,readerAccountId}){return this.source(primaryAccountId,readerAccountId);}
 getRecipients({primaryAccountId,accountId,fanIds}){
  if(!Array.isArray(fanIds)||!fanIds.length||fanIds.length>50||new Set(fanIds).size!==fanIds.length)throw Error('每次只能核对明确选择的 1 至 50 位联系人');const {reader}=this.source(primaryAccountId,accountId),list=this.lists.get(primaryAccountId),map=new Map(list.items.map(item=>[item.id,item]));
  return fanIds.map(id=>{const fan=map.get(id);if(!fan)throw Error('所选粉丝尚未从原生目录核对，请重新读取，不会猜测其他联系人');return{account:clone(reader),fan:clone(fan)};});
 }
 withReadSnapshot(action){return action();}
 closeAccount(id){for(const [primary,list]of this.lists)if(primary===id||!this.studio.live.has(primary))this.lists.delete(primary);}
}
module.exports={OperationsDirectory};
