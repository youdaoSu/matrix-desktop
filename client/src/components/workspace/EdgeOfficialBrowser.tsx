import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Home, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import type { PlatformAccount } from '@shared/api.interface';
import { createAutoBinding } from './auto-binding';
import { recordAccountObservation, recordLoginObservation } from './account-observations';
import { useAccountInspection } from './use-account-inspection';
import { officialLoginUrl } from '@shared/account-availability';
import { waitForEdgeNavigation } from './edge-publish-navigation';
import { AccountSiteNavigation } from './AccountSiteNavigation';
import { accountSiteForUrl, type AccountSite } from '@shared/account-sites';

type EdgeTab = MatrixDesktopSession & { id: string; parentId?: string; nickname: string; binding: boolean; bindingGroupId?: string; accountId?: string; background?: boolean; initialUrl?: string; draftText?: string; preparation?: { title: string; body: string }; intent: string };
type Publisher = { input(): MatrixPageActionInput; open(mediaType: 'video' | 'image', fresh?: boolean, signal?: AbortSignal): Promise<void> };
export function EdgeOfficialBrowser({ tab, active, nativeAccountKey, accountManagement = false, openAccountSite, update, close, registerPublisher, registerPage }: { tab: EdgeTab; active: boolean;nativeAccountKey?:string;accountManagement?: boolean;openAccountSite?(site: AccountSite): void;
  update(id: string, patch: { nickname?: string; binding?: boolean; accountId?: string; pageTitle?: string }): void;
  close(id: string): void; registerPublisher(accountId: string, publisher: Publisher, background?: boolean): () => void;
  registerPage(id: string, input: () => MatrixPageActionInput): () => void;
}) {
  const desktop = window.matrixDesktop;
  const host = useRef<HTMLDivElement>(null), guest = useRef(''), owner = useRef('');
  const [guestId, setGuestId] = useState(''), [opening, setOpening] = useState(true), [error, setError] = useState('');
  const [status, setStatus] = useState<MatrixEdgeStatus>(), [bindingStatus, setBindingStatus] = useState(''), [busy, setBusy] = useState(false);
  const statusRef = useRef<MatrixEdgeStatus | undefined>(undefined);
  const completedNavigations = useRef(new Map<string, MatrixEdgeStatus>());
  const [zoom, setZoom] = useState(70), [generation, setGeneration] = useState(0), [showDraft, setShowDraft] = useState(false);
  const [draft, setDraft] = useState(tab.draftText || tab.preparation?.body || '');
  const callbacks = useRef({ update, close }); callbacks.current = { update, close };
  const runner = useRef<ReturnType<typeof createAutoBinding<PlatformAccount>> | undefined>(undefined);
  const latestTab = useRef(tab); latestTab.current = tab;
  useAccountInspection({ enabled: active && !tab.background && !tab.binding && !tab.parentId && tab.intent === 'manage' && accountSiteForUrl('wechat', status?.url || '') === 'manage' && !!guestId && !!status?.ready && !opening,
    accountId: tab.accountId, sessionId: tab.sessionId, platform: tab.platform, nickname: tab.nickname,
    nativeAccountKey,
    read: () => desktop!.bindEdgeGuest({ guestId: guest.current, accessToken: owner.current }) });
  const control = async (command: MatrixEdgeInput['command'], extra: Partial<MatrixEdgeInput> = {}) => {
    if (!desktop || !guest.current) return;
    const result = await desktop.controlEdgeGuest({ guestId: guest.current, accessToken: owner.current, command, ...extra });
    if (result.error) setError(result.error);
  };
  useEffect(() => {
    if (!desktop) { setOpening(false); return; }
    let disposed = false;
    const accessToken = getAuthToken(), userId = getUser()?.id; owner.current = accessToken || '';
    setOpening(true); setError('');
    statusRef.current = undefined; setStatus(undefined); completedNavigations.current.clear();
    const remove = desktop.onEdgeStatus(next => {
      if (next.guestId !== guest.current) return;
      if (next.navigationComplete && next.navigationRequestId) {
        completedNavigations.current.set(next.navigationRequestId, next);
        if (completedNavigations.current.size > 8) completedNavigations.current.delete(completedNavigations.current.keys().next().value!);
      }
      statusRef.current = next; setStatus(next); if (next.error) setError(next.error); else if (next.navigationComplete) setError('');
      callbacks.current.update(tab.id, { pageTitle: next.title });
      if (userId && latestTab.current.accountId && next.navigationComplete && officialLoginUrl('wechat', next.url)) recordAccountObservation(userId, { id: latestTab.current.accountId, connectorSessionId: tab.sessionId }, { state: 'offline', reason: '当前视频号官方页面已返回扫码登录页', checkedAt: Date.now() });
    });
    void desktop.openEdgeGuest({ platform: 'wechat', sessionId: tab.sessionId, accountId: tab.accountId, accessToken: accessToken || '' }).then(async result => {
      if ('error' in result) { if (!disposed) setError(result.error); return; }
      if (disposed) { await desktop.controlEdgeGuest({ guestId: result.guestId, accessToken: accessToken || '', command: 'close' }); return; }
      guest.current = result.guestId; setGuestId(result.guestId);
      await desktop.controlEdgeGuest({ guestId: result.guestId, accessToken: accessToken || '', command: 'zoom', zoom: .7 });
      if (tab.initialUrl && tab.initialUrl !== tab.url) await desktop.controlEdgeGuest({ guestId: result.guestId, accessToken: accessToken || '', command: 'navigate', url: tab.initialUrl });
    }).catch(() => { if (!disposed) setError('原生 Edge 页面启动失败，请重试'); }).finally(() => { if (!disposed) setOpening(false); });
    return () => { disposed = true; remove(); const id = guest.current; guest.current = ''; if (id) void desktop.controlEdgeGuest({ guestId: id, accessToken: accessToken || '', command: 'close' }); };
  }, [tab.id, tab.sessionId, tab.background, generation]);
  useEffect(() => {
    if (!guestId || !desktop) return;
    let fingerprint = '', retainedWidth = 1280, retainedHeight = 850;
    const sync = () => {
      const rect = host.current?.getBoundingClientRect(), scale = window.devicePixelRatio;
      const overlay = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], .matrix-additional-workspaces:not([hidden])')].some(element => element.getClientRects().length > 0);
      const visible = Boolean(active && rect && rect.width > 1 && rect.height > 1 && rect.left >= 0 && rect.top >= 0 && !overlay && owner.current === getAuthToken());
      const bounds = { x: visible ? Math.round((rect?.x || 0) * scale) : 0, y: visible ? Math.round((rect?.y || 0) * scale) : 0, width: tab.background && !visible ? 1280 : Math.round((rect?.width || 1280) * scale), height: tab.background && !visible ? 850 : Math.round((rect?.height || 850) * scale), visible };
      if (bounds.width > 1 && bounds.height > 1) { retainedWidth = bounds.width; retainedHeight = bounds.height; }
      const next = JSON.stringify(bounds); if (next === fingerprint) return; fingerprint = next;
      void desktop.controlEdgeGuest({ guestId, accessToken: owner.current, command: 'bounds', ...bounds }).then(result => { if (result.error && fingerprint === next) fingerprint = ''; }).catch(() => { if (fingerprint === next) fingerprint = ''; });
    };
    sync(); const timer = window.setInterval(sync, 250), observer = new ResizeObserver(sync);
    if (host.current) observer.observe(host.current);
    window.addEventListener('resize', sync);
    const restoreLayout = () => { fingerprint = ''; sync(); };
    window.addEventListener('focus', restoreLayout);
    document.addEventListener('visibilitychange', restoreLayout);
    return () => { window.clearInterval(timer); observer.disconnect(); window.removeEventListener('resize', sync); window.removeEventListener('focus', restoreLayout); document.removeEventListener('visibilitychange', restoreLayout); void desktop.controlEdgeGuest({ guestId, accessToken: owner.current, command: 'bounds', x: 0, y: 0, width: retainedWidth, height: retainedHeight, visible: false }); };
  }, [guestId, active, showDraft, error, opening, bindingStatus, tab.background]);
  useEffect(() => {
    if (!guestId || !desktop || !tab.binding) return;
    const accessToken = owner.current;
    const binding = createAutoBinding<PlatformAccount>({
      // The owned native bridge already confirms the same identity for three seconds.
      // Do not add a second three-second countdown in the renderer.
      confirmationMilliseconds: 0,
      isCurrent: () => Boolean(accessToken && getAuthToken() === accessToken && guest.current === guestId),
      detect: async () => { const userId = getUser()?.id, checkedAt = Date.now(), result = await desktop.bindEdgeGuest({ guestId, accessToken }); if (userId && tab.accountId) recordLoginObservation(userId, { id: tab.accountId, connectorSessionId: tab.sessionId, platform: 'wechat', nickname: tab.nickname }, result, checkedAt); return result; },
      persist: async result => { const response = await axiosForBackend.post('/api/platform/accounts/desktop', { platform: result.platform, connectorSessionId: result.sessionId, nickname: result.nickname, avatarUrl: result.avatarUrl || undefined, nativeAccountKey:result.ownIdentity?.key, pageUrl: result.pageUrl, groupId: tab.bindingGroupId }); if (!response.data?.data?.id) throw Error('账号保存结果不完整'); return response.data.data; },
      detected: result => { setBindingStatus(`已识别：${result.nickname}`); setError(''); },
      saved: (result, account) => { const userId = getUser()?.id; if (userId) recordAccountObservation(userId, account, { state: 'normal', reason: '已完成稳定的本人官方登录识别并保存绑定', checkedAt: Date.now() }); callbacks.current.update(tab.id, { nickname: result.nickname, binding: false, accountId: account.id }); window.dispatchEvent(new Event('matrix:accounts-updated')); toast.success(`已绑定视频号 ${result.nickname}`); },
      failed: setError, saving: setBusy, waiting: setBindingStatus,    });
    runner.current = binding; void binding.run();
    const timer = window.setInterval(() => void binding.run(), 1000);
    return () => { binding.dispose(); window.clearInterval(timer); runner.current = undefined; };
  }, [guestId, tab.binding, tab.id, tab.bindingGroupId]);
  useEffect(() => {
    if (!tab.accountId || tab.binding || tab.background || !guestId) return;
    return registerPage(tab.id, () => {
      if (!owner.current || owner.current !== getAuthToken() || !guest.current || !statusRef.current?.ready) throw Error('视频号官方页面尚未就绪');
      return { platform:'wechat', sessionId:tab.sessionId, accountId:tab.accountId!,accessToken:owner.current,webContentsId:0,edgeGuestId:guest.current };
    });
  }, [tab.accountId, tab.binding, tab.background, tab.id, tab.sessionId, guestId, registerPage]);
  useEffect(() => {
    if (!tab.accountId || tab.parentId || tab.binding || !guestId || !desktop) return;
    const input = (): MatrixPageActionInput => {
      if (!owner.current || owner.current !== getAuthToken() || !guest.current || !statusRef.current?.ready) throw Error('视频号原生官方页面尚未就绪或用户已变化');
      return { platform: 'wechat', sessionId: tab.sessionId, accountId: tab.accountId!, accessToken: owner.current, webContentsId: 0, edgeGuestId: guest.current };
    };
    return registerPublisher(tab.accountId, { input, open: async (mediaType, fresh = false, signal) => {
      const check = () => { if (signal?.aborted) throw Error('本次视频号发布准备已停止'); };
      check();
      const page = input(), current = statusRef.current?.url || '';
      if (/\/post\/create(?:\/|$)/.test(current) && !fresh) return;
      if (/\/post\/create(?:\/|$)/.test(current) && fresh && !tab.background) throw Error('视频号前台已有发布编辑器，不会覆盖未保存内容；请使用独立后台发布任务');
      const navigate = await desktop.controlEdgeGuest({ guestId: page.edgeGuestId!, accessToken: page.accessToken, command: 'navigate', url: 'https://channels.weixin.qq.com/platform' });
      if (navigate.error) throw Error(navigate.error);
      await waitForEdgeNavigation(navigate.navigationRequestId, id => completedNavigations.current.get(id), check, ms => new Promise(resolve => setTimeout(resolve, ms)));
      for (let attempt = 0; attempt < 150; attempt++) {
        check();
        const result = await desktop.openEdgePublishEntry({ ...input(), mediaType });
        check();
        if (result.opened) return;
        if (result.error && !/正在切换|尚未就绪|已变化|未准备|Execution context|Cannot find context/.test(result.error)) throw Error(result.error);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw Error('视频号官方发布入口尚未就绪，请检查当前账号发布权限');
    } }, tab.background);
  }, [tab.accountId, tab.binding, tab.background, tab.sessionId, guestId, registerPublisher]);
  return <div className="matrix-official-browser" hidden={!active} data-edge-publish-job={tab.background ? guestId : undefined}>
    <div className="matrix-browser-toolbar">
      <button aria-label="后退" disabled={!status?.back} onClick={() => void control('back')}><ArrowLeft size={16}/></button>
      <button aria-label="前进" disabled={!status?.forward} onClick={() => void control('forward')}><ArrowRight size={16}/></button>
      <button aria-label="刷新官方页面" disabled={opening} onClick={() => void control('reload')}><RefreshCw size={16}/></button>
      <button aria-label="平台首页" onClick={() => void control('navigate', { url: tab.url })}><Home size={16}/></button>
      <div className="matrix-address"><span>{status?.url || tab.url}</span></div>
      <span className="text-xs text-muted-foreground">原生 Edge · 内嵌</span>
      <div className="matrix-zoom-controls"><button aria-label="缩小官方页面" onClick={() => { const next = Math.max(50, zoom - 10); setZoom(next); void control('zoom', { zoom: next / 100 }); }}>−</button><span>{zoom}%</span><button aria-label="放大官方页面" onClick={() => { const next = Math.min(150, zoom + 10); setZoom(next); void control('zoom', { zoom: next / 100 }); }}>+</button></div>
      <button onClick={() => setShowDraft(!showDraft)}><Copy size={15}/>文案辅助</button>
    </div>
    {accountManagement && !tab.binding && !tab.background && openAccountSite && <AccountSiteNavigation platform="wechat" url={status?.url || tab.initialUrl || tab.url} nickname={`视频号 · ${tab.nickname}`} open={openAccountSite} />}
    {tab.binding ? <div className="matrix-binding-banner"><div><strong>微信视频号 · 原生 Edge 登录</strong><small>在远效内扫码并在手机确认；检测到稳定的本人昵称后自动绑定。新会话需重新扫码，不迁移其他浏览器 Cookie。</small></div><div>{error && <Button size="sm" disabled={opening || busy || !guestId} onClick={() => void runner.current?.run(false)}>{busy ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>}重试自动识别</Button>}<button className="matrix-cancel-binding" onClick={() => close(tab.id)}>取消绑定</button></div></div> : accountManagement ? null : <div className="matrix-browser-hint"><span>视频号 · {tab.nickname}。上传、发布和互动可直接在下方官方页面操作；自动适配仍待真实核验。</span><Button variant="outline" size="sm" onClick={() => void control('navigate', { url: 'https://channels.weixin.qq.com/platform/home' })}>打开官方后台</Button></div>}
    {bindingStatus && !error && <div role="status" className="matrix-browser-hint">{bindingStatus}</div>}
    {status?.loginLoop && !bindingStatus && <div role="status" className="matrix-browser-error">扫码确认后官方页面又退回了登录页，尚未登录成功；请保留当前页继续核验。</div>}
    {error && <div role="alert" className="matrix-browser-error">{error}<button onClick={() => { setError(''); if (guestId) void control('reload'); else setGeneration(value => value + 1); }}>重试</button></div>}
    <div className="matrix-browser-body">
      <div ref={host} className="matrix-edge-host" data-edge-guest-id={guestId} data-edge-url={status?.url || ''} aria-label="视频号原生 Edge 内嵌页面" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {opening && <div className="matrix-login-loading"><Loader2 className="animate-spin" size={28}/><strong>正在启动原生内嵌 Edge…</strong><p>原有账号及数据不变，不会打开外部浏览器窗口。</p></div>}
      </div>
      {showDraft && <aside className="matrix-draft-helper"><strong>文案辅助</strong><p>复制标题或简介后，粘贴到下方官方发布表单。</p>{tab.preparation && <><Button variant="outline" onClick={() => setDraft(tab.preparation!.title)}>使用通用标题</Button><Button variant="outline" onClick={() => setDraft(tab.preparation!.body)}>使用通用简介</Button></>}<textarea aria-label="视频号文案辅助" value={draft} onChange={event => setDraft(event.target.value)}/><Button disabled={!draft.trim()} onClick={() => void navigator.clipboard.writeText(draft).then(() => toast.success('文案已复制')).catch(() => toast.error('复制失败，请手动复制'))}>复制文案</Button><small>当前为真实内嵌官方页面，自动上传尚未验证；复制不会提交发布。</small></aside>}
    </div>
    <div className="matrix-browser-status"><span>原生 Edge WebView2 · 账号独立本地会话</span><span>登录凭据仅由浏览器保存在本机</span></div>
  </div>;
}
