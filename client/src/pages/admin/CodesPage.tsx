import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import {
  KeyRound,
  Plus,
  Search,
  Copy,
  Check,
  MoreHorizontal,
  Eye,
  Ban,
  PlayCircle,
  Trash2,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { ActivationCode, VipPlan } from '@shared/api.interface';

const PLANS: VipPlan[] = [
  { id: 'p1', name: '月度会员', code: 'monthly', durationDays: 30, maxAccounts: 5, price: '99', status: 'active', sortOrder: 1 },
  { id: 'p2', name: '季度会员', code: 'quarterly', durationDays: 90, maxAccounts: 10, price: '259', status: 'active', sortOrder: 2 },
  { id: 'p3', name: '年度会员', code: 'yearly', durationDays: 365, maxAccounts: 20, price: '899', status: 'active', sortOrder: 3 },
  { id: 'p4', name: '企业版', code: 'enterprise', durationDays: 365, maxAccounts: 50, price: '2999', status: 'active', sortOrder: 4 },
];

const BATCH_NOS = ['B20250901', 'B20250915', 'B20250928', 'B20251010', 'B20251025'];
const USER_NAMES = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十', '郑十一', '冯十二'];

function genCode(prefix: string, idx: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += chars[Math.floor((idx * 9301 + i * 49297) % chars.length)];
  }
  return (prefix || '') + s;
}

function generateMockCodes(): ActivationCode[] {
  const codes: ActivationCode[] = [];
  const statuses: Array<'unused' | 'used' | 'disabled'> = ['unused', 'unused', 'unused', 'used', 'used', 'disabled'];
  for (let i = 0; i < 100; i++) {
    const plan = PLANS[i % PLANS.length];
    const batchNo = BATCH_NOS[i % BATCH_NOS.length];
    const status = statuses[i % statuses.length];
    const isUsed = status === 'used';
    const userIdx = i % USER_NAMES.length;
    const createdAt = new Date(2025, 8 + (i % 3), 1 + (i % 27), 10 + (i % 10), (i * 7) % 60);
    const activatedAt = isUsed
      ? new Date(createdAt.getTime() + (i % 10 + 1) * 86400000).toISOString()
      : undefined;
    codes.push({
      id: `c${i + 1}`,
      code: genCode('', i + 1000 + i * 3),
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      maxAccounts: plan.maxAccounts,
      status,
      userId: isUsed ? `u${userIdx + 1}` : undefined,
      username: isUsed ? USER_NAMES[userIdx] : undefined,
      activatedAt,
      batchNo,
      remark: i % 7 === 0 ? '运营活动发放' : undefined,
      createdAt: createdAt.toISOString(),
    });
  }
  return codes;
}

const MOCK_CODES = generateMockCodes();

