import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Upload,
  Download,
  Copy,
  Check,
  Eye,
  EyeOff,
  Shield,
  Settings2,
  Megaphone,
  AlertTriangle,
  KeyRound,
  Users,
  Save,
  RefreshCw,
  BellRing,
  MessageSquare,
  Send,
  BookOpen,
} from 'lucide-react';
import type { Announcement, SensitiveWord, AdminUser } from '@shared/api.interface';

// ===== 平台凭证数据 =====
type PlatformStatus = 'configured' | 'unconfigured' | 'error';
interface PlatformCredential {
  id: string;
  name: string;
  platform: 'douyin' | 'xiaohongshu' | 'wechat' | 'bilibili';
  appId: string;
  appSecret: string;
  callbackUrl: string;
  scopes: string[];
  status: PlatformStatus;
  note?: string;
}

const PLATFORM_SCOPES = ['用户信息', '视频发布', '私信', '评论', '粉丝列表', '数据统计'];

const initialPlatforms: PlatformCredential[] = [
  {
    id: 'dy',
    name: '抖音',
    platform: 'douyin',
    appId: 'awjg7d8f3k2m1n',
    appSecret: '********',
    callbackUrl: 'https://matrix.saas.example.com/api/callback/douyin',
    scopes: ['用户信息', '视频发布', '私信', '评论', '粉丝列表', '数据统计'],
    status: 'configured',
  },
  {
    id: 'xhs',
    name: '小红书',
    platform: 'xiaohongshu',
    appId: '',
    appSecret: '',
    callbackUrl: 'https://matrix.saas.example.com/api/callback/xiaohongshu',
    scopes: [],
    status: 'unconfigured',
  },
  {
    id: 'wx',
    name: '微信视频号',
    platform: 'wechat',
    appId: 'wx_100003',
    appSecret: '********',
    callbackUrl: 'https://matrix.saas.example.com/api/callback/wechat',
    scopes: ['用户信息', '粉丝列表', '数据统计'],
    status: 'configured',
    note: '视频内容发布 API 暂未开放，当前仅支持电商/直播数据接口',
  },
  {
    id: 'bili',
    name: 'B站',
    platform: 'bilibili',
    appId: 'bili_app_987',
    appSecret: '********',
    callbackUrl: 'https://matrix.saas.example.com/api/callback/bilibili',
    scopes: ['用户信息', '视频发布', '评论', '粉丝列表', '数据统计'],
    status: 'error',
  },
];

// ===== 功能开关数据 =====
interface GlobalFeature {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  warning?: boolean;
}

const initialGlobalFeatures: GlobalFeature[] = [
  { key: 'publish', name: '内容发布', description: '允许用户通过平台发布内容到各社交媒体', enabled: true },
  { key: 'message', name: '私信收发', description: '启用私信收发与会话管理功能', enabled: true },
  { key: 'comment', name: '评论管理', description: '启用评论查看、回复与管理功能', enabled: true },
  { key: 'follower', name: '粉丝同步', description: '定期同步各平台粉丝数据', enabled: true },
  { key: 'autoreply', name: '自动回复', description: '关键词回复、欢迎语等自动回复功能', enabled: true },
  { key: 'monitor', name: '监控任务', description: '粉丝/私信/评论关键词监控与自动处理', enabled: true },
  { key: 'autoMessage', name: '主动消息', description: '批量主动发送私信（需遵守平台规则，默认关闭）', enabled: false, warning: true },
];

// ===== 敏感词数据 =====
const SENSITIVE_CATEGORIES = ['广告类', '违规类', '政治类', '色情类'];

const generateSensitiveWords = (): SensitiveWord[] => {
  const words: SensitiveWord[] = [];
  const adWords = ['加微信', '扫码领', '点击链接', '限时优惠', '免费领取', '加好友', '进群福利', '扫码下载'];
  const violationWords = ['刷量', '刷粉', '刷赞', '刷单', '代刷', '涨粉神器', '引流脚本', '自动点赞'];
  const politicalWords = ['敏感政治词1', '敏感政治词2', '敏感政治词3', '敏感政治词4', '敏感政治词5', '敏感政治词6', '敏感政治词7', '敏感政治词8'];
  const pornWords = ['敏感色情词1', '敏感色情词2', '敏感色情词3', '敏感色情词4', '敏感色情词5', '敏感色情词6', '敏感色情词7', '敏感色情词8'];

  const categories: { name: string; words: string[] }[] = [
    { name: '广告类', words: adWords },
    { name: '违规类', words: violationWords },
    { name: '政治类', words: politicalWords },
    { name: '色情类', words: pornWords },
  ];

  let idx = 1;
  categories.forEach((cat) => {
    cat.words.forEach((word, i) => {
      words.push({
        id: `sw${idx}`,
        word,
        category: cat.name,
        level: i < 4 ? 'block' : 'warn',
        isEnabled: i % 5 !== 4,
        createdAt: `2024-09-${String((idx % 28) + 1).padStart(2, '0')} 10:${String(idx * 7 % 60).padStart(2, '0')}:00`,
      });
      idx += 1;
    });
  });
  return words;
};

