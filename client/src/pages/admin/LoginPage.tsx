import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, AtSign, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { adminAxios, logger, setAdminToken, setAdminUser } from '@client/src/api';
import type { AdminUser } from '@shared/api.interface';
import { AuthCard, AuthError, AuthField, AuthPasswordField, AuthSubmit, getAuthError } from '@/components/auth/AuthComponents';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return setError('请输入管理员账号和密码');
    setLoading(true);
    setError('');
    try {
      const response = await adminAxios.post('/api/admin/login', { username: username.trim(), password });
      const result = response.data.data as { token: string; user: AdminUser };
      setAdminToken(result.token);
      setAdminUser(result.user);
      logger.info('管理员登录成功', username.trim());
      navigate('/admin/dashboard');
    } catch (requestError: unknown) {
      setError(getAuthError(requestError, '管理员账号或密码错误'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard eyebrow="安全管理入口" title="管理员登录" description="请使用已获授权的管理员账号进入系统管理后台。">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <AuthError>{error}</AuthError>
        <Alert className="rounded-xl border-amber-200 bg-amber-50 text-amber-900">
          <ShieldCheck className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-xs leading-5">管理员入口仅用于系统维护。请使用部署时设置的管理账号，并在首次登录后修改初始密码。</AlertDescription>
        </Alert>
        <AuthField id="admin-username" label="管理员账号" icon={AtSign} value={username} onChange={(event) => { setUsername(event.target.value); setError(''); }} placeholder="请输入管理员账号" autoComplete="username" autoFocus required />
        <AuthPasswordField id="admin-password" label="密码" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="请输入管理员密码" autoComplete="current-password" required />
        <AuthSubmit loading={loading}>{loading ? '正在验证…' : '安全登录'}</AuthSubmit>
      </form>
      <div className="mt-5 border-t border-slate-100 pt-5 text-center">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900"><ArrowLeft className="h-4 w-4" />返回用户登录</Link>
      </div>
    </AuthCard>
  );
}
