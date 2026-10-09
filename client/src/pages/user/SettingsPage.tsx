import { useState } from 'react';
import {
  User,
  Lock,
  Crown,
  History,
  Camera,
  CreditCard,
  Calendar,
  Users,
  Link2,
  Bell,
  Palette,
  Mail,
  Smartphone,
  Check,
  X,
  AlertCircle,
  Shield,
  Sparkles,
  Moon,
  Sun,
  Monitor,
  Type,
  VolumeX,
  Music,
  BookOpen,
  Video,
  Tv,
  LogIn,
  MapPin,
  Globe,
  Monitor as MonitorIcon,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { PlatformType } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import { Switch } from '@client/src/components/ui/switch';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@client/src/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@client/src/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@client/src/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback } from '@client/src/components/ui/avatar';
import { Textarea } from '@client/src/components/ui/textarea';
import { Progress } from '@client/src/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Separator } from '@client/src/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@client/src/components/ui/radio-group';
import { useTheme, type Theme } from '@client/src/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

const menuItems = [
  { key: 'profile', label: '个人资料', icon: User },
  { key: 'password', label: '修改密码', icon: Lock },
  { key: 'bindings', label: '账号绑定', icon: Link2 },
  { key: 'vip', label: 'VIP 状态', icon: Crown },
  { key: 'logins', label: '登录记录', icon: History },
  { key: 'notifications', label: '消息通知', icon: Bell },
  { key: 'theme', label: '主题偏好', icon: Palette },
];

interface LoginRecord {
  id: string;
  time: string;
  ip: string;
  device: string;
  location: string;
  status: 'success' | 'failed';
  current?: boolean;
}

const loginRecords: LoginRecord[] = [
  { id: '1', time: '2026-09-28 14:30:25', ip: '192.168.1.100', device: 'Chrome 128 / macOS', location: '北京', status: 'success', current: true },
  { id: '2', time: '2026-09-27 09:15:32', ip: '192.168.1.100', device: 'Chrome 128 / macOS', location: '北京', status: 'success' },
  { id: '3', time: '2026-09-26 20:45:10', ip: '10.0.0.55', device: 'Safari 17 / iOS 17', location: '上海', status: 'success' },
  { id: '4', time: '2026-09-25 11:20:08', ip: '192.168.1.100', device: 'Chrome 128 / macOS', location: '北京', status: 'success' },
  { id: '5', time: '2026-09-25 08:30:55', ip: '203.0.113.42', device: 'Unknown Browser / Windows', location: '广东深圳', status: 'failed' },
  { id: '6', time: '2026-09-24 16:12:30', ip: '192.168.1.100', device: 'Chrome 127 / macOS', location: '北京', status: 'success' },
  { id: '7', time: '2026-09-23 22:05:18', ip: '10.0.0.55', device: 'Safari 17 / iOS 17', location: '上海', status: 'success' },
  { id: '8', time: '2026-09-22 10:45:00', ip: '192.168.1.100', device: 'Chrome 127 / macOS', location: '北京', status: 'success' },
];

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

type AccentColor = 'orange' | 'blue' | 'green';
const accentColors: { key: AccentColor; label: string; value: string }[] = [
  { key: 'orange', label: '活力橙', value: 'hsl(26 90% 49%)' },
  { key: 'blue', label: '科技蓝', value: 'hsl(221 83% 53%)' },
  { key: 'green', label: '品牌绿', value: 'hsl(130 54% 42%)' },
];

