import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type SetStateAction } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Globe2, Home, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import type { PlatformAccount, PlatformType } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { officialOperation } from '@shared/official-operations';
import { PageActionPanel } from './PageActionPanel';
import { createAutoBinding } from './auto-binding';
import { DouyinCommentMonitorProvider } from './DouyinCommentMonitor';
import { DouyinInboxProvider } from './DouyinInbox';
import { EdgeOfficialBrowser } from './EdgeOfficialBrowser';
import { AdditionalPlatformWorkspaces } from './AdditionalPlatformWorkspaces';
import { foregroundTabId, workspaceIntent, workspaceScope, type WorkspaceIntent } from './workspace-scope';
import { AccountManagerSidebar } from './AccountManagerSidebar';
import { AccountAvatar } from './AccountAvatar';
import { PlatformLogo } from './PlatformLogo';
import { recordAccountObservation, recordLoginObservation, useAccountAvailabilityCounts } from './account-observations';
import { useAccountInspection } from './use-account-inspection';
import { observeOfficialDocumentLoading } from './official-document-loading';
import { StartupInitialization } from './StartupInitialization';
import { officialLoginUrl } from '@shared/account-availability';
import { accountSites, accountSiteForUrl, type AccountSite } from '@shared/account-sites';
import { AccountSiteNavigation } from './AccountSiteNavigation';
import { DouyinFollowerSessions } from './DouyinFollowerSessions';
import { AccountOperationsRuntime } from './AccountOperationsRuntime';
import { loadPublishAccounts } from './publish-preferences';
import { useOwnerRequest } from './use-owner-request';
import { useWorkspaceIdentity } from './WorkspaceUiState';

export const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
const EMPTY_ACCOUNTS: PlatformAccount[] = [];
type Intent = WorkspaceIntent;
type TaskLink = { id: string; title: string; kind: 'comments' | 'withdraw';attemptId?:string };
type PublishPreparation = { media?: MatrixMediaSelection; title: string; body: string };
type WorkspaceTab = MatrixDesktopSession & { id: string; scope: string; parentId?: string; pageTitle?: string; nickname: string; binding: boolean; bindingGroupId?: string; accountId?: string; intent: Intent; draftText?: string; preparation?: PublishPreparation; initialUrl?: string; background?: boolean; task?: TaskLink };
interface WorkspaceContext {
  tabs: WorkspaceTab[];
  activeId: string | null;
  visible: boolean;
  scope: string | null;
  accounts: PlatformAccount[];
  loadingAccounts: boolean;
  accountError: string;
  refreshAccounts(): Promise<void>;
  openAccount(account: PlatformAccount, intent?: Intent, reconnect?: boolean, draftText?: string, preparation?: PublishPreparation, background?: boolean, signal?: AbortSignal): Promise<boolean>;
  bindAccount(platform: PlatformType, groupId?: string): Promise<void>;
  show(intent?: Intent): void;
  hide(): void;
  select(id: string): void;
  selectAccount(id: string): void;
  openPage(sourceId: string, url: string, draftText?: string): void;
  openAccountSite(sourceId: string, site: AccountSite): void;
  openDouyinProfile(accountId:string,url:string):Promise<boolean>;
  openAccountWork(accountId:string,url:string,draftText:string):Promise<boolean>;
  close(id: string): void;
  update(id: string, patch: Partial<WorkspaceTab>): void;
  registerPublisher(accountId: string, publisher: Publisher, background?: boolean): () => void;
  publisher(accountId: string, background?: boolean): Publisher | undefined;
  registerPage(id: string, input: () => MatrixPageActionInput): () => void;
  registerInteractionSource(accountId: string, sessionId: string, kind: 'messages', input: () => MatrixPageActionInput): () => void;
  page(accountId: string): (() => MatrixPageActionInput) | undefined;
  interactionPage(accountId: string, kind: 'comments' | 'messages' | 'followers'): (() => MatrixPageActionInput) | undefined;
  lockJobs(locked: boolean): void;
  jobsLocked: boolean;
  linkTask(accountId: string, task: TaskLink): void;
}
type Publisher = { input(): MatrixPageActionInput; open(mediaType: 'video' | 'image', fresh?: boolean, signal?: AbortSignal): Promise<void> };
const Context = createContext<WorkspaceContext | null>(null);
export function useOfficialWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('账号操作面板未初始化');
  return value;
}

