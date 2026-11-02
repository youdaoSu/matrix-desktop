import { useState } from 'react';
import {
  Lock,
  Info,
  AlertCircle,
  Check,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Progress } from '@client/src/components/ui/progress';
import { cn } from '@/lib/utils';
import { axiosForBackend, clearAuthToken } from '@/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const getPasswordStrength = (pwd: string): { level: number; label: string; color: string } => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  if (pwd.length >= 12) score++;

  if (score <= 1) return { level: 20, label: '弱', color: 'hsl(2 84% 62%)' };
  if (score <= 2) return { level: 40, label: '较弱', color: 'hsl(26 90% 49%)' };
  if (score <= 3) return { level: 60, label: '中等', color: 'hsl(46 100% 52%)' };
  if (score <= 4) return { level: 80, label: '较强', color: 'hsl(130 54% 42%)' };
  return { level: 100, label: '强', color: 'hsl(130 54% 42%)' };
};

const SettingsPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await axiosForBackend.post('/api/users/change-password', { oldPassword, newPassword });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      clearAuthToken();
      toast.success('密码修改成功，请使用新密码重新登录');
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || '密码修改失败');
    } finally { setSaving(false); }
  };

  const strength = getPasswordStrength(newPassword);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = oldPassword.length > 0 && newPassword.length > 0 && newPassword === confirmPassword && strength.level >= 40;

  const requirements = [
    { text: '长度至少 8 位', met: newPassword.length >= 8 },
    { text: '包含字母和数字', met: /[a-zA-Z]/.test(newPassword) && /\d/.test(newPassword) },
    { text: '包含大小写字母', met: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { text: '包含特殊字符', met: /[^a-zA-Z0-9]/.test(newPassword) },
  ];

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-primary/5 border-primary/20">
        <Info className="w-4 h-4 text-primary" />
        <AlertDescription>
          密码将安全更新到当前本地账户，原密码校验失败时不会修改。
        </AlertDescription>
      </Alert>

      <div>
        <h1 className="text-xl font-semibold text-foreground">修改密码</h1>
        <p className="text-sm text-muted-foreground mt-1">定期更换密码可以提升账号安全性</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">设置导航</CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              <button className="w-full flex items-center gap-3 h-9 px-3 rounded-md text-sm bg-primary text-white font-medium">
                <Lock className="w-4 h-4 shrink-0" />
                <span>修改密码</span>
              </button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-9">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">修改登录密码</CardTitle>
              <CardDescription>请输入当前密码并设置新密码</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="old-password">当前密码</Label>
                <Input
                  id="old-password"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入当前密码"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">新密码</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码"
                />
                {newPassword.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={strength.level}
                        className={cn('h-1.5')}
                        style={{ ['--progress-bg' as string]: strength.color }}
                      />
                      <span
                        className="text-xs font-medium whitespace-nowrap"
                        style={{ color: strength.color }}
                      >
                        {strength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 pt-1">
                      {requirements.map((req, index: number) => (
                        <div key={index} className="flex items-center gap-1.5 text-xs">
                          {req.met ? (
                            <Check className="w-3 h-3 text-[hsl(130_54%_42%)]" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-muted-foreground" />
                          )}
                          <span className={req.met ? 'text-[hsl(130_54%_42%)]' : 'text-muted-foreground'}>
                            {req.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">确认新密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  className={mismatch ? 'border-destructive' : ''}
                />
                {mismatch && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    两次输入的密码不一致
                  </p>
                )}
              </div>

              <Alert variant="default" className="bg-primary/5 border-primary/20 text-primary">
                <Shield className="w-4 h-4" />
                <AlertDescription className="text-sm">
                  为了账号安全，建议使用包含大小写字母、数字和特殊字符的强密码
                </AlertDescription>
              </Alert>

              <div className="flex gap-2 pt-2">
                <Button disabled={!canSubmit || saving} onClick={() => void submit()}>{saving ? '修改中…' : '确认修改'}</Button>
                <Button variant="outline" onClick={() => { setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}>取消</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsPasswordPage;
