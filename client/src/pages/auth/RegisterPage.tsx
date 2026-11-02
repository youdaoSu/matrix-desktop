import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtSign, CheckCircle2, Mail, Phone, UserRound, UserRoundPlus } from 'lucide-react';
import { axiosForBackend, logger } from '@client/src/api';
import { AuthCard, AuthError, AuthField, AuthPasswordField, AuthSubmit, getAuthError } from '@/components/auth/AuthComponents';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', nickname: '', password: '', confirmPassword: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const update = (field: keyof typeof formData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({ ...current, [field]: event.target.value }));
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const { username, password, confirmPassword, email, phone } = formData;
    if (username.trim().length < 4) return setError('用户名至少需要 4 个字符');
    if (password.length < 8) return setError('密码至少需要 8 位');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('密码需同时包含字母和数字');
    if (password !== confirmPassword) return setError('两次输入的密码不一致');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('请输入有效的邮箱地址');
    if (phone && !/^\+?[0-9\s-]{7,20}$/.test(phone)) return setError('请输入有效的手机号');

    setLoading(true);
    setError('');
    try {
      await axiosForBackend.post('/api/auth/register', {
        username: username.trim(), password,
        nickname: formData.nickname.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      logger.info('用户注册成功', username.trim());
      setSuccess(true);
      window.setTimeout(() => navigate('/login'), 1200);
    } catch (requestError: unknown) {
      setError(getAuthError(requestError, '注册失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="开始使用"
      title="创建你的远效账号"
      description="创建账号后即可登录；VIP 功能可在之后使用授权码开通。"
      footer={<>已经有账号？ <Link to="/login" className="font-semibold text-blue-700 hover:text-blue-800">返回登录</Link></>}
    >
      {success ? (
        <div className="py-8 text-center" role="status">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
          <h2 className="text-lg font-semibold text-slate-900">账号创建成功</h2>
          <p className="mt-2 text-sm text-slate-500">正在带你前往登录页面…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <AuthError>{error}</AuthError>
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField id="register-username" label="用户名" icon={AtSign} value={formData.username} onChange={update('username')} placeholder="至少 4 个字符" autoComplete="username" required />
            <AuthField id="register-nickname" label="昵称（选填）" icon={UserRound} value={formData.nickname} onChange={update('nickname')} placeholder="工作区显示名称" autoComplete="nickname" />
          </div>
          <AuthPasswordField id="register-password" label="设置密码" value={formData.password} onChange={update('password')} placeholder="至少 8 位，包含字母和数字" autoComplete="new-password" required />
          <AuthPasswordField id="register-confirm-password" label="确认密码" value={formData.confirmPassword} onChange={update('confirmPassword')} placeholder="再次输入密码" autoComplete="new-password" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField id="register-email" label="邮箱（选填）" icon={Mail} type="email" value={formData.email} onChange={update('email')} placeholder="用于账号安全联系" autoComplete="email" />
            <AuthField id="register-phone" label="手机号（选填）" icon={Phone} type="tel" value={formData.phone} onChange={update('phone')} placeholder="用于账号安全联系" autoComplete="tel" />
          </div>
          <p className="text-xs leading-5 text-slate-400">请妥善保管登录凭据。邮箱和手机号作为账号资料保存，目前不用于验证码验证。</p>
          <AuthSubmit loading={loading}><UserRoundPlus className="mr-2 h-4 w-4" />{loading ? '正在创建账号…' : '创建账号'}</AuthSubmit>
        </form>
      )}
    </AuthCard>
  );
}