export function OfficialWorkspaceProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scope = workspaceScope(pathname);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const [panels, setPanels] = useState<Record<string, { activeId: string | null; visible: boolean }>>({});
  const activeId = scope ? panels[scope]?.activeId || null : null;
  const visible = Boolean(scope && (scope === '/accounts' || panels[scope]?.visible));
  const reveal = (ownerScope: string, id: string | null) => setPanels(current => ({ ...current, [ownerScope]: { activeId: id, visible: true } }));
  const accountLease = useWorkspaceIdentity();
  const [accountSnapshot, setAccountSnapshot] = useState<{lease:string;items:PlatformAccount[]}>({lease:'',items:[]});
  const accounts = accountSnapshot.lease === accountLease ? accountSnapshot.items : EMPTY_ACCOUNTS;
  const setAccounts = useCallback((next: SetStateAction<PlatformAccount[]>) => {
    if (!accountLease || JSON.stringify([getUser()?.id, getAuthToken()]) !== accountLease) return;
    setAccountSnapshot(current => {
      const previous=current.lease===accountLease ? current.items : [];
      return {lease:accountLease,items:typeof next==='function' ? next(previous) : next};
    });
  }, [accountLease]);
  const accountsRef=useRef(accounts);accountsRef.current=accounts;
  const startupAccount=useCallback((account:PlatformAccount)=>{setAccounts(current=>current.map(item=>item.id===account.id?account:item));setTabs(current=>current.map(tab=>tab.accountId===account.id?{...tab,nickname:account.nickname||tab.nickname}:tab));},[setAccounts]);
  useEffect(()=>{const updated=(event:Event)=>{const detail=(event as CustomEvent<{ownerId:string;account:PlatformAccount}>).detail;if(detail?.ownerId===getUser()?.id&&accountsRef.current.some(account=>account.id===detail.account?.id&&account.connectorSessionId===detail.account.connectorSessionId))startupAccount(detail.account);};window.addEventListener('matrix:account-profile-updated',updated);return()=>window.removeEventListener('matrix:account-profile-updated',updated);},[startupAccount]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountError, setAccountError] = useState('');
  const beginAccountRequest = useOwnerRequest();
  const publishers = useRef(new Map<string, Publisher>());
  const pages = useRef(new Map<string, () => MatrixPageActionInput>());
  const interactionSources = useRef(new Map<string, { sessionId: string; input: () => MatrixPageActionInput }>());
  const registerInteractionSource = useCallback((accountId: string, sessionId: string, kind: 'messages', input: () => MatrixPageActionInput) => {
    const key = `${accountId}:${kind}`, source = { sessionId, input };
    interactionSources.current.set(key, source);
    return () => { if (interactionSources.current.get(key) === source) interactionSources.current.delete(key); };
  }, []);
  const registerPage = useCallback((id: string, input: () => MatrixPageActionInput) => {
    pages.current.set(id, input);
    return () => { if (pages.current.get(id) === input) pages.current.delete(id); };
  }, []);
  const rememberedPages = useRef(new Map<string, string>());
  useEffect(() => window.matrixDesktop?.onDouyinWorkflowProgress?.(progress => {
    const page = [...pages.current].find(([, input]) => { try { return input().webContentsId === progress.webContentsId; } catch { return false; } });
    const tab = page && tabsRef.current.find(item => item.id === page[0]);
    // Progress from another module is a notification, not a navigation request.
    if (tab && tab.scope === scopeRef.current) reveal(tab.scope, tab.id);
    toast.info(progress.message);
  }), []);
  const [jobsLocked, lockJobs] = useState(false);
  const registerPublisher = useCallback((accountId: string, publisher: Publisher, background = false) => {
    const key = accountId + (background ? ':job' : '');
    publishers.current.set(key, publisher);
    return () => { if (publishers.current.get(key) === publisher) publishers.current.delete(key); };
  }, []);
  const refreshAccounts = useCallback(async () => {
    const request = beginAccountRequest();
    if (!request.authorized) { request.finish(); setLoadingAccounts(false); setAccountError('请登录后读取账号'); return; }
    setLoadingAccounts(true);
    setAccountError('');
    try {
      const result = await loadPublishAccounts({ signal: request.signal });
      if (request.current()) setAccounts(result);
    } catch { if (request.current()) setAccountError('账号加载失败，原列表保留，请重试'); }
    finally { request.finish(); if (request.current()) setLoadingAccounts(false); }
  }, [beginAccountRequest,setAccounts]);
  useEffect(() => { if (visible) void refreshAccounts(); }, [visible, refreshAccounts]);
  useEffect(() => {
    const refresh = () => void refreshAccounts();
    window.addEventListener('matrix:accounts-updated', refresh);
    return () => window.removeEventListener('matrix:accounts-updated', refresh);
  }, [refreshAccounts]);

  const prepare = async (platform: PlatformType, sessionId: string | undefined, nickname: string, binding: boolean, intent: Intent, accountId?: string, draftText?: string, preparation?: PublishPreparation, background = false, bindingGroupId?: string, signal?: AbortSignal) => {
    if (signal?.aborted) return false;
    const ownerScope = background ? '/publish/tasks' : scopeRef.current;
    if (!ownerScope || (binding && ownerScope !== '/accounts')) {
      toast.info(binding ? '请到账号管理添加或重新授权账号' : '请进入对应功能模块操作');
      return false;
    }
    if (!window.matrixDesktop?.isDesktop) {
      toast.info('请使用远效桌面版打开内嵌账号操作面板');
      return false;
    }
    try {
      const prepared = await window.matrixDesktop.preparePlatformLogin(platform, sessionId);
      if (signal?.aborted) return false;
      if ('error' in prepared) throw new Error(prepared.error);
      const id = background ? `${platform}-${prepared.sessionId}-job` : foregroundTabId(platform, prepared.sessionId, ownerScope);
      const tab: WorkspaceTab = { ...prepared, id, scope: ownerScope, nickname, binding, bindingGroupId, intent, accountId, draftText, preparation, background, initialUrl: !binding && intent !== 'manage' ? officialOperation(platform, intent).url : prepared.url };
      setTabs(current => current.some(item => item.id === id)
        ? current.map(item => item.id === id ? { ...item, intent, task: undefined, binding: item.binding || binding, ...(draftText !== undefined ? { draftText } : {}), ...(preparation ? { preparation } : {}) } : item)
        : [...current, tab]);
      if (!background) reveal(ownerScope, !binding ? rememberedPages.current.get(id) || id : id);
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : '无法打开官方页面'); return false; }
  };
  const openAccount = async (account: PlatformAccount, intent: Intent = workspaceIntent(scope), reconnect = false, draftText?: string, preparation?: PublishPreparation, background = false, signal?: AbortSignal) => {
    if (!account.connectorSessionId) {
      toast.info('该账号通过 API 授权绑定，请在官方页面另行登录后绑定本机工作区');
      return false;
    }
    const missingNickname = !account.nickname || account.nickname === `${platformLabels[account.platform]}账号` || account.nickname === '未命名账号';
    return prepare(account.platform, account.connectorSessionId, account.nickname || platformLabels[account.platform], reconnect || missingNickname, intent, account.id, draftText, preparation, background, undefined, signal);
  };
  const close = (id: string) => {
    const currentTabs = tabsRef.current;
    if (jobsLocked && currentTabs.some(tab => tab.id === id && tab.background)) { toast.info('发布任务正在使用该页面，请先停止后续任务'); return; }
    const closing = currentTabs.find(tab => tab.id === id);
    if (!closing) return;
    const remaining = currentTabs.filter(tab => tab.id !== id && tab.parentId !== id);
    tabsRef.current = remaining;
    setTabs(remaining);
    for (const [root, page] of rememberedPages.current) if (root === id || page === id) rememberedPages.current.delete(root);
    if (closing) setPanels(current => Object.fromEntries(Object.entries(current).map(([ownerScope, panel]) => [ownerScope,
      panel.activeId === id || currentTabs.find(tab => tab.id === panel.activeId)?.parentId === id
        ? { ...panel, activeId: closing.parentId || remaining.filter(tab => !tab.background && tab.scope === ownerScope).at(-1)?.id || null }
        : panel])));
  };
  const select = (id: string) => {
    const tab = tabsRef.current.find(item => item.id === id); if (!tab) return;
    // Explicit task-page selection goes to task records; foreground tabs stay in their owner module.
    if (tab.background) { reveal('/publish/tasks', id); if (scopeRef.current !== '/publish/tasks') navigate('/publish/tasks'); }
    else if (tab.scope === scopeRef.current) { rememberedPages.current.set(tab.parentId || tab.id, tab.id); reveal(tab.scope, id); }
  };
  const openPage = (sourceId: string, url: string, draftText?: string) => {
    const current = tabsRef.current, source = current.find(tab => tab.id === sourceId); if (!source) return;
    if (source.background) { toast.info('后台发布页请求打开新页面，请先处理当前任务；原发布页保持不变'); return; }
    const parentId = source.parentId || source.id;
    if (!current.some(tab => tab.id === parentId)) return;
    if (current.filter(tab => tab.id === parentId || tab.parentId === parentId).length >= 12) { toast.info('该账号最多同时打开 12 个页面，请先关闭不用的页面'); return; }
    const id = `${parentId}-page-${crypto.randomUUID()}`;
    // Reserve the page immediately: multiple popup events in one render cannot exceed the cap.
    tabsRef.current = [...current, { ...source, id, parentId, initialUrl: url, pageTitle: '新页面', binding: false, draftText, preparation: undefined, task: undefined }];
    setTabs(tabsRef.current);
    rememberedPages.current.set(parentId, id); reveal(source.scope, id);
  };
  const bindAccount = async (platform: PlatformType, groupId?: string) => { await prepare(platform, undefined, `登录${platformLabels[platform]}`, true, 'manage', undefined, undefined, undefined, false, groupId); };
  const openAccountSite = (sourceId: string, site: AccountSite) => {
    if (site !== 'front' && site !== 'manage') return;
    const source = tabsRef.current.find(tab => tab.id === sourceId);
    if (!source || source.scope !== '/accounts' || scopeRef.current !== '/accounts' || source.binding || source.background || !source.accountId) return;
    const rootId = source.parentId || source.id, url = accountSites[source.platform][site];
    // Reuse an already-open destination. Selecting never navigates an existing
    // page, so unsaved official forms and other modules remain untouched.
    const existing = tabsRef.current.find(tab => (tab.id === rootId || tab.parentId === rootId) &&
      tab.sessionId === source.sessionId && tab.accountId === source.accountId &&
      (site === 'manage' ? !tab.parentId : tab.initialUrl === url));
    if (existing) select(existing.id); else openPage(source.id, url);
  };
  const openDouyinProfile=async(accountId:string,url:string)=>{
    const account=accountsRef.current.find(item=>item.id===accountId),owner=getUser()?.id,token=getAuthToken();
    try{
      const target=new URL(url);
      if(!owner||!token||!account||account.platform!=='douyin'||!account.connectorSessionId||!account.nativeAccountKey||target.origin!=='https://www.douyin.com'||target.username||target.password||target.search||target.hash||!/^\/user\/(?:MS4w[A-Za-z0-9_-]{1,256}|[1-9]\d{0,18})\/?$/.test(target.pathname))throw Error('粉丝主页或所属账号尚未核验，未打开其他浏览器');
      const binding=JSON.stringify([account.id,account.connectorSessionId,account.nativeAccountKey]),rootId=foregroundTabId('douyin',account.connectorSessionId,'/accounts');
      const current=()=>getUser()?.id===owner&&getAuthToken()===token&&accountsRef.current.some(item=>JSON.stringify([item.id,item.connectorSessionId,item.nativeAccountKey])===binding);
      const findRoot=()=>tabsRef.current.find(tab=>tab.id===rootId&&tab.scope==='/accounts'&&tab.accountId===account.id&&tab.sessionId===account.connectorSessionId&&!tab.binding&&!tab.background&&!tab.parentId);
      let source=findRoot();
      if(!source){
        if(!window.matrixDesktop?.isDesktop)throw Error('请使用远效桌面版查看账号内官方主页');
        const prepared=await window.matrixDesktop.preparePlatformLogin('douyin',account.connectorSessionId);
        if(!current())throw Error('账号绑定已变化，主页未打开');
        if('error' in prepared)throw Error(prepared.error);
        if(prepared.platform!=='douyin'||prepared.sessionId!==account.connectorSessionId||typeof prepared.partition!=='string'||!prepared.partition.startsWith('persist:'))throw Error('官方页面会话与所属账号不一致，未打开');
        source=findRoot();
        if(!source){
          if(tabsRef.current.some(tab=>tab.id===rootId))throw Error('该账号官方页面仍在绑定中，请先在账号管理完成');
          source={...prepared,id:rootId,scope:'/accounts',accountId:account.id,nickname:account.nickname||'抖音账号',binding:false,intent:'manage',initialUrl:prepared.url};
          tabsRef.current=[...tabsRef.current,source];setTabs(tabsRef.current);
        }
      }
      if(!current())throw Error('账号绑定已变化，主页未打开');
      const existing=tabsRef.current.find(tab=>tab.parentId===rootId&&tab.accountId===account.id&&tab.sessionId===source.sessionId&&tab.partition===source.partition&&tab.initialUrl===target.href);
      if(existing){rememberedPages.current.set(rootId,existing.id);reveal('/accounts',existing.id);}
      else{if(tabsRef.current.filter(tab=>tab.id===rootId||tab.parentId===rootId).length>=12)throw Error('该账号已打开12个页面，请先关闭不用的页面');openPage(source.id,target.href);}
      // New child, same bound partition. Keep the verified root and every
      // publisher/other feature page untouched, then show its owning module.
      if(scopeRef.current!=='/accounts')navigate('/accounts');
      return true;
    }catch(error){toast.error(error instanceof Error?error.message:'无法打开账号内官方主页');return false;}
  };
  const openAccountWork=async(accountId:string,url:string,draftText:string)=>{
    const account=accountsRef.current.find(a=>a.id===accountId),owner=getUser()?.id,token=getAuthToken(),ownerScope='/engage/account-operations';
    try{
      const target=new URL(url);
      if(scopeRef.current!==ownerScope||!owner||!token||jobsLocked||!account||account.platform!=='douyin'||!account.connectorSessionId||!account.nativeAccountKey||target.origin!=='https://www.douyin.com'||target.username||target.password||target.search||target.hash||!/^\/video\/[1-9]\d{0,18}\/?$/.test(target.pathname)||!draftText.trim()||draftText.length>500)throw Error('请选择已绑定抖音账号、完整作品链接及1–500字评论；发布任务进行中请稍后');
      const binding=JSON.stringify([account.id,account.connectorSessionId,account.nativeAccountKey]);
      const current=()=>getUser()?.id===owner&&getAuthToken()===token&&scopeRef.current===ownerScope&&accountsRef.current.some(a=>JSON.stringify([a.id,a.connectorSessionId,a.nativeAccountKey])===binding);
      const rootId=foregroundTabId('douyin',account.connectorSessionId,ownerScope);
      let source=tabsRef.current.find(t=>t.id===rootId&&t.accountId===account.id&&!t.binding&&!t.background);
      if(!source){const api=window.matrixDesktop;if(!api)throw Error('请使用远效桌面版');const prepared=await api.preparePlatformLogin('douyin',account.connectorSessionId);if('error' in prepared)throw Error(prepared.error);if(!current()||prepared.sessionId!==account.connectorSessionId||prepared.platform!=='douyin'||prepared.partition!==`persist:matrix-douyin-${account.connectorSessionId}`)throw Error('账号已切换，未打开作品');source={...prepared,id:rootId,scope:ownerScope,accountId:account.id,nickname:account.nickname||'抖音账号',binding:false,intent:'comments',initialUrl:prepared.url};tabsRef.current=[...tabsRef.current,source];setTabs(tabsRef.current);}
      if(!current())throw Error('账号已切换，未打开作品');
      const existing=tabsRef.current.find(t=>t.parentId===rootId&&t.initialUrl===target.href&&t.accountId===account.id);
      // Existing official drafts stay untouched. Changing text never authorizes
      // a new submit and never overwrites an already-open form.
      if(existing){select(existing.id);toast.info('已打开原作品页，原有草稿保留；新文案请在核对后自行填写');}
      else openPage(source.id,target.href,draftText);
      return true;
    }catch(error){toast.error(error instanceof Error?error.message:'无法打开作品');return false;}
  };
  return <Context.Provider value={{ tabs, activeId, visible, scope, accounts, loadingAccounts, accountError, refreshAccounts, openAccount,
    registerPublisher, publisher: (id, background = false) => publishers.current.get(id + (background ? ':job' : '')), lockJobs, jobsLocked,
    registerPage, registerInteractionSource, page: accountId => {
      const owned = tabsRef.current.filter(tab => tab.scope === scope && tab.accountId === accountId && !tab.background && !tab.binding);
      const root = owned.find(tab => !tab.parentId);
      const page = owned.find(tab => tab.id === activeId) || owned.find(tab => tab.id === rememberedPages.current.get(root?.id || '')) || root;
      return page ? pages.current.get(page.id) : undefined;
    },
    interactionPage: (accountId, kind) => {
      const source = interactionSources.current.get(`${accountId}:${kind}`);
      if (source) return source.input;
      // Read only this feature's existing guests. Never activate a browser,
      // touch a publisher, or reuse account-management/another kind's page.
      const scopes = kind === 'comments' ? ['/engage/comments', '/engage/comments-agg'] : kind === 'messages' ? ['/engage/messages', '/engage/messages-agg'] : ['/engage/followers'];
      const owned = tabsRef.current.filter(tab => tab.accountId === accountId && !tab.background && !tab.binding && scopes.includes(tab.scope) && pages.current.has(tab.id));
      const page = owned.find(tab => tab.id === activeId) || [...owned].reverse().find(tab => tab.parentId) || owned[0];
      return page ? pages.current.get(page.id) : undefined;
    },
    linkTask: (accountId, task) => setTabs(current => current.map(tab => tab.scope === scope && tab.accountId === accountId && !tab.background && !tab.parentId ? { ...tab, task } : tab)),
    bindAccount,
    show: intent => {
      if (!scope) return;
      const selected = tabs.find(tab => tab.id === activeId && !tab.background && tab.scope === scope);
      // Reopening a module never mutates a browser from another module.
      if (selected && intent) setTabs(current => current.map(tab => tab.id === selected.id ? { ...tab, intent } : tab));
      reveal(scope, selected?.id || tabs.filter(tab => !tab.background && tab.scope === scope).at(-1)?.id || null);
    }, hide: () => { if (scope) setPanels(current => ({ ...current, [scope]: { activeId: scope === '/accounts' ? null : activeId, visible: scope === '/accounts' } })); },
    select, selectAccount: id => select(rememberedPages.current.get(id) || id), openPage, openAccountSite, openDouyinProfile, openAccountWork, close,
    update: (id, patch) => setTabs(current => current.map(tab => tab.id === id ? { ...tab, ...patch } : tab.parentId === id && patch.accountId ? { ...tab, accountId: patch.accountId, nickname: patch.nickname || tab.nickname } : tab)),
  }}><DouyinInboxProvider accounts={accounts}><DouyinCommentMonitorProvider><DouyinFollowerSessions accounts={accounts} blocked={jobsLocked}><AccountOperationsRuntime accounts={accounts}/>{children}<StartupInitialization onList={setAccounts} onAccount={startupAccount} paused={jobsLocked}/><BackgroundPublishPages /><AdditionalPlatformWorkspaces bindCore={bindAccount} /></DouyinFollowerSessions></DouyinCommentMonitorProvider></DouyinInboxProvider></Context.Provider>;
}

