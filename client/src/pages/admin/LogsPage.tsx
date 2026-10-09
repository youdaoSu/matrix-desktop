import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { OperationLog } from '@shared/api.interface';

interface ExtendedLog extends OperationLog {
  succeeded?: boolean;
  targetId?: string;
  requestData?: string;
  userAgent?: string;
}

const actions = ['登录', '退出', '注册', '开通VIP', '延长VIP', '重置密码', '生成授权码', '使用授权码', '绑定账号', '解绑账号', '发布内容', '新增套餐', '修改设置', '停用账号', '启用账号'];
const targetTypes = ['user', 'auth', 'activation_code', 'vip_plan', 'platform_account', 'content_post', 'settings', 'admin_user', 'follower_record', 'message'];

const targetTypeLabels: Record<string, string> = {
  user: '用户',
  auth: '认证',
  activation_code: '授权码',
  vip_plan: '套餐',
  platform_account: '平台账号',
  content_post: '内容发布',
  settings: '系统设置',
  admin_user: '管理员',
  follower_record: '粉丝数据',
  message: '消息',
};

const mockLogs: ExtendedLog[] = Array.from({ length: 80 }, (_, i) => {
  const isAdmin = i % 5 === 0;
  const actionIndex = i % actions.length;
  const succeeded = i % 10 !== 7; // 90% 成功率
  return {
    id: `log_${(i + 1).toString().padStart(5, '0')}`,
    operatorType: isAdmin ? 'admin' : 'user',
    operatorName: isAdmin ? 'admin' : `user${(i % 20) + 1}`,
    action: actions[actionIndex],
    targetType: targetTypes[i % targetTypes.length],
    targetId: `target_${i + 1}`,
    detail: `${actions[actionIndex]}操作 - 记录详情 ${i + 1}，包含完整的操作上下文和参数信息。这是一条模拟的详细操作日志记录，用于展示日志详情弹窗的效果。`,
    ipAddress: `${192 + (i % 8)}.${168 + (i % 5)}.${i % 255}.${i % 255}`,
    succeeded,
    createdAt: `2024-09-${(((i * 2) % 28) + 1).toString().padStart(2, '0')} ${(23 - (i % 24)).toString().padStart(2, '0')}:${((i * 7) % 60).toString().padStart(2, '0')}:${((i * 13) % 60).toString().padStart(2, '0')}`,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    requestData: JSON.stringify({ id: i, param: 'value' }, null, 2),
  };
});

export default function LogsPage() {
  const [search, setSearch] = useState('');
  const [operatorType, setOperatorType] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedLog, setSelectedLog] = useState<ExtendedLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredLogs = mockLogs.filter((log) => {
    if (search) {
      const keyword = search.toLowerCase();
      if (!log.operatorName?.toLowerCase().includes(keyword) &&
          !log.action.toLowerCase().includes(keyword) &&
          !log.detail?.toLowerCase().includes(keyword) &&
          !log.ipAddress.includes(search)) {
        return false;
      }
    }
    if (operatorType !== 'all' && log.operatorType !== operatorType) return false;
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (targetTypeFilter !== 'all' && log.targetType !== targetTypeFilter) return false;
    if (resultFilter !== 'all') {
      const isSuccess = log.succeeded !== false;
      if (resultFilter === 'success' && !isSuccess) return false;
      if (resultFilter === 'failed' && isSuccess) return false;
    }
    if (startDate && log.createdAt < startDate) return false;
    if (endDate && log.createdAt > endDate + ' 23:59:59') return false;
    return true;
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const pagedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);

  const handleViewDetail = (log: OperationLog) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  const handleExportCsv = () => {
    const headers = ['时间', '操作人', '操作类型', '目标类型', '详情', 'IP地址', '结果'];
    const rows = filteredLogs.map((log) => [
      log.createdAt, log.operatorName || '', log.action,
      log.targetType, log.detail || '', log.ipAddress,
      log.succeeded !== false ? '成功' : '失败',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `操作日志_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">操作日志</h1>
          <p className="text-sm text-slate-500 mt-1">查看系统中所有用户与管理员的操作记录</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="搜索操作人/动作/详情/IP"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-56 pl-9 h-9"
                />
              </div>
              <Select value={operatorType} onValueChange={(v) => { setOperatorType(v); setPage(1); }}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder="操作者" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="user">普通用户</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder="操作类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部操作</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={targetTypeFilter} onValueChange={(v) => { setTargetTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder="目标类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部目标</SelectItem>
                  {targetTypes.map((t) => (
                    <SelectItem key={t} value={t}>{targetTypeLabels[t] || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultFilter} onValueChange={(v) => { setResultFilter(v); setPage(1); }}>
                <SelectTrigger className="w-24 h-9">
                  <SelectValue placeholder="结果" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部结果</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 border rounded-md px-2 h-9">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                  className="w-28 h-7 border-0 px-1 text-xs"
                />
                <span className="text-xs text-slate-400">~</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                  className="w-28 h-7 border-0 px-1 text-xs"
                />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="w-4 h-4 mr-1" />
              导出 CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>操作人</TableHead>
                <TableHead>操作类型</TableHead>
                <TableHead>目标类型</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>IP 地址</TableHead>
                <TableHead>结果</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">{log.createdAt}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={log.operatorType === 'admin' ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {log.operatorType === 'admin' ? '管理' : '用户'}
                      </Badge>
                      <span className="text-sm">{log.operatorName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{log.action}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {targetTypeLabels[log.targetType] || log.targetType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 max-w-[260px] truncate">
                    {log.detail}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 font-mono">{log.ipAddress}</TableCell>
                  <TableCell>
                    {log.succeeded !== false ? (
                      <div className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-xs">成功</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-500">
                        <XCircle className="w-3.5 h-3.5" />
                        <span className="text-xs">失败</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewDetail(log)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>共 {filteredLogs.length} 条，第 {page} / {totalPages || 1} 页</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 条/页</SelectItem>
                <SelectItem value="20">20 条/页</SelectItem>
                <SelectItem value="50">50 条/页</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <Button key={p} variant={page === p ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => setPage(p)}>
                {p}
              </Button>
            ))}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              日志详情
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">日志 ID</div>
                  <div className="font-mono text-sm">{selectedLog.id}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">操作时间</div>
                  <div className="text-sm flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {selectedLog.createdAt}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">操作人</div>
                  <div className="text-sm flex items-center gap-1.5">
                    <Badge variant={selectedLog.operatorType === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                      {selectedLog.operatorType === 'admin' ? '管理员' : '用户'}
                    </Badge>
                    {selectedLog.operatorName}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">操作类型</div>
                  <div className="text-sm font-medium">{selectedLog.action}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">目标类型</div>
                  <div className="text-sm">
                    <Badge variant="secondary">{targetTypeLabels[selectedLog.targetType] || selectedLog.targetType}</Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">操作结果</div>
                  <div>
                    {selectedLog.succeeded !== false ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-0">成功</Badge>
                    ) : (
                      <Badge variant="destructive">失败</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">IP 地址</div>
                  <div className="font-mono text-sm">{selectedLog.ipAddress}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">目标 ID</div>
                  <div className="font-mono text-sm">{selectedLog.targetId || '-'}</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-500">操作详情</div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm">
                  {selectedLog.detail}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-500">请求参数</div>
                <pre className="p-3 rounded-lg bg-slate-900 dark:bg-slate-900 text-slate-100 text-xs overflow-x-auto font-mono">
                  {selectedLog.requestData || '{}'}
                </pre>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-500">User-Agent</div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-400 break-all">
                  {selectedLog.userAgent}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
