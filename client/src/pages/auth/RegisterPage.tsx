import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, UserPlus, CheckCircle2 } from 'lucide-react';
import { axiosForBackend, logger } from '@client/src/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    password: '',
    confirmPassword: '',
    email: '',
    phone: '',
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
    const { username, password, confirmPassword } = formData;

    if (!username || !password) {
      setError('用户名和密码不能为空');
      return;
    }
    if (password.length < 6) {
      setError('密码长度不能少于6位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await axiosForBackend.post('/api/auth/register', {
        username,
        password,
        nickname: formData.nickname || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
      });
      logger.info('用户注册成功', username);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || '注册失败，请稍后重试');
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
        <h1 className="text-2xl font-bold text-white mb-2">新媒体矩阵管理系统</h1>
        <p className="text-sm text-slate-400">创建您的账号，开启矩阵管理之旅</p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg text-white">用户注册</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-medium">注册成功！</p>
              <p className="text-sm text-slate-400 mt-1">正在跳转到登录页...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">用户名 *</Label>
                  <Input
                    type="text"
                    value={formData.username}
                    onChange={handleChange('username')}
                    placeholder="请设置用户名"
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">昵称</Label>
                  <Input
                    type="text"
                    value={formData.nickname}
                    onChange={handleChange('nickname')}
                    placeholder="显示用昵称"
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">密码 *</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={handleChange('password')}
                    placeholder="至少6位"
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">确认密码 *</Label>
                  <Input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange('confirmPassword')}
                    placeholder="再次输入密码"
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">邮箱（选填）</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={handleChange('email')}
                    placeholder="用于找回密码"
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">手机号（选填）</Label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange('phone')}
                    placeholder="接收通知"
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary h-9"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                <UserPlus className="w-4 h-4" />
                {loading ? '注册中...' : '注 册'}
              </Button>
            </form>
          )}

          <div className="mt-5 text-center text-sm">
            <span className="text-slate-500">
              已有账号？
              <Link to="/login" className="text-primary hover:text-primary/80 ml-1">
                去登录
              </Link>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