// Keep guests mounted and laid out even when the user visits another module (including docs).
function BackgroundPublishPages() {
  const workspace = useOfficialWorkspace();
  return <>{workspace.tabs.filter(tab => tab.background).map(tab => {
    const shown = workspace.visible && workspace.activeId === tab.id;
    return <section key={tab.id} aria-label={`${tab.nickname}后台发布页`} aria-hidden={!shown} style={{ position: 'fixed', top: shown ? 60 : 0, left: shown ? 16 : -20000, width: shown ? 'calc(100vw - 32px)' : 1280, height: shown ? 'calc(100vh - 76px)' : 900, zIndex: 45, background: 'var(--background, white)', display: 'flex', flexDirection: 'column', border: '1px solid #ddd' }}>
      <div className="flex items-center justify-between bg-background p-3"><strong>{tab.nickname} · 发布任务页面{workspace.jobsLocked ? '（处理中，请勿修改）' : ''}</strong><Button variant="outline" onClick={workspace.hide}>收起，继续其他操作</Button></div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}><OfficialBrowser tab={tab} active={tab.engine === 'webview2' ? shown && !workspace.jobsLocked : true} />{workspace.jobsLocked && <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} aria-label="任务处理中，暂不可手动修改">{tab.engine === 'webview2' && <p className="p-4 text-sm">视频号任务正在后台处理；结束后可查看保留的官方页面。</p>}</div>}</div>
    </section>;
  })}</>;
}

