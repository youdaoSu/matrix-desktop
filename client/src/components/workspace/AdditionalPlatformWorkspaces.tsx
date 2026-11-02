import { createElement, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Globe2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { getAuthToken } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { PlatformType } from '@shared/api.interface';
import catalog from '../../../../desktop/account-platforms.json';
import { useLocation } from 'react-router-dom';
import { PlatformLogo } from './PlatformLogo';

export const openPlatformDirectory = (provider?: string) => window.dispatchEvent(new CustomEvent('matrix:platform-directory', { detail: { provider } }));
type PlatformEntry = { id: string; label: string; group: string; core?: boolean; custom?: boolean; url?: string; pending?: string };
type ExtraTab = MatrixExtraWorkspace & { partition: string };
export function AdditionalPlatformWorkspaces({ bindCore }: { bindCore(platform: PlatformType): Promise<void> }) {
  const { pathname } = useLocation();
  const canManageAccounts = pathname === '/accounts';
  const canManageRef = useRef(canManageAccounts); canManageRef.current = canManageAccounts;
  const [visible, setVisible] = useState(false), [query, setQuery] = useState(''), [selected, setSelected] = useState<PlatformEntry>();
  const [name, setName] = useState(''), [remark, setRemark] = useState(''), [customUrl, setCustomUrl] = useState('');
  const [workspaces, setWorkspaces] = useState<MatrixExtraWorkspace[]>([]), [tabs, setTabs] = useState<ExtraTab[]>([]), [active, setActive] = useState(''), [busy, setBusy] = useState(false);
  const owner = useRef('');
  const call = async (input: Omit<Parameters<NonNullable<Window['matrixDesktop']>['extraPlatformWorkspaces']>[0], 'accessToken'>) => {
    if (!window.matrixDesktop?.extraPlatformWorkspaces) throw Error('请使用完整远效 Windows 安装版打开更多平台工作区');
    const token = getAuthToken(); if (!token) throw Error('请先登录远效');
    const result = await window.matrixDesktop.extraPlatformWorkspaces({ ...input, accessToken: token }); if (result.error) throw Error(result.error); return result;
  };
  const refresh = async () => { try { const result = await call({ command: 'list' }); setWorkspaces(result.items || []); } catch (failure) { toast.error(failure instanceof Error ? failure.message : '工作区加载失败'); } };
  useEffect(() => {
    const open = (event: Event) => { if (!canManageRef.current) return; const token = getAuthToken() || ''; if (owner.current !== token) { setTabs([]); setActive(''); setWorkspaces([]); owner.current = token; } const requested = catalog.find(entry => entry.id === (event as CustomEvent).detail?.provider); if (requested && !requested.core) { setSelected(requested); setName(`${requested.label}账号`); setActive(''); } setVisible(true); void refresh(); };
    window.addEventListener('matrix:platform-directory', open);
    const timer = window.setInterval(() => { if (owner.current && owner.current !== getAuthToken()) { setVisible(false); setTabs([]); setWorkspaces([]); owner.current = ''; } }, 1000);
    return () => { window.removeEventListener('matrix:platform-directory', open); window.clearInterval(timer); };
  }, []);
  useEffect(() => { if (!canManageAccounts) setVisible(false); }, [canManageAccounts]);
  const openWorkspace = async (id: string) => {
    try { const result = await call({ command: 'open', id }); if (!result.item || !result.session) throw Error('工作区会话未准备好');
      setTabs(current => current.some(item => item.id === id) ? current : [...current, { ...result.item!, ...result.session! }]); setActive(id);
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : '打开失败'); }
  };
  const add = async () => {
    if (!selected || !canManageRef.current) return; setBusy(true);
    try { const result = await call({ command: 'add', provider: selected.id, name, remark, url: selected.custom ? customUrl : undefined }); if (!result.item) throw Error('未保存工作区');
      setSelected(undefined); setName(''); setRemark(''); setCustomUrl(''); await refresh(); await openWorkspace(result.item.id); toast.success('独立工作区已保存；请在官方页面登录，未自动认定授权成功');
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : '保存失败'); } finally { setBusy(false); }
  };
  const entries = (catalog as PlatformEntry[]).filter(entry => `${entry.label} ${entry.group}`.toLowerCase().includes(query.toLowerCase()));
  const shown = visible && canManageAccounts;
  return <section hidden={!shown} aria-label="更多平台独立工作区" className="matrix-additional-workspaces" style={{ position: 'fixed', inset: '60px 12px 12px', zIndex: 60, display: shown ? 'flex' : 'none', flexDirection: 'column', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
    <header className="flex items-center justify-between border-b p-3"><div><strong>平台目录与独立账号工作区</strong><p className="text-xs text-muted-foreground">对照小v猫的 29 类平台；工作区、真实授权、自动发布能力分别标明，不混为“已支持”。</p></div><Button variant="outline" onClick={() => setVisible(false)}><ArrowLeft size={14}/>收起，保留页面</Button></header>
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <aside className="border-r p-3" style={{ width: 280, overflowY: 'auto', flexShrink: 0 }}>
        <div className="flex gap-2"><Input aria-label="搜索更多平台" placeholder="搜索平台或分类" value={query} onChange={event => setQuery(event.target.value)}/><Button size="icon" variant="outline" onClick={() => void refresh()} aria-label="刷新更多平台工作区"><RefreshCw size={15}/></Button></div>
        <div className="grid grid-cols-2 gap-2 mt-3">{entries.map(entry => <button key={entry.id} className="rounded-lg border p-2 text-left hover:bg-muted" onClick={() => {
          if (entry.core) { setVisible(false); void bindCore(entry.id as PlatformType); }
          else { setSelected(entry); setName(`${entry.label}账号`); setActive(''); }
        }}><span className="flex items-center gap-2 text-sm"><PlatformLogo platform={entry.id} size={24} />{entry.label}</span><small className="text-muted-foreground">{entry.core ? '专门适配入口' : entry.pending ? '待核验 / 适配' : '独立工作区'}</small></button>)}</div>
        <h3 className="mt-5 mb-2 text-sm font-semibold">已保存工作区（{workspaces.length}）</h3>
        {workspaces.map(item => <button key={item.id} className="w-full rounded border p-2 mb-2 text-left hover:bg-muted" onClick={() => void openWorkspace(item.id)}><strong className="text-sm block">{item.name}</strong><span className="text-xs text-muted-foreground">{item.label} · {item.remark || '登录状态以官方页面为准'}</span></button>)}
      </aside>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {selected && <div className="p-6 max-w-xl"><h2 className="text-lg font-semibold">{selected.label}</h2>
          {selected.pending ? <div className="mt-4 rounded border p-4 text-sm"><p>{selected.pending}</p><p className="mt-2 text-muted-foreground">该项目已列入完整平台目录，目前不能创建“已授权”账号或自动发布。不会指向不明网址让你输入密码。</p><Button variant="outline" className="mt-4" onClick={() => setSelected(undefined)}>返回目录</Button></div> : <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">提供账号独立的内嵌官方浏览器。此类平台尚未接通自动昵称识别和自动发布；保存工作区名称不等于平台授权成功。</p>
            <label className="block text-sm">工作区名称<Input value={name} onChange={event => setName(event.target.value)} placeholder="便于区分的账号名称"/></label>
            <label className="block text-sm">备注<Input value={remark} onChange={event => setRemark(event.target.value)} placeholder="可选"/></label>
            {selected.custom && <label className="block text-sm">平台官方 HTTPS 地址<Input value={customUrl} onChange={event => setCustomUrl(event.target.value)} placeholder="https://平台官方网址/"/></label>}
            {!selected.custom && <p className="text-xs break-all text-muted-foreground">官方网址：{selected.url}</p>}
            <Button disabled={busy || !name.trim() || (selected.custom && !customUrl.trim())} onClick={() => void add()}><Plus size={14}/>{busy ? '正在保存…' : '保存并在远效内打开'}</Button>
          </div>}
        </div>}
        <div className="flex border-b gap-1 p-2" hidden={!tabs.length}>{tabs.map(tab => <div key={tab.id} className="flex items-center rounded border"><button className="px-3 py-2 text-xs" onClick={() => { setSelected(undefined); setActive(tab.id); }}>{tab.name}</button><button aria-label={`关闭工作区 ${tab.name}`} className="p-2" onClick={() => { setTabs(current => current.filter(item => item.id !== tab.id)); if (active === tab.id) setActive(''); }}><X size={12}/></button></div>)}</div>
        {tabs.map(tab => <AdditionalBrowser key={tab.id} tab={tab} active={tab.id === active && !selected}/>) }
        {!selected && !active && <div className="m-auto p-8 text-center text-muted-foreground"><Globe2 className="mx-auto mb-3"/><p>从左侧选择平台，或打开已保存的独立账号工作区。</p><p className="text-xs mt-2">登录会话保存在本机，关闭标签不会删除浏览器账号数据。</p></div>}
      </div>
    </div>
  </section>;
}
function AdditionalBrowser({ tab, active }: { tab: ExtraTab; active: boolean }) {
  const view = useRef<any>(null); const [url, setUrl] = useState(tab.url), [error, setError] = useState('');
  useEffect(() => { const element = view.current; const update = () => { try { const current = new URL(element.getURL()); setUrl(current.origin + current.pathname); } catch {} }; const failed = (event: any) => { if (event.isMainFrame !== false && event.errorCode !== -3) setError(`官方页面加载失败（${event.errorDescription || event.errorCode}），原工作区未删除。`); };
    element.addEventListener('did-navigate', update); element.addEventListener('did-fail-load', failed);
    return () => { element.removeEventListener('did-navigate', update); element.removeEventListener('did-fail-load', failed); };
  }, []);
  return <div hidden={!active} style={{ display: active ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
    <div className="flex items-center gap-2 border-b p-2"><Button size="sm" variant="outline" onClick={() => { setError(''); view.current.reload(); }}><RefreshCw size={13}/>刷新</Button><Button size="sm" variant="outline" onClick={() => void view.current.loadURL(tab.url)}>官方首页</Button><span className="text-xs text-muted-foreground truncate">{url}</span></div>
    <p className="border-b p-2 text-xs text-muted-foreground">独立会话工作区 · 登录状态请查看官方页面 · 未接通自动识别及自动发布，不会自动提交任何操作。</p>
    {error && <p role="alert" className="p-2 text-sm text-destructive">{error}</p>}
    {createElement('webview', { ref: view, src: tab.url, partition: tab.partition, style: { display: 'flex', width: '100%', flex: 1, minHeight: 0 } })}
  </div>;
}