function maskCode(code: string): string {
  if (code.length <= 8) return code;
  return `${code.slice(0, 4)}****${code.slice(-4)}`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function statusBadge(status: 'unused' | 'used' | 'disabled') {
  const map = {
    unused: { label: '未使用', variant: 'secondary' as const, className: 'bg-slate-100 text-slate-600 border-slate-200' },
    used: { label: '已使用', variant: 'default' as const, className: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    disabled: { label: '已禁用', variant: 'destructive' as const, className: 'bg-red-50 text-red-600 border-red-200' },
  };
  return map[status];
}

export default function CodesPage() {
  const [codes, setCodes] = useState<ActivationCode[]>(MOCK_CODES);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [batchSearch, setBatchSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailCode, setDetailCode] = useState<ActivationCode | null>(null);

  // Batch generate form
  const [genStep, setGenStep] = useState<1 | 2>(1);
  const [genPlanId, setGenPlanId] = useState(PLANS[0].id);
  const [genDuration, setGenDuration] = useState('30');
  const [genMaxAccounts, setGenMaxAccounts] = useState('5');
  const [genCount, setGenCount] = useState('10');
  const [genPrefix, setGenPrefix] = useState('');
  const [genRemark, setGenRemark] = useState('');
  const [generatedCodes, setGeneratedCodes] = useState<ActivationCode[]>([]);

  const filteredCodes = useMemo(() => {
    return codes.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (planFilter && c.planId !== planFilter) return false;
      if (batchSearch && !c.batchNo?.toLowerCase().includes(batchSearch.toLowerCase())) return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        if (!c.code.toLowerCase().includes(kw) && !c.username?.toLowerCase().includes(kw)) return false;
      }
      if (dateFrom) {
        const fromTs = new Date(dateFrom).getTime();
        if (new Date(c.createdAt).getTime() < fromTs) return false;
      }
      if (dateTo) {
        const toTs = new Date(dateTo).getTime() + 86400000;
        if (new Date(c.createdAt).getTime() >= toTs) return false;
      }
      return true;
    });
  }, [codes, statusFilter, planFilter, batchSearch, keyword, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredCodes.length / pageSize));
  const pagedCodes = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCodes.slice(start, start + pageSize);
  }, [filteredCodes, page, pageSize]);

  const stats = useMemo(() => {
    const total = codes.length;
    const unused = codes.filter((c) => c.status === 'unused').length;
    const used = codes.filter((c) => c.status === 'used').length;
    const disabled = codes.filter((c) => c.status === 'disabled').length;
    return { total, unused, used, disabled };
  }, [codes]);

  const allSelectedOnPage = pagedCodes.length > 0 && pagedCodes.every((c) => selectedIds.has(c.id));
  const someSelectedOnPage = pagedCodes.some((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allSelectedOnPage) {
      pagedCodes.forEach((c) => next.delete(c.id));
    } else {
      pagedCodes.forEach((c) => next.add(c.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // noop
    }
  };

  const handleViewDetail = (code: ActivationCode) => {
    setDetailCode(code);
    setDetailDialogOpen(true);
  };

  const handleToggleStatus = (id: string) => {
    setCodes(codes.map((c) => {
      if (c.id !== id) return c;
      if (c.status === 'disabled') return { ...c, status: 'unused' as const };
      return { ...c, status: 'disabled' as const };
    }));
    if (detailCode?.id === id) {
      setDetailCode((prev) => prev ? { ...prev, status: prev.status === 'disabled' ? 'unused' : 'disabled' } : null);
    }
  };

  const handleVoid = (id: string) => {
    setCodes(codes.map((c) => (c.id === id ? { ...c, status: 'disabled' as const } : c)));
    if (detailCode?.id === id) setDetailCode((prev) => prev ? { ...prev, status: 'disabled' } : null);
  };

  const handleBatchDisable = () => {
    setCodes(codes.map((c) => (selectedIds.has(c.id) ? { ...c, status: 'disabled' as const } : c)));
    setSelectedIds(new Set());
  };

  const handleBatchEnable = () => {
    setCodes(codes.map((c) => (selectedIds.has(c.id) && c.status === 'disabled' ? { ...c, status: 'unused' as const } : c)));
    setSelectedIds(new Set());
  };

  const handleBatchExport = () => {
    const selected = codes.filter((c) => selectedIds.has(c.id));
    exportCSV(selected);
    setSelectedIds(new Set());
  };

  const exportCSV = (list: ActivationCode[]) => {
    const headers = ['授权码', '套餐', '时长(天)', '账号额度', '状态', '绑定用户', '激活时间', '批次号', '生成时间', '备注'];
    const rows = list.map((c) => [
      c.code,
      c.planName || '',
      String(c.durationDays),
      String(c.maxAccounts),
      statusBadge(c.status).label,
      c.username || '',
      c.activatedAt ? formatDate(c.activatedAt) : '',
      c.batchNo || '',
      formatDate(c.createdAt),
      c.remark || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activation-codes-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerate = () => {
    const count = Math.min(Math.max(1, parseInt(genCount, 10) || 1), 1000);
    const plan = PLANS.find((p) => p.id === genPlanId) || PLANS[0];
    const now = new Date();
    const batchNo = `B${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const newCodes: ActivationCode[] = [];
    for (let i = 0; i < count; i++) {
      newCodes.push({
        id: `cg${Date.now()}_${i}`,
        code: genCode(genPrefix, Date.now() + i * 7 + i * 13),
        planId: plan.id,
        planName: plan.name,
        durationDays: parseInt(genDuration, 10) || plan.durationDays,
        maxAccounts: parseInt(genMaxAccounts, 10) || plan.maxAccounts,
        status: 'unused',
        batchNo,
        remark: genRemark || undefined,
        createdAt: now.toISOString(),
      });
    }
    setGeneratedCodes(newCodes);
    setCodes([...newCodes, ...codes]);
    setGenStep(2);
  };

  const openGenerateDialog = () => {
    setGenStep(1);
    setGenPlanId(PLANS[0].id);
    setGenDuration('30');
    setGenMaxAccounts('5');
    setGenCount('10');
    setGenPrefix('');
    setGenRemark('');
    setGeneratedCodes([]);
    setGenerateDialogOpen(true);
  };

  const handleExportAllGenerated = () => {
    exportCSV(generatedCodes);
  };

  const handlePageSizeChange = (val: string) => {
    setPageSize(parseInt(val, 10) || 10);
    setPage(1);
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  const renderPagination = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">授权码管理</h1>
          <p className="text-sm text-slate-500 mt-1">生成、管理和导出 VIP 授权码</p>
        </div>
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-4 gap-4" data-ai-section-type="card-stat">
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-sm text-slate-500 mb-1">授权码总数</div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-sm text-slate-500 mb-1">未使用</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.unused}</span>
              <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200">待激活</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-sm text-slate-500 mb-1">已使用</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.used}</span>
              <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200">已激活</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-sm text-slate-500 mb-1">已禁用</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.disabled}</span>
              <Badge variant="secondary" className="bg-slate-200 text-slate-600">已作废</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选栏 */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 whitespace-nowrap">状态</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部</SelectItem>
                  <SelectItem value="unused">未使用</SelectItem>
                  <SelectItem value="used">已使用</SelectItem>
                  <SelectItem value="disabled">已禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 whitespace-nowrap">套餐</Label>
              <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue placeholder="全部套餐" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部套餐</SelectItem>
                  {PLANS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 whitespace-nowrap">批次号</Label>
              <Input
                value={batchSearch}
                onChange={(e) => { setBatchSearch(e.target.value); setPage(1); }}
                placeholder="搜索批次号"
                className="w-36 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 whitespace-nowrap">关键词</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={keyword}
                  onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
                  placeholder="授权码/用户名"
                  className="w-44 h-8 pl-8 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 whitespace-nowrap">生成时间</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-36 h-8 text-xs"
              />
              <span className="text-xs text-slate-400">至</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-36 h-8 text-xs"
              />
            </div>
            <div className="ml-auto">
              <Button
                size="sm"
                onClick={openGenerateDialog}
                className="bg-orange-500 hover:bg-orange-600 text-white border border-orange-500 min-h-8"
              >
                <Plus className="w-4 h-4 mr-1" />
                批量生成
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <Card className="shadow-sm border-orange-200 bg-orange-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-700">
                已选中 <span className="font-semibold text-orange-600">{selectedIds.size}</span> 项
              </span>
              <Button variant="outline" size="sm" onClick={handleBatchDisable}>
                <Ban className="w-3.5 h-3.5 mr-1" />
                批量禁用
              </Button>
              <Button variant="outline" size="sm" onClick={handleBatchEnable}>
                <PlayCircle className="w-3.5 h-3.5 mr-1" />
                批量启用
              </Button>
              <Button variant="outline" size="sm" onClick={handleBatchExport}>
                <Download className="w-3.5 h-3.5 mr-1" />
                批量导出
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                <X className="w-3.5 h-3.5 mr-1" />
                取消选择
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 表格 */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelectedOnPage}
                    onCheckedChange={toggleSelectAll}
                    aria-label="全选"
                    data-state={allSelectedOnPage ? 'checked' : someSelectedOnPage ? 'indeterminate' : 'unchecked'}
                  />
                </TableHead>
                <TableHead>授权码</TableHead>
                <TableHead>套餐名称</TableHead>
                <TableHead className="text-center">时长(天)</TableHead>
                <TableHead className="text-center">账号额度</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>绑定用户</TableHead>
                <TableHead>激活时间</TableHead>
                <TableHead>批次号</TableHead>
                <TableHead>生成时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedCodes.map((code) => {
                const badge = statusBadge(code.status);
                return (
                  <TableRow key={code.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(code.id)}
                        onCheckedChange={() => toggleSelectOne(code.id)}
                        aria-label={`选择 ${code.code}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{maskCode(code.code)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopy(code.code, code.id)}
                          title="复制完整授权码"
                        >
                          {copiedId === code.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                          <KeyRound className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{code.planName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm">{code.durationDays}</TableCell>
                    <TableCell className="text-center text-sm">{code.maxAccounts}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {code.username ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-600">
                            {code.username.slice(0, 1)}
                          </div>
                          <span className="text-sm">{code.username}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{formatDate(code.activatedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {code.batchNo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{formatDate(code.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuLabel>操作</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleViewDetail(code)}>
                            <Eye className="w-4 h-4 mr-2" />
                            查看详情
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(code.id)}>
                            {code.status === 'disabled' ? (
                              <>
                                <PlayCircle className="w-4 h-4 mr-2" />
                                启用
                              </>
                            ) : (
                              <>
                                <Ban className="w-4 h-4 mr-2" />
                                禁用
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleVoid(code.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            作废
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pagedCodes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-slate-400">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {/* 底部分页栏 */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>共 {filteredCodes.length} 条</span>
            <div className="flex items-center gap-2">
              <span>每页</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger size="sm" className="w-20 h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span>条</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCSV(filteredCodes)}>
              <Download className="w-3.5 h-3.5 mr-1" />
              导出
            </Button>
          </div>
          <Pagination className="w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationLink
                  size="sm"
                  onClick={() => goToPage(page - 1)}
                  className={`cursor-pointer ${page === 1 ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </PaginationLink>
              </PaginationItem>
              {renderPagination().map((p, idx) => (
                <PaginationItem key={`${p}-${idx}`}>
                  {p === 'ellipsis' ? (
                    <span className="px-2 text-xs text-slate-400">...</span>
                  ) : (
                    <PaginationLink
                      size="sm"
                      isActive={p === page}
                      onClick={() => goToPage(p)}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationLink
                  size="sm"
                  onClick={() => goToPage(page + 1)}
                  className={`cursor-pointer ${page === totalPages ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </PaginationLink>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </Card>

      {/* 批量生成弹窗 */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className={genStep === 2 ? 'max-w-3xl max-h-[80vh]' : 'max-w-lg'}>
          <DialogHeader>
            <DialogTitle>
              {genStep === 1 ? '批量生成授权码' : '生成结果'}
            </DialogTitle>
          </DialogHeader>

          {genStep === 1 && (
            <>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label>套餐选择 *</Label>
                  <Select value={genPlanId} onValueChange={setGenPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择套餐" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>有效期（天）*</Label>
                    <Input
                      type="number"
                      value={genDuration}
                      onChange={(e) => setGenDuration(e.target.value)}
                      min="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>可绑定账号数 *</Label>
                    <Input
                      type="number"
                      value={genMaxAccounts}
                      onChange={(e) => setGenMaxAccounts(e.target.value)}
                      min="1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>生成数量 * <span className="text-xs text-slate-400">(1-1000)</span></Label>
                    <Input
                      type="number"
                      value={genCount}
                      onChange={(e) => setGenCount(e.target.value)}
                      min="1"
                      max="1000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>前缀 <span className="text-xs text-slate-400">(可选)</span></Label>
                    <Input
                      value={genPrefix}
                      onChange={(e) => setGenPrefix(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      placeholder="字母数字"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>备注 <span className="text-xs text-slate-400">(可选)</span></Label>
                  <Textarea
                    value={genRemark}
                    onChange={(e) => setGenRemark(e.target.value)}
                    placeholder="备注说明"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <Button
                  onClick={handleGenerate}
                  className="bg-orange-500 hover:bg-orange-600 text-white border border-orange-500"
                >
                  生成
                </Button>
              </DialogFooter>
            </>
          )}

          {genStep === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-emerald-700">
                    成功生成 {generatedCodes.length} 个授权码
                  </div>
                  <div className="text-xs text-emerald-600">
                    批次号：{generatedCodes[0]?.batchNo}
                  </div>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">序号</TableHead>
                      <TableHead>授权码</TableHead>
                      <TableHead>套餐</TableHead>
                      <TableHead className="text-center">时长(天)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generatedCodes.slice(0, 20).map((c, idx) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs text-slate-500">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{c.code}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleCopy(c.code, c.id)}
                            >
                              {copiedId === c.id ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-400" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{c.planName}</TableCell>
                        <TableCell className="text-center text-sm">{c.durationDays}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {generatedCodes.length > 20 && (
                  <div className="text-xs text-center py-2 text-slate-400 border-t bg-slate-50">
                    仅展示前 20 条，共 {generatedCodes.length} 条，点击「导出全部」下载完整列表
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleExportAllGenerated}>
                  <Download className="w-4 h-4 mr-1" />
                  导出全部
                </Button>
                <DialogClose asChild>
                  <Button
                    className="bg-orange-500 hover:bg-orange-600 text-white border border-orange-500"
                    onClick={() => setGenerateDialogOpen(false)}
                  >
                    完成
                  </Button>
                </DialogClose>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>授权码详情</DialogTitle>
          </DialogHeader>
          {detailCode && (
            <div className="space-y-4 py-2">
              {/* 授权码展示 */}
              <div className="p-4 bg-slate-50 rounded-lg border flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 mb-1">授权码</div>
                  <div className="font-mono text-base font-semibold tracking-wide">{detailCode.code}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(detailCode.code, `detail-${detailCode.id}`)}
                >
                  {copiedId === `detail-${detailCode.id}` ? (
                    <>
                      <Check className="w-4 h-4 mr-1 text-emerald-500" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      复制
                    </>
                  )}
                </Button>
              </div>

              {/* 基本信息 */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">基本信息</div>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-slate-500">套餐</div>
                  <div>{detailCode.planName}</div>
                  <div className="text-slate-500">时长</div>
                  <div>{detailCode.durationDays} 天</div>
                  <div className="text-slate-500">账号额度</div>
                  <div>{detailCode.maxAccounts} 个</div>
                  <div className="text-slate-500">状态</div>
                  <div>
                    <Badge
                      variant={statusBadge(detailCode.status).variant}
                      className={statusBadge(detailCode.status).className}
                    >
                      {statusBadge(detailCode.status).label}
                    </Badge>
                  </div>
                  <div className="text-slate-500">批次号</div>
                  <div className="font-mono text-xs">{detailCode.batchNo}</div>
                  <div className="text-slate-500">备注</div>
                  <div>{detailCode.remark || '—'}</div>
                  <div className="text-slate-500">生成时间</div>
                  <div>{formatDate(detailCode.createdAt)}</div>
                </div>
              </div>

              {/* 使用信息 */}
              {detailCode.status === 'used' && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">使用信息</div>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <div className="text-slate-500">绑定用户</div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium">
                        {detailCode.username?.slice(0, 1)}
                      </div>
                      <span>{detailCode.username}</span>
                    </div>
                    <div className="text-slate-500">激活时间</div>
                    <div>{formatDate(detailCode.activatedAt)}</div>
                    <div className="text-slate-500">激活IP</div>
                    <div className="font-mono text-xs">192.168.1.{Math.floor(Math.random() * 255)}</div>
                  </div>
                </div>
              )}

              {detailCode.status === 'unused' && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  该授权码尚未被激活使用
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {detailCode && detailCode.status !== 'disabled' ? (
              <Button
                variant="outline"
                onClick={() => handleToggleStatus(detailCode.id)}
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <Ban className="w-4 h-4 mr-1" />
                禁用
              </Button>
            ) : detailCode && detailCode.status === 'disabled' ? (
              <Button
                variant="outline"
                onClick={() => handleToggleStatus(detailCode.id)}
                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              >
                <PlayCircle className="w-4 h-4 mr-1" />
                启用
              </Button>
            ) : null}
            {detailCode && detailCode.status !== 'disabled' && (
              <Button
                variant="destructive"
                onClick={() => handleVoid(detailCode.id)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                作废
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
