import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, CircleDashed, Search, ShieldCheck } from 'lucide-react';
import { featureDeliveries, deliveryLabels, type DeliveryState } from '@shared/feature-delivery';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function FeatureStatusPage() {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<DeliveryState | 'all'>('all');
  const rows = useMemo(() => featureDeliveries.filter(row => (filter === 'all' || row.state === filter) && `${row.name} ${row.group} ${row.scope} ${row.limitation}`.includes(query.trim())), [query, filter]);
  return <div className="matrix-capability-page">
    <header className="matrix-data-heading"><div><span className="matrix-eyebrow">DELIVERY & EVIDENCE</span><h1>功能与数据来源</h1><p>按当前代码的实际接入范围盘点，不把页面入口当成功能已经交付。</p></div><ShieldCheck size={30} /></header>
    <div className="matrix-capability-counts">{(['available', 'partial', 'pending'] as const).map(state => <button key={state} className={`matrix-capability-count ${state}`} aria-pressed={filter === state} onClick={() => setFilter(filter === state ? 'all' : state)}><span>{deliveryLabels[state]}</span><strong>{featureDeliveries.filter(row => row.state === state).length}</strong><small>项功能范围</small></button>)}</div>
    <div className="matrix-data-panel"><h2>三类真实数据，不混加</h2><div className="matrix-source-grid"><article><strong>业务数据库</strong><p>已保存草稿、内容、评论、私信等记录；不代表平台全量。</p></article><article><strong>桌面采集缓存</strong><p>当前绑定账号的官网可访问内容；显示采集覆盖和未完成状态。</p></article><article><strong>本人主页计数</strong><p>带来源与采集时间的精确计数；名单长度不替代粉丝总数。</p></article></div></div>
    <div className="matrix-capability-toolbar"><label><Search size={16} /><Input aria-label="搜索功能" placeholder="搜索功能、平台或限制" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="交付状态筛选" value={filter} onChange={event => setFilter(event.target.value as DeliveryState | 'all')}><option value="all">全部状态</option>{Object.entries(deliveryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span>{rows.length} 项</span></div>
    <div className="matrix-capability-list">{rows.map(row => <article key={row.id}><div className="matrix-capability-title"><span className={`matrix-delivery-badge ${row.state}`}>{row.state === 'available' ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}{deliveryLabels[row.state]}</span><small>{row.group}</small><h2>{row.name}</h2></div><p>{row.scope}</p><p className="matrix-data-note">{row.limitation}</p><Button asChild size="sm" variant="ghost"><Link to={row.to}>查看功能<ArrowUpRight size={13} /></Link></Button></article>)}</div>
    {!rows.length && <p role="status" className="matrix-data-panel">没有符合条件的功能。</p>}
    <p className="matrix-data-note">“已实现”描述代码能力，不是当前账号已验证或所有请求必成功。平台权限、验证码、实时采集与本机环境仍须分别核验。</p>
  </div>;
}
