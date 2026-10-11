import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Globe2, Home, Loader2, MessageCircle, Plus, RefreshCw, Search, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { axiosForBackend, getAuthToken } from '@/api';
import type { PlatformAccount, PlatformType } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { officialOperation } from '@shared/official-operations';
import { PageActionPanel } from './PageActionPanel';
import { createAutoBinding } from './auto-binding';

export const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
const platformColors: Record<PlatformType, string> = { douyin: '#24242b', xiaohongshu: '#f04462', wechat: '#38a46a', bilibili: '#3ea9e4' };
type Intent = 'manage' | 'publish' | 'comments' | 'messages' | 'withdraw';
type TaskLink = { id: string; title: string; kind: 'comments' | 'withdraw' };
type PublishPreparation = { media?: MatrixMediaSelection; title: string; body: string };
type WorkspaceTab = MatrixDesktopSession & { id: string; nickname: string; binding: boolean; accountId?: string; intent: Intent; draftText?: string; preparation?: PublishPreparation; initialUrl?: string; background?: boolean; task?: TaskLink };
interface WorkspaceContext {
  tabs: WorkspaceTab[];
  activeId: string | null;
  visible: boolean;
  accounts: PlatformAccount[];
  loadingAccounts: boolean;
  accountError: string;
  refreshAccounts(): Promise<void>;
  openAccount(account: PlatformAccount, intent?: Intent, reconnect?: boolean, draftText?: string, preparation?: PublishPreparation, background?: boolean): Promise<boolean>;
  bindAccount(platform: PlatformType): Promise<void>;
  show(intent?: Intent): void;
  hide(): void;
  select(id: string): void;
  close(id: string): void;
  update(id: string, patch: Partial<WorkspaceTab>): void;
  registerPublisher(accountId: string, publisher: Publisher, background?: boolean): () => void;
  publisher(accountId: string, background?: boolean): Publisher | undefined;
  lockJobs(locked: boolean): void;
  jobsLocked: boolean;
  linkTask(accountId: string, task: TaskLink): void;
}
type Publisher = { input(): MatrixPageActionInput; open(mediaType: 'video' | 'image', fresh?: boolean): Promise<void> };
const Context = createContext<WorkspaceContext | null>(null);
export function useOfficialWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('账号操作面板未初始化');
  return value;
}

