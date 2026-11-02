import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, AtSign, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { axiosForBackend, clearAuthToken } from '@client/src/api';
import { AuthCard, AuthError, AuthField, AuthPasswordField, AuthSubmit, getAuthError } from '@/components/auth/AuthComponents';

interface RecoveryStatus { emailAvailable: boolean; configured: boolean; message: string }
interface RecoveryRequest { requestId: string; cooldownSeconds: number; expiresInSeconds: number; message: string }

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RecoveryStatus>();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [request, setRequest] = useState<RecoveryRequest>();
  const [deadline, setDeadline] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [configurationNote, setConfigurationNote] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const checkStatus = async () => {
    setChecking(true); setError('');
    try {
      const response = await axiosForBackend.get('/api/auth/password-recovery/status');
      if (mounted.current) setStatus(response.data.data as RecoveryStatus);
    } catch (requestError) {
      if (mounted.current) setError(getAuthError(requestError, '无法检查邮件服务，请稍后重试'));
    } finally { if (mounted.current) setChecking(false); }
  };
  useEffect(() => { void checkStatus(); }, []);
  const resetIdentity = () => {
    generation.current++; setRequest(undefined); setCode(''); setError('');
    setPassword(''); setConfirmation(''); setExpiresAt(0);
  };
  const cooldown = Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = !!request && now >= expiresAt;
  const busy = sending || submitting;
  const send = async () => {
    if (busy || cooldown || !status?.emailAvailable) return;
    if (!username.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('请填写用户名和原来绑定的有效邮箱'); return; }
    const current = ++generation.current;
    setSending(true); setError('');
    try {
      const response = await axiosForBackend.post('/api/auth/password-recovery/request', { username: username.trim(), email: email.trim() });
      if (!mounted.current || generation.current !== current) return;
      const result = response.data.data as RecoveryRequest;
      setRequest(result); setCode(''); setDeadline(Date.now() + result.cooldownSeconds * 1000);
      setExpiresAt(Date.now() + result.expiresInSeconds * 1000); setNow(Date.now());
    } catch (requestError: any) {
      if (!mounted.current || generation.current !== current) return;
      setError(getAuthError(requestError, '验证码请求失败，请稍后重试'));
      if (requestError?.response?.status === 429) {
        const seconds=Number(requestError.response.headers?.['retry-after']);
        setDeadline(Date.now() + (Number.isFinite(seconds) ? Math.max(1, Math.min(3600, seconds)) : 60) * 1000); setNow(Date.now());
      }
    } finally { if (mounted.current) setSending(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!request || expired) { setError('请先获取有效的邮箱验证码'); return; }
    if (!/^\d{6}$/.test(code)) { setError('请输入6位邮箱验证码'); return; }
    if (password.length < 10 || !password.trim() || new TextEncoder().encode(password).length > 72) { setError('新密码至少10位，UTF-8编码后不能超过72字节'); return; }
    if (password !== confirmation) { setError('两次输入的新密码不一致'); return; }
    setSubmitting(true); setError('');
    try {
      await axiosForBackend.post('/api/auth/forgot-password', { requestId: request.requestId, code, newPassword: password, confirmPassword: confirmation });
      if (!mounted.current) return;
      setPassword(''); setConfirmation(''); setCode(''); setRequest(undefined); clearAuthToken();
      navigate('/login', { replace: true, state: { recoveredUsername: username.trim(), passwordReset: true } });
    } catch (requestError) { if (mounted.current) setError(getAuthError(requestError, '密码重置失败，请重新获取验证码或稍后重试')); }
    finally { if (mounted.current) setSubmitting(false); }
  };
  return <AuthCard eyebrow="账号安全" title="找回登录密码" description="通过原来绑定的邮箱验证身份，重置远效登录密码。">
    <form onSubmit={submit} className="space-y-4" noValidate>
      <AuthError>{error}</AuthError>
      <div className={`rounded-xl border p-3 text-xs leading-5 ${status?.emailAvailable ? 'border-blue-100 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status" aria-live="polite">
        {checking ? '正在检查邮件发送服务…' : status?.message || '暂时无法检查邮件服务。'}
        {!checking && !status?.emailAvailable && <button type="button" className="ml-2 underline" onClick={() => void checkStatus()}>重新检查</button>}
        {!checking && !status?.emailAvailable && window.matrixDesktop?.openRecoveryMailSettings && <button type="button" className="ml-2 underline" onClick={async () => {
          try { const result=await window.matrixDesktop!.openRecoveryMailSettings(); if(result.error)setError(result.error); else if(result.opened)setConfigurationNote('请在本机文件中填写 SMTP 地址、发件邮箱和专用授权码。保存后重启远效；不要把授权码或配置文件发送到聊天。'); }
          catch { setError('无法打开本机邮件配置，请联系管理员。'); }
        }}>配置邮件服务</button>}
      </div>
      {configurationNote && <p role="status" className="text-xs leading-5 text-slate-600">{configurationNote}</p>}
      <AuthField id="recovery-username" label="用户名" icon={AtSign} autoComplete="username" value={username} maxLength={50} disabled={busy} onChange={event => { setUsername(event.target.value); resetIdentity(); }} placeholder="请输入原来的用户名" required />
      <AuthField id="recovery-email" label="原绑定邮箱" icon={Mail} type="email" autoComplete="email" value={email} maxLength={254} disabled={busy} onChange={event => { setEmail(event.target.value); resetIdentity(); }} placeholder="请输入注册或个人资料中绑定的邮箱" required />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><AuthField id="recovery-code" label="邮箱验证码" icon={KeyRound} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={submitting} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="6位验证码" required /></div>
        <button type="button" onClick={() => void send()} disabled={busy || checking || !status?.emailAvailable || cooldown > 0} className="h-12 shrink-0 rounded-xl border border-blue-200 px-3 text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{sending ? '请求中…' : cooldown ? `${cooldown}秒后重试` : request ? '重新获取' : '获取验证码'}</button>
      </div>
      {request && <p className={`text-xs leading-5 ${expired ? 'text-rose-700' : 'text-slate-500'}`} role="status">{expired ? '验证码已过期，请重新获取。' : request.message}</p>}
      <AuthPasswordField id="recovery-password" label="新密码" value={password} autoComplete="new-password" maxLength={72} disabled={busy} onChange={event => { setPassword(event.target.value); setError(''); }} placeholder="至少10位，建议使用更长的独立密码" required />
      <AuthPasswordField id="recovery-confirmation" label="确认新密码" value={confirmation} autoComplete="new-password" maxLength={72} disabled={busy} onChange={event => { setConfirmation(event.target.value); setError(''); }} placeholder="再次输入新密码" required />
      <AuthSubmit loading={submitting} disabled={!request || expired || sending}>验证并重置密码</AuthSubmit>
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />验证码10分钟有效，最多尝试5次。重置后需重新登录远效；平台账号、平台登录会话、草稿和任务记录不变。</p>
      <Link to="/login" className="flex justify-center gap-2 text-sm text-slate-600"><ArrowLeft className="h-4 w-4" />返回登录</Link>
    </form>
  </AuthCard>;
}
