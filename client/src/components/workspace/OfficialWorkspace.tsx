import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Globe2, Home, Loader2, MessageCircle, Plus, RefreshCw, Search, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { axiosForBackend } from '@/api';
import type { PlatformAccount, PlatformType } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { officialOperation } from '@shared/official-operations';

export const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
const platformColors: Record<PlatformType, string> = { douyin: '#24242b', xiaohongshu: '#f04462', wechat: '#38a46a', bilibili: '#3ea9e4' };
type Intent = 'manage' | 'publish' | 'comments' | 'messages';
type WorkspaceTab = MatrixDesktopSession & { id: string; nickname: string; binding: boolean; accountId?: string; intent: Intent; draftText?: string };
interface WorkspaceContext {
  tabs: WorkspaceTab[];
  activeId: string | null;
  visible: boolean;
  accounts: PlatformAccount[];
  loadingAccounts: boolean;
  accountError: string;
  refreshAccounts(): Promise<void>;
  openAccount(account: PlatformAccount, intent?: Intent, reconnect?: boolean, draftText?: string): Promise<boolean>;
  bindAccount(platform: PlatformType): Promise<void>;
  show(intent?: Intent): void;
  hide(): void;
  select(id: string): void;
  close(id: string): void;
  update(id: string, patch: Partial<WorkspaceTab>): void;
}
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

  const prepare = async (platform: PlatformType, sessionId: string | undefined, nickname: string, binding: boolean, intent: Intent, accountId?: string, draftText?: string) => {
    if (!window.matrixDesktop?.isDesktop) {
      toast.info('请使用矩效桌面版打开内嵌账号操作面板');
      return false;
    }
    try {
      const prepared = await window.matrixDesktop.preparePlatformLogin(platform, sessionId);
      if ('error' in prepared) throw new Error(prepared.error);
      const id = `${platform}-${prepared.sessionId}`;
      const tab: WorkspaceTab = { ...prepared, id, nickname, binding, intent, accountId, draftText };
      setTabs(current => current.some(item => item.id === id)
        ? current.map(item => item.id === id ? { ...item, intent, binding: item.binding || binding, ...(draftText !== undefined ? { draftText } : {}) } : item)
        : [...current, tab]);
      setActiveId(id);
      setVisible(true);
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : '无法打开官方页面'); return false; }
  };
  const openAccount = async (account: PlatformAccount, intent: Intent = preferredIntent.current, reconnect = false, draftText?: string) => {
    if (!account.connectorSessionId) {
      toast.info('该账号通过 API 授权绑定，请在官方页面另行登录后绑定本机工作区');
      return false;
    }
    return prepare(account.platform, account.connectorSessionId, account.nickname || platformLabels[account.platform], reconnect, intent, account.id, draftText);
  };
  const close = (id: string) => {
    const remaining = tabs.filter(tab => tab.id !== id);
    setTabs(remaining);
    if (activeId === id) setActiveId(remaining.at(-1)?.id || null);
  };
  return <Context.Provider value={{ tabs, activeId, visible, accounts, loadingAccounts, accountError, refreshAccounts, openAccount,
    bindAccount: async platform => { await prepare(platform, undefined, `登录${platformLabels[platform]}`, true, preferredIntent.current); },
    show: intent => {
      if (typeof intent === 'string' && intent in intentInfo) {
        preferredIntent.current = intent;
        if (activeId) setTabs(current => current.map(tab => tab.id === activeId ? { ...tab, intent } : tab));
      }
      setVisible(true);
    }, hide: () => setVisible(false),
    select: id => { setActiveId(id); setVisible(true); }, close,
    update: (id, patch) => setTabs(current => current.map(tab => tab.id === id ? { ...tab, ...patch } : tab)),
  }}>{children}</Context.Provider>;
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
      {workspace.tabs.map(tab => <OfficialBrowser key={tab.id} tab={tab} active={tab.id === workspace.activeId} />)}
    </div>
  </section>;
}

