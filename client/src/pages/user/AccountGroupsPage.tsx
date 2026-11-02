import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  FolderGit2,
  Users,
  Trash2,
  Pencil,
  Check,
  AlertTriangle,
  Info,
  ArrowUp,
  ArrowDown,
  GripVertical,
  RefreshCw,
  Music,
  BookOpen,
  Video,
  Tv,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PlatformType, AccountGroup, PlatformAccount } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@client/src/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@client/src/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Label } from '@client/src/components/ui/label';
import { Separator } from '@client/src/components/ui/separator';
import { cn } from '@/lib/utils';
import { axiosForBackend } from '@/api';
import { toast } from 'sonner';
import { loadPublishAccounts } from '@/components/workspace/publish-preferences';
import { useOwnerRequest } from '@/components/workspace/use-owner-request';
import { useWorkspaceIdentity } from '@/components/workspace/WorkspaceUiState';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

type AccountGroupView = AccountGroup;

function apiErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback;
}

const AccountGroupsPage: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<AccountGroupView[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [sorting, setSorting] = useState(false);
  const [sortUncertain, setSortUncertain] = useState(false);
  const sortLock = useRef(false);
  const beginRequest = useOwnerRequest();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccountGroupView | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<AccountGroupView | null>(null);
  const ready = loaded && !loading && !sorting && !sortUncertain && !loadError;

  const loadData = async () => {
    const request = beginRequest();
    if (!request.authorized) { request.finish(); setLoading(false); setLoadError('请登录后读取账号分组'); return; }
    setLoading(true); setLoadError('');
    try {
      const [groupResponse, accountResponse] = await Promise.all([
        axiosForBackend.get('/api/platform/groups', { signal: request.signal }),
        loadPublishAccounts({ signal: request.signal }),
      ]);
      if (!Array.isArray(groupResponse.data?.data)) throw Error('账号分组响应不完整');
      if (request.current()) { setGroups(groupResponse.data.data); setAccounts(accountResponse); setLoaded(true); }
    } catch (error: any) {
      if (request.current()) { const message=apiErrorMessage(error, '加载账号分组失败'); setLoadError(message); toast.error(message); }
    } finally {
      request.finish(); if (request.current()) setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleCreateGroup = async () => {
    if (!ready || sortLock.current || !newGroupName.trim()) return;
    try {
      const maxOrder = groups.length ? Math.max(...groups.map((g) => g.sortOrder)) : 0;
      await axiosForBackend.post('/api/platform/groups', { groupName: newGroupName.trim(), sortOrder: maxOrder + 1 });
      await loadData();
      setNewGroupOpen(false);
      setNewGroupName('');
      toast.success('分组已创建');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '创建分组失败'));
    }
  };

  const startEdit = (group: AccountGroupView) => {
    setEditingGroup(group);
    setEditNameValue(group.groupName);
    setEditGroupOpen(true);
  };

  const saveEdit = async () => {
    if (!ready || sortLock.current || !editNameValue.trim() || !editingGroup) return;
    try {
      await axiosForBackend.put(`/api/platform/groups/${editingGroup.id}`, { groupName: editNameValue.trim() });
      await loadData();
      setEditGroupOpen(false);
      setEditingGroup(null);
      toast.success('分组已更新');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '更新分组失败'));
    }
  };

  const moveGroup = async (index: number, direction: 'up' | 'down') => {
    if (!ready || sortLock.current) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedGroups.length) return;
    const current = sortedGroups[index];
    const target = sortedGroups[targetIndex];
    if (target.isDefault) return; // 不能和默认组交换
    sortLock.current = true; setSorting(true);
    try {
      // Both writes must settle before re-reading: Promise.all rejects early,
      // allowing the slower write to land after a supposedly fresh snapshot.
      const results = await Promise.allSettled([
        Promise.resolve().then(() => axiosForBackend.put(`/api/platform/groups/${current.id}`, { sortOrder: target.sortOrder })),
        Promise.resolve().then(() => axiosForBackend.put(`/api/platform/groups/${target.id}`, { sortOrder: current.sortOrder })),
      ]);
      const uncertain = results.some(result => result.status === 'rejected');
      if (uncertain) setSortUncertain(true);
      await loadData();
      if (uncertain) toast.error('分组排序结果未确认；请核对当前记录，不要连续重复操作');
    } finally { sortLock.current = false; setSorting(false); }
  };

  const confirmDelete = async () => {
    if (!ready || sortLock.current || !groupToDelete) return;
    try {
      await axiosForBackend.delete(`/api/platform/groups/${groupToDelete.id}`);
      await loadData();
      setDeleteConfirmOpen(false);
      setGroupToDelete(null);
      toast.success('分组已删除，账号已移至默认分组');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '删除分组失败'));
    }
  };

  const goToAccounts = (group: AccountGroupView) => {
    navigate('/accounts', { state: { groupId: group.id, groupName: group.groupName } });
  };

  const accountIndex = useMemo(() => {
    const byId = new Map<string, PlatformAccount[]>(), byName = new Map<string, PlatformAccount[]>();
    for (const account of accounts) { const key=account.groupId || account.groupName; if (!key) continue; const target=account.groupId ? byId : byName; const rows=target.get(key) || []; rows.push(account); target.set(key, rows); }
    return { byId, byName };
  }, [accounts]);
  const getGroupAccounts = (group: AccountGroupView) => [...(accountIndex.byId.get(group.id) || []), ...(accountIndex.byName.get(group.groupName) || [])];

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-primary/5 border-primary/20 text-foreground">
        <Info className="w-4 h-4 text-primary" />
        <AlertDescription>
          分组和账号均来自本地数据库，所有修改会立即保存。
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">账号分组</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? '正在加载真实数据…' : !loaded ? '分组与账号数量未知' : `共 ${groups.length} 个分组 · ${accounts.length} 个账号${loadError ? '（上次读取结果）' : ''}`}
          </p>
        </div>
        <div className="flex gap-2"><Button variant="outline" disabled={loading || sorting} onClick={() => void loadData()}><RefreshCw className="w-4 h-4 mr-1.5" />刷新</Button><Button disabled={!ready} onClick={() => setNewGroupOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          新建分组
        </Button></div>
      </div>

      {loadError && <Alert variant="destructive"><AlertDescription role="alert">读取失败：{loadError}；{loaded ? '显示上次结果，请刷新后再核对。' : '无法判断分组或账号数量。'}</AlertDescription></Alert>}
      {sortUncertain && <Alert variant="destructive"><AlertDescription role="alert">分组排序结果未确认，可能仅部分保存或延迟生效；请刷新并核对当前顺序，本页已暂停修改。此提示仅在本页保留。 <Button variant="outline" disabled={loading || sorting || !!loadError || !loaded} onClick={() => { if (window.confirm('已核对当前分组顺序？服务器可能仍在处理超时请求，请确认后再继续修改。')) setSortUncertain(false); }}>已核对，允许继续</Button></AlertDescription></Alert>}

      {/* 分组卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedGroups.map((group, index) => {
          const groupAccounts = getGroupAccounts(group);
          const platformCounts = groupAccounts.reduce((acc, a) => {
            acc[a.platform] = (acc[a.platform] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          return (
            <Card
              key={group.id}
              className="shadow-sm hover:shadow-md transition-shadow overflow-hidden group/card"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-11 h-11 rounded-xl flex items-center justify-center',
                      group.isDefault
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      <FolderGit2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{group.groupName}</h3>
                        {group.isDefault && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-muted-foreground/30">
                            默认
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => goToAccounts(group)}
                        className="text-xs text-primary hover:underline mt-0.5 flex items-center gap-0.5"
                      >
                        <Users className="w-3 h-3" />
                        {groupAccounts.length} 个账号
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!group.isDefault && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover/card:opacity-100 transition-opacity"
                          onClick={() => moveGroup(index, 'up')}
                          disabled={!ready || index === 0 || sortedGroups[index - 1].isDefault}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover/card:opacity-100 transition-opacity"
                          onClick={() => moveGroup(index, 'down')}
                          disabled={!ready || index === sortedGroups.length - 1}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover/card:opacity-100 transition-opacity"
                      onClick={() => startEdit(group)}
                      disabled={!ready || group.isDefault}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* 平台分布小图标 */}
                <div className="flex items-center gap-2 mb-3">
                  {Object.entries(platformCounts).map(([platform, count]) => {
                    const meta = platformMeta[platform as PlatformType] || {label: platform, color: 'hsl(220 10% 45%)', icon: Users};
                    const Icon = meta.icon;
                    return (
                      <div key={platform} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          <Icon className="w-2.5 h-2.5" />
                        </div>
                        <span>{count}</span>
                      </div>
                    );
                  })}
                  {Object.keys(platformCounts).length === 0 && (
                    <span className="text-xs text-muted-foreground">暂无账号</span>
                  )}
                </div>

                <Separator className="my-3" />

                {/* 预览账号头像 */}
                {groupAccounts.length > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {groupAccounts.slice(0, 5).map((acc) => {
                        const meta = platformMeta[acc.platform] || {label: String(acc.platform), color: 'hsl(220 10% 45%)', icon: Users};
                        const Icon = meta.icon;
                        return (
                          <div
                            key={acc.id}
                            className="w-7 h-7 rounded-full border-2 border-card flex items-center justify-center text-white text-[10px] font-medium"
                            style={{ backgroundColor: meta.color }}
                            title={acc.nickname}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                        );
                      })}
                      {groupAccounts.length > 5 && (
                        <div className="w-7 h-7 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                          +{groupAccounts.length - 5}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => goToAccounts(group)}
                    >
                      查看账号
                    </Button>
                  </div>
                )}

                {!group.isDefault && (
                  <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      排序 #{group.sortOrder + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setGroupToDelete(group);
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={!ready}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      删除
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* 新建分组卡片 */}
        <Card
          className="shadow-sm border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer flex items-center justify-center min-h-[180px]"
          onClick={() => { if (ready) setNewGroupOpen(true); }}
        >
          <CardContent className="p-5 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Plus className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">新建分组</p>
            <p className="text-xs text-muted-foreground/70 mt-1">创建新的账号分组</p>
          </CardContent>
        </Card>
      </div>

      {/* 新建分组 Dialog */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建分组</DialogTitle>
            <DialogDescription>输入分组名称，创建后可添加账号</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-sm font-medium mb-1.5 block">分组名称</Label>
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="请输入分组名称"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewGroupOpen(false); setNewGroupName(''); }}>取消</Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>创建分组</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑分组 Dialog */}
      <Dialog open={editGroupOpen} onOpenChange={setEditGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑分组</DialogTitle>
            <DialogDescription>修改分组名称</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-sm font-medium mb-1.5 block">分组名称</Label>
            <Input
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditGroupOpen(false); setEditingGroup(null); }}>取消</Button>
            <Button onClick={saveEdit} disabled={!editNameValue.trim()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除分组</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{groupToDelete?.groupName}」吗？分组内的账号不会被删除，将自动移至默认分组。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setGroupToDelete(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-white">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default function AccountGroupsOwnerBoundary() {
  const identity = useWorkspaceIdentity();
  return <AccountGroupsPage key={identity} />;
}