export function WorkspaceTabs() {
  const workspace = useOfficialWorkspace();
  const selected = workspace.tabs.find(tab => tab.id === workspace.activeId);
  const rootId = selected?.parentId || selected?.id;
  if (!workspace.visible) return null;
  return <div className="matrix-workspace-tabs" role="tablist" aria-label="工作区标签">
    <button onClick={workspace.hide}><ArrowLeft size={14} />{workspace.scope === '/accounts' ? '账号概览' : '收起官方页面'}</button>
    {workspace.tabs.filter(tab => tab.scope === workspace.scope && !tab.parentId && !tab.background).map(tab => <div className={`matrix-account-tab ${rootId === tab.id ? 'is-active' : ''}`} key={tab.id}>
      <button role="tab" aria-selected={rootId === tab.id} onClick={() => workspace.selectAccount(tab.id)}><AccountAvatar size="xs" status account={workspace.accounts.find(a => a.id === tab.accountId) || { nickname: tab.nickname, platform: tab.platform, authStatus: 'pending' }} /><span>{tab.nickname}</span></button>
      <button className="matrix-tab-close" aria-label={`关闭${tab.nickname}`} onClick={() => workspace.close(tab.id)}><X size={13} /></button>
    </div>)}
  </div>;
}
function AccountPageTabs() {
  const workspace = useOfficialWorkspace(), current = workspace.tabs.find(tab => tab.id === workspace.activeId);
  if (!current || current.background) return null;
  const rootId = current.parentId || current.id;
  return <div className="matrix-account-page-tabs" role="tablist" aria-label="当前账号的页面">{workspace.tabs.filter(tab => tab.id === rootId || tab.parentId === rootId).map(tab => <div key={tab.id} className={tab.id === current.id ? 'is-active' : ''}><button role="tab" aria-selected={tab.id === current.id} title={tab.pageTitle || platformLabels[tab.platform] + '官方后台'} onClick={() => workspace.select(tab.id)}>{tab.pageTitle || platformLabels[tab.platform] + '官方后台'}</button>{tab.parentId && <button aria-label={`关闭页面 ${tab.pageTitle || '新页面'}`} onClick={() => workspace.close(tab.id)}><X size={13} /></button>}</div>)}<button aria-label="在当前账号中新建页面" title="新建官方首页" onClick={() => workspace.openPage(current.id, current.url)}><Plus size={15} /></button></div>;
}
export function OfficialActionButton({ intent, children }: { intent: Intent; children: ReactNode }) {
  const workspace = useOfficialWorkspace();
  return <Button variant="outline" onClick={() => workspace.show(intent)}><Globe2 size={15} />{children}</Button>;
}
function AccountPicker() {
  const workspace = useOfficialWorkspace();
  const tab = workspace.tabs.find(item => item.id === workspace.activeId);
  return <div className="matrix-context-account"><label htmlFor="matrix-context-account">当前账号</label><select id="matrix-context-account" value={tab?.accountId || ''} onChange={event => { const account = workspace.accounts.find(item => item.id === event.target.value); if (account) void workspace.openAccount(account); }}><option value="">选择已绑定的个人账号</option>{workspace.accounts.filter(account => account.connectorSessionId).map(account => <option key={account.id} value={account.id}>{platformLabels[account.platform]} · {account.nickname}</option>)}</select></div>;
}
function PlatformMark({ platform, small = false }: { platform: PlatformType; small?: boolean }) {
  return <span className={`matrix-platform-mark ${small ? 'small' : ''}`}><PlatformLogo platform={platform} size={small ? 16 : 28} /></span>;
}

