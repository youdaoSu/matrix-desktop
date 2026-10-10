import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { axiosForBackend, logger, setUser } from '@client/src/api';
import type { AppUser } from '@shared/api.interface';
import { AuthCard, AuthError, AuthField, AuthSubmit, getAuthError } from '@/components/auth/AuthComponents';

export default function ActivatePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);
  const [user, setCurrentUser] = useState<AppUser | null>(null);
  const [error, setError] = useState('');

  const handleActivate = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length < 8) return setError('请检查授权码是否完整');
    setLoading(true);
    setError('');
    try {
      const response = await axiosForBackend.post('/api/auth/activate', { code: cleanCode });
      const activatedUser = response.data.data as AppUser;
      setUser(activatedUser);
      setCurrentUser(activatedUser);
      logger.info('授权码激活成功');
      setActivated(true);
    } catch (requestError: unknown) {
      setError(getAuthError(requestError, '授权码激活失败，请检查后重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard eyebrow="开通矩效会员" title={activated ? '授权已生效' : '激活你的 VIP'} description={activated ? '你的账号权益已更新，可以开始使用矩效工作台。' : '输入管理员发放的授权码，开通对应会员权益。'}>
      {activated ? (
        <div className="py-5 text-center" role="status">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600"><BadgeCheck className="h-8 w-8" /></div>
          <h2 className="text-lg font-semibold text-slate-900">激活成功</h2>
          <p className="mt-2 text-sm text-slate-500">{user?.vipPlanName || '会员权益'}{user?.vipExpiresAt ? ` · 有效期至 ${new Date(user.vipExpiresAt).toLocaleDateString('zh-CN')}` : ''}</p>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left text-sm text-slate-600">
            <div className="flex items-center gap-2 font-medium text-slate-800"><Sparkles className="h-4 w-4 text-blue-600" />账号额度</div>
            <p className="mt-1">最多可绑定 {user?.maxAccounts ?? '—'} 个平台账号</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard')} className="mt-6 h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold text-white shadow-lg shadow-blue-600/20">进入工作台</button>
        </div>
      ) : (
        <form onSubmit={handleActivate} className="space-y-5" noValidate>
          <AuthError>{error}</AuthError>
          <Alert className="rounded-xl border-blue-100 bg-blue-50 text-blue-900">
            <ShieldCheck className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-xs leading-5">授权码由矩效管理员发放。激活后，套餐时长和账号额度会显示在你的账户中。</AlertDescription>
          </Alert>
          <AuthField
            id="activation-code"
            label="授权码"
            icon={KeyRound}
            value={code}
            onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(''); }}
            placeholder="输入完整授权码"
            className="font-mono uppercase tracking-wider"
            autoComplete="off"
            maxLength={64}
            required
          />
          <AuthSubmit loading={loading}>{loading ? '正在验证授权码…' : '验证并激活'}</AuthSubmit>
        </form>
      )}
      {!activated && <div className="mt-5 border-t border-slate-100 pt-5 text-center"><Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900"><ArrowLeft className="h-4 w-4" />返回工作台</Link></div>}
    </AuthCard>
  );
}
