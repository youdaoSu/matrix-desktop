import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtSign, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { axiosForBackend, logger, setAuthToken, setSessionAuthToken, setUser } from '@client/src/api';
import type { AppUser } from '@shared/api.interface';
import { AuthCard, AuthError, AuthField, AuthPasswordField, AuthSubmit, getAuthError } from '@/components/auth/AuthComponents';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await axiosForBackend.post('/api/auth/login', { username: username.trim(), password });
      const result = response.data.data as { token: string; user: AppUser };
      if (remember) setAuthToken(result.token);
      else setSessionAuthToken(result.token);
      setUser(result.user, remember);
      logger.info('用户登录成功', username.trim());
      navigate('/dashboard');
    } catch (requestError: unknown) {
      setError(getAuthError(requestError, '登录失败，请检查账号和密码后重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="欢迎回来"
      title="登录矩效"
      description="登录后继续管理你的内容与平台账号。"
      footer={<>还没有账号？ <Link to="/register" className="font-semibold text-blue-700 hover:text-blue-800">免费创建</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <AuthError>{error}</AuthError>
        <AuthField
          id="username"
          label="用户名"
          icon={AtSign}
          value={username}
          onChange={(event) => { setUsername(event.target.value); setError(''); }}
          placeholder="请输入用户名"
          autoComplete="username"
          autoFocus
          required
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">密码</span>
            <Link to="/forgot-password" className="text-xs font-medium text-blue-700 hover:text-blue-800">忘记密码？</Link>
          </div>
          <AuthPasswordField
            id="password"
            aria-label="密码"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(''); }}
            placeholder="请输入密码"
            autoComplete="current-password"
            required
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
          <Checkbox checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
          <span>在此设备上保持登录</span>
        </label>
        <AuthSubmit loading={loading}><LockKeyhole className="mr-2 h-4 w-4" />{loading ? '正在安全登录…' : '登录工作台'}</AuthSubmit>
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          本机账号密码验证 · 平台登录会话独立
        </div>
      </form>
      <div className="mt-5 text-center">
        <Link to="/admin/login" className="text-xs text-slate-400 transition hover:text-slate-700">管理员登录 →</Link>
      </div>
    </AuthCard>
  );
}
