import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react';
import { axiosForBackend, logger } from '@client/src/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    newPassword: '',
    confirmPassword: '',
    email: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { username, newPassword, confirmPassword, email } = formData;

    if (!username || !newPassword || !confirmPassword || !email) {
      setError('请填写所有必填字段');
      return;
    }
    if (newPassword.length < 6) {
      setError('密码长度不能少于6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await axiosForBackend.post('/api/auth/forgot-password', {
        username,
        newPassword,
        email,
      });
      logger.info('密码重置成功', username);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || '密码重置失败');
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
        <h1 className="text-2xl font-bold text-white mb-2">重置密码</h1>
        <p className="text-sm text-slate-400">请输入您的用户名和邮箱</p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            忘记密码
          </CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-medium">密码重置成功！</p>
              <p className="text-sm text-slate-400 mt-1">正在跳转到登录页...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">用户名 *</Label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={handleChange('username')}
                  placeholder="请输入用户名"
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">注册邮箱（验证用）*</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={handleChange('email')}
                  placeholder="请输入注册时的邮箱"
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                />
                <p className="text-xs text-slate-600">
                  未配置安全验证码服务时，系统会拒绝直接重置密码
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">新密码 *</Label>
                <Input
                  type="password"
                  value={formData.newPassword}
                  onChange={handleChange('newPassword')}
                  placeholder="至少6位"
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">确认新密码 *</Label>
                <Input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange('confirmPassword')}
                  placeholder="再次输入新密码"
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                <KeyRound className="w-4 h-4" />
                {loading ? '重置中...' : '重置密码'}
              </Button>
            </form>
          )}

          <div className="mt-5 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