export function OfficialWorkspaceDeck() {
  const workspace = useOfficialWorkspace();
  const availability=useAccountAvailabilityCounts(workspace.accounts);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlatformType | 'all'>('all');
  const filtered = workspace.accounts.filter(account => (filter === 'all' || account.platform === filter) && `${account.nickname || ''} ${account.accountRemark || ''} ${account.groupName || ''}`.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(filtered.map(account => account.groupName || '默认分组'))];
  const accountManagement = workspace.scope === '/accounts';
  const foregroundVisible = workspace.visible && !workspace.tabs.find(tab => tab.id === workspace.activeId)?.background;
  return <section className="matrix-official-deck" hidden={!foregroundVisible} aria-label="当前模块官方页面" data-workspace-scope={workspace.scope || ''}>
    {accountManagement ? <AccountManagerSidebar /> : <aside className="matrix-account-rail">
      <div className="matrix-rail-actions"><Button size="sm" variant="outline" onClick={workspace.hide}>{accountManagement ? '返回账号列表' : '收起官方页面'}</Button><button aria-label="刷新账号" title="刷新账号" onClick={() => void workspace.refreshAccounts()}><RefreshCw size={16} className={workspace.loadingAccounts ? 'animate-spin' : ''} /></button></div>
      <div className="matrix-account-search"><Search size={14} /><input aria-label="搜索账号" placeholder="搜索昵称 / 备注 / 分组" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="matrix-platform-filters"><button onClick={() => setFilter('all')} className={filter === 'all' ? 'is-active' : ''}>全部</button>{(Object.keys(platformLabels) as PlatformType[]).map(platform => <button key={platform} onClick={() => setFilter(platform)} className={filter === platform ? 'is-active' : ''}>{platformLabels[platform]}</button>)}</div>
      <div className="matrix-account-list">
        {workspace.accountError && <button className="matrix-account-error" onClick={() => void workspace.refreshAccounts()}>{workspace.accountError}</button>}
        {groups.map(group => <div key={group}><div className="matrix-group-label">{group}<span>{filtered.filter(account => (account.groupName || '默认分组') === group).length}</span></div>{filtered.filter(account => (account.groupName || '默认分组') === group).map(account => <button key={account.id} className={`matrix-rail-account ${workspace.tabs.find(tab => tab.id === workspace.activeId)?.accountId === account.id ? 'is-active' : ''}`} onClick={() => void workspace.openAccount(account)}><PlatformMark platform={account.platform} /><span><strong>{account.nickname || '未命名账号'}</strong><small>{platformLabels[account.platform]} · {account.accountRemark || '官方后台'}</small></span><i className={account.authStatus === 'authorized' ? 'online' : ''} /></button>)}</div>)}
        {!filtered.length && !workspace.loadingAccounts && !workspace.accountError && <div className="matrix-rail-empty">{workspace.accounts.length ? '没有匹配的账号' : '请先到账号管理绑定账号'}</div>}
      </div>
    </aside>}
    <div className="matrix-browser-area">
      <WorkspaceTabs />
      {!workspace.activeId && <AccountPicker />}
      <AccountPageTabs />
      {!workspace.activeId && <div className="matrix-workspace-welcome"><span className="matrix-welcome-icon"><Globe2 size={32} /></span><span className="matrix-eyebrow">{accountManagement ? 'ACCOUNT WORKSPACE' : 'OFFICIAL WORKSPACE'}</span><h1>{accountManagement ? '账号管理，一个工作区就够了' : '选择已绑定账号'}</h1><p>{accountManagement ? '账号状态自动后台刷新，无需逐个打开核验。拖动账号到分组，整理自己的账号矩阵。' : '当前官方页面只用于本功能，切换模块不会重载或关闭已打开的页面。'}</p>{accountManagement ? <div className="matrix-account-workspace-summary"><span><strong>{workspace.accounts.length}</strong>已绑定账号</span><span><strong>{availability.normal}</strong>最近状态正常</span></div> : <Button asChild variant="outline"><Link to="/accounts" onClick={workspace.hide}>前往账号管理</Link></Button>}<small>新绑定账号加入默认分组 · 登录会话保存在本机 · 仅登录确实失效时需要本人重新登录</small></div>}
      {workspace.tabs.filter(tab => !tab.background).map(tab => <OfficialBrowser key={tab.id} tab={tab} active={foregroundVisible && tab.scope === workspace.scope && tab.id === workspace.activeId} />)}
    </div>
  </section>;
}

const intentInfo: Record<Intent, { label: string; instruction: string }> = {
  manage: { label: '账号后台', instruction: '在官方后台查看与管理当前账号。' },
  publish: { label: '发布内容', instruction: '在官方页面选择内容发布，上传素材并确认发表。这里的草稿辅助只复制文案。' },
  comments: { label: '评论回复', instruction: '在官方页面打开评论管理，选择评论并提交回复。' },
  messages: { label: '私信消息', instruction: '在官方页面打开消息中心，选择联系人并发送消息。' },
  withdraw: { label: '下架作品', instruction: '核对准确的本人作品后，使用官方下架或私密设置；不是删除任务记录。' },
};

