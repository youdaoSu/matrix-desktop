import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, LogIn, ArrowLeft, AlertTriangle } from 'lucide-react';
import { adminAxios, logger, setAdminToken, setAdminUser } from '@client/src/api';
import type { AdminUser } from '@shared/api.interface';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入管理员账号和密码');
      return;
    }
    setLoading(true);

    setError('');
    try {
      const response = await adminAxios.post('/api/admin/login', { username, password });
      const result = response.data.data as { token: string; user: AdminUser };
      setAdminToken(result.token);
      setAdminUser(result.user);
      logger.info('管理员登录成功', username);
      navigate('/admin/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || '管理员账号或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 mb-4">
          <Shield className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">管理后台</h1>
        <p className="text-sm text-slate-400">请使用管理员账号登录</p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-white">管理员登录</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 bg-amber-500/10 border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <AlertTitle className="text-amber-400 text-xs">安全提示</AlertTitle>
            <AlertDescription className="text-slate-400 text-xs">
              首次登录后请立即修改初始密码，确保账号安全
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label className="text-slate-300">管理员用户名</Label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入管理员账号"
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
                placeholder="请输入管理员密码"
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:border-primary"
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="w-4 h-4" />
              {loading ? '登录中...' : '登 录'}
            </Button>

            <p className="text-xs text-slate-600 text-center">
              初始账号：admin / admin123456
            </p>
          </form>

          <div className="mt-5 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回用户登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
