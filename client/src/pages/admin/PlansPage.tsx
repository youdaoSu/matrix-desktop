import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Download,
  Search,
} from 'lucide-react';
import type { VipPlan } from '@shared/api.interface';

const initialPlans: VipPlan[] = [
  { id: 'p1', name: '月度会员', code: 'monthly', durationDays: 30, maxAccounts: 5, price: '99', description: '适合个人博主入门使用', status: 'active', sortOrder: 1 },
  { id: 'p2', name: '季度会员', code: 'quarterly', durationDays: 90, maxAccounts: 10, price: '259', description: '性价比之选，季度运营必备', status: 'active', sortOrder: 2 },
  { id: 'p3', name: '年度会员', code: 'yearly', durationDays: 365, maxAccounts: 20, price: '899', description: '年度最低单价，长期运营首选', status: 'active', sortOrder: 3 },
  { id: 'p4', name: '企业版', code: 'enterprise', durationDays: 365, maxAccounts: 50, price: '2999', description: '企业团队级使用，支持更多账号', status: 'active', sortOrder: 4 },
  { id: 'p5', name: '终身版', code: 'lifetime', durationDays: 36500, maxAccounts: 100, price: '9999', description: '一次购买终身使用（内测）', status: 'inactive', sortOrder: 5 },
  { id: 'p6', name: '体验版', code: 'trial', durationDays: 3, maxAccounts: 1, price: '0', description: '新用户注册体验套餐', status: 'active', sortOrder: 0 },
];

export default function PlansPage() {
  const [plans, setPlans] = useState<VipPlan[]>(initialPlans);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<VipPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<VipPlan | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState<Partial<VipPlan>>({
    name: '',
    code: '',
    durationDays: 30,
    maxAccounts: 5,
    price: '',
    description: '',
    sortOrder: 0,
    status: 'active',
  });

  const filteredPlans = plans.filter((p) =>
    !search || p.name.includes(search) || p.code.toLowerCase().includes(search.toLowerCase())
  );

  const sortedPlans = [...filteredPlans].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAdd = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      code: '',
      durationDays: 30,
      maxAccounts: 5,
      price: '',
      description: '',
      sortOrder: plans.length,
      status: 'active',
    });
    setDialogOpen(true);
  };

  const handleEdit = (plan: VipPlan) => {
    setEditingPlan(plan);
    setFormData(plan);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editingPlan) {
      setPlans(plans.map((p) => (p.id === editingPlan.id ? { ...p, ...formData } as VipPlan : p)));
    } else {
      const newPlan: VipPlan = {
        id: `p${Date.now()}`,
        name: formData.name || '',
        code: formData.code || '',
        durationDays: Number(formData.durationDays) || 30,
        maxAccounts: Number(formData.maxAccounts) || 5,
        price: formData.price || '0',
        description: formData.description,
        sortOrder: Number(formData.sortOrder) || 0,
        status: formData.status || 'active',
      };
      setPlans([...plans, newPlan]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (plan: VipPlan) => {
    setPlanToDelete(plan);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (planToDelete) {
      setPlans(plans.filter((p) => p.id !== planToDelete.id));
    }
    setDeleteDialogOpen(false);
    setPlanToDelete(null);
  };

  const handleToggleStatus = (id: string) => {
    setPlans(plans.map((p) =>
      p.id === id ? { ...p, status: p.status === 'active' ? 'inactive' : 'active' } : p
    ));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const arr = [...sortedPlans];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    // 更新 sortOrder
    setPlans(plans.map((p) => {
      const newIdx = arr.findIndex((a) => a.id === p.id);
      if (newIdx === -1) return p;
      return { ...p, sortOrder: newIdx };
    }));
  };

  const moveDown = (index: number) => {
    if (index >= sortedPlans.length - 1) return;
    const arr = [...sortedPlans];
    [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
    setPlans(plans.map((p) => {
      const newIdx = arr.findIndex((a) => a.id === p.id);
      if (newIdx === -1) return p;
      return { ...p, sortOrder: newIdx };
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">套餐管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理 VIP 套餐配置与定价策略</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="搜索套餐"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 pl-9 h-9"
            />
          </div>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            导出
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-1" />
            新增套餐
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">排序</TableHead>
                <TableHead>套餐名</TableHead>
                <TableHead>代码</TableHead>
                <TableHead className="text-center">时长(天)</TableHead>
                <TableHead className="text-center">最大账号数</TableHead>
                <TableHead>价格(元)</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlans.map((plan, index) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveDown(index)}
                        disabled={index === sortedPlans.length - 1}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Package className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{plan.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {plan.code}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{plan.durationDays}</TableCell>
                  <TableCell className="text-center">{plan.maxAccounts}</TableCell>
                  <TableCell className="font-semibold text-emerald-600">¥{plan.price}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={plan.status === 'active'}
                        onCheckedChange={() => handleToggleStatus(plan.id)}
                      />
                      <span className={`text-xs ${plan.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {plan.status === 'active' ? '启用' : '停用'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">
                    {plan.description || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(plan)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(plan)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="px-4 py-3 border-t text-xs text-slate-500">
          共 {sortedPlans.length} 个套餐
        </div>
      </Card>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? '编辑套餐' : '新增套餐'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>套餐名称 *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：月度会员"
                />
              </div>
              <div className="space-y-2">
                <Label>套餐代码 *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="如：monthly"
                  className="lowercase"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>时长(天) *</Label>
                <Input
                  type="number"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>最大账号数 *</Label>
                <Input
                  type="number"
                  value={formData.maxAccounts}
                  onChange={(e) => setFormData({ ...formData, maxAccounts: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>价格(元) *</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch
                    checked={formData.status === 'active'}
                    onCheckedChange={(c) => setFormData({ ...formData, status: c ? 'active' : 'inactive' })}
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {formData.status === 'active' ? '启用' : '停用'}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>套餐描述</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="简要描述该套餐的特点和适用人群"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button onClick={handleSave}>{editingPlan ? '保存修改' : '创建套餐'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              确认删除
            </DialogTitle>
            <DialogDescription>
              确定要删除套餐 <strong>{planToDelete?.name}</strong> 吗？删除后将无法恢复，已使用该套餐的用户不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
