import { useEffect, useRef, useState } from 'react';
import type { PlatformAccount } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useOfficialWorkspace } from './OfficialWorkspace';

export function dynamicField(label: string): '音乐' | '商品' | '合集' | undefined {
  if (label.includes('合集')) return '合集';
  if (label.includes('商品') || label === '添加标签 / 挂载') return '商品';
  if (label === '音乐') return '音乐';
}

export function OfficialOptionPicker({ account, field, disabled, onSelect }: {
  account: PlatformAccount; field: '音乐' | '商品' | '合集'; disabled?: boolean; onSelect(label: string): void;
}) {
  const workspace = useOfficialWorkspace();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState<{ nonce: string; guest: number; items: { index: number; label: string }[]; source: string; capturedAt: string }>();
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (disabled) { generation.current++; setBusy(false); setPlan(undefined); setOpen(false); } }, [disabled]);
  const run = async (command: 'options' | 'open-options' | 'select-option', index?: number) => {
    const version = ++generation.current;
    setBusy(true); setMessage('');
    try {
      if (!window.matrixDesktop?.officialData) throw Error('请使用支持动态选项的新版矩效桌面端');
      const page = workspace.page(account.id);
      if (!page) throw Error('请先打开该账号的官方发布页，展开对应选择框，再回到这里读取');
      const input = page();
      if (command === 'select-option' && input.webContentsId !== plan?.guest) throw Error('账号子页面已切换，请重新读取候选项');
      const result = await window.matrixDesktop.officialData({ ...input, command, field, index, nonce: plan?.nonce });
      if (version !== generation.current) return;
      if (result.error) throw Error(result.error);
      if (command === 'options') setPlan({ nonce: result.nonce!, guest: input.webContentsId, items: result.items || [], source: result.source || '', capturedAt: result.capturedAt || '' });
      else if (command === 'open-options') { setPlan(undefined); setMessage('已尝试展开，请点击“读取当前候选项”。'); }
      else {
        const label = plan?.items.find(item => item.index === index)?.label;
        if (label) onSelect(label);
        setPlan(undefined);
        setMessage(result.applied ? '已选入当前官方编辑器，并记入本账号配置。新建后台任务仍需核对该选项，不代表已发布。' : '已点击官方候选项，并记下所选名称；官方是否已应用仍需在内嵌页面确认。');
      }
    } catch (error) { if (version === generation.current) { setPlan(undefined); setMessage(error instanceof Error ? error.message : '读取失败，请重试'); } }
    finally { if (version === generation.current) setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>选择官方{field}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{account.nickname} · 官方{field}</DialogTitle><DialogDescription>只读取当前账号已展开的官方列表，不生成示例候选项。请先在官方页搜索，再返回读取。此操作不发布作品。</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setOpen(false); void workspace.openAccount(account, 'manage'); }}>打开账号页面</Button><Button variant="outline" disabled={busy} onClick={() => void run('open-options')}>尝试展开{field}</Button><Button disabled={busy} onClick={() => void run('options')}>{busy ? '处理中…' : '读取当前候选项'}</Button></div>
      {message && <p role="status" className="text-sm text-orange-700">{message}</p>}
      {plan && <><small className="break-all text-muted-foreground">来源：{plan.source} · {new Date(plan.capturedAt).toLocaleString()} · 最多 100 项，2 分钟后失效</small><Input aria-label="筛选官方候选项" placeholder="筛选当前已读取结果" value={query} onChange={event => setQuery(event.target.value)} /><div className="max-h-72 space-y-2 overflow-auto">{plan.items.filter(item => item.label.includes(query)).map(item => <Button className="h-auto w-full justify-start whitespace-normal text-left" variant="outline" disabled={busy} key={item.index} onClick={() => void run('select-option', item.index)}>{item.label}</Button>)}</div></>}
      <p className="text-xs text-muted-foreground">仅当前账号、当前官方编辑器生效；合并设置只同步名称，不会替其他账号选择商品或音乐。官方列表无法识别时仍需手动选择。</p>
    </DialogContent></Dialog>
  </>;
}