const intentInfo: Record<Intent, { label: string; instruction: string }> = {
  manage: { label: '账号后台', instruction: '在官方后台查看与管理当前账号。' },
  publish: { label: '发布内容', instruction: '在官方页面选择内容发布，上传素材并确认发表。这里的草稿辅助只复制文案。' },
  comments: { label: '评论回复', instruction: '在官方页面打开评论管理，选择评论并提交回复。' },
  messages: { label: '私信消息', instruction: '在官方页面打开消息中心，选择联系人并发送消息。' },
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
  const upload = async (mediaType: 'video' | 'image') => {
    if (!window.matrixDesktop || uploading || tab.binding) return;
    setUploading(true); setUploadNote('');
    try {
      const result = await window.matrixDesktop.uploadMedia({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId(), mediaType });
      if (result.error) throw new Error(result.error);
      if (result.uploadStarted) setUploadNote(`已交给官方上传控件：${result.filenames?.join('、')}。请等待官方上传结果，核对后自行点击发表；尚未发布。`);
    } catch (failure) { setUploadNote(failure instanceof Error ? failure.message : '无法准备上传，请使用官方上传按钮'); }
    finally { setUploading(false); }
  };
  const [zoom, setZoom] = useState(100);
  const [detectedAccount, setDetectedAccount] = useState('');
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return; }
    const timer = window.setTimeout(() => setSlowLoad(true), 15000);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    if (!active || !tab.binding || loading || error || !window.matrixDesktop) return;
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const result = await window.matrixDesktop!.completePlatformLogin({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId() });
        if (!cancelled) setDetectedAccount('error' in result ? '' : result.nickname);
      } catch { if (!cancelled) setDetectedAccount(''); }
      finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, tab.binding, tab.platform, tab.sessionId, loading, error]);
  useEffect(() => {
    const element = view.current;
    if (!element) return;
    const start = () => { setLoading(true); setDetectedAccount(''); setError(''); };
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
    element.addEventListener('did-stop-loading', stop);
    element.addEventListener('did-fail-load', failed);
    element.addEventListener('did-navigate', stop);
    element.addEventListener('did-navigate-in-page', stop);
    return () => {
      element.removeEventListener('did-start-loading', start);
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
  const bind = async () => {
    if (!window.matrixDesktop || !view.current) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.matrixDesktop.completePlatformLogin({ platform: tab.platform, sessionId: tab.sessionId, webContentsId: view.current.getWebContentsId() });
      if ('error' in result) throw new Error(result.error);
      const response = await axiosForBackend.post('/api/platform/accounts/desktop', { platform: result.platform, connectorSessionId: result.sessionId, nickname: result.nickname, avatarUrl: result.avatarUrl || undefined, pageUrl: result.pageUrl });
      workspace.update(tab.id, { nickname: result.nickname, binding: false, accountId: response.data?.data?.id });
      window.dispatchEvent(new Event('matrix:accounts-updated'));
      toast.success(`已绑定 ${result.nickname}`);
    } catch (failure: any) { setError(failure?.response?.data?.message || failure?.message || '绑定失败，请确认已登录'); }
    finally { setBusy(false); }
  };
  return <div className="matrix-official-browser" hidden={!active}>
    <div className="matrix-browser-toolbar"><button title="后退" aria-label="后退" disabled={!back} onClick={() => operate(() => view.current.goBack())}><ArrowLeft size={16} /></button><button title="前进" aria-label="前进" disabled={!forward} onClick={() => operate(() => view.current.goForward())}><ArrowRight size={16} /></button><button title="刷新官方页面" aria-label="刷新官方页面" onClick={() => operate(() => view.current.reload())}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button><button title="平台首页" aria-label="平台首页" onClick={() => operate(() => view.current.loadURL(tab.url))}><Home size={16} /></button><div className="matrix-address"><Globe2 size={14} /><span>{url}</span></div><div className="matrix-zoom-controls"><button aria-label="缩小官方页面" onClick={() => changeZoom(zoom - 10)}>−</button><button aria-label="重置页面缩放" onClick={() => changeZoom(100)}>{zoom}%</button><button aria-label="放大官方页面" onClick={() => changeZoom(zoom + 10)}>+</button></div><button className={helperOpen ? 'is-active' : ''} onClick={() => setHelperOpen(!helperOpen)}><Copy size={15} />文案辅助</button></div>
    <div className="matrix-intent-bar"><div>{(Object.keys(intentInfo) as Intent[]).map(intent => <button key={intent} className={tab.intent === intent ? 'is-active' : ''} onClick={() => workspace.update(tab.id, { intent })}>{intentInfo[intent].label}</button>)}</div><span>{tab.binding ? '请先完成官方登录' : `${platformLabels[tab.platform]} · ${tab.nickname}`}</span></div>
    {tab.binding ? <div className={"matrix-binding-banner " + (detectedAccount ? "is-ready" : "")}><div><strong>{detectedAccount ? `已检测到登录：${detectedAccount}` : tab.platform === "xiaohongshu" ? "小红书官方短信登录" : `用${tab.platform === "wechat" ? "微信" : platformLabels[tab.platform]} APP 扫描下方官方二维码`}</strong><small>{detectedAccount ? "核对当前账号后点击确认绑定，登录会话仅保存于本机。" : tab.platform === "xiaohongshu" ? "当前官方创作后台提供短信登录，请在下方官方页面输入手机号并完成验证；验证码不经过矩效后台。" : "手机确认登录后自动检测账号；二维码过期请刷新。此处是官方网页登录，不是开放平台 API 授权。"}</small></div><div><Button variant="outline" size="sm" disabled={busy} onClick={() => operate(() => view.current.reload())}><RefreshCw size={14} />刷新登录页</Button><Button size="sm" disabled={loading || busy} onClick={() => void bind()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{busy ? "正在绑定" : detectedAccount ? "确认绑定该账号" : "我已登录，完成绑定"}</Button><button className="matrix-cancel-binding" onClick={() => workspace.close(tab.id)}>取消绑定</button></div></div> : <div className="matrix-browser-hint"><span>{operation.instruction}</span><Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void openOperation()}>打开{intentInfo[tab.intent].label}页面</Button></div>}
    {error && <div role="alert" className="matrix-browser-error">{error}<button onClick={() => operate(() => view.current.reload())}>重试</button></div>}
    <div className="matrix-browser-body">{createElement('webview', { ref: view, src: tab.url, partition: tab.partition, className: 'matrix-official-webview', style: { display: 'flex', width: '100%', height: '100%' } })}
      {loading && <div className="matrix-login-loading" role="status"><Loader2 size={28} className="animate-spin" /><strong>{slowLoad ? "官方页面加载较慢" : "正在加载官方登录页…"}</strong><p>{slowLoad ? "请检查网络，或点击刷新登录页重新获取二维码。" : "正在获取官方登录入口，请稍候。"}</p>{slowLoad && <Button variant="outline" onClick={() => operate(() => view.current.reload())}>重新加载</Button>}</div>}
      {helperOpen && <aside className="matrix-draft-helper"><div><strong>文案辅助</strong><button aria-label="关闭文案辅助" onClick={() => setHelperOpen(false)}><X size={16} /></button></div><p>先在官方页面点击标题、正文或回复输入框，再填入文案；核对后自行提交。</p><textarea aria-label="文案辅助内容" placeholder="输入要发布的文案或回复…" value={draft} onChange={event => setDraft(event.target.value)} /><Button disabled={!draft.trim()} onClick={() => void navigator.clipboard.writeText(draft).then(() => toast.success('文案已复制')).catch(() => toast.error('复制失败，请手动选择文案复制'))}><Copy size={14} />复制文案</Button><Button variant="outline" disabled={!draft.trim() || tab.binding || loading || inserting} onClick={() => void insert()}>{inserting ? "正在填入…" : "填入选中的官方输入框"}</Button><div className="matrix-personal-upload"><Button variant="outline" disabled={tab.binding || loading || uploading || busy} onClick={() => void openOperation('publish')}>打开发表入口</Button><Button variant="outline" disabled={tab.binding || loading || uploading} onClick={() => void upload('video')}>选择视频上传</Button><Button variant="outline" disabled={tab.binding || loading || uploading} onClick={() => void upload('image')}>选择图片上传</Button><small>先进入官方发布表单；只上传本人选定素材，不自动发表。</small>{uploadNote && <p role="status">{uploadNote}</p>}</div><small>文案仅保留在当前标签内，关闭标签后清除。</small></aside>}
    </div>
    <div className="matrix-browser-status"><span><i />{loading ? '正在加载官方页面…' : '官方页面'} · {platformLabels[tab.platform]}</span><span>本机独立会话 · 操作由你确认</span></div>
  </div>;
}
