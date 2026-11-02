import { useCallback, useEffect, useRef, useState } from 'react';
import { uiPage, useWorkspacePreference } from '@/components/workspace/WorkspaceUiState';
import { ShieldCheck } from 'lucide-react';
import type { PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function AccountHealthPage() {
  const workspace = useOfficialWorkspace();
  const [items, setItems] = useState<PlatformAccount[]>([]);
  const [results, setResults] = useState<Record<string, { message: string; checkedAt: string }>>({});
  const [page, setPage] = useWorkspacePreference('accounts.health.page', 1, uiPage), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false), [checking, setChecking] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError('');
    try { const r = await axiosForBackend.get('/api/platform/accounts', { params: { page, pageSize: 20 } }); if (current === generation.current) { setItems(r.data.data.items); setTotal(r.data.data.total); } }
    catch (e: any) { if (current === generation.current) { setItems([]); setError(e?.response?.data?.error?.message || '加载账号失败，请重试'); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  const check = async () => {
    if (lock.current || !window.matrixDesktop) return;
    lock.current = true; setChecking(true);
    try {
      for (const account of items) {
        if (!alive.current) break;
        let message = '该账号为 API 授权，无法检查本机网页登录凭据';
        if (account.connectorSessionId) {
          try { message = (await window.matrixDesktop.checkPlatformSession(account.platform, account.connectorSessionId)).message; }
          catch { message = '检查失败，请重试；不据此判定账号失效'; }
        }
        if (alive.current) setResults(previous => ({ ...previous, [account.id]: { message, checkedAt: new Date().toLocaleString('zh-CN') } }));
      }
    } finally { lock.current = false; if (alive.current) setChecking(false); }
  };
  return <div className="space-y-5" data-matrix-account-health><Alert><ShieldCheck size={16} /><AlertDescription>检查当前页账号在本机是否保留登录凭据，不读取密码、不导出 Cookie，也不改变绑定状态。凭据存在不等于平台仍接受登录；请打开官方页面确认。此页不是平台风控、违规或粉丝实时监测。</AlertDescription></Alert><div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">账号会话检查</h1><div className="flex gap-2"><Button variant="outline" disabled={loading || checking} onClick={() => void load()}>刷新账号</Button><Button disabled={!window.matrixDesktop || checking || loading || !items.length} onClick={() => void check()}>{checking ? '检查中…' : '检查当前页会话'}</Button></div></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{!window.matrixDesktop && <p className="text-sm text-muted-foreground">本机凭据检查需要远效桌面版。</p>}{items.map(account => <Card key={account.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{platformLabels[account.platform]} · {account.nickname || '未命名账号'}</strong><p className="mt-2 text-sm">{results[account.id]?.message || '尚未检查本机凭据'}</p>{results[account.id] && <p className="text-xs text-muted-foreground">检查时间：{results[account.id].checkedAt}</p>}</div><Button variant="outline" onClick={() => void workspace.openAccount(account, 'manage')}>打开官方页面确认</Button></CardContent></Card>)}{!items.length && !loading && !error && <p>尚未绑定账号。</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={page === 1 || loading || checking} onClick={() => setPage(p => p - 1)}>上一页</Button><span className="p-2 text-sm">第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><Button variant="outline" disabled={page * 20 >= total || loading || checking} onClick={() => setPage(p => p + 1)}>下一页</Button></div></div>;
}
