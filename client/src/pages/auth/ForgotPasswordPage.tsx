import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, MailCheck, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthCard } from '@/components/auth/AuthComponents';

export default function ForgotPasswordPage() {
  return (
    <AuthCard eyebrow="账号安全" title="找回登录密码" description="保护你的账号需要先验证邮箱或手机号所有权。">
      <div className="space-y-5">
        <div className="flex items-start gap-4 rounded-2xl bg-slate-50 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><KeyRound className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-900">自助找回暂未开放</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">当前版本尚未配置邮箱或短信验证码发送服务。为避免他人仅凭用户名和邮箱就重置你的密码，我们不会直接修改密码。</p>
          </div>
        </div>
        <Alert className="rounded-xl border-amber-200 bg-amber-50 text-amber-950">
          <ShieldAlert className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-xs leading-5">请联系矩效管理员核验身份并协助重置。配置邮件服务后，可再启用安全验证码找回流程。</AlertDescription>
        </Alert>
        <div className="rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><MailCheck className="h-4 w-4 text-slate-500" />后续开通所需配置</div>
          <p className="mt-2 text-xs leading-5 text-slate-500">邮件服务地址、发件账号和应用专用密钥。配置完成后会使用限时、一次性验证码验证邮箱。</p>
        </div>
        <Link to="/login" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />返回登录</Link>
      </div>
    </AuthCard>
  );
}