export function OfficialWorkspaceProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountError, setAccountError] = useState('');
  const preferredIntent = useRef<Intent>('manage');
  const publishers = useRef(new Map<string, Publisher>());
  const [jobsLocked, lockJobs] = useState(false);
  const registerPublisher = useCallback((accountId: string, publisher: Publisher, background = false) => {
    const key = accountId + (background ? ':job' : '');
    publishers.current.set(key, publisher);
    return () => { if (publishers.current.get(key) === publisher) publishers.current.delete(key); };
  }, []);
  const refreshAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountError('');
    try {
      const response = await axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } });
      setAccounts(response.data?.data?.items || []);
    } catch { setAccountError('账号加载失败，请重试'); }
    finally { setLoadingAccounts(false); }
  }, []);
  useEffect(() => { if (visible) void refreshAccounts(); }, [visible, refreshAccounts]);
  useEffect(() => {
    const refresh = () => void refreshAccounts();
    window.addEventListener('matrix:accounts-updated', refresh);
    return () => window.removeEventListener('matrix:accounts-updated', refresh);
  }, [refreshAccounts]);

  const prepare = async (platform: PlatformType, sessionId: string | undefined, nickname: string, binding: boolean, intent: Intent, accountId?: string, draftText?: string, preparation?: PublishPreparation, background = false) => {
    if (!window.matrixDesktop?.isDesktop) {
      toast.info('请使用矩效桌面版打开内嵌账号操作面板');
      return false;
    }
    try {
      const prepared = await window.matrixDesktop.preparePlatformLogin(platform, sessionId);
      if ('error' in prepared) throw new Error(prepared.error);
      const id = `${platform}-${prepared.sessionId}${background ? '-job' : ''}`;
      const tab: WorkspaceTab = { ...prepared, id, nickname, binding, intent, accountId, draftText, preparation, background, initialUrl: !binding && intent === 'publish' ? officialOperation(platform, intent).url : prepared.url };
      setTabs(current => current.some(item => item.id === id)
        ? current.map(item => item.id === id ? { ...item, intent, task: undefined, binding: item.binding || binding, ...(draftText !== undefined ? { draftText } : {}), ...(preparation ? { preparation } : {}) } : item)
        : [...current, tab]);
      if (!background) { setActiveId(id); setVisible(true); }
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : '无法打开官方页面'); return false; }
  };
  const openAccount = async (account: PlatformAccount, intent: Intent = preferredIntent.current, reconnect = false, draftText?: string, preparation?: PublishPreparation, background = false) => {
    if (!account.connectorSessionId) {
      toast.info('该账号通过 API 授权绑定，请在官方页面另行登录后绑定本机工作区');
      return false;
    }
    const missingNickname = !account.nickname || account.nickname === `${platformLabels[account.platform]}账号` || account.nickname === '未命名账号';
    return prepare(account.platform, account.connectorSessionId, account.nickname || platformLabels[account.platform], reconnect || missingNickname, intent, account.id, draftText, preparation, background);
  };
  const close = (id: string) => {
    if (jobsLocked && tabs.some(tab => tab.id === id && tab.background)) { toast.info('发布任务正在使用该页面，请先停止后续任务'); return; }
    const remaining = tabs.filter(tab => tab.id !== id);
    setTabs(remaining);
    if (activeId === id) setActiveId(remaining.at(-1)?.id || null);
  };
  return <Context.Provider value={{ tabs, activeId, visible, accounts, loadingAccounts, accountError, refreshAccounts, openAccount,
    registerPublisher, publisher: (id, background = false) => publishers.current.get(id + (background ? ':job' : '')), lockJobs, jobsLocked,
    linkTask: (accountId, task) => setTabs(current => current.map(tab => tab.accountId === accountId && !tab.background ? { ...tab, task } : tab)),
    bindAccount: async platform => { await prepare(platform, undefined, `登录${platformLabels[platform]}`, true, preferredIntent.current); },
    show: intent => {
      if (typeof intent === 'string' && intent in intentInfo) {
        preferredIntent.current = intent;
        if (tabs.some(tab => tab.id === activeId && tab.background)) setActiveId(tabs.filter(tab => !tab.background).at(-1)?.id || null);
        else if (activeId) setTabs(current => current.map(tab => tab.id === activeId ? { ...tab, intent } : tab));
      }
      setVisible(true);
    }, hide: () => setVisible(false),
    select: id => { setActiveId(id); setVisible(true); }, close,
    update: (id, patch) => setTabs(current => current.map(tab => tab.id === id ? { ...tab, ...patch } : tab)),
  }}>{children}<BackgroundPublishPages /></Context.Provider>;
}

// Keep guests mounted and laid out even when the user visits another module (including docs).
function BackgroundPublishPages() {
  const workspace = useOfficialWorkspace();
  return <>{workspace.tabs.filter(tab => tab.background).map(tab => {
    const shown = workspace.visible && workspace.activeId === tab.id;
    return <section key={tab.id} aria-label={`${tab.nickname}后台发布页`} aria-hidden={!shown} style={{ position: 'fixed', top: shown ? 60 : 0, left: shown ? 16 : -20000, width: shown ? 'calc(100vw - 32px)' : 1280, height: shown ? 'calc(100vh - 76px)' : 900, zIndex: 45, background: 'var(--background, white)', display: 'flex', flexDirection: 'column', border: '1px solid #ddd' }}>
      <div className="flex items-center justify-between bg-background p-3"><strong>{tab.nickname} · 发布任务页面{workspace.jobsLocked ? '（处理中，请勿修改）' : ''}</strong><Button variant="outline" onClick={workspace.hide}>收起，继续其他操作</Button></div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}><OfficialBrowser tab={tab} active />{workspace.jobsLocked && <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} aria-label="任务处理中，暂不可手动修改" />}</div>
    </section>;
  })}</>;
}