// ===== 公告数据 =====
const initialAnnouncements: Announcement[] = [
  { id: 'a1', title: '系统升级维护通知', content: '将于本周五凌晨2:00-4:00进行系统升级维护...', summary: '系统升级维护通知，升级期间服务暂停', category: 'system', isPublished: true, sortOrder: 1, createdAt: '2024-09-25 10:00:00', updatedAt: '2024-09-25 10:00:00' },
  { id: 'a2', title: 'v2.3.0 版本功能更新', content: '新增批量发布功能，优化粉丝同步速度...', summary: 'v2.3.0 版本更新，新增批量发布功能', category: 'update', isPublished: true, sortOrder: 2, createdAt: '2024-09-20 14:30:00', updatedAt: '2024-09-20 14:30:00' },
  { id: 'a3', title: '国庆专属活动上线', content: '国庆期间开通年度会员享7折优惠...', summary: '国庆活动，年度会员7折', category: 'activity', isPublished: true, sortOrder: 3, createdAt: '2024-09-28 09:00:00', updatedAt: '2024-09-28 09:00:00' },
  { id: 'a4', title: '平台合规使用公告', content: '请各用户遵守各平台社区规范，严禁发布违规内容...', summary: '合规使用提醒', category: 'compliance', isPublished: true, sortOrder: 4, createdAt: '2024-09-15 16:00:00', updatedAt: '2024-09-15 16:00:00' },
  { id: 'a5', title: '抖音平台API调整通知', content: '抖音开放平台近期调整了部分API权限...', summary: '抖音API调整通知', category: 'system', isPublished: true, sortOrder: 5, createdAt: '2024-09-10 11:00:00', updatedAt: '2024-09-10 11:00:00' },
  { id: 'a6', title: '新增数据看板功能（草稿）', content: '全新数据看板模块即将上线...', summary: '数据看板功能预告', category: 'update', isPublished: false, sortOrder: 6, createdAt: '2024-09-27 15:00:00', updatedAt: '2024-09-27 15:00:00' },
  { id: 'a7', title: '双十一预热活动策划', content: '双十一活动方案草稿...', summary: '双十一预热活动', category: 'activity', isPublished: false, sortOrder: 7, createdAt: '2024-09-26 08:00:00', updatedAt: '2024-09-26 08:00:00' },
  { id: 'a8', title: '内容发布合规指引更新', content: '更新内容发布合规指引...', summary: '合规指引更新', category: 'compliance', isPublished: true, sortOrder: 8, createdAt: '2024-09-05 13:00:00', updatedAt: '2024-09-05 13:00:00' },
  { id: 'a9', title: '客服系统升级通知', content: '客服系统将于本周进行升级...', summary: '客服系统升级', category: 'system', isPublished: false, sortOrder: 9, createdAt: '2024-09-22 10:30:00', updatedAt: '2024-09-22 10:30:00' },
  { id: 'a10', title: '小红书数据接口优化', content: '优化小红书数据拉取接口性能...', summary: '小红书接口优化', category: 'update', isPublished: true, sortOrder: 10, createdAt: '2024-09-18 17:00:00', updatedAt: '2024-09-18 17:00:00' },
];

const ANNOUNCEMENT_CATEGORIES: { value: Announcement['category']; label: string; color: string }[] = [
  { value: 'system', label: '系统更新', color: 'bg-blue-100 text-blue-700' },
  { value: 'update', label: '功能更新', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'activity', label: '活动通知', color: 'bg-orange-100 text-orange-700' },
  { value: 'compliance', label: '合规公告', color: 'bg-purple-100 text-purple-700' },
];

// ===== 管理员数据 =====
const initialAdmins: AdminUser[] = [
  { id: 'admin1', username: 'admin', nickname: '超级管理员', role: 'super_admin', status: 'active', mustChangePwd: false, lastLoginAt: '2024-09-28 09:15:30' },
  { id: 'admin2', username: 'operator', nickname: '运营小王', role: 'operator', status: 'active', mustChangePwd: false, lastLoginAt: '2024-09-27 18:20:10' },
  { id: 'admin3', username: 'service01', nickname: '客服小美', role: 'service', status: 'active', mustChangePwd: true, lastLoginAt: '2024-09-26 14:05:00' },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  operator: '运营',
  service: '客服',
};

// ===== 平台品牌色 =====
const PLATFORM_COLORS: Record<string, { bg: string; icon: string; text: string }> = {
  douyin: { bg: 'bg-black', icon: 'text-white', text: 'text-black' },
  xiaohongshu: { bg: 'bg-rose-500', icon: 'text-white', text: 'text-rose-600' },
  wechat: { bg: 'bg-green-500', icon: 'text-white', text: 'text-green-600' },
  bilibili: { bg: 'bg-sky-500', icon: 'text-white', text: 'text-sky-600' },
};

