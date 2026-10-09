import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, LogIn } from 'lucide-react';
import { axiosForBackend, logger, setAuthToken, setUser } from '@client/src/api';
import type { AppUser } from '@shared/api.interface';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);

    setError('');
    try {
      const response = await axiosForBackend.post('/api/auth/login', { username, password });
      const result = response.data.data as { token: string; user: AppUser };
      setAuthToken(result.token);
      setUser(result.user);
      logger.info('用户登录成功', username);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败，请检查用户名和密码');
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
        <p className="text-sm text-slate-400">一站式多平台账号管理平台</p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg text-white">用户登录</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label className="text-slate-300">用户名 / 邮箱</Label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名或邮箱"
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">密码</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary"
                autoComplete="current-password"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(checked) => setRemember(checked === true)}
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-slate-400 cursor-pointer select-none"
                >
                  记住我
                </label>
              </div>
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:text-primary/80"
              >
                忘记密码？
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="w-4 h-4" />
              {loading ? '登录中...' : '登 录'}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              没有账号？
              <Link to="/register" className="text-primary hover:text-primary/80 ml-1">
                去注册
              </Link>
            </span>
            <Link to="/admin/login" className="text-slate-500 hover:text-slate-300">
              管理员入口 →
            </Link>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-slate-600 mt-6">
        登录即表示同意《用户协议》和《隐私政策》
      </p>
    </div>
  );
}
