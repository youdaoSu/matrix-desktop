import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, Key, CheckCircle2, Sparkles, ArrowLeft } from 'lucide-react';
import type { VipPlan } from '@shared/api.interface';
import { axiosForBackend, logger, setUser } from '@client/src/api';

const mockPlans: Record<string, VipPlan> = {
  VIP30: {
    id: 'plan_01',
    name: '月度会员',
    code: 'VIP30',
    durationDays: 30,
    maxAccounts: 5,
    price: '99',
    status: 'active',
    sortOrder: 1,
  },
  VIP90: {
    id: 'plan_02',
    name: '季度会员',
    code: 'VIP90',
    durationDays: 90,
    maxAccounts: 10,
    price: '259',
    status: 'active',
    sortOrder: 2,
  },
  VIP365: {
    id: 'plan_03',
    name: '年度会员',
    code: 'VIP365',
    durationDays: 365,
    maxAccounts: 20,
    price: '899',
    status: 'active',
    sortOrder: 3,
  },
};

export default function ActivatePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);
  const [matchedPlan, setMatchedPlan] = useState<VipPlan | null>(null);
  const [error, setError] = useState('');

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setCode(val);
    setError('');
    // 实时匹配套餐前缀（演示效果）
    if (val.startsWith('VIP365') && val.length >= 6) {
      setMatchedPlan(mockPlans.VIP365);
    } else if (val.startsWith('VIP90') && val.length >= 5) {
      setMatchedPlan(mockPlans.VIP90);
    } else if (val.startsWith('VIP30') && val.length >= 5) {
      setMatchedPlan(mockPlans.VIP30);
    } else {
      setMatchedPlan(null);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      setError('请输入授权码');
      return;
    }
    if (code.length < 8) {
      setError('授权码格式不正确');
      return;
    }
    setLoading(true);
    try {
      const response = await axiosForBackend.post('/api/auth/activate', { code });
      setUser(response.data.data);
      logger.info('授权码激活成功', code);
      setActivated(true);
    } catch (err: any) {
      setError(err.response?.data?.message || '授权码激活失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 mb-4">
          <Shield className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">激活 VIP 授权码</h1>
        <p className="text-sm text-slate-400">激活后即可使用全部功能</p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            授权码激活
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activated ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-1">激活成功！</h3>
              <p className="text-sm text-slate-400 mb-4">
                您已成功激活
                <span className="text-emerald-400 font-medium mx-1">
                  {matchedPlan?.name || 'VIP 会员'}
                </span>
              </p>
              <Button onClick={() => navigate('/dashboard')}>
                <Sparkles className="w-4 h-4" />
                进入工作台
              </Button>
            </div>
          ) : (
            <>
              <Alert className="mb-4 bg-primary/10 border-primary/30">
                <Sparkles className="w-4 h-4 text-primary" />
                <AlertTitle className="text-white text-sm">激活 VIP 授权码</AlertTitle>
                <AlertDescription className="text-slate-400 text-xs">
                  激活 VIP 授权码后即可使用全部功能，包括多平台账号管理、内容发布、粉丝私信管理等
                </AlertDescription>
              </Alert>

              <form onSubmit={handleActivate} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">授权码</Label>
                  <Input
                    type="text"
                    value={code}
                    onChange={handleCodeChange}
                    placeholder="请输入授权码，如 VIP365-XXXX-XXXX"
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary uppercase tracking-wider font-mono"
                    maxLength={20}
                  />
                  <p className="text-xs text-slate-500">
                    提示：授权码为大写字母和数字格式，示例：VIP365-A1B2-C3D4
                  </p>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>

                {/* 套餐信息占位 */}
                <div className="border border-dashed border-slate-600 rounded-lg p-4 bg-slate-900/30">
                  <p className="text-xs text-slate-500 mb-2">匹配套餐信息</p>
                  {matchedPlan ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">{matchedPlan.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          有效期 {matchedPlan.durationDays} 天 · 最多绑定 {matchedPlan.maxAccounts} 个账号
                        </div>
                      </div>
                      <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-0">
                        已匹配
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">输入有效授权码前缀后将显示对应套餐信息</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  <Key className="w-4 h-4" />
                  {loading ? '激活中...' : '立即激活'}
                </Button>
              </form>
            </>
          )}

          <div className="mt-5 text-center">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回工作台
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