const statusDotClass = (status: PlatformStatus): string => {
  if (status === 'configured') return 'bg-emerald-500';
  if (status === 'error') return 'bg-red-500';
  return 'bg-slate-300';
};

const statusTextClass = (status: PlatformStatus): string => {
  if (status === 'configured') return 'text-emerald-600';
  if (status === 'error') return 'text-red-600';
  return 'text-slate-400';
};

const statusLabel = (status: PlatformStatus): string => {
  if (status === 'configured') return '已配置';
  if (status === 'error') return '连接失败';
  return '未配置';
};

const categoryBadgeClass = (category: string): string => {
  switch (category) {
    case '广告类': return 'bg-blue-100 text-blue-700';
    case '违规类': return 'bg-orange-100 text-orange-700';
    case '政治类': return 'bg-red-100 text-red-700';
    case '色情类': return 'bg-pink-100 text-pink-700';
    default: return 'bg-slate-100 text-slate-700';
  }
};

export default function SettingsPage() {
  // ===== 平台凭证状态 =====
  const [platforms, setPlatforms] = useState<PlatformCredential[]>(initialPlatforms);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ===== 功能开关状态 =====
  const [globalFeatures, setGlobalFeatures] = useState<GlobalFeature[]>(initialGlobalFeatures);
  const [platformSwitches, setPlatformSwitches] = useState<Record<string, { publish: boolean; message: boolean; comment: boolean }>>({
    douyin: { publish: true, message: true, comment: true },
    xiaohongshu: { publish: true, message: true, comment: true },
    wechat: { publish: false, message: false, comment: true },
    bilibili: { publish: true, message: true, comment: true },
  });

  // ===== 敏感词状态 =====
  const [sensitiveWords, setSensitiveWords] = useState<SensitiveWord[]>(generateSensitiveWords());
  const [swSearch, setSwSearch] = useState('');
  const [swCategory, setSwCategory] = useState<string>('all');
  const [swLevel, setSwLevel] = useState<string>('all');
  const [swDialogOpen, setSwDialogOpen] = useState(false);
  const [swEditItem, setSwEditItem] = useState<SensitiveWord | null>(null);
  const [swForm, setSwForm] = useState<Partial<SensitiveWord>>({ word: '', category: '广告类', level: 'warn', isEnabled: true });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importCategory, setImportCategory] = useState('广告类');
  const [importLevel, setImportLevel] = useState<'warn' | 'block'>('warn');

  // ===== 公告状态 =====
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [annSearch, setAnnSearch] = useState('');
  const [annCategory, setAnnCategory] = useState<string>('all');
  const [annStatus, setAnnStatus] = useState<string>('all');
  const [annDialogOpen, setAnnDialogOpen] = useState(false);
  const [annEditItem, setAnnEditItem] = useState<Announcement | null>(null);
  const [annForm, setAnnForm] = useState<Partial<Announcement>>({
    title: '', content: '', summary: '', category: 'system', isPublished: false, sortOrder: 0,
  });

  // ===== 基础配置状态 =====
  const [baseSettings, setBaseSettings] = useState({
    systemName: '矩阵管家 SaaS',
    logoUrl: '',
    icp: '京ICP备12345678号-1',
    contact: 'support@matrix.example.com',
    registerEnabled: true,
    registerCloseMsg: '系统内测中，暂不开放注册，请联系管理员获取邀请码',
    trialPlanId: 'trial',
    loginFailLock: 5,
    passwordMinLength: 8,
  });

  // ===== 管理员状态 =====
  const [admins, setAdmins] = useState<AdminUser[]>(initialAdmins);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '', nickname: '', role: 'operator', status: 'active' });

  // ===== 平台凭证方法 =====
  const toggleSecret = (id: string) => {
    setShowSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyCallback = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const testConnection = (platform: PlatformCredential) => {
    setPlatforms(platforms.map((p) => {
      if (p.id === platform.id) {
        return { ...p, status: 'configured' };
      }
      return p;
    }));
  };

  const savePlatform = (platform: PlatformCredential) => {
    setPlatforms(platforms.map((p) => p.id === platform.id ? { ...p, status: 'configured' } : p));
  };

  const toggleScope = (platformId: string, scope: string) => {
    setPlatforms(platforms.map((p) => {
      if (p.id !== platformId) return p;
      const has = p.scopes.includes(scope);
      return { ...p, scopes: has ? p.scopes.filter((s) => s !== scope) : [...p.scopes, scope] };
    }));
  };

  // ===== 功能开关方法 =====
  const toggleGlobalFeature = (key: string) => {
    setGlobalFeatures(globalFeatures.map((f) => f.key === key ? { ...f, enabled: !f.enabled } : f));
  };

  const togglePlatformSwitch = (platform: string, field: 'publish' | 'message' | 'comment') => {
    setPlatformSwitches((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: !prev[platform][field] },
    }));
  };

  // ===== 敏感词方法 =====
  const filteredSensitiveWords = sensitiveWords.filter((w) => {
    if (swSearch && !w.word.includes(swSearch)) return false;
    if (swCategory !== 'all' && w.category !== swCategory) return false;
    if (swLevel !== 'all' && w.level !== swLevel) return false;
    return true;
  });

  const handleAddSensitiveWord = () => {
    setSwEditItem(null);
    setSwForm({ word: '', category: '广告类', level: 'warn', isEnabled: true });
    setSwDialogOpen(true);
  };

  const handleEditSensitiveWord = (item: SensitiveWord) => {
    setSwEditItem(item);
    setSwForm(item);
    setSwDialogOpen(true);
  };

  const handleSaveSensitiveWord = () => {
    if (!swForm.word) return;
    if (swEditItem) {
      setSensitiveWords(sensitiveWords.map((w) => w.id === swEditItem.id ? { ...w, ...swForm } as SensitiveWord : w));
    } else {
      const newWord: SensitiveWord = {
        id: `sw${Date.now()}`,
        word: swForm.word || '',
        category: swForm.category || '广告类',
        level: (swForm.level as 'warn' | 'block') || 'warn',
        isEnabled: swForm.isEnabled ?? true,
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      setSensitiveWords([...sensitiveWords, newWord]);
    }
    setSwDialogOpen(false);
  };

  const handleDeleteSensitiveWord = (id: string) => {
    setSensitiveWords(sensitiveWords.filter((w) => w.id !== id));
  };

  const handleImportSensitiveWords = () => {
    const words = importText.split('\n').map((w) => w.trim()).filter((w) => w.length > 0);
    const newWords: SensitiveWord[] = words.map((word, i) => ({
      id: `sw${Date.now()}_${i}`,
      word,
      category: importCategory,
      level: importLevel,
      isEnabled: true,
      createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }));
    setSensitiveWords([...sensitiveWords, ...newWords]);
    setImportDialogOpen(false);
    setImportText('');
  };

  // ===== 公告方法 =====
  const filteredAnnouncements = announcements.filter((a) => {
    if (annSearch && !a.title.includes(annSearch)) return false;
    if (annCategory !== 'all' && a.category !== annCategory) return false;
    if (annStatus !== 'all') {
      if (annStatus === 'published' && !a.isPublished) return false;
      if (annStatus === 'draft' && a.isPublished) return false;
    }
    return true;
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAddAnnouncement = () => {
    setAnnEditItem(null);
    setAnnForm({ title: '', content: '', summary: '', category: 'system', isPublished: false, sortOrder: announcements.length + 1 });
    setAnnDialogOpen(true);
  };

  const handleEditAnnouncement = (item: Announcement) => {
    setAnnEditItem(item);
    setAnnForm(item);
    setAnnDialogOpen(true);
  };

  const handleSaveAnnouncement = () => {
    if (!annForm.title) return;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (annEditItem) {
      setAnnouncements(announcements.map((a) => a.id === annEditItem.id
        ? { ...a, ...annForm, updatedAt: now } as Announcement
        : a));
    } else {
      const newAnn: Announcement = {
        id: `a${Date.now()}`,
        title: annForm.title || '',
        content: annForm.content || '',
        summary: annForm.summary || '',
        category: (annForm.category as Announcement['category']) || 'system',
        isPublished: annForm.isPublished ?? false,
        sortOrder: Number(annForm.sortOrder) || 0,
        createdAt: now,
        updatedAt: now,
      };
      setAnnouncements([...announcements, newAnn]);
    }
    setAnnDialogOpen(false);
  };

  const handleDeleteAnnouncement = (id: string) => {
    setAnnouncements(announcements.filter((a) => a.id !== id));
  };

  const togglePublishAnnouncement = (id: string) => {
    setAnnouncements(announcements.map((a) => a.id === id ? { ...a, isPublished: !a.isPublished } : a));
  };

  // ===== 管理员方法 =====
  const handleAddAdmin = () => {
    setAdminForm({ username: '', password: '', nickname: '', role: 'operator', status: 'active' });
    setAdminDialogOpen(true);
  };

  const handleSaveAdmin = () => {
    if (!adminForm.username || !adminForm.password) return;
    const newAdmin: AdminUser = {
      id: `admin${Date.now()}`,
      username: adminForm.username,
      nickname: adminForm.nickname,
      role: adminForm.role,
      status: adminForm.status,
      mustChangePwd: true,
      lastLoginAt: undefined,
    };
    setAdmins([...admins, newAdmin]);
    setAdminDialogOpen(false);
  };

  const handleDeleteAdmin = (id: string) => {
    setAdmins(admins.filter((a) => a.id !== id));
  };

  const getAnnCategoryLabel = (cat: Announcement['category']): string => {
    const found = ANNOUNCEMENT_CATEGORIES.find((c) => c.value === cat);
    return found?.label || cat;
  };

  const getAnnCategoryBadge = (cat: Announcement['category']): string => {
    const found = ANNOUNCEMENT_CATEGORIES.find((c) => c.value === cat);
    return found?.color || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">系统配置</h1>
        <p className="text-sm text-slate-500 mt-1">管理平台凭证、功能开关、敏感词库、公告等系统设置</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="platform" className="w-full">
            <div className="flex border-b">
              <TabsList className="h-auto flex-col items-stretch bg-transparent p-0 w-48 border-r rounded-none">
                <TabsTrigger value="platform" className="justify-start px-4 py-3 data-[state=active]:bg-slate-50 data-[state=active]:shadow-none rounded-none border-l-2 border-l-transparent data-[state=active]:border-l-primary text-sm">
                  <Shield className="w-4 h-4 mr-2" />
                  平台凭证
                </TabsTrigger>
                <TabsTrigger value="features" className="justify-start px-4 py-3 data-[state=active]:bg-slate-50 data-[state=active]:shadow-none rounded-none border-l-2 border-l-transparent data-[state=active]:border-l-primary text-sm">
                  <Settings2 className="w-4 h-4 mr-2" />
                  功能开关
                </TabsTrigger>
                <TabsTrigger value="sensitive" className="justify-start px-4 py-3 data-[state=active]:bg-slate-50 data-[state=active]:shadow-none rounded-none border-l-2 border-l-transparent data-[state=active]:border-l-primary text-sm">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  敏感词库
                </TabsTrigger>
                <TabsTrigger value="announcements" className="justify-start px-4 py-3 data-[state=active]:bg-slate-50 data-[state=active]:shadow-none rounded-none border-l-2 border-l-transparent data-[state=active]:border-l-primary text-sm">
                  <Megaphone className="w-4 h-4 mr-2" />
                  公告管理
                </TabsTrigger>
                <TabsTrigger value="base" className="justify-start px-4 py-3 data-[state=active]:bg-slate-50 data-[state=active]:shadow-none rounded-none border-l-2 border-l-transparent data-[state=active]:border-l-primary text-sm">
                  <Settings2 className="w-4 h-4 mr-2" />
                  基础配置
                </TabsTrigger>
                <TabsTrigger value="admins" className="justify-start px-4 py-3 data-[state=active]:bg-slate-50 data-[state=active]:shadow-none rounded-none border-l-2 border-l-transparent data-[state=active]:border-l-primary text-sm">
                  <Users className="w-4 h-4 mr-2" />
                  管理员设置
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 p-6">
                {/* ===== Tab 1: 平台凭证 ===== */}
                <TabsContent value="platform" className="mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    {platforms.map((platform) => (
                      <Card key={platform.id} className="shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${PLATFORM_COLORS[platform.platform].bg}`}>
                                <span className={`text-sm font-bold ${PLATFORM_COLORS[platform.platform].icon}`}>
                                  {platform.platform === 'douyin' && '抖'}
                                  {platform.platform === 'xiaohongshu' && '红'}
                                  {platform.platform === 'wechat' && '视'}
                                  {platform.platform === 'bilibili' && 'B'}
                                </span>
                              </div>
                              <div>
                                <CardTitle className="text-base">{platform.name}</CardTitle>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`w-2 h-2 rounded-full ${statusDotClass(platform.status)}`} />
                                  <span className={`text-xs ${statusTextClass(platform.status)}`}>{statusLabel(platform.status)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {platform.note && (
                            <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                              {platform.note}
                            </div>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-slate-500">AppID</Label>
                            <Input
                              size={1}
                              value={platform.appId}
                              placeholder="请输入 AppID"
                              onChange={(e) => {
                                setPlatforms(platforms.map((p) => p.id === platform.id ? { ...p, appId: e.target.value } : p));
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-slate-500">AppSecret</Label>
                            <div className="relative">
                              <Input
                                type={showSecrets[platform.id] ? 'text' : 'password'}
                                value={platform.appSecret}
                                placeholder="请输入 AppSecret"
                                onChange={(e) => {
                                  setPlatforms(platforms.map((p) => p.id === platform.id ? { ...p, appSecret: e.target.value } : p));
                                }}
                                className="h-8 text-sm pr-9"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-400"
                                onClick={() => toggleSecret(platform.id)}
                              >
                                {showSecrets[platform.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-slate-500">回调地址</Label>
                            <div className="flex gap-1">
                              <Input value={platform.callbackUrl} readOnly className="h-8 text-xs font-mono" />
                              <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => copyCallback(platform.callbackUrl, platform.id)}>
                                {copiedId === platform.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-500">已申请 Scope</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {PLATFORM_SCOPES.map((scope) => (
                                <div key={scope} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`${platform.id}-${scope}`}
                                    checked={platform.scopes.includes(scope)}
                                    onCheckedChange={() => toggleScope(platform.id, scope)}
                                  />
                                  <label htmlFor={`${platform.id}-${scope}`} className="text-xs text-slate-600 cursor-pointer">
                                    {scope}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="flex-col gap-2 pt-0">
                          <div className="flex gap-2 w-full">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => savePlatform(platform)}>
                              <Save className="w-3.5 h-3.5 mr-1" />
                              保存
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => testConnection(platform)}>
                              <RefreshCw className="w-3.5 h-3.5 mr-1" />
                              测试连接
                            </Button>
                          </div>
                          <p className="text-xs text-slate-400 text-center w-full">
                            请确保回调地址已在平台开放平台后台配置
                          </p>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {/* ===== Tab 2: 功能开关 ===== */}
                <TabsContent value="features" className="mt-0">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" />
                        全局功能
                      </h3>
                      <Card className="shadow-sm">
                        <CardContent className="p-4 space-y-4">
                          {globalFeatures.map((feature) => (
                            <div key={feature.key} className="flex items-start justify-between gap-3 py-1">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-700">{feature.name}</span>
                                  {feature.warning && (
                                    <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50 text-[10px] h-4">
                                      <AlertTriangle className="w-3 h-3 mr-0.5" />
                                      风险
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">{feature.description}</p>
                              </div>
                              <Switch
                                checked={feature.enabled}
                                onCheckedChange={() => toggleGlobalFeature(feature.key)}
                              />
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" />
                        分平台开关
                      </h3>
                      <Accordion type="multiple" defaultValue={['douyin', 'xiaohongshu', 'wechat', 'bilibili']} className="space-y-2">
                        {[
                          { key: 'douyin', name: '抖音', color: 'bg-black text-white' },
                          { key: 'xiaohongshu', name: '小红书', color: 'bg-rose-500 text-white' },
                          { key: 'wechat', name: '微信视频号', color: 'bg-green-500 text-white' },
                          { key: 'bilibili', name: 'B站', color: 'bg-sky-500 text-white' },
                        ].map(({ key, name, color }) => (
                          <AccordionItem key={key} value={key} className="border rounded-lg px-3 shadow-sm">
                            <AccordionTrigger className="py-3 hover:no-underline">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${color}`}>
                                  {name.slice(0, 1)}
                                </div>
                                <span className="text-sm font-medium">{name}</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-3 space-y-3">
                              {[
                                { field: 'publish' as const, label: '内容发布', icon: <Send className="w-3.5 h-3.5" /> },
                                { field: 'message' as const, label: '私信', icon: <MessageSquare className="w-3.5 h-3.5" /> },
                                { field: 'comment' as const, label: '评论', icon: <BookOpen className="w-3.5 h-3.5" /> },
                              ].map(({ field, label, icon }) => (
                                <div key={field} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-500">{icon}</span>
                                    <span className="text-sm text-slate-600">{label}</span>
                                  </div>
                                  <Switch
                                    checked={platformSwitches[key]?.[field] ?? false}
                                    onCheckedChange={() => togglePlatformSwitch(key, field)}
                                  />
                                </div>
                              ))}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </div>
                  </div>

                  <div className="flex justify-end mt-6 pt-4 border-t">
                    <Button>
                      <Save className="w-4 h-4 mr-1" />
                      保存设置
                    </Button>
                  </div>
                </TabsContent>

                {/* ===== Tab 3: 敏感词库 ===== */}
                <TabsContent value="sensitive" className="mt-0">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="搜索敏感词"
                          value={swSearch}
                          onChange={(e) => setSwSearch(e.target.value)}
                          className="w-48 pl-9 h-9"
                        />
                      </div>
                      <Select value={swCategory} onValueChange={setSwCategory}>
                        <SelectTrigger className="w-32 h-9">
                          <SelectValue placeholder="分类" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部分类</SelectItem>
                          {SENSITIVE_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={swLevel} onValueChange={setSwLevel}>
                        <SelectTrigger className="w-28 h-9">
                          <SelectValue placeholder="级别" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部级别</SelectItem>
                          <SelectItem value="warn">预警</SelectItem>
                          <SelectItem value="block">拦截</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">
                        <Download className="w-3.5 h-3.5 mr-1" />
                        导出
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                        <Upload className="w-3.5 h-3.5 mr-1" />
                        批量导入
                      </Button>
                      <Button size="sm" onClick={handleAddSensitiveWord}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        新增敏感词
                      </Button>
                    </div>
                  </div>

                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>词语</TableHead>
                            <TableHead>分类</TableHead>
                            <TableHead>级别</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSensitiveWords.map((word) => (
                            <TableRow key={word.id}>
                              <TableCell className="font-medium text-slate-700">{word.word}</TableCell>
                              <TableCell>
                                <Badge className={categoryBadgeClass(word.category)}>{word.category}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={word.level === 'block' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                                  {word.level === 'block' ? '拦截' : '预警'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={word.isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                                  {word.isEnabled ? '启用' : '停用'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-slate-500">{word.createdAt}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditSensitiveWord(word)}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteSensitiveWord(word.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                    <div className="px-4 py-3 border-t text-xs text-slate-500">
                      共 {filteredSensitiveWords.length} 条敏感词
                    </div>
                  </Card>
                </TabsContent>

                {/* ===== Tab 4: 公告管理 ===== */}
                <TabsContent value="announcements" className="mt-0">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="搜索公告"
                          value={annSearch}
                          onChange={(e) => setAnnSearch(e.target.value)}
                          className="w-48 pl-9 h-9"
                        />
                      </div>
                      <Select value={annCategory} onValueChange={setAnnCategory}>
                        <SelectTrigger className="w-32 h-9">
                          <SelectValue placeholder="分类" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部分类</SelectItem>
                          {ANNOUNCEMENT_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={annStatus} onValueChange={setAnnStatus}>
                        <SelectTrigger className="w-28 h-9">
                          <SelectValue placeholder="状态" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部状态</SelectItem>
                          <SelectItem value="published">已发布</SelectItem>
                          <SelectItem value="draft">草稿</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={handleAddAnnouncement}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      新建公告
                    </Button>
                  </div>

                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>标题</TableHead>
                            <TableHead>分类</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead className="text-center">排序</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAnnouncements.map((ann) => (
                            <TableRow key={ann.id}>
                              <TableCell className="font-medium text-slate-700 max-w-[280px] truncate">{ann.title}</TableCell>
                              <TableCell>
                                <Badge className={getAnnCategoryBadge(ann.category)}>{getAnnCategoryLabel(ann.category)}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={ann.isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                                  {ann.isPublished ? '已发布' : '草稿'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center text-slate-600">{ann.sortOrder}</TableCell>
                              <TableCell className="text-sm text-slate-500">{ann.createdAt}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditAnnouncement(ann)}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title={ann.isPublished ? '下线' : '发布'}
                                    onClick={() => togglePublishAnnouncement(ann.id)}
                                  >
                                    {ann.isPublished ? <BellRing className="w-3.5 h-3.5 text-orange-500" /> : <BellRing className="w-3.5 h-3.5 text-slate-400" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteAnnouncement(ann.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                    <div className="px-4 py-3 border-t text-xs text-slate-500">
                      共 {filteredAnnouncements.length} 条公告
                    </div>
                  </Card>
                </TabsContent>

                {/* ===== Tab 5: 基础配置 ===== */}
                <TabsContent value="base" className="mt-0">
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">基础配置</CardTitle>
                      <CardDescription>配置系统基础信息与注册设置</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>系统名称</Label>
                          <Input
                            value={baseSettings.systemName}
                            onChange={(e) => setBaseSettings({ ...baseSettings, systemName: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>系统 Logo URL</Label>
                          <Input
                            value={baseSettings.logoUrl}
                            onChange={(e) => setBaseSettings({ ...baseSettings, logoUrl: e.target.value })}
                            placeholder="https://..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>备案号</Label>
                          <Input
                            value={baseSettings.icp}
                            onChange={(e) => setBaseSettings({ ...baseSettings, icp: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>客服联系方式</Label>
                          <Input
                            value={baseSettings.contact}
                            onChange={(e) => setBaseSettings({ ...baseSettings, contact: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <div className="text-sm font-medium text-slate-700">注册开关</div>
                            <p className="text-xs text-slate-500 mt-0.5">关闭后新用户将无法注册账号</p>
                          </div>
                          <Switch
                            checked={baseSettings.registerEnabled}
                            onCheckedChange={(checked) => setBaseSettings({ ...baseSettings, registerEnabled: checked })}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>关闭注册说明</Label>
                        <Textarea
                          value={baseSettings.registerCloseMsg}
                          onChange={(e) => setBaseSettings({ ...baseSettings, registerCloseMsg: e.target.value })}
                          rows={3}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <Label>默认体验套餐</Label>
                          <Select value={baseSettings.trialPlanId} onValueChange={(v) => setBaseSettings({ ...baseSettings, trialPlanId: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder="选择套餐" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="trial">体验版</SelectItem>
                              <SelectItem value="monthly">月度会员</SelectItem>
                              <SelectItem value="quarterly">季度会员</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>登录失败锁定次数</Label>
                          <Input
                            type="number"
                            value={baseSettings.loginFailLock}
                            onChange={(e) => setBaseSettings({ ...baseSettings, loginFailLock: Number(e.target.value) })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>密码最小长度</Label>
                          <Input
                            type="number"
                            value={baseSettings.passwordMinLength}
                            onChange={(e) => setBaseSettings({ ...baseSettings, passwordMinLength: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end border-t pt-4">
                      <Button>
                        <Save className="w-4 h-4 mr-1" />
                        保存配置
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>

                {/* ===== Tab 6: 管理员设置 ===== */}
                <TabsContent value="admins" className="mt-0 space-y-6">
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-primary" />
                        修改密码
                      </CardTitle>
                      <CardDescription>定期修改密码以保障账号安全</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>原密码</Label>
                        <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>新密码</Label>
                          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>确认新密码</Label>
                          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end border-t pt-4">
                      <Button>
                        <Save className="w-4 h-4 mr-1" />
                        保存密码
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            管理员列表
                          </CardTitle>
                          <CardDescription>管理后台系统管理员账号</CardDescription>
                        </div>
                        <Button size="sm" onClick={handleAddAdmin}>
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          新增管理员
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>用户名</TableHead>
                            <TableHead>昵称</TableHead>
                            <TableHead>角色</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>最后登录时间</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {admins.map((admin) => (
                            <TableRow key={admin.id}>
                              <TableCell className="font-medium text-slate-700">{admin.username}</TableCell>
                              <TableCell>{admin.nickname}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                                  {ROLE_LABELS[admin.role] || admin.role}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={admin.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                                  {admin.status === 'active' ? '正常' : '禁用'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-slate-500">{admin.lastLoginAt || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleDeleteAdmin(admin.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                    <div className="px-4 py-3 border-t text-xs text-slate-500">
                      共 {admins.length} 位管理员
                    </div>
                  </Card>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* ===== 敏感词新增/编辑弹窗 ===== */}
      <Dialog open={swDialogOpen} onOpenChange={setSwDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{swEditItem ? '编辑敏感词' : '新增敏感词'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>词语 *</Label>
              <Input
                value={swForm.word || ''}
                onChange={(e) => setSwForm({ ...swForm, word: e.target.value })}
                placeholder="请输入敏感词"
              />
            </div>
            <div className="space-y-1.5">
              <Label>分类</Label>
              <Select
                value={swForm.category || '广告类'}
                onValueChange={(v) => setSwForm({ ...swForm, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENSITIVE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>级别</Label>
              <RadioGroup
                value={swForm.level || 'warn'}
                onValueChange={(v) => setSwForm({ ...swForm, level: v as 'warn' | 'block' })}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="warn" id="sw-warn" />
                  <Label htmlFor="sw-warn" className="text-sm cursor-pointer">预警</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="block" id="sw-block" />
                  <Label htmlFor="sw-block" className="text-sm cursor-pointer">拦截</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex items-center justify-between py-2">
              <Label className="cursor-pointer">启用状态</Label>
              <Switch
                checked={swForm.isEnabled ?? true}
                onCheckedChange={(checked) => setSwForm({ ...swForm, isEnabled: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveSensitiveWord}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 敏感词批量导入弹窗 ===== */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量导入敏感词</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>敏感词列表</Label>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="每行一个敏感词，例如：&#10;加微信&#10;扫码领&#10;点击链接"
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-400">每行一个词语，最多支持 100 条</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>分类</Label>
                <Select value={importCategory} onValueChange={setImportCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENSITIVE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>级别</Label>
                <Select value={importLevel} onValueChange={(v) => setImportLevel(v as 'warn' | 'block')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">预警</SelectItem>
                    <SelectItem value="block">拦截</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button onClick={handleImportSensitiveWords}>导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 公告新增/编辑弹窗 ===== */}
      <Dialog open={annDialogOpen} onOpenChange={setAnnDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{annEditItem ? '编辑公告' : '新建公告'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label>标题 *</Label>
              <Input
                value={annForm.title || ''}
                onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                placeholder="请输入公告标题"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>分类</Label>
                <Select
                  value={annForm.category || 'system'}
                  onValueChange={(v) => setAnnForm({ ...annForm, category: v as Announcement['category'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={annForm.sortOrder || 0}
                  onChange={(e) => setAnnForm({ ...annForm, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>摘要</Label>
              <Input
                value={annForm.summary || ''}
                onChange={(e) => setAnnForm({ ...annForm, summary: e.target.value })}
                placeholder="简短描述公告内容"
              />
            </div>
            <div className="space-y-1.5">
              <Label>内容</Label>
              <Textarea
                value={annForm.content || ''}
                onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
                rows={6}
                placeholder="请输入公告详细内容"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-t pt-3">
              <div>
                <div className="text-sm font-medium">发布状态</div>
                <p className="text-xs text-slate-500">开启后立即对所有用户可见</p>
              </div>
              <Switch
                checked={annForm.isPublished ?? false}
                onCheckedChange={(checked) => setAnnForm({ ...annForm, isPublished: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveAnnouncement}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 新增管理员弹窗 ===== */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增管理员</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>用户名 *</Label>
                <Input
                  value={adminForm.username}
                  onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                  placeholder="登录用户名"
                />
              </div>
              <div className="space-y-1.5">
                <Label>密码 *</Label>
                <Input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  placeholder="初始密码"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>昵称</Label>
              <Input
                value={adminForm.nickname}
                onChange={(e) => setAdminForm({ ...adminForm, nickname: e.target.value })}
                placeholder="显示名称"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>角色</Label>
                <Select value={adminForm.role} onValueChange={(v) => setAdminForm({ ...adminForm, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">超级管理员</SelectItem>
                    <SelectItem value="operator">运营</SelectItem>
                    <SelectItem value="service">客服</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex items-center justify-between py-2 px-3 border rounded-md">
                <Label className="cursor-pointer">启用状态</Label>
                <Switch
                  checked={adminForm.status === 'active'}
                  onCheckedChange={(checked) => setAdminForm({ ...adminForm, status: checked ? 'active' : 'disabled' })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveAdmin}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