export function WorkspaceTabs() {
  const workspace = useOfficialWorkspace();
  if (!workspace.tabs.length || !workspace.visible) return null;
  return <div className="matrix-workspace-tabs" role="tablist" aria-label="工作区标签">
    <button onClick={workspace.hide}><ArrowLeft size={14} />收起账号页面</button>
    {workspace.tabs.map(tab => <div className={`matrix-account-tab ${workspace.visible && workspace.activeId === tab.id ? 'is-active' : ''}`} key={tab.id}>
      <button role="tab" aria-selected={workspace.visible && workspace.activeId === tab.id} onClick={() => workspace.select(tab.id)}><PlatformMark platform={tab.platform} small /><span>{tab.nickname}</span></button>
      <button className="matrix-tab-close" aria-label={`关闭${tab.nickname}`} onClick={() => workspace.close(tab.id)}><X size={13} /></button>
    </div>)}
  </div>;
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
  return <span className={`matrix-platform-mark ${small ? 'small' : ''}`} style={{ background: platformColors[platform] }}>{platformLabels[platform].slice(0, 1)}</span>;
}

export function OfficialWorkspaceDeck() {
  const workspace = useOfficialWorkspace();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlatformType | 'all'>('all');
  const filtered = workspace.accounts.filter(account => (filter === 'all' || account.platform === filter) && `${account.nickname || ''} ${account.accountRemark || ''} ${account.groupName || ''}`.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(filtered.map(account => account.groupName || '默认分组'))];
  return <section className="matrix-official-deck" hidden={!workspace.visible} aria-label="账号操作面板">
    <aside className="matrix-account-rail">
      <div className="matrix-rail-actions"><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Plus size={15} />添加账号</Button></DropdownMenuTrigger><DropdownMenuContent>{(Object.keys(platformLabels) as PlatformType[]).map(platform => <DropdownMenuItem key={platform} onSelect={() => void workspace.bindAccount(platform)}>{platformLabels[platform]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><Button size="sm" variant="outline" onClick={workspace.hide}>管理面板</Button><button aria-label="刷新账号" title="刷新账号" onClick={() => void workspace.refreshAccounts()}><RefreshCw size={16} className={workspace.loadingAccounts ? 'animate-spin' : ''} /></button></div>
      <div className="matrix-account-search"><Search size={14} /><input aria-label="搜索账号" placeholder="搜索昵称 / 备注 / 分组" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="matrix-platform-filters"><button onClick={() => setFilter('all')} className={filter === 'all' ? 'is-active' : ''}>全部</button>{(Object.keys(platformLabels) as PlatformType[]).map(platform => <button key={platform} onClick={() => setFilter(platform)} className={filter === platform ? 'is-active' : ''}>{platformLabels[platform]}</button>)}</div>
      <div className="matrix-account-list">
        {workspace.accountError && <button className="matrix-account-error" onClick={() => void workspace.refreshAccounts()}>{workspace.accountError}</button>}
        {groups.map(group => <div key={group}><div className="matrix-group-label">{group}<span>{filtered.filter(account => (account.groupName || '默认分组') === group).length}</span></div>{filtered.filter(account => (account.groupName || '默认分组') === group).map(account => <button key={account.id} className={`matrix-rail-account ${workspace.tabs.find(tab => tab.id === workspace.activeId)?.accountId === account.id ? 'is-active' : ''}`} onClick={() => void workspace.openAccount(account)}><PlatformMark platform={account.platform} /><span><strong>{account.nickname || '未命名账号'}</strong><small>{platformLabels[account.platform]} · {account.accountRemark || '官方后台'}</small></span><i className={account.authStatus === 'authorized' ? 'online' : ''} /></button>)}</div>)}
        {!filtered.length && !workspace.loadingAccounts && !workspace.accountError && <div className="matrix-rail-empty">{workspace.accounts.length ? '没有匹配的账号' : '先添加账号，再在这里切换'}</div>}
      </div>
      <div className="matrix-add-platforms"><span>添加个人账号</span><div>{(Object.keys(platformLabels) as PlatformType[]).map(platform => <button key={platform} onClick={() => void workspace.bindAccount(platform)}><Plus size={12} />{platformLabels[platform]}</button>)}</div></div>
      <Link className="matrix-rail-group-link" to="/accounts/groups" onClick={workspace.hide}>管理账号分组</Link>
    </aside>
    <div className="matrix-browser-area">
      <WorkspaceTabs />
      <AccountPicker />
      {!workspace.activeId && <div className="matrix-workspace-welcome"><span className="matrix-welcome-icon"><Globe2 size={32} /></span><span className="matrix-eyebrow">OFFICIAL WORKSPACE</span><h1>账号与操作，都在一个工作区</h1><p>选择左侧账号，打开官方后台。发布内容、回复评论和发送私信，直接在官方页面中完成。</p><div className="matrix-welcome-features"><span><Users size={17} />账号分组切换</span><span><Send size={17} />官方页面发布</span><span><MessageCircle size={17} />评论与私信</span></div><div className="matrix-platform-cards">{(Object.keys(platformLabels) as PlatformType[]).map(platform => <button key={platform} onClick={() => void workspace.bindAccount(platform)}><PlatformMark platform={platform} /><strong>{platformLabels[platform]}</strong><small>{platform === "xiaohongshu" ? "官方短信登录" : "官方扫码登录"}</small><Plus size={15} /></button>)}</div><small>登录会话保存在本机，各账号独立。平台页面中提交的操作以官方结果为准。</small></div>}
      {workspace.tabs.filter(tab => !tab.background).map(tab => <OfficialBrowser key={tab.id} tab={tab} active={tab.id === workspace.activeId} />)}
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
  const view = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState(tab.url);
  const [back, setBack] = useState(false);
  const [forward, setForward] = useState(false);
  const [helperOpen, setHelperOpen] = useState(Boolean(tab.draftText));
  const [draft, setDraft] = useState(tab.draftText || '');
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [inserting, setInserting] = useState(false);
  const operation = officialOperation(tab.platform, tab.intent);
  const openOperation = async (intent = tab.intent) => {
    if (tab.binding || loading || busy) return;
    if (!window.confirm('将切换当前官方页面，官方页面中尚未保存的内容可能丢失。矩效已保存的草稿和待办不受影响。继续打开吗？')) return;
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
  useEffect(() => {
    if (!tab.accountId) return;
    return workspace.registerPublisher(tab.accountId, {
      input: () => {
        const accessToken = getAuthToken();
        if (!accessToken || tab.binding || !domReady || !view.current) throw new Error('官方页面尚未准备好或账号未登录');
        return { platform: tab.platform, sessionId: tab.sessionId, accountId: tab.accountId!, accessToken, webContentsId: view.current.getWebContentsId() };
      },
      open: async (mediaType, fresh = false) => {
        const current = view.current?.getURL() || '';
        if (tab.binding) throw new Error('请先完成该账号的官方登录');
        const desired = officialOperation(tab.platform, 'publish').url;
        const target = tab.platform === 'xiaohongshu' && mediaType === 'image' ? desired.replace('target=video', 'target=image') : desired;
        if (fresh || !/upload|publish|post\/video|post\/create/.test(new URL(current).pathname) || (tab.platform === 'xiaohongshu' && new URL(current).searchParams.get('target') !== (mediaType === 'image' ? 'image' : 'video'))) {
          await view.current.loadURL(target);
        }
      },
    }, tab.background);
  }, [tab.accountId, tab.binding, tab.platform, tab.sessionId, tab.background, domReady, workspace.registerPublisher]);
  const bindingRunner = useRef<ReturnType<typeof createAutoBinding<PlatformAccount>> | null>(null);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  useEffect(() => {
    if (!tab.binding || !window.matrixDesktop) return;
    const ownerToken = getAuthToken();
    const runner = createAutoBinding<PlatformAccount>({
      isCurrent: () => Boolean(ownerToken && getAuthToken() === ownerToken),
      detect: () => window.matrixDesktop!.completePlatformLogin({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId() }),
      persist: async result => {
        const response = await axiosForBackend.post('/api/platform/accounts/desktop', { platform: result.platform, connectorSessionId: result.sessionId, nickname: result.nickname, avatarUrl: result.avatarUrl || undefined, pageUrl: result.pageUrl });
        if (!response.data?.data?.id) throw new Error('账号保存结果不完整，请重试绑定');
        return response.data.data;
      },
      detected: result => { setDetectedAccount(result.nickname); setError(''); },
      saved: (result, account) => {
        workspaceRef.current.update(tab.id, { nickname: result.nickname, binding: false, accountId: account.id });
        window.dispatchEvent(new Event('matrix:accounts-updated'));
        toast.success(`已自动绑定 ${result.nickname}`);
      },
      failed: message => setError(message),
      waiting: setBindingStatus,
      saving: setBusy,
    });
    bindingRunner.current = runner;
    return () => { runner.dispose(); bindingRunner.current = null; };
  }, [tab.id, tab.binding, tab.platform, tab.sessionId]);
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return; }
    const timer = window.setTimeout(() => setSlowLoad(true), 15000);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    if (!tab.binding || !domReady) return;
    void bindingRunner.current?.run();
    const timer = window.setInterval(() => void bindingRunner.current?.run(), 2000);
    return () => window.clearInterval(timer);
  }, [tab.binding, domReady]);
  useEffect(() => {
    const element = view.current;
    if (!element) return;
    const start = () => { setLoading(true); setDetectedAccount(''); setError(''); };
    const ready = () => setDomReady(true);
    const navigating = (event: any) => { if (event.isMainFrame && !event.isInPlace) setDomReady(false); };
    const stop = () => {
      setLoading(false);
      try { setUrl(element.getURL()); setBack(element.canGoBack()); setForward(element.canGoForward()); } catch { /* Guest may be closing. */ }
    };
    const failed = (event: any) => {
      if (event.errorCode === -3 || event.isMainFrame === false) return;
      setLoading(false);
      setError(`页面暂时无法加载（${event.errorDescription || event.errorCode}），可以刷新或返回平台首页。`);
    };
    element.addEventListener('did-start-loading', start);
    element.addEventListener('dom-ready', ready);
    element.addEventListener('did-start-navigation', navigating);
    element.addEventListener('did-stop-loading', stop);
    element.addEventListener('did-fail-load', failed);
    element.addEventListener('did-navigate', stop);
    element.addEventListener('did-navigate-in-page', stop);
    return () => {
      element.removeEventListener('did-start-loading', start);
      element.removeEventListener('dom-ready', ready);
      element.removeEventListener('did-start-navigation', navigating);
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
    <div className="matrix-intent-bar"><div>{(Object.keys(intentInfo) as Intent[]).map(intent => <button key={intent} className={tab.intent === intent ? 'is-active' : ''} onClick={() => workspace.update(tab.id, { intent })}>{intentInfo[intent].label}</button>)}</div><span>{tab.binding ? '请先完成官方登录' : `${platformLabels[tab.platform]} · ${tab.nickname}`}</span></div>
    {tab.binding ? <div className={"matrix-binding-banner " + (detectedAccount ? "is-ready" : "")}><div><strong>{detectedAccount ? `已检测到登录：${detectedAccount}` : tab.platform === "xiaohongshu" ? "小红书官方登录" : `用${tab.platform === "wechat" ? "微信" : platformLabels[tab.platform]} APP 扫描下方官方二维码`}</strong><small>{detectedAccount ? "正在自动保存账号，登录会话仅保存于本机。" : tab.platform === "xiaohongshu" ? "在下方官方页面扫码或使用其提供的登录方式；登录成功后会自动识别并绑定，无需再次点击确认。" : "手机确认登录后自动识别并绑定；二维码过期请刷新。此处是官方网页登录，不是开放平台 API 授权。"}</small></div><div><Button variant="outline" size="sm" disabled={busy} onClick={() => operate(() => view.current.reload())}><RefreshCw size={14} />刷新登录页</Button><Button size="sm" disabled={loading || busy} onClick={() => void bind()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{busy ? "正在绑定" : detectedAccount ? "重试绑定该账号" : "我已登录，完成绑定"}</Button><button className="matrix-cancel-binding" onClick={() => workspace.close(tab.id)}>取消绑定</button></div></div> : <div className="matrix-browser-hint"><span>{operation.instruction}</span><Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void openOperation()}>打开{intentInfo[tab.intent].label}页面</Button>{tab.intent !== 'manage' && <Button variant="outline" size="sm" onClick={() => setHelperOpen(true)}>文案与提交</Button>}</div>}
    {tab.binding && bindingStatus && !error && <div role="status" className="matrix-browser-hint">{bindingStatus}</div>}
    {error && <div role="alert" className="matrix-browser-error">{error}<button onClick={() => operate(() => view.current.reload())}>重试</button></div>}
    <div className="matrix-browser-body">{createElement('webview', { ref: view, src: tab.initialUrl || tab.url, partition: tab.partition, className: 'matrix-official-webview', style: { display: 'flex', width: '100%', height: '100%' } })}
      {loading && <div className="matrix-login-loading" role="status"><Loader2 size={28} className="animate-spin" /><strong>{slowLoad ? "官方页面加载较慢" : "正在加载官方登录页…"}</strong><p>{slowLoad ? "请检查网络，或点击刷新登录页重新获取二维码。" : "正在获取官方登录入口，请稍候。"}</p>{slowLoad && <Button variant="outline" onClick={() => operate(() => view.current.reload())}>重新加载</Button>}</div>}
      {helperOpen && <aside className="matrix-draft-helper"><div><strong>文案与提交</strong><button aria-label="关闭文案辅助" onClick={() => setHelperOpen(false)}><X size={16} /></button></div><p>点击官方页面的输入框，再填入文案。</p>{tab.preparation && <div className="matrix-prepared-text"><Button size="sm" variant="outline" onClick={() => setDraft(tab.preparation!.title)}>使用通用标题</Button><Button size="sm" variant="outline" onClick={() => setDraft(tab.preparation!.body)}>使用通用简介</Button></div>}<textarea aria-label="文案辅助内容" placeholder="输入要发布的文案或回复…" value={draft} onChange={event => setDraft(event.target.value)} /><Button disabled={!draft.trim()} onClick={() => void navigator.clipboard.writeText(draft).then(() => toast.success('文案已复制')).catch(() => toast.error('复制失败，请手动选择文案复制'))}><Copy size={14} />复制文案</Button><Button variant="outline" disabled={!draft.trim() || tab.binding || loading || inserting} onClick={() => void insert()}>{inserting ? "正在填入…" : "填入选中的官方输入框"}</Button><div className="matrix-personal-upload"><Button variant="outline" disabled={tab.binding || loading || uploading || busy} onClick={() => void openOperation('publish')}>打开发表入口</Button>{tab.preparation?.media && <div className="matrix-prepared-media"><strong>通用素材</strong><p>{tab.preparation.media.files.map(file => file.name).join('、')}</p><Button disabled={tab.binding || loading || uploading} onClick={() => void upload(tab.preparation!.media!.mediaType, tab.preparation!.media!.id)}>{uploading ? '正在交给上传控件…' : '将已选素材上传到当前账号'}</Button></div>}<Button variant="outline" disabled={tab.binding || loading || uploading} onClick={() => void upload('video')}>选择视频上传</Button><Button variant="outline" disabled={tab.binding || loading || uploading} onClick={() => void upload('image')}>选择图片上传</Button>{uploadNote && <p role="status">{uploadNote}</p>}</div>{!tab.binding && <PageActionPanel platform={tab.platform} sessionId={tab.sessionId} accountId={tab.accountId} kind={tab.intent} task={tab.task} pageUrl={url} getGuestId={() => view.current.getWebContentsId()} />}<small>未保存的文案会在关闭标签后清除。</small></aside>}
    </div>
    <div className="matrix-browser-status"><span><i />{loading ? '正在加载官方页面…' : '官方页面'} · {platformLabels[tab.platform]}</span><span>本机独立会话 · 操作由你确认</span></div>
  </div>;
}