function OfficialBrowser({ tab, active }: { tab: WorkspaceTab; active: boolean }) {
  const workspace = useOfficialWorkspace();
  if (tab.engine === 'webview2') return <EdgeOfficialBrowser tab={tab} active={active} accountManagement={tab.scope === '/accounts'} openAccountSite={site => workspace.openAccountSite(tab.id, site)} nativeAccountKey={workspace.accounts.find(account=>account.id===tab.accountId)?.nativeAccountKey} update={workspace.update} close={workspace.close} registerPublisher={workspace.registerPublisher} registerPage={workspace.registerPage} />;
  return <ElectronOfficialBrowser tab={tab} active={active} />;
}
function ElectronOfficialBrowser({ tab, active }: { tab: WorkspaceTab; active: boolean }) {
  const workspace = useOfficialWorkspace();
  const view = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState(tab.initialUrl || tab.url);
  const [back, setBack] = useState(false);
  const [forward, setForward] = useState(false);
  const [helperOpen, setHelperOpen] = useState(Boolean(tab.draftText));
  const [draft, setDraft] = useState(tab.draftText || '');
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [inserting, setInserting] = useState(false);
  const [readingFollowers,setReadingFollowers]=useState(false);
  const [followerNote,setFollowerNote]=useState('');
  const followerOperation=useRef(0);
  const [autoFollowers,setAutoFollowers]=useState(false),[followerCursor,setFollowerCursor]=useState('');
  const stopFollowers=useRef(true);
  useEffect(()=>{if(!active)stopFollowers.current=true;},[active]);
  useEffect(()=>{followerOperation.current++;stopFollowers.current=true;setAutoFollowers(false);setFollowerCursor('');setReadingFollowers(false);setFollowerNote('');return()=>{followerOperation.current++;stopFollowers.current=true;};},[url,tab.accountId,tab.sessionId]);
  const syncAllFollowers=async(restart=false)=>{
    if(autoFollowers||readingFollowers||!active||!tab.accountId||!window.matrixDesktop?.syncDouyinFollowers||!view.current)return;
    const owner=getUser()?.id,token=getAuthToken(),guest=view.current.getWebContentsId(),id=++followerOperation.current;
    if(!owner||!token)return;
    const input={accessToken:token,accountId:tab.accountId,webContentsId:guest};
    const current=()=>followerOperation.current===id&&getUser()?.id===owner&&getAuthToken()===token;
    const notify=()=>{const account=workspace.accounts.find(a=>a.id===tab.accountId&&a.connectorSessionId===tab.sessionId);if(account)window.dispatchEvent(new CustomEvent('matrix:followers-cache-updated',{detail:{owner,accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey}}));};
    let cursor=restart?'':followerCursor,lastNotify=0;
    stopFollowers.current=false;setAutoFollowers(true);setFollowerNote('正在核验本人粉丝面板，将自动滚动此列表；可随时暂停…');
    try{
      let command:'start'|'resume'|'next'=cursor?'resume':'start';
      while(current()&&!stopFollowers.current){
        const result=await window.matrixDesktop.syncDouyinFollowers({...input,command,...(cursor?{cursor}:{})});
        if(!current())break;
        if(result.error)throw Error(result.error);
        if(result.accountId!==tab.accountId||result.sessionId!==tab.sessionId||!result.cursor||!['running','paused','complete'].includes(result.status||''))throw Error('官网分页账号或进度不一致，已停止');
        cursor=result.cursor;setFollowerCursor(result.complete?'':cursor);
        setFollowerNote(result.complete?`官网可访问名单已从顶部读至明确末页：${result.loaded||0} 位，${result.avatars||0} 位有头像地址。历史缓存保留，粉丝指数未作为总数。`:result.status==='paused'?result.reason||'已暂停，断点保留':`正在自动同步：本轮已读 ${result.loaded||0} 位，其中 ${result.avatars||0} 位有头像地址；尚未到末页。`);
        if(Date.now()-lastNotify>=5000||result.status!=='running'){notify();lastNotify=Date.now();}
        if(result.status!=='running')break;
        await new Promise(resolve=>setTimeout(resolve,Math.max(1000,Math.min(5000,result.retryAfterMs||1500))));command='next';
      }
    }catch(failure){if(current()){setFollowerNote(failure instanceof Error?failure.message:'官网分页未完成，原名单保留');notify();}}
    finally{
      if(cursor&&stopFollowers.current)try{const paused=await window.matrixDesktop.syncDouyinFollowers({...input,command:'pause',cursor});if(current()){setFollowerNote(paused.reason||'已暂停，当前面板断点和已保存成员保留');notify();}}catch{/* No alternate read after a stop. */}
      if(current())setAutoFollowers(false);
    }
  };
  const readOpenFollowers=async()=>{
    if(readingFollowers||autoFollowers||!active||!tab.accountId||!window.matrixDesktop?.readOpenDouyinFollowers||!view.current)return;
    const owner=getUser()?.id,token=getAuthToken(),id=++followerOperation.current;
    if(!token)return;
    setReadingFollowers(true);setFollowerNote('只读同步官网已加载成员，不改变页面滚动位置…');
    try{
      const result=await window.matrixDesktop.readOpenDouyinFollowers({accessToken:token,accountId:tab.accountId,webContentsId:view.current.getWebContentsId()});
      if(followerOperation.current!==id||getUser()?.id!==owner)return;
      if(result.error)throw Error(result.error);
      if(result.accountId!==tab.accountId||result.sessionId!==tab.sessionId)throw Error('账号页面已变化，本次同步结果未显示');
      const account=workspace.accounts.find(item=>item.id===tab.accountId&&item.connectorSessionId===tab.sessionId);
      if(account)window.dispatchEvent(new CustomEvent('matrix:followers-cache-updated',{detail:{owner,accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey}}));
      setFollowerNote(`已合并 ${result.loaded||0} 位已加载成员，其中 ${result.avatars||0} 位有头像地址；尚非全量。可在官网继续向下滚动后再次同步。`);
    }catch(failure){if(followerOperation.current===id)setFollowerNote(failure instanceof Error?failure.message:'官网粉丝面板读取失败，原名单保留');}
    finally{if(followerOperation.current===id)setReadingFollowers(false);}
  };
  const baseOperation = officialOperation(tab.platform, tab.intent);
  const operation = tab.scope==='/engage/account-operations'&&tab.intent==='comments'?{...baseOperation,instruction:'请核对当前发送账号、作品和评论内容；使用单次表单检查提交，不自动轮换账号。'}:baseOperation;
  const openOperation = async (intent = tab.intent) => {
    if (tab.binding || loading || busy) return;
    if (tab.scope === '/accounts' && intent === 'manage') { workspace.openAccountSite(tab.id, 'manage'); return; }
    if (!tab.background) { workspace.openPage(tab.id, officialOperation(tab.platform, intent).url, intent === tab.intent && (intent === 'comments' || intent === 'messages') ? draft : undefined); return; }
    if (!window.confirm('将切换当前官方页面，官方页面中尚未保存的内容可能丢失。远效已保存的草稿和待办不受影响。继续打开吗？')) return;
    await operate(() => view.current.loadURL(officialOperation(tab.platform, intent).url));
  };
  const insert = async () => {
    if (!window.matrixDesktop || inserting || tab.binding) return;
    setInserting(true);
    try {
      const result = await window.matrixDesktop.insertDraft({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId(), text: draft });
      if (result.error) throw new Error(result.error);
      if (result.inserted) toast.success('文案已填入；请核对内容和对象后，在官方页面确认提交。尚未发送。');
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : '填入失败，请使用复制文案'); }
    finally { setInserting(false); }
  };
  useEffect(() => { if (tab.draftText !== undefined) { setDraft(tab.draftText); setHelperOpen(true); } }, [tab.draftText]);
  useEffect(() => { if (tab.task) setHelperOpen(true); }, [tab.task]);
  const upload = async (mediaType: 'video' | 'image', selectionId?: string) => {
    if (!window.matrixDesktop || uploading || tab.binding) return;
    setUploading(true); setUploadNote('');
    try {
      const result = await window.matrixDesktop.uploadMedia({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId(), mediaType, selectionId });
      if (result.error) throw new Error(result.error);
      if (result.uploadStarted) setUploadNote(`已交给官方上传控件：${result.filenames?.join('、')}。请等待官方上传结果，核对后自行点击发表；尚未发布。`);
    } catch (failure) { setUploadNote(failure instanceof Error ? failure.message : '无法准备上传，请使用官方上传按钮'); }
    finally { setUploading(false); }
  };
  const [zoom, setZoom] = useState(100);
  const [detectedAccount, setDetectedAccount] = useState('');
  const [bindingStatus, setBindingStatus] = useState('');
  const [domReady, setDomReady] = useState(false);
  const publisherOpened = useRef(false);
  useAccountInspection({ enabled: active && !tab.background && !tab.binding && !tab.parentId && tab.intent === 'manage' && accountSiteForUrl(tab.platform, url) === 'manage' && domReady && !loading,
    accountId: tab.accountId, sessionId: tab.sessionId, platform: tab.platform, nickname: tab.nickname,
    nativeAccountKey:workspace.accounts.find(account=>account.id===tab.accountId)?.nativeAccountKey,
    read: () => window.matrixDesktop!.completePlatformLogin({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId() }) });
  useEffect(() => {
    if (!tab.accountId || tab.background || tab.binding) return;
    return workspace.registerPage(tab.id, () => {
      const accessToken = getAuthToken();
      if (!accessToken || !domReady || !view.current) throw Error('官方页面尚未准备好，请等待页面加载');
      return { platform: tab.platform, sessionId: tab.sessionId, accountId: tab.accountId!, accessToken, webContentsId: view.current.getWebContentsId() };
    });
  }, [tab.id, tab.accountId, tab.background, tab.binding, tab.platform, tab.sessionId, domReady, workspace.registerPage]);
  useEffect(() => {
    if (!tab.accountId || tab.parentId) return;
    return workspace.registerPublisher(tab.accountId, {
      input: () => {
        const accessToken = getAuthToken();
        if (!accessToken || tab.binding || !domReady || !view.current) throw new Error('官方页面尚未准备好或账号未登录');
        return { platform: tab.platform, sessionId: tab.sessionId, accountId: tab.accountId!, accessToken, webContentsId: view.current.getWebContentsId() };
      },
      open: async (mediaType, fresh = false, signal) => {
        if (signal?.aborted) throw Error('本次发布准备已停止');
        const current = view.current?.getURL() || '';
        if (tab.binding) throw new Error('请先完成该账号的官方登录');
        const desired = officialOperation(tab.platform, 'publish').url;
        const target = tab.platform === 'xiaohongshu' && mediaType === 'image' ? desired.replace('target=video', 'target=image') : desired;
        // A new task guest already navigates to its initial publish URL. Do not
        // cancel that first load with a second identical loadURL (ERR_ABORTED).
        // Subsequent retries still reload to discard this task's old editor.
        const reload = fresh && (publisherOpened.current || !tab.background);
        publisherOpened.current = true;
        if (reload || !/upload|publish|post\/video|post\/create/.test(new URL(current).pathname) || (tab.platform === 'xiaohongshu' && new URL(current).searchParams.get('target') !== (mediaType === 'image' ? 'image' : 'video'))) {
          await view.current.loadURL(target);
        }
      },
    }, tab.background);
  }, [tab.accountId, tab.binding, tab.platform, tab.sessionId, tab.background, domReady, workspace.registerPublisher]);
  const bindingRunner = useRef<ReturnType<typeof createAutoBinding<PlatformAccount>> | null>(null);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  useEffect(() => window.matrixDesktop?.onOfficialPageOpen?.(event => {
    try {
      if (view.current?.getWebContentsId() !== event.webContentsId) return;
      if (event.blocked) { toast.info('已阻止非当前平台的新窗口链接，原页面保持不变'); return; }
      workspaceRef.current.openPage(tab.id, event.url);
    } catch { /* A closing guest cannot open another tab. */ }
  }), [tab.id]);
  useEffect(() => {
    if (!tab.binding || !window.matrixDesktop) return;
    const ownerToken = getAuthToken();
    const runner = createAutoBinding<PlatformAccount>({
      isCurrent: () => Boolean(ownerToken && getAuthToken() === ownerToken),
      detect: async () => { const owner = getUser()?.id, checkedAt = Date.now(); const result = await window.matrixDesktop!.completePlatformLogin({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId() }); if (owner && tab.accountId) recordLoginObservation(owner, { id: tab.accountId, connectorSessionId: tab.sessionId, platform: tab.platform, nickname: tab.nickname }, result, checkedAt); return result; },
      persist: async result => {
        const response = await axiosForBackend.post('/api/platform/accounts/desktop', { platform: result.platform, connectorSessionId: result.sessionId, nickname: result.nickname, avatarUrl: result.avatarUrl || undefined, nativeAccountKey:result.ownIdentity?.key, pageUrl: result.pageUrl, groupId: tab.bindingGroupId });
        if (!response.data?.data?.id) throw new Error('账号保存结果不完整，请重试绑定');
        return response.data.data;
      },
      detected: result => { setDetectedAccount(result.nickname); setError(''); },
      saved: (result, account) => {
        const owner = getUser()?.id; if (owner) recordAccountObservation(owner, account, { state: 'normal', reason: '已完成稳定的本人官方登录识别并保存绑定', checkedAt: Date.now() });
        workspaceRef.current.update(tab.id, { nickname: result.nickname, binding: false, accountId: account.id });
        window.dispatchEvent(new Event('matrix:accounts-updated'));
        toast.success(`已自动绑定 ${result.nickname}`);
      },
      failed: message => setError(message),
      waiting: setBindingStatus,
      saving: setBusy,
      returnToLogin: async () => { await view.current.loadURL(tab.url); },
    });
    bindingRunner.current = runner;
    return () => { runner.dispose(); bindingRunner.current = null; };
  }, [tab.id, tab.binding, tab.platform, tab.sessionId, tab.bindingGroupId]);
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return; }
    const timer = window.setTimeout(() => setSlowLoad(true), 15000);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    if (!tab.binding || !domReady) return;
    void bindingRunner.current?.run();
    const timer = window.setInterval(() => void bindingRunner.current?.run(), 1000);
    return () => window.clearInterval(timer);
  }, [tab.binding, domReady]);
  useEffect(() => {
    const element = view.current;
    if (!element) return;
    const owner = getUser()?.id, ownerToken = getAuthToken();
    const disposeLoading = observeOfficialDocumentLoading(element, state => {
      setLoading(state.loading); setDomReady(state.ready);
      if (state.loading) { setDetectedAccount(''); setError(''); }
    });
    const title = (event: any) => workspaceRef.current.update(tab.id, { pageTitle: String(event.title || '官方页面').slice(0, 120) });
    const stop = () => {
      try { const currentUrl = element.getURL(); setUrl(currentUrl); setBack(element.canGoBack()); setForward(element.canGoForward()); if (owner && ownerToken === getAuthToken() && tab.accountId && officialLoginUrl(tab.platform, currentUrl)) recordAccountObservation(owner, { id: tab.accountId, connectorSessionId: tab.sessionId }, { state: 'offline', reason: '当前官方页面已返回登录页，请重新登录', checkedAt: Date.now() }); } catch { /* Guest may be closing. */ }
    };
    const failed = (event: any) => {
      if (event.errorCode === -3 || event.isMainFrame === false) return;
      setLoading(false);
      setError(`页面暂时无法加载（${event.errorDescription || event.errorCode}），可以刷新或返回平台首页。`);
    };
    element.addEventListener('page-title-updated', title);
    element.addEventListener('did-stop-loading', stop);
    element.addEventListener('did-fail-load', failed);
    element.addEventListener('did-navigate', stop);
    element.addEventListener('did-navigate-in-page', stop);
    return () => {
      disposeLoading();
      element.removeEventListener('page-title-updated', title);
      element.removeEventListener('did-stop-loading', stop);
      element.removeEventListener('did-fail-load', failed);
      element.removeEventListener('did-navigate', stop);
      element.removeEventListener('did-navigate-in-page', stop);
    };
  }, []);
  const operate = async (action: () => void | Promise<unknown>) => {
    try { setError(''); await action(); }
    catch (e) { setError(e instanceof Error ? e.message : '页面尚未准备好，请稍后重试'); }
  };
  const changeZoom = (next: number) => operate(() => {
    const percent = Math.max(50, Math.min(150, next));
    view.current.setZoomFactor(percent / 100);
    setZoom(percent);
  });
  const bind = () => bindingRunner.current?.run(false);
  return <div className="matrix-official-browser" hidden={!active}>
    <div className="matrix-browser-toolbar"><button title="后退" aria-label="后退" disabled={!back} onClick={() => operate(() => view.current.goBack())}><ArrowLeft size={16} /></button><button title="前进" aria-label="前进" disabled={!forward} onClick={() => operate(() => view.current.goForward())}><ArrowRight size={16} /></button><button title="刷新官方页面" aria-label="刷新官方页面" onClick={() => operate(() => view.current.reload())}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button><button title="平台首页" aria-label="平台首页" onClick={() => operate(() => view.current.loadURL(tab.url))}><Home size={16} /></button><div className="matrix-address"><Globe2 size={14} /><span>{url}</span></div><div className="matrix-zoom-controls"><button aria-label="缩小官方页面" onClick={() => changeZoom(zoom - 10)}>−</button><button aria-label="重置页面缩放" onClick={() => changeZoom(100)}>{zoom}%</button><button aria-label="放大官方页面" onClick={() => changeZoom(zoom + 10)}>+</button></div><button className={helperOpen ? 'is-active' : ''} onClick={() => setHelperOpen(!helperOpen)}><Copy size={15} />文案辅助</button></div>
    {tab.scope === '/accounts' && !tab.binding && !tab.background ? <AccountSiteNavigation platform={tab.platform} url={url} nickname={`${platformLabels[tab.platform]} · ${tab.nickname}`} open={site => workspace.openAccountSite(tab.id, site)} /> : <div className="matrix-intent-bar"><div><span className="is-active">{tab.binding ? '账号绑定' : intentInfo[tab.intent].label}</span></div><span>{tab.binding ? '请先完成官方登录' : `${platformLabels[tab.platform]} · ${tab.nickname}`}</span></div>}
    {active&&tab.scope==='/accounts'&&tab.platform==='douyin'&&tab.accountId&&!tab.binding&&!tab.background&&/^https:\/\/www\.douyin\.com\/(?:jingxuan\/?|user\/self\/?)?(?:[?#]|$)/.test(url)&&<div className="matrix-browser-hint"><Button variant="outline" size="sm" disabled={loading||readingFollowers||autoFollowers} onClick={()=>void readOpenFollowers()}>{readingFollowers?'正在同步已加载成员…':'同步已打开粉丝面板'}</Button>{autoFollowers?<Button variant="outline" size="sm" onClick={()=>{stopFollowers.current=true;setFollowerNote('正在暂停，将在当前页保存后停止…');}}>暂停自动同步</Button>:<><Button variant="outline" size="sm" disabled={loading||readingFollowers} onClick={()=>void syncAllFollowers()}>{followerCursor?'继续自动同步':'自动同步全部粉丝'}</Button>{followerCursor&&<Button variant="ghost" size="sm" disabled={loading||readingFollowers} onClick={()=>void syncAllFollowers(true)}>从顶部重新核验</Button>}</>}<span role="status">{followerNote||'先打开官网本人粉丝列表；自动同步会滚动此面板，可暂停。不会点击关注或移除，也不以粉丝指数代替名单人数。'}</span></div>}
    {tab.binding ? <div className={"matrix-binding-banner " + (detectedAccount ? "is-ready" : "")}><div><strong>{detectedAccount ? `已检测到登录：${detectedAccount}` : tab.platform === "xiaohongshu" ? "小红书官方登录" : `用${tab.platform === "wechat" ? "微信" : platformLabels[tab.platform]} APP 扫描下方官方二维码`}</strong><small>{detectedAccount ? "正在进行稳定身份检查，随后自动保存；无需点击识别绑定。" : tab.platform === "xiaohongshu" ? "在下方官方页面扫码或使用其提供的登录方式；登录成功后会自动识别并绑定，无需再次点击确认。" : "手机确认登录后自动识别并绑定；二维码过期请刷新。此处是官方网页登录，不是开放平台 API 授权。"}</small></div><div><Button variant="outline" size="sm" disabled={busy} onClick={() => operate(() => view.current.reload())}><RefreshCw size={14} />刷新登录页</Button>{error && <Button size="sm" disabled={loading || busy} onClick={() => void bind()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{busy ? "正在绑定" : "重试自动识别"}</Button>}<button className="matrix-cancel-binding" onClick={() => workspace.close(tab.id)}>取消绑定</button></div></div> : <div className="matrix-browser-hint"><span>{operation.instruction}</span><Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void openOperation()}>打开{intentInfo[tab.intent].label}页面</Button>{tab.intent !== 'manage' && <Button variant="outline" size="sm" onClick={() => setHelperOpen(true)}>文案与提交</Button>}</div>}
    {tab.binding && bindingStatus && !error && <div role="status" className="matrix-browser-hint">{bindingStatus}</div>}
    {error && <div role="alert" className="matrix-browser-error">{error}<button onClick={() => operate(() => view.current.reload())}>重试</button></div>}
    <div className="matrix-browser-body">{createElement('webview', { ref: view, src: tab.initialUrl || tab.url, partition: tab.partition, allowpopups: 'true', className: 'matrix-official-webview', style: { display: 'flex', width: '100%', height: '100%' } })}
      {loading && <div className="matrix-login-loading" role="status"><Loader2 size={28} className="animate-spin" /><strong>{slowLoad ? "官方页面加载较慢" : "正在加载官方登录页…"}</strong><p>{slowLoad ? "请检查网络，或点击刷新登录页重新获取二维码。" : "正在获取官方登录入口，请稍候。"}</p>{slowLoad && <Button variant="outline" onClick={() => operate(() => view.current.reload())}>重新加载</Button>}</div>}
      {helperOpen && <aside className="matrix-draft-helper">
        <div><strong>文案与提交</strong><button aria-label="关闭文案辅助" onClick={() => setHelperOpen(false)}><X size={16} /></button></div>
        <p>点击官方页面的输入框，再填入文案。</p>
        {tab.preparation && <div className="matrix-prepared-text"><Button size="sm" variant="outline" onClick={() => setDraft(tab.preparation!.title)}>使用通用标题</Button><Button size="sm" variant="outline" onClick={() => setDraft(tab.preparation!.body)}>使用通用简介</Button></div>}
        <textarea aria-label="文案辅助内容" placeholder="输入当前功能的文案…" value={draft} onChange={event => setDraft(event.target.value)} />
        <Button disabled={!draft.trim()} onClick={() => void navigator.clipboard.writeText(draft).then(() => toast.success('文案已复制')).catch(() => toast.error('复制失败，请手动选择文案复制'))}><Copy size={14} />复制文案</Button>
        <Button variant="outline" disabled={!draft.trim() || tab.binding || loading || inserting} onClick={() => void insert()}>{inserting ? '正在填入…' : '填入选中的官方输入框'}</Button>
        {tab.scope.startsWith('/publish/') && <div className="matrix-personal-upload">
          <Button variant="outline" disabled={tab.binding || loading || uploading || busy} onClick={() => void openOperation('publish')}>打开发表入口</Button>
          {tab.preparation?.media && <div className="matrix-prepared-media"><strong>通用素材</strong><p>{tab.preparation.media.files.map(file => file.name).join('、')}</p><Button disabled={tab.binding || loading || uploading} onClick={() => void upload(tab.preparation!.media!.mediaType, tab.preparation!.media!.id)}>{uploading ? '正在交给上传控件…' : '将已选素材上传到当前账号'}</Button></div>}
          <Button variant="outline" disabled={tab.binding || loading || uploading} onClick={() => void upload('video')}>选择视频上传</Button>
          <Button variant="outline" disabled={tab.binding || loading || uploading} onClick={() => void upload('image')}>选择图片上传</Button>
          {uploadNote && <p role="status">{uploadNote}</p>}
        </div>}
        {!tab.binding && <PageActionPanel platform={tab.platform} sessionId={tab.sessionId} accountId={tab.accountId} kind={tab.intent} task={tab.task} pageUrl={url} getGuestId={() => view.current.getWebContentsId()} />}
        <small>切换模块保留此文案；关闭标签后清除。</small>
      </aside>}
    </div>
    <div className="matrix-browser-status"><span><i />{loading ? '正在加载官方页面…' : '官方页面'} · {platformLabels[tab.platform]}</span><span>本机独立会话 · 操作由你确认</span></div>
  </div>;
}
