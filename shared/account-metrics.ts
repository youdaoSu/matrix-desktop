export const maxAccountCounter = 2147483647; // Current PostgreSQL integer columns.
export type AccountMetricEvidence = {source:'douyin-self-profile'|'douyin-creator-profile'|'rendered-own-counter';ownerUid?:string};
export function accountMetricSourceLabel(source?:string) {
  return source==='douyin-self-profile'?'抖音本人主页资料':source==='douyin-creator-profile'?'抖音创作者本人资料':source==='rendered-own-counter'?'本人主页精确可见计数':'尚无可信来源';
}
type MetricContext = {sessionId:string;nativeAccountKey?:string;evidence?:AccountMetricEvidence};
const validKey = (value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{2,100}$/.test(value);
const validUid = (value:unknown):value is string=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
export function metricBinding(platform:string, sessionId:unknown, nativeAccountKey:unknown) {
  return typeof sessionId==='string'&&/^[a-z0-9-]{16,80}$/i.test(sessionId)&&validKey(nativeAccountKey)?JSON.stringify([platform,sessionId,nativeAccountKey]):undefined;
}
export function mergeAccountMetricSnapshot(platform:string, previous:Record<string,unknown>|undefined, metrics:Record<string,number>, at:string, context?:MetricContext) {
  if(!Object.keys(metrics).length)return previous;
  const binding=context&&metricBinding(platform,context.sessionId,context.nativeAccountKey);
  const source=context?.evidence?.source,ownerUid=validUid(context?.evidence?.ownerUid)?context.evidence.ownerUid:undefined;
  const basis=platform==='douyin'&&context?binding&&['douyin-self-profile','douyin-creator-profile'].includes(source||'')&&ownerUid?'douyin-own-profile-v1':binding&&source==='rendered-own-counter'?'douyin-rendered-exact-v1':undefined:platform==='xiaohongshu'?'xhs-isolated-counter-v2':undefined;
  const sameBasis=platform==='douyin'&&context?!!basis&&previous?.followersBasis===basis&&previous?.followersBinding===binding&&previous?.followersSource===source&&(basis!=='douyin-own-profile-v1'||previous?.followersOwnerUid===ownerUid):platform!=='xiaohongshu'||previous?.followersBasis==='xhs-isolated-counter-v2';
  return {...previous,...metrics,at,...(metrics.followersCount!==undefined?{
    followersAt:at,
    ...(context?{followersBinding:binding,followersSource:source,followersOwnerUid:ownerUid,followersBasis:basis}:platform==='xiaohongshu'?{followersBasis:basis}:{}),
    // Correcting a legacy misread counter is not a real loss of followers.
    followersChange:sameBasis&&typeof previous?.followersCount==='number'&&Number.isSafeInteger(previous.followersCount)?metrics.followersCount-previous.followersCount:undefined,
  }:{})};
}
export interface FollowerCoverage {
  accountCount: number;
  measuredAccounts: number;
  missingAccounts: number;
  staleAccounts: number;
  total: number | null;
  oldestObservedAt?: string;
  latestObservedAt?: string;
  bindingCount?: number;
  duplicateBindings?: number;
}
export type StoredAccountMetric = {id?:unknown;platform?:unknown;followersCount?: unknown; rawData?: unknown};
type Snapshot = {followersCount?:unknown;followersAt?:unknown;followersBasis?:unknown;followersBinding?:unknown;followersSource?:unknown;followersOwnerUid?:unknown};
type RawMetric = {connectorSessionId?:unknown;nativeAccountKey?:unknown;metricSnapshot?:Snapshot};
export function observedFollowers(account: StoredAccountMetric, now = Date.now()): {value:number; at:string} | undefined {
  const raw=account.rawData as RawMetric | undefined;
  const snapshot=raw?.metricSnapshot,at=snapshot?.followersAt,value=snapshot?.followersCount;
  if(typeof at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(at)||!Number.isFinite(Date.parse(at))||Date.parse(at)>now+5000) return;
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>maxAccountCounter||account.followersCount!==value) return;
  if(account.platform==='douyin') {
    const binding=metricBinding('douyin',raw?.connectorSessionId,raw?.nativeAccountKey);
    if(!binding||snapshot?.followersBinding!==binding)return;
    if(snapshot.followersBasis==='douyin-own-profile-v1') {if(!['douyin-self-profile','douyin-creator-profile'].includes(String(snapshot.followersSource))||!validUid(snapshot.followersOwnerUid))return;}
    else if(snapshot.followersBasis==='douyin-rendered-exact-v1') {if(snapshot.followersSource!=='rendered-own-counter')return;}
    else return; // Legacy rounded/unbound values remain saved, not trusted totals.
  }
  return {value,at:new Date(at).toISOString()};
}
export function auditFollowerCoverage(accounts:StoredAccountMetric[],now=Date.now()) {
  const observations=accounts.map(account=>observedFollowers(account,now));
  // Names, avatars and a cached follower-list length are never identities or totals.
  const handles=new Map<string,Set<string>>();
  const handleOf=(account:StoredAccountMetric)=>{const raw=account.rawData as RawMetric|undefined;return typeof account.platform==='string'&&validKey(raw?.nativeAccountKey)?JSON.stringify([account.platform,raw.nativeAccountKey]):undefined;};
  for(let i=0;i<accounts.length;i++) {
    const account=accounts[i],raw=account.rawData as RawMetric|undefined,uid=raw?.metricSnapshot?.followersOwnerUid,handle=handleOf(account);
    if(observations[i]&&handle&&validUid(uid)){const set=handles.get(handle)||new Set();set.add(uid);handles.set(handle,set);}
  }
  const groups=new Map<string,number[]>();
  for(let i=0;i<accounts.length;i++) {
    const account=accounts[i],raw=account.rawData as RawMetric|undefined,uid=raw?.metricSnapshot?.followersOwnerUid,handle=handleOf(account),aliases=handle?handles.get(handle):undefined;
    const knownUid=observations[i]&&validUid(uid)?uid:aliases?.size===1?[...aliases][0]:undefined;
    const identity=knownUid?JSON.stringify([account.platform,'uid',knownUid]):handle||'unproven-row/'+i;
    const indexes=groups.get(identity)||[];indexes.push(i);groups.set(identity,indexes);
  }
  const representatives:number[]=[], representativeByIndex:number[]=Array(accounts.length);
  for(const indexes of groups.values()) {
    const available=indexes.filter(i=>observations[i]);
    const chosen=available.length?available.reduce((a,b)=>observations[a]!.at>=observations[b]!.at?a:b):indexes[0];
    representatives.push(chosen);for(const i of indexes)representativeByIndex[i]=chosen;
  }
  const samples=representatives.map(i=>observations[i]).filter((sample):sample is {value:number;at:string}=>!!sample);
  const times=samples.map(sample=>sample.at).sort();
  const coverage:FollowerCoverage={accountCount:groups.size,measuredAccounts:samples.length,missingAccounts:groups.size-samples.length,
    staleAccounts:samples.filter(sample=>now-Date.parse(sample.at)>86400000).length,
    total:samples.length?samples.reduce((sum,sample)=>sum+sample.value,0):null,
    bindingCount:accounts.length,duplicateBindings:accounts.length-groups.size,
    ...(times.length?{oldestObservedAt:times[0],latestObservedAt:times[times.length-1]}:{})};
  return {coverage,samples:accounts.map((_account,index)=>({index,sample:observations[index],included:representativeByIndex[index]===index&&!!observations[index],duplicateOf:representativeByIndex[index]===index?undefined:representativeByIndex[index]}))};
}
export function summarizeFollowerCoverage(accounts: StoredAccountMetric[], now = Date.now()): FollowerCoverage {return auditFollowerCoverage(accounts,now).coverage;}
// Missing/legacy/malformed API metadata never upgrades a numeric DB default
// into evidence of a real zero. Keep older servers safe to display too.
export function followerPresentation(value: unknown): {value:number|null;detail:string} {
  const item=value as FollowerCoverage | undefined;
  const valid=item&&['accountCount','measuredAccounts','missingAccounts','staleAccounts'].every(key=>Number.isSafeInteger(item[key as keyof FollowerCoverage])&&Number(item[key as keyof FollowerCoverage])>=0)
    &&item.measuredAccounts+item.missingAccounts===item.accountCount&&item.staleAccounts<=item.measuredAccounts
    &&(item.measuredAccounts===0?item.total===null:typeof item.total==='number'&&Number.isSafeInteger(item.total)&&item.total>=0)
    &&(item.duplicateBindings===undefined||Number.isSafeInteger(item.duplicateBindings)&&item.duplicateBindings>=0&&item.bindingCount===item.accountCount+item.duplicateBindings);
  if(!valid)return{value:null,detail:'暂无可信采集信息'};
  if(!item.accountCount)return{value:null,detail:'尚未绑定账号'};
  if(!item.measuredAccounts)return{value:null,detail:`${item.accountCount} 个账号尚未采集到可信官网粉丝计数`};
  return {value:item.total,detail:`已采集 ${item.measuredAccounts}/${item.accountCount} 个账号${item.missingAccounts?'（部分统计）':''}${item.duplicateBindings?`，排除 ${item.duplicateBindings} 个重复绑定`:''}${item.staleAccounts?`，${item.staleAccounts} 个样本超过24小时`:''}`};
}
