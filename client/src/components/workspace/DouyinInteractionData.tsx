import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import type { DouyinInteractionResult, DouyinInteractionRow, DouyinInteractionWork,DouyinFollowerPanelSync } from '@shared/douyin-interactions';
import { useOfficialWorkspace } from './OfficialWorkspace';
import { useWorkspaceIdentity } from './WorkspaceUiState';
import { assertInteractionBudget, interactionRowBytes, interactionRowsBytes, retainInteractionKeys } from './interaction-memory';

export type DouyinKind = 'comments' | 'followers';
export const isDouyinCommentId = (value: unknown, legacy: boolean) => typeof value === 'string' && (/^[1-9]\d{0,18}$/.test(value) || legacy && /^[\x21-\x7e]{1,512}$/.test(value) && !/^(?:https?|file|data|javascript):/i.test(value) && !/^\d+$/.test(value));
export type DouyinEntry = { rows: DouyinInteractionRow[]; works: DouyinInteractionWork[]; cursor?: string; pendingReply?:{workId:string;commentId:string}; complete: boolean;forceHistory?:boolean; refreshLatest?:boolean; refreshFollowers?:boolean; followerRosterVerified?:boolean; followerPending?:boolean; followerPanelSync?:DouyinFollowerPanelSync;waitingForAccount?:boolean; bytes: number; at: number; nextAt: number; failures: number; recoveries?: number; error?: string; phase: string; progress?: DouyinInteractionResult['progress']; baseline?: boolean; newCount: number };
const key = (a: PlatformAccount, kind: DouyinKind) => [kind, a.id, a.connectorSessionId, a.nativeAccountKey || ''].join('/');
export function douyinPollDelay(kind:DouyinKind,result:Pick<DouyinInteractionResult,'complete'|'monitoring'|'pollAfterMs'|'followerPending'>){const suggested=result.pollAfterMs,valid=typeof suggested==='number'&&Number.isSafeInteger(suggested)&&suggested<=60000;return valid&&(kind==='comments'&&result.complete===true&&result.monitoring===true&&suggested>=4500||kind==='followers'&&result.complete===false&&result.followerPending===true&&suggested>=10000)?suggested:result.complete?15000:4500;}
type Data = { activate(kind: DouyinKind): void; refresh(a: PlatformAccount, kind: DouyinKind): void; requestReplies?(a:PlatformAccount,root:DouyinInteractionRow):void; prioritize(a: PlatformAccount | null | undefined, workId: string, kind?: DouyinKind): void; acceptAction?(a:PlatformAccount,result:DouyinInteractionResult):void; entry(a: PlatformAccount, kind: DouyinKind): DouyinEntry | undefined; reading: string; readings?: string[] };
const Context = createContext<Data>({ activate() {}, refresh() {}, prioritize() {}, entry: () => undefined, reading: '' });
export function interactionStatus(error?: string) {
  if (!error) return '已同步';
  if (/权限不足|没有权限|无读取权限|未授权此功能/.test(error)) return '没有权限';
  if (/验证码|本人验证|页面验证|官方验证|安全验证|请完成验证/.test(error)) return '需要验证';
  if (/缺少有效登录|缺少可用官方会话|请.*(?:重新登录|恢复登录|先登录)|用户未登录|登录失效|登录凭据失效|请在账号管理绑定/.test(error)) return '需要登录';
  return '获取失败';
}
export function interactionCanRetry(error: string) {
  // Platform refusal text must not become a transport retry merely because
  // its explanation happens to mention a network problem.
  return !/平台码|HTTP\s*(?:401|403|429)|验证码|安全验证/.test(error) && (/尚未加载|加载超时|网络连接|读取.*超时|准备官网只读采集页超时|^抖音官方(?:作品目录|评论)尚未读取完成/.test(error) || interactionNeedsRescan(error));
}
export function interactionNeedsRescan(error: string) {
  return error === '抖音创作者只读采集页已释放，需要重新建立作品目录' || error === '抖音粉丝采集页已释放，需要重新建立粉丝分页' || error === '抖音创作者只读页面操作超时，已有记录保留' || error === '抖音分页凭据不属于当前账号或已过期，请重新读取';
}
// One owner-scoped provider survives route changes. The monitor and visible
// list share it; neither opens another persistent official guest or marks read.
export function DouyinInteractionDataProvider({ children,initialKinds=['comments','followers'] }: { children: ReactNode;initialKinds?:ReadonlyArray<DouyinKind> }) {
  const workspace = useOfficialWorkspace(), lease = useWorkspaceIdentity(), owner = getUser()?.id || '', token = getAuthToken() || '';
  const accounts = workspace.accounts.filter(a => a.platform === 'douyin' && a.connectorSessionId);
  const signature = accounts.map(a => key(a, 'comments')).sort().join('|');
  const [snapshot, setSnapshot] = useState<{ lease: string; entries: Map<string, DouyinEntry>; reading: string; readings: string[] }>({ lease: '', entries: new Map(), reading: '', readings: [] });
  // Restarting on the home route must not silently disable background reads.
  // Flags only; account authentication and native owner proofs still gate GETs.
  const cache = useRef({ lease, entries: new Map<string, DouyinEntry>(), enabled: new Set<DouyinKind>(initialKinds), hydrated: new Set<string>() });
  const pendingFollowerReload=useRef(new Set<string>());
  const replyRequests=useRef(new Map<string,{workId:string;commentId:string}>());
  if (cache.current.lease !== lease) {cache.current = { lease, entries: new Map(), enabled: new Set(initialKinds), hydrated: new Set() };pendingFollowerReload.current.clear();}
  const latest = useRef({ accounts, locked: workspace.jobsLocked }); latest.current = { accounts, locked: workspace.jobsLocked };
  // Independent accounts may read concurrently; kinds belonging to the same
  // account/session still share a lane and the native per-account safety floor.
  const epoch = useRef(0), occupied = useRef(new Map<string, { job: symbol; target: string }>()), accountNextAt = useRef(new Map<string, number>()), position = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const activate = useCallback((kind: DouyinKind) => { cache.current.enabled.add(kind); }, [lease]);
  const acceptAction=useCallback((a:PlatformAccount,result:DouyinInteractionResult)=>{
    const id=key(a,'comments');
    if(!mounted.current||cache.current.lease!==lease||result.accountId!==a.id||result.sessionId!==a.connectorSessionId||result.receipt?.state!=='confirmed'||!latest.current.accounts.some(current=>key(current,'comments')===id))return;
    const old=cache.current.entries.get(id);if(!old||!result.records?.length)return;
    const updates=new Map(result.records.filter(row=>typeof row.platformId==='string'&&typeof row.workId==='string'&&typeof row.content==='string'&&old.works.some(work=>work.platformId===row.workId)).map(row=>[(row.workId||'')+'/'+row.platformId,row]));
    const rows=new Map<string,DouyinInteractionRow>();for(const row of old.rows)rows.set((row.workId||'')+'/'+row.platformId,row);for(const [rowId,row]of updates)rows.set(rowId,row);
    if(rows.size>50000)return;
    const values=[...rows.values()];let bytes:number;try{bytes=interactionRowsBytes(values);assertInteractionBudget(cache.current.entries,id,bytes);}catch{return;}
    cache.current.entries.set(id,{...old,rows:values,bytes});
    setSnapshot(previous=>({...previous,lease,entries:new Map(cache.current.entries)}));
  },[lease]);
  const priority = useRef({ lease, account: '', workId: '', kind: null as DouyinKind | null });
  const wake = useRef<() => void>(() => {});
  const requestReplies=useCallback((a:PlatformAccount,root:DouyinInteractionRow)=>{
    const id=key(a,'comments'),entry=cache.current.entries.get(id);
    if(cache.current.lease!==lease||!latest.current.accounts.some(current=>key(current,'comments')===id)||!root.workId||root.parentPlatformId||root.repliesReadState==='complete'||!entry?.rows.some(row=>row.platformId===root.platformId&&row.workId===root.workId&&!row.parentPlatformId))return;
    replyRequests.current.set(id,{workId:root.workId,commentId:root.platformId});cache.current.enabled.add('comments');
    priority.current={lease,account:id,workId:root.workId,kind:'comments'};
    queueMicrotask(()=>wake.current());
  },[lease]);
  const foregroundTurns = useRef(new Map<string,{target:string;count:number}>());
  const refreshRequests = useRef({ lease, ids: new Set<string>() });
  if(refreshRequests.current.lease !== lease) refreshRequests.current = { lease, ids: new Set() };
  const refresh = useCallback((a: PlatformAccount, kind: DouyinKind) => {
    if(cache.current.lease !== lease || !latest.current.accounts.some(current => key(current, kind) === key(a, kind))) return;
    const id = key(a, kind); cache.current.enabled.add(kind);
    refreshRequests.current.ids.add(id);
    priority.current={lease,account:id,workId:priority.current.lease===lease&&priority.current.account===id?priority.current.workId:'',kind};
    queueMicrotask(()=>wake.current());
    const old = cache.current.entries.get(id);
    if(old) cache.current.entries.set(id, {...old, phase: '已请求刷新，已有缓存保留'});
    setSnapshot(previous => ({lease, entries:new Map(cache.current.entries), reading:previous.lease === lease ? previous.reading : '', readings:previous.lease === lease ? previous.readings : []}));
  }, [lease]);
  const prioritize = useCallback((a: PlatformAccount | null | undefined, workId: string, kind: DouyinKind = 'comments') => {
    if(cache.current.lease!==lease)return;
    const chosen={lease,account:a?key(a,kind):'',kind:a===undefined?null:kind,workId:a!==undefined&&kind==='comments'&&/^[1-9]\d{0,18}$/.test(workId)?workId:''},previous=priority.current;
    priority.current=chosen;
    if(previous.lease===lease&&previous.account===chosen.account&&previous.workId===chosen.workId&&previous.kind===chosen.kind)return;
    foregroundTurns.current.clear();
    const entry=a&&latest.current.accounts.some(current=>key(current,kind)===chosen.account)?cache.current.entries.get(chosen.account):undefined;
    // Selection is not a retry permission. A rejected account remains paused;
    // the native/account lane floor and active job lock are never reset.
    if(entry&&!entry.error&&!entry.followerPending&&!(kind==='followers'&&entry.followerPanelSync))cache.current.entries.set(chosen.account,{...entry,nextAt:Math.min(entry.nextAt,Date.now())});
    queueMicrotask(()=>wake.current());
  }, [lease]);
  useEffect(() => {
    const generation = ++epoch.current; let alive = true;
    // Account/session churn must release unreachable payloads and scheduling
    // metadata. Ordinary route changes keep the same keys and pagination.
    const validIds = new Set(accounts.flatMap(a => [key(a,'comments'),key(a,'followers')]));
    const validLanes = new Set(accounts.map(a => [lease,a.id,a.connectorSessionId,a.nativeAccountKey || ''].join('/')));
    retainInteractionKeys(cache.current.entries,validIds);
    retainInteractionKeys(cache.current.hydrated,validIds);
    retainInteractionKeys(pendingFollowerReload.current,validIds);
    retainInteractionKeys(refreshRequests.current.ids,validIds);
    retainInteractionKeys(accountNextAt.current,validLanes);
    retainInteractionKeys(foregroundTurns.current,validLanes);
    if(priority.current.lease!==lease||priority.current.account&&!validIds.has(priority.current.account))priority.current={lease,account:'',workId:'',kind:null};
    // Keep admitted jobs until their own finally releases the lane. Removing
    // an in-flight lane here could admit a second request for the same account.
    replyRequests.current.clear();
    const current = () => alive && generation === epoch.current && cache.current.lease === lease && getUser()?.id === owner && getAuthToken() === token;
    const publish = () => { if (current()) { const readings=[...occupied.current.values()].map(job=>job.target);setSnapshot({ lease, entries: new Map(cache.current.entries), reading:readings[0] || '', readings }); } };
    const reloadFollowerCache=(event:Event)=>{
      if(!current())return;
      const detail=(event as CustomEvent).detail;
      if(detail?.owner!==owner)return;
      const account=latest.current.accounts.find(a=>a.id===detail.accountId&&a.connectorSessionId===detail.sessionId&&a.nativeAccountKey===detail.nativeAccountKey);
      if(!account)return;
      const id=key(account,'followers');pendingFollowerReload.current.add(id);cache.current.hydrated.delete(id);
      const old=cache.current.entries.get(id);
      if(old)cache.current.entries.set(id,{...old,nextAt:0});
      // Native encrypted cache is re-authenticated by the existing cache IPC;
      // the browser event carries no follower fields or continuation proof.
    };
    window.addEventListener('matrix:followers-cache-updated',reloadFollowerCache);
    const applyRefresh = (entry: DouyinEntry, kind: DouyinKind): DouyinEntry => kind==='followers'&&entry.followerPanelSync?{...entry,nextAt:Infinity,error:undefined,phase:'此账号已启用官网分页，可在粉丝管理继续或重新同步；缓存保留'}:({...entry,...(kind==='comments'&&entry.cursor&&!entry.error?{refreshLatest:true}:{cursor:undefined,complete:false,forceHistory:kind==='comments',refreshLatest:kind==='comments'}),refreshFollowers:kind==='followers',followerPending:false,waitingForAccount:false,nextAt:Date.now(),failures:0,recoveries:0,error:undefined,phase:refreshing(kind)});
    const refreshing = (kind: DouyinKind) => kind === 'followers' ? '正在刷新粉丝名单，已有缓存保留' : '正在刷新作品目录，已有缓存保留';
    // A cached result is useful even when old. Never expire displayed data just
    // because a route changes; only process-local continuation proofs expire.
    for (const entry of cache.current.entries.values()) if (entry.cursor && Date.now() - entry.at > 25 * 60 * 1000) { entry.cursor = undefined; entry.complete = false; entry.nextAt = 0; }
    publish();
    const run = async (target: { account: PlatformAccount; kind: DouyinKind; id: string }, lane: string, job: symbol) => {
      const showReading = () => publish();
      showReading();
      let liveRead = false, refreshFollowers = false;
      let entry: DouyinEntry = cache.current.entries.get(target.id) || { rows: [], works: [], complete: false, bytes: 2, at: Date.now(), nextAt: 0, failures: 0, phase: '获取中', newCount: 0 };
      try {
        if (!window.matrixDesktop?.douyinInteractions) throw Error('当前桌面版本尚未接入抖音读取，需要更新');
        if (!cache.current.hydrated.has(target.id)) {
          cache.current.hydrated.add(target.id);
          const saved = await window.matrixDesktop.douyinInteractions({ command: 'cache', accessToken: token, accountId: target.account.id, kind: target.kind });
          if (!current()) return;
          if (!saved.error && saved.fromCache && saved.accountId === target.account.id && saved.sessionId === target.account.connectorSessionId && saved.kind === target.kind && saved.platform === 'douyin' && Array.isArray(saved.records) && Array.isArray(saved.works)) {
            const panel=(saved as DouyinInteractionResult&{followerPanelSync?:DouyinFollowerPanelSync}).followerPanelSync;
            const bytes=interactionRowsBytes(saved.records);assertInteractionBudget(cache.current.entries,target.id,bytes);
            if(saved.works.length>5000)throw Error('本轮达到读取容量上限，已有结果保留，尚未全部读取');
            entry = { ...entry, rows: saved.records, works: saved.works, bytes, complete: panel?.status==='complete'&&saved.complete===true, progress:saved.progress, followerRosterVerified:saved.followerRosterVerified===true,...(panel?{followerPanelSync:panel,nextAt:Infinity,error:undefined,followerPending:false}:{}),baseline: saved.complete, phase: saved.phase || '本机缓存，后台检查更新' };
            cache.current.entries.set(target.id, entry); showReading();
          }
          // Cache restoration is its own short job. Do not let the following
          // slow website call prevent the next account's cache being displayed.
          return;
        }
        if(target.kind==='followers'&&entry.followerPanelSync){
          // This account belongs to the retained website paging controller.
          // Priority may reorder eligible reads, never restart this old lane.
          if(entry.nextAt!==Infinity)cache.current.entries.set(target.id,{...entry,nextAt:Infinity});
          return;
        }
        liveRead = true;
        // A completed historical scan may retain an opaque monitoring cursor.
        // Only explicit refresh/expiry rebuilds it; ordinary polls do not rewind.
        entry = { ...entry };
        const preferred = priority.current;
        // One explicit user refresh may replace a stuck collector, not every
        // background poll/retry. Displayed business rows remain in this entry.
        refreshFollowers = target.kind==='followers' && entry.refreshFollowers===true && !entry.cursor;
        entry.refreshFollowers=false;
        const r = await window.matrixDesktop.douyinInteractions({ accessToken: token, accountId: target.account.id, kind: target.kind, ...(entry.cursor ? { cursor: entry.cursor } : {}),...(refreshFollowers?{refreshFollowers:true}:{}),...(target.kind==='comments'&&entry.refreshLatest&&!entry.pendingReply?{refreshLatest:true}:{}),...(entry.forceHistory&&target.kind==='comments'&&!entry.cursor?{forceHistory:true}:{}), ...(entry.pendingReply?{priorityWorkId:entry.pendingReply.workId,priorityCommentId:entry.pendingReply.commentId}:preferred.lease === lease && preferred.account === target.id && preferred.workId ? { priorityWorkId: preferred.workId } : {}) });
        if (!current()) return;
        if (r.error) throw Error(r.error);
        accountNextAt.current.set(lane, Date.now() + 4500);
        if (r.accountId !== target.account.id || r.sessionId !== target.account.connectorSessionId || r.platform !== 'douyin' || r.kind !== target.kind || !Array.isArray(r.records) || typeof r.complete !== 'boolean' || !r.complete && !r.nextCursor || !r.progress) throw Error('返回账号、作品或分页状态不一致，本页已丢弃');
        if (r.works !== undefined && (!Array.isArray(r.works) || r.works.length > 100 || r.works.some(w => !/^[1-9]\d{0,18}$/.test(w.platformId) || typeof w.title !== 'string' || w.title.length > 1000 || w.readError !== undefined && (typeof w.readError !== 'string' || w.readError.length > 160) || w.readComplete !== undefined && typeof w.readComplete !== 'boolean' || !!w.readError && w.readComplete === true))) throw Error('抖音作品目录结构无效，本页未采用');
        // Status-only polls need no full-history Map/array reconstruction.
        // Keep immutable content references so the visible feed can reuse its
        // projection; real updates and verified membership changes still merge.
        const works = r.works?.length ? new Map(entry.works.map(w => [w.platformId, w])) : undefined; for (const w of r.works || []) works!.set(w.platformId, { ...works!.get(w.platformId), ...w, ...(Object.prototype.hasOwnProperty.call(w,'readError')||Object.prototype.hasOwnProperty.call(w,'readComplete')?{readError:w.readError,readComplete:w.readComplete}:{}) });
        const rows = r.records.length || target.kind==='followers'&&r.complete&&r.followerRosterVerified===true ? new Map<string,DouyinInteractionRow>() : undefined;
        if(rows)for(const row of entry.rows)rows.set((row.workId || '') + '/' + row.platformId,row);
        let bytes = entry.bytes, added = 0;
        for (const row of r.records) {
          if (!isDouyinCommentId(row.platformId, target.kind === 'comments' && row.referenceKind === 'legacy') || row.referenceKind !== undefined && row.referenceKind !== 'legacy' || typeof row.author !== 'string' || typeof row.content !== 'string') throw Error('抖音记录编号或结构无效，本页未采用');
          const id = (row.workId || '') + '/' + row.platformId, previous = rows!.get(id);
          bytes += interactionRowBytes(row) - (previous ? interactionRowBytes(previous) : 0) + (!previous&&rows!.size ? 1 : 0);
          if (!previous) added++; rows!.set(id, row);
        }
        if(r.followerRosterVerified!==undefined&&typeof r.followerRosterVerified!=='boolean'||r.followerRosterVerified===true&&(!r.complete||!Array.isArray(r.currentFollowerIds)))throw Error('粉丝全量核对证明无效，旧记录保留');
        if (target.kind === 'followers' && r.complete && r.followerRosterVerified===true && Array.isArray(r.currentFollowerIds)) {
          if (r.currentFollowerIds.length > 50000 || r.currentFollowerIds.some(id => !/^[1-9]\d{0,18}$/.test(id))) throw Error('粉丝完整名单标识无效，已有记录保留');
          const current = new Set(r.currentFollowerIds);
          for (const [id, row] of rows!) {const updated={...row,isCurrentFollower:current.has(row.platformId),membershipCheckedAt:r.capturedAt};bytes+=interactionRowBytes(updated)-interactionRowBytes(row);rows!.set(id,updated);}
        }
        if ((works?.size??entry.works.length) > 5000 || (rows?.size??entry.rows.length) > 50000 || bytes > 32 * 1024 * 1024) throw Error('本轮达到读取容量上限，已有结果保留，尚未全部读取');
        assertInteractionBudget(cache.current.entries,target.id,bytes);
        // A merged cache may contain a previous partial end state. Only this
        // admitted read's native completion flag can retire the current target.
        const completedReply=entry.pendingReply&&r.replyReadPending===false;
        if(completedReply)entry.pendingReply=undefined;
        const pollDelay=entry.pendingReply?4500:douyinPollDelay(target.kind,r);
        cache.current.entries.set(target.id, { ...entry,forceHistory:false,refreshLatest:false,followerPending:r.followerPending===true,waitingForAccount:false, rows: rows?[...rows.values()]:entry.rows, works: works?[...works.values()]:entry.works, bytes, cursor: r.nextCursor, complete: r.complete, followerRosterVerified:r.followerRosterVerified===true, at: Date.now(), nextAt: Date.now() + pollDelay, failures: 0, recoveries: r.complete ? 0 : entry.recoveries, error: undefined, phase: r.phase || '已同步', progress: r.progress, baseline: entry.baseline || r.complete, newCount: entry.newCount + (entry.baseline && target.kind === 'comments' ? added : 0) });
      } catch (e) {
        if (current()) {
          if (liveRead) accountNextAt.current.set(lane, Date.now() + 15000);
          const error = e instanceof Error ? e.message : '获取失败', busy = /正在读取另一页|正在处理评论|读取过于频繁/.test(error), retryable = interactionCanRetry(error), failures = entry.failures + (busy ? 0 : 1), rescan = interactionNeedsRescan(error), recoveries = (entry.recoveries || 0) + (rescan ? 1 : 0);
          // A new collector has no owner-proven inventory/root references.
          // Retain displayed rows, but rebuild those proofs from official GETs;
          // never reuse a mid-comment cursor against a recreated window.
          // Admission conflicts have not rebuilt anything. Preserve this one
          // user intent until an admitted attempt; platform refusals/timeouts
          // still consume it and do not authorize repeated page replacement.
          cache.current.entries.set(target.id, { ...entry,pendingReply:busy||retryable&&failures<=2&&recoveries<=2?entry.pendingReply:undefined,waitingForAccount:busy, ...(busy && refreshFollowers ? {refreshFollowers:true}:{}), ...(rescan ? { cursor: undefined, complete: false } : {}), at: Date.now(), failures, recoveries, nextAt: Date.now() + (busy ? 15000 : retryable && failures <= 2 && recoveries <= 2 ? 60000 : Infinity), phase: busy ? '等待当前账号的既有读取完成，当前页面优先排队' : interactionStatus(error), error: busy ? entry.error : error });
        }
      } finally {
        if(current() && refreshRequests.current.ids.delete(target.id)) {
          const saved = cache.current.entries.get(target.id);
          if(saved) cache.current.entries.set(target.id, applyRefresh(saved,target.kind));
        }
        if (occupied.current.get(lane)?.job === job) occupied.current.delete(lane);
        showReading();
      }
    };
    const tick = () => {
      if (!current() || latest.current.locked) return;
      for(const [id,target]of replyRequests.current)if(![...occupied.current.values()].some(job=>job.target===id)){
        const entry=cache.current.entries.get(id);replyRequests.current.delete(id);
        if(entry)cache.current.entries.set(id,{...entry,pendingReply:target,error:undefined,failures:0,recoveries:0,nextAt:Date.now(),phase:'已请求优先读取当前评论回复，原分页断点保留'});
      }
      for(const id of pendingFollowerReload.current)if(![...occupied.current.values()].some(job=>job.target===id)){cache.current.hydrated.delete(id);const old=cache.current.entries.get(id);if(old)cache.current.entries.set(id,{...old,nextAt:0});pendingFollowerReload.current.delete(id);}
      for(const id of refreshRequests.current.ids) if(![...occupied.current.values()].some(job=>job.target===id)) {
        const saved=cache.current.entries.get(id);
        if(saved) cache.current.entries.set(id,applyRefresh(saved,id.startsWith('followers/')?'followers':'comments'));
        refreshRequests.current.ids.delete(id);
      }
      const targets = [...cache.current.enabled].flatMap(kind => latest.current.accounts.map(account => ({ account, kind, id: key(account, kind) })));
      const laneFor = (account: PlatformAccount) => [lease, account.id, account.connectorSessionId, account.nativeAccountKey || ''].join('/');
      const isForeground=(id:string)=>priority.current.lease===lease&&(priority.current.account?id===priority.current.account:!!priority.current.kind&&id.startsWith(priority.current.kind+'/'));
      // At most four independent account readers, never two kinds of one account.
      // Rotation keeps a busy or failed account from starving all other lanes.
      // A synchronous skip/failure can release its lane before run returns.
      // Bound every turn independently of occupancy and never read one target
      // twice in it, otherwise a dormant entry can spin without yielding.
      const admitted=new Set<string>();
      while (occupied.current.size < 4 && targets.length && admitted.size < 4) {
        // Leave capacity for a newly selected page/account. Never cancel an
        // admitted website read; former foreground jobs finish in place.
        const backgroundJobs=[...occupied.current.values()].filter(job=>!isForeground(job.target)).length;
        const eligible = Array.from({ length: targets.length }, (_, i) => targets[(position.current + i) % targets.length]).filter(t => {
          const lane = laneFor(t.account);
          const entry=cache.current.entries.get(t.id),hydrated=cache.current.hydrated.has(t.id);
          return !admitted.has(t.id)&&!(hydrated&&t.kind==='followers'&&entry?.followerPanelSync)&&!occupied.current.has(lane) && (entry?.nextAt || 0) <= Date.now() &&
            (!cache.current.hydrated.has(t.id) || (accountNextAt.current.get(lane) || 0) <= Date.now()) &&
            (isForeground(t.id)||backgroundJobs<2);
        });
        let target = eligible.find(t => priority.current.lease === lease && t.id === priority.current.account) || eligible.find(t=>priority.current.lease===lease&&t.kind===priority.current.kind) || eligible[0];
        if (!target) break;
        // Foreground gets three turns, then an eligible sibling kind gets one.
        // Priority never permanently starves background followers/comments.
        const turns=foregroundTurns.current.get(laneFor(target.account));
        if(turns?.target===target.id&&turns.count>=3)target=eligible.find(t=>t.account.id===target.account.id&&t.kind!==target.kind)||target;
        position.current = (targets.indexOf(target) + 1) % targets.length;
        const lane = laneFor(target.account), job = Symbol();
        const oldTurns=foregroundTurns.current.get(lane);
        foregroundTurns.current.set(lane,{target:target.id,count:oldTurns?.target===target.id?oldTurns.count+1:1});
        admitted.add(target.id);
        occupied.current.set(lane, { job, target: target.id });
        void run(target, lane, job);
      }
    };
    wake.current=tick;
    void tick(); const timer = window.setInterval(() => void tick(), 1000);
    return () => { alive = false; epoch.current++; wake.current=()=>{}; window.clearInterval(timer);window.removeEventListener('matrix:followers-cache-updated',reloadFollowerCache); if(!mounted.current){cache.current.entries.clear();cache.current.hydrated.clear();pendingFollowerReload.current.clear();replyRequests.current.clear();refreshRequests.current.ids.clear();accountNextAt.current.clear();foregroundTurns.current.clear();} };
  }, [lease, signature]);
  const state = snapshot.lease === lease ? snapshot : { entries: new Map<string, DouyinEntry>(), reading: '', readings: [] };
  return <Context.Provider value={{ activate, refresh, requestReplies, prioritize, acceptAction, entry: (a, kind) => state.entries.get(key(a, kind)), reading: state.reading, readings: state.readings }}>{children}</Context.Provider>;
}
export function useDouyinInteractionData(kind: DouyinKind) { const data = useContext(Context); useEffect(() => data.activate(kind), [kind, data.activate]); return data; }
// Passive consumers must not activate collectors or change page priority.
export function useDouyinInteractionCache() { return useContext(Context); }
export const douyinInteractionKey = key;