type FontSize = 'normal' | 'large' | 'xlarge';

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');

  // Profile
  const [nickname, setNickname] = useState('肆宇');
  const [email, setEmail] = useState('siyu@example.com');
  const [phone, setPhone] = useState('138****8888');
  const [bio, setBio] = useState('新媒体运营从业者，专注短视频内容创作与账号矩阵管理。');
  const [emailEditOpen, setEmailEditOpen] = useState(false);
  const [phoneEditOpen, setPhoneEditOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  // Password
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  // Bindings
  const [platformBindings, setPlatformBindings] = useState<Record<PlatformType, boolean>>({
    douyin: true,
    xiaohongshu: true,
    wechat: false,
    bilibili: false,
  });
  const [phoneBound, setPhoneBound] = useState(true);
  const [emailBound, setEmailBound] = useState(true);

  // Notifications
  const [notifications, setNotifications] = useState({
    system: { inapp: true, email: false },
    publish: { inapp: true, email: true },
    follower: { inapp: true, email: false },
    comment: { inapp: true, email: false },
    message: { inapp: true, email: false },
    monitor: { inapp: true, email: true },
    vipExpire: { inapp: true, email: true },
  });
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart, setDndStart] = useState('22:00');
  const [dndEnd, setDndEnd] = useState('08:00');

  // Theme
  const [accentColor, setAccentColor] = useState<AccentColor>('orange');
  const [fontSize, setFontSize] = useState<FontSize>('normal');

  const strength = getPasswordStrength(newPassword);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canChangePwd = oldPassword.length > 0 && newPassword.length > 0 && newPassword === confirmPassword && strength.level >= 40;

  const requirements = [
    { text: '长度至少 8 位', met: newPassword.length >= 8 },
    { text: '包含字母和数字', met: /[a-zA-Z]/.test(newPassword) && /\d/.test(newPassword) },
    { text: '包含大小写字母', met: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { text: '包含特殊字符', met: /[^a-zA-Z0-9]/.test(newPassword) },
  ];

  const handleChangePassword = () => {
    if (!canChangePwd) return;
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2000);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const toggleNotification = (key: keyof typeof notifications, channel: 'inapp' | 'email', value: boolean) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: { ...prev[key], [channel]: value },
    }));
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">个人设置</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的个人信息、安全设置和偏好</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧导航 */}
        <div className="lg:col-span-3">
          <Card className="shadow-sm sticky top-4">
            <CardContent className="p-2 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={cn(
                      'w-full flex items-center gap-3 h-9 px-3 rounded-md text-sm transition-colors',
                      activeTab === item.key
                        ? 'bg-primary text-white font-medium'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* 右侧内容 */}
        <div className="lg:col-span-9 space-y-6">
          {/* 个人资料 */}
          {activeTab === 'profile' && (
            <>
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">基本资料</CardTitle>
                  <CardDescription>修改您的个人信息，修改后点击保存</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4 pb-4 border-b border-border">
                    <div className="relative">
                      <Avatar className="w-20 h-20">
                        <AvatarFallback className="text-xl bg-primary/10 text-primary">
                          <User className="w-8 h-8" />
                        </AvatarFallback>
                      </Avatar>
                      <button className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors">
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-medium">头像</p>
                      <p className="text-xs text-muted-foreground mt-0.5">支持 JPG/PNG 格式，建议尺寸 200x200</p>
                      <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary mt-1">
                        更换头像
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="nickname">昵称</Label>
                      <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="username">用户名</Label>
                      <Input id="username" value="siyu001" disabled />
                      <p className="text-xs text-muted-foreground">用户名不可修改</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bio">个人简介</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      placeholder="介绍一下自己吧"
                    />
                    <p className="text-xs text-muted-foreground text-right">{bio.length}/200</p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button>保存修改</Button>
                    <Button variant="outline">取消</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">联系方式</CardTitle>
                  <CardDescription>管理您的邮箱和手机号</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">邮箱</div>
                        <div className="text-xs text-muted-foreground">{email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-none">
                        <Check className="w-3 h-3 mr-1" />已绑定
                      </Badge>
                      <Button variant="outline" size="sm" className="h-7" onClick={() => { setNewEmail(email); setEmailEditOpen(true); }}>
                        换绑
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Smartphone className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">手机号</div>
                        <div className="text-xs text-muted-foreground">{phone}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-none">
                        <Check className="w-3 h-3 mr-1" />已绑定
                      </Badge>
                      <Button variant="outline" size="sm" className="h-7" onClick={() => { setNewPhone(phone); setPhoneEditOpen(true); }}>
                        换绑
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* 修改密码 */}
          {activeTab === 'password' && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">修改登录密码</CardTitle>
                <CardDescription>请输入当前密码并设置新密码</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 max-w-md">
                {passwordSaved && (
                  <Alert variant="default" className="bg-[hsl(130_54%_42%)]/10 border-[hsl(130_54%_42%)]/30 text-[hsl(130_54%_42%)]">
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">密码修改成功</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="old-password">当前密码</Label>
                  <div className="relative">
                    <Input
                      id="old-password"
                      type={showOldPwd ? 'text' : 'password'}
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="请输入当前密码"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowOldPwd(!showOldPwd)}
                    >
                      {showOldPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-password">新密码</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPwd ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="请输入新密码"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPwd(!showNewPwd)}
                    >
                      {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPassword.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-2">
                        <Progress value={strength.level} className="h-1.5" style={{ ['--progress-bg' as string]: strength.color }} />
                        <span className="text-xs font-medium whitespace-nowrap" style={{ color: strength.color }}>
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
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPwd ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="请再次输入新密码"
                      className={cn('pr-10', mismatch && 'border-destructive')}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                    >
                      {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
                  <Button disabled={!canChangePwd} onClick={handleChangePassword}>确认修改</Button>
                  <Button variant="outline" onClick={() => { setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}>
                    取消
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 账号绑定 */}
          {activeTab === 'bindings' && (
            <div className="space-y-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">基础账号绑定</CardTitle>
                  <CardDescription>管理您的手机号和邮箱绑定</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Smartphone className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">手机号</div>
                        <div className="text-xs text-muted-foreground">{phone}</div>
                      </div>
                    </div>
                    <Button variant={phoneBound ? 'outline' : 'default'} size="sm" className="h-7" onClick={() => setPhoneBound(!phoneBound)}>
                      {phoneBound ? '换绑' : '去绑定'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">邮箱</div>
                        <div className="text-xs text-muted-foreground">{email}</div>
                      </div>
                    </div>
                    <Button variant={emailBound ? 'outline' : 'default'} size="sm" className="h-7" onClick={() => setEmailBound(!emailBound)}>
                      {emailBound ? '换绑' : '去绑定'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">第三方平台账号</CardTitle>
                  <CardDescription>绑定第三方平台账号，方便快速登录</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(Object.keys(platformMeta) as PlatformType[]).map((platform) => {
                    const meta = platformMeta[platform];
                    const Icon = meta.icon;
                    const bound = platformBindings[platform];
                    return (
                      <div key={platform} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
                            style={{ backgroundColor: meta.color }}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{meta.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {bound ? '已绑定 · 可快速登录' : '未绑定'}
                            </div>
                          </div>
                        </div>
                        {bound ? (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-none">
                              <Check className="w-3 h-3 mr-1" />已绑定
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-destructive hover:text-destructive"
                              onClick={() => setPlatformBindings({ ...platformBindings, [platform]: false })}
                            >
                              解绑
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" className="h-7" onClick={() => setPlatformBindings({ ...platformBindings, [platform]: true })}>
                            去绑定
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}

          {/* VIP 状态 */}
          {activeTab === 'vip' && (
            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-[hsl(221_83%_53%)] via-[hsl(221_83%_60%)] to-[hsl(46_100%_52%)] border-none text-white overflow-hidden shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
                        <Crown className="w-6 h-6 text-[hsl(46_100%_92%)]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">专业版</span>
                          <Badge className="bg-white/20 text-white border-none text-xs">
                            <Sparkles className="w-3 h-3 mr-1" />当前套餐
                          </Badge>
                        </div>
                        <p className="text-sm text-white/80 mt-0.5">适合团队运营使用</p>
                      </div>
                    </div>
                    <Badge className="bg-[hsl(130_54%_42%)] text-white border-none">
                      <Check className="w-3 h-3 mr-1" />有效期内
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                      <div className="text-xs text-white/70 mb-1 flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5" />套餐名称
                      </div>
                      <div className="text-base font-semibold">专业版</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                      <div className="text-xs text-white/70 mb-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />到期时间
                      </div>
                      <div className="text-base font-semibold">2027-04-02</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                      <div className="text-xs text-white/70 mb-1 flex items-center gap-1">
                        <Crown className="w-3.5 h-3.5" />剩余天数
                      </div>
                      <div className="text-base font-semibold text-[hsl(46_100%_85%)]">186 天</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                      <div className="text-xs text-white/70 mb-1 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />绑定账号
                      </div>
                      <div className="text-base font-semibold">8 / 20</div>
                    </div>
                  </div>

                  <div className="mt-4 bg-white/10 backdrop-blur rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs text-white/80 mb-1.5">
                      <span>VIP 有效期进度</span>
                      <span>186 / 365 天</span>
                    </div>
                    <Progress value={51} className="h-2 bg-white/20" style={{ ['--progress-bg' as string]: 'hsl(46 100% 85%)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">授权激活记录</CardTitle>
                  <CardDescription>查看历史授权码激活记录</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>授权码</TableHead>
                        <TableHead>套餐</TableHead>
                        <TableHead>激活时间</TableHead>
                        <TableHead>到期时间</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono text-sm">ABCD-EFGH-IJKL-MNOP</TableCell>
                        <TableCell className="text-sm">专业版 · 年卡</TableCell>
                        <TableCell className="text-sm text-muted-foreground">2026-04-02 10:30:00</TableCell>
                        <TableCell className="text-sm text-muted-foreground">2027-04-02</TableCell>
                        <TableCell>
                          <Badge className="bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-none text-xs">
                            生效中
                          </Badge>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">1234-5678-90AB-CDEF</TableCell>
                        <TableCell className="text-sm">基础版 · 月卡</TableCell>
                        <TableCell className="text-sm text-muted-foreground">2026-03-01 14:20:00</TableCell>
                        <TableCell className="text-sm text-muted-foreground">2026-04-01</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">已过期</Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">授权码激活</CardTitle>
                  <CardDescription>输入购买的授权码延长 VIP 时长</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3 max-w-xl">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="vip-code">授权码</Label>
                      <Input
                        id="vip-code"
                        placeholder="请输入 16 位授权码"
                        className="font-mono tracking-wider"
                      />
                    </div>
                    <Button className="mb-0.5">
                      <Sparkles className="w-4 h-4" />
                      立即激活
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 登录记录 */}
          {activeTab === 'logins' && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">近期登录记录</CardTitle>
                    <CardDescription>共 {loginRecords.length} 条记录，最多保留 30 天</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Shield className="w-4 h-4 mr-1" />
                    退出其他设备
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />登录时间
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" />IP 地址
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <MonitorIcon className="w-3.5 h-3.5" />设备/浏览器
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />地点
                        </span>
                      </TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {record.time}
                            {record.current && (
                              <Badge variant="secondary" className="text-[10px] h-4 bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-none">
                                当前
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{record.ip}</TableCell>
                        <TableCell className="text-sm">{record.device}</TableCell>
                        <TableCell className="text-sm">{record.location}</TableCell>
                        <TableCell>
                          {record.status === 'success' ? (
                            <Badge className="bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-none text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />成功
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="w-3 h-3 mr-1" />失败
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 消息通知 */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">通知设置</CardTitle>
                  <CardDescription>选择您想要接收的通知类型和推送方式</CardDescription>
                </CardHeader>
                <CardContent className="space-y-0">
                  <div className="grid grid-cols-[1fr_80px_80px] gap-3 text-xs font-medium text-muted-foreground pb-3 border-b border-border">
                    <div>通知类型</div>
                    <div className="text-center">站内</div>
                    <div className="text-center">邮件</div>
                  </div>
                  {[
                    { key: 'system' as const, label: '系统公告', desc: '重要系统更新和维护通知' },
                    { key: 'publish' as const, label: '发布结果', desc: '内容发布成功或失败通知' },
                    { key: 'follower' as const, label: '粉丝提醒', desc: '新粉丝关注提醒' },
                    { key: 'comment' as const, label: '评论提醒', desc: '新评论和回复提醒' },
                    { key: 'message' as const, label: '私信提醒', desc: '新私信消息提醒' },
                    { key: 'monitor' as const, label: '监控预警', desc: '监控任务命中关键词提醒' },
                    { key: 'vipExpire' as const, label: 'VIP 到期', desc: 'VIP 到期前提醒续费' },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-[1fr_80px_80px] gap-3 items-center py-3 border-b border-border/60 last:border-0"
                    >
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                      </div>
                      <div className="flex justify-center">
                        <Switch
                          checked={notifications[item.key].inapp}
                          onCheckedChange={(v) => toggleNotification(item.key, 'inapp', v)}
                        />
                      </div>
                      <div className="flex justify-center">
                        <Switch
                          checked={notifications[item.key].email}
                          onCheckedChange={(v) => toggleNotification(item.key, 'email', v)}
                          disabled
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground pt-3">
                    * 邮件通知功能待开发，敬请期待
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">免打扰设置</CardTitle>
                  <CardDescription>设置免打扰时段，期间不会推送通知</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                        <VolumeX className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">免打扰模式</div>
                        <div className="text-xs text-muted-foreground">开启后在指定时段不接收通知</div>
                      </div>
                    </div>
                    <Switch checked={dndEnabled} onCheckedChange={setDndEnabled} />
                  </div>

                  {dndEnabled && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground mb-1 block">开始时间</Label>
                        <Input type="time" value={dndStart} onChange={(e) => setDndStart(e.target.value)} className="h-9" />
                      </div>
                      <span className="text-muted-foreground pt-5">至</span>
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground mb-1 block">结束时间</Label>
                        <Input type="time" value={dndEnd} onChange={(e) => setDndEnd(e.target.value)} className="h-9" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* 主题偏好 */}
          {activeTab === 'theme' && (
            <div className="space-y-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">主题模式</CardTitle>
                  <CardDescription>选择您喜欢的界面主题</CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={theme} onValueChange={(v) => handleThemeChange(v as Theme)}>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: 'light', label: '明亮', icon: Sun },
                        { value: 'dark', label: '暗黑', icon: Moon },
                        { value: 'system', label: '跟随系统', icon: Monitor },
                      ].map((option) => {
                        const Icon = option.icon;
                        const active = theme === option.value;
                        return (
                          <label
                            key={option.value}
                            className={cn(
                              'flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-all',
                              active
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <RadioGroupItem value={option.value} id={`theme-${option.value}`} className="sr-only" />
                            <div className={cn(
                              'w-10 h-10 rounded-full flex items-center justify-center',
                              active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                            )}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className="text-sm font-medium">{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">强调色</CardTitle>
                  <CardDescription>选择按钮、链接和高亮元素的颜色</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    {accentColors.map((color) => (
                      <button
                        key={color.key}
                        onClick={() => setAccentColor(color.key)}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all flex-1',
                          accentColor === color.key
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <div
                          className="w-10 h-10 rounded-full ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: color.value }}
                        />
                        <span className="text-sm font-medium">{color.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    * 强调色切换为演示功能，当前以橙色为默认强调色
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">字体大小</CardTitle>
                  <CardDescription>调整界面文字大小</CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as FontSize)}>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: 'normal', label: '标准', size: 'text-base' },
                        { value: 'large', label: '大', size: 'text-lg' },
                        { value: 'xlarge', label: '特大', size: 'text-xl' },
                      ].map((option) => {
                        const active = fontSize === option.value;
                        return (
                          <label
                            key={option.value}
                            className={cn(
                              'flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-all',
                              active
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <RadioGroupItem value={option.value} id={`font-${option.value}`} className="sr-only" />
                            <Type className={cn('w-5 h-5', active ? 'text-primary' : 'text-muted-foreground')} />
                            <span className={cn('font-medium', option.size)}>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* 邮箱换绑 Dialog */}
      <Dialog open={emailEditOpen} onOpenChange={setEmailEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>换绑邮箱</DialogTitle>
            <DialogDescription>输入新邮箱和验证码完成换绑</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>当前邮箱</Label>
              <Input value={email} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>新邮箱</Label>
              <Input type="email" placeholder="请输入新邮箱地址" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>验证码</Label>
              <div className="flex gap-2">
                <Input placeholder="请输入验证码" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
                <Button variant="outline" className="whitespace-nowrap">获取验证码</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEmailEditOpen(false); setNewEmail(''); setVerifyCode(''); }}>取消</Button>
            <Button disabled={!newEmail || !verifyCode}>确认换绑</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 手机换绑 Dialog */}
      <Dialog open={phoneEditOpen} onOpenChange={setPhoneEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>换绑手机号</DialogTitle>
            <DialogDescription>输入新手机号和验证码完成换绑</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>当前手机号</Label>
              <Input value={phone} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>新手机号</Label>
              <Input placeholder="请输入新手机号" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>验证码</Label>
              <div className="flex gap-2">
                <Input placeholder="请输入验证码" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
                <Button variant="outline" className="whitespace-nowrap">获取验证码</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPhoneEditOpen(false); setNewPhone(''); setVerifyCode(''); }}>取消</Button>
            <Button disabled={!newPhone || !verifyCode}>确认换绑</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
