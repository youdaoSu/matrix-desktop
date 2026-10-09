import { useState, useRef, useMemo } from 'react';
import {
  Send,
  Upload,
  Check,
  Image,
  Video,
  Music,
  BookOpen,
  Tv,
  Info,
  Calendar,
  X,
  Plus,
  Search,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  MapPin,
  FolderPlus,
  Hash,
  Eye,
  Clock,
  FileText,
} from 'lucide-react';
import type { PlatformType } from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Checkbox } from '@client/src/components/ui/checkbox';
import { Switch } from '@client/src/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Label } from '@client/src/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import {
  RadioGroup,
  RadioGroupItem,
} from '@client/src/components/ui/radio-group';
import { Progress } from '@client/src/components/ui/progress';
import { Image as UIImage } from '@client/src/components/ui/image';
import { toast } from 'sonner';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

interface MockAccount {
  id: string;
  platform: PlatformType;
  nickname: string;
  avatar: string;
  authStatus: 'authorized' | 'expired' | 'pending';
  followers: string;
}

const mockAccounts: MockAccount[] = [
  { id: '1', platform: 'douyin', nickname: '美食探店小队', avatar: '', authStatus: 'authorized', followers: '12.5w' },
  { id: '2', platform: 'douyin', nickname: '旅行日记Vlog', avatar: '', authStatus: 'authorized', followers: '8.3w' },
  { id: '3', platform: 'xiaohongshu', nickname: '生活种草日记', avatar: '', authStatus: 'authorized', followers: '5.6w' },
  { id: '4', platform: 'xiaohongshu', nickname: '时尚穿搭指南', avatar: '', authStatus: 'authorized', followers: '12.1w' },
  { id: '5', platform: 'wechat', nickname: '职场成长笔记', avatar: '', authStatus: 'authorized', followers: '3.2w' },
  { id: '6', platform: 'bilibili', nickname: '科技宅频道', avatar: '', authStatus: 'authorized', followers: '20.8w' },
  { id: '7', platform: 'douyin', nickname: '健身打卡日记', avatar: '', authStatus: 'expired', followers: '2.1w' },
  { id: '8', platform: 'bilibili', nickname: '数码开箱测评', avatar: '', authStatus: 'pending', followers: '6.7w' },
];

const recommendTags: Record<PlatformType, string[]> = {
  douyin: ['秋日穿搭', 'ootd', '时尚穿搭', '通勤穿搭', '显瘦穿搭'],
  xiaohongshu: ['秋冬穿搭', '氛围感穿搭', '温柔系', '显白穿搭', '小个子穿搭'],
  wechat: ['穿搭分享', '每日穿搭', '秋日穿搭灵感', '通勤风'],
  bilibili: ['穿搭教程', '秋季穿搭', '平价穿搭', '学生党穿搭'],
};

const steps = [
  { id: 1, label: '选择账号' },
  { id: 2, label: '编辑内容' },
  { id: 3, label: '发布设置' },
];

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: 'image' | 'video';
  previewUrl: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
}

const PublishCreatePage = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlatformTab, setSelectedPlatformTab] = useState<PlatformType>('douyin');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['1', '3']);
  const [accountSearch, setAccountSearch] = useState('');
  const [contentType, setContentType] = useState<'image' | 'video'>('video');
  const [activePlatformTab, setActivePlatformTab] = useState<string>('douyin');
  const [title, setTitle] = useState('秋日穿搭灵感分享');
  const [content, setContent] = useState('秋天来了，分享几套温柔又显瘦的秋日穿搭，通勤约会都合适～');
  const [tags, setTags] = useState<string[]>(['秋日穿搭', 'ootd']);
  const [tagInput, setTagInput] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [publishMode, setPublishMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [autoFollowUp, setAutoFollowUp] = useState(true);
  const [followUpContent, setFollowUpContent] = useState('喜欢的话记得点赞收藏哦～更多穿搭看主页');
  const [followUpDelay, setFollowUpDelay] = useState('30');
  const [sensitiveCheckOpen, setSensitiveCheckOpen] = useState(false);
  const [sensitiveChecking, setSensitiveChecking] = useState(false);
  const [sensitiveResult, setSensitiveResult] = useState<{ level: 'pass' | 'warn' | 'block'; words: string[] } | null>(null);
  const [complianceChecked, setComplianceChecked] = useState(false);
  const [publishResult, setPublishResult] = useState<'success' | 'failed' | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const selectedAccountObjects = mockAccounts.filter((a) => selectedAccounts.includes(a.id));

  const filteredAccounts = useMemo(() => {
    return mockAccounts.filter((a) => {
      if (selectedPlatformTab !== 'all' as any && a.platform !== selectedPlatformTab) return false;
      if (accountSearch && !a.nickname.toLowerCase().includes(accountSearch.toLowerCase())) return false;
      return true;
    });
  }, [selectedPlatformTab, accountSearch]);

  const toggleAccount = (id: string) => {
    const acc = mockAccounts.find((a) => a.id === id);
    if (!acc || acc.authStatus !== 'authorized') return;
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const removeAccount = (id: string) => {
    setSelectedAccounts((prev) => prev.filter((a) => a !== id));
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const addRecommendTag = (tag: string) => {
    if (!tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCoverImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const id = Math.random().toString(36).slice(2);
      const isVideo = file.type.startsWith('video/');
      const newFile: UploadedFile = {
        id,
        name: file.name,
        size: file.size,
        type: isVideo ? 'video' : 'image',
        previewUrl: isVideo ? '' : URL.createObjectURL(file),
        progress: 0,
        status: 'uploading',
      };
      setUploadedFiles((prev) => [...prev, newFile]);
      // simulate upload
      const timer = setInterval(() => {
        setUploadedFiles((prev) =>
          prev.map((f) => {
            if (f.id !== id) return f;
            if (f.progress >= 100) {
              clearInterval(timer);
              return { ...f, status: 'done' };
            }
            return { ...f, progress: f.progress + 10 };
          })
        );
      }, 150);
    });
  };

  const removeUploadedFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const runSensitiveCheck = () => {
    setSensitiveChecking(true);
    setSensitiveResult(null);
    setSensitiveCheckOpen(true);
    setTimeout(() => {
      setSensitiveChecking(false);
      setSensitiveResult({
        level: 'warn',
        words: ['超强', '第一', '最好'],
      });
    }, 1500);
  };

  const canNext = () => {
    if (currentStep === 1) return selectedAccounts.length > 0;
    if (currentStep === 2) return title.trim().length > 0;
    if (currentStep === 3) return complianceChecked;
    return true;
  };

  const handlePublish = () => {
    setIsPublishing(true);
    setTimeout(() => {
      setIsPublishing(false);
      setPublishResult('success');
    }, 2000);
  };

  const handleSaveDraft = () => {
    // simulate save
    toast('草稿已保存到本地草稿箱');
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setPublishResult(null);
    setTitle('');
    setContent('');
    setTags([]);
    setCoverImage(null);
    setUploadedFiles([]);
    setComplianceChecked(false);
  };

  if (publishResult) {
    return (
      <div className="space-y-4 p-4">
        <Alert>
          <Info className="w-4 h-4" />
          <AlertDescription>
            <span className="text-[hsl(26_90%_49%)] font-medium">示例数据 / 演示流程</span>
            ，发布操作为前端模拟，不会真实发布到平台
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="py-16 text-center">
            {publishResult === 'success' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-[hsl(130_54%_42%)]/10 mx-auto flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-10 h-10 text-[hsl(130_54%_42%)]" />
                </div>
                <h2 className="text-xl font-semibold mb-2">发布任务已提交</h2>
                <p className="text-sm text-muted-foreground mb-1">
                  已向 <span className="text-foreground font-medium">{selectedAccounts.length}</span> 个账号分发发布任务
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  发布进度和结果可在「任务记录」中查看
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={resetWizard}>
                    继续发布
                  </Button>
                  <Button>
                    查看任务记录
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-[hsl(2_84%_62%)]/10 mx-auto flex items-center justify-center mb-4">
                  <XCircle className="w-10 h-10 text-[hsl(2_84%_62%)]" />
                </div>
                <h2 className="text-xl font-semibold mb-2">发布失败</h2>
                <p className="text-sm text-muted-foreground mb-6">部分账号发布失败，请检查后重试</p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={() => setPublishResult(null)}>
                    返回修改
                  </Button>
                  <Button onClick={handlePublish}>重新发布</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Alert>
        <Info className="w-4 h-4" />
        <AlertDescription>
          <span className="text-[hsl(26_90%_49%)] font-medium">示例数据 / 演示流程</span>
          ，发布操作为前端模拟，不会真实发布到平台。视频号需手动跳转助手发布。
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">发条单视频</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSaveDraft}>存为草稿</Button>
          <Button size="sm" disabled={!complianceChecked || isPublishing} onClick={handlePublish}>
            <Send className="w-4 h-4 mr-1" />
            {isPublishing ? '发布中...' : '一键发布'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Stepper */}
          <div className="flex items-center justify-between mb-6 max-w-xl mx-auto">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
                      currentStep > step.id
                        ? 'bg-[hsl(130_54%_42%)] text-white'
                        : currentStep === step.id
                        ? 'bg-primary text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-3 ${
                      currentStep > step.id ? 'bg-[hsl(130_54%_42%)]' : 'bg-border'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Select accounts */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Selected accounts bar */}
              {selectedAccounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <span className="text-xs text-muted-foreground shrink-0">已选账号：</span>
                  {selectedAccountObjects.map((acc) => {
                    const meta = platformMeta[acc.platform];
                    return (
                      <div
                        key={acc.id}
                        className="flex items-center gap-1.5 bg-white rounded-full pl-1 pr-2 py-0.5 border border-border shadow-sm"
                      >
                        <div
                          className="w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center"
                          style={{ backgroundColor: meta.color }}
                        >
                          {acc.nickname.charAt(0)}
                        </div>
                        <span className="text-xs">{acc.nickname}</span>
                        <button
                          onClick={() => removeAccount(acc.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setSelectedAccounts([])}
                    className="text-xs text-primary hover:underline ml-auto"
                  >
                    清空
                  </button>
                </div>
              )}

              {/* Platform tabs */}
              <Tabs value={selectedPlatformTab} onValueChange={(v) => setSelectedPlatformTab(v as PlatformType)}>
                <TabsList className="grid w-full grid-cols-4 max-w-md">
                  {(Object.keys(platformMeta) as PlatformType[]).map((p) => {
                    const meta = platformMeta[p];
                    const Icon = meta.icon;
                    return (
                      <TabsTrigger key={p} value={p} className="gap-1.5 text-xs">
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              {/* Search */}
              <div className="relative max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索账号昵称..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Account list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredAccounts.map((acc) => {
                  const checked = selectedAccounts.includes(acc.id);
                  const meta = platformMeta[acc.platform];
                  const disabled = acc.authStatus !== 'authorized';
                  return (
                    <div
                      key={acc.id}
                      onClick={() => !disabled && toggleAccount(acc.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                        checked
                          ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20'
                          : disabled
                          ? 'opacity-60 cursor-not-allowed bg-muted/30 border-border'
                          : 'hover:bg-muted border-border'
                      }`}
                    >
                      <Checkbox checked={checked} disabled={disabled} className="mt-0.5" />
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium shrink-0" style={{ backgroundColor: meta.color }}>
                        {acc.nickname.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{acc.nickname}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          粉丝 {acc.followers}
                        </div>
                        <div className="text-xs mt-0.5">
                          {acc.authStatus === 'authorized' && (
                            <span className="text-[hsl(130_54%_42%)]">✓ 已授权</span>
                          )}
                          {acc.authStatus === 'expired' && (
                            <span className="text-[hsl(2_84%_62%)]">授权已过期</span>
                          )}
                          {acc.authStatus === 'pending' && (
                            <span className="text-[hsl(26_90%_49%)]">授权中</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredAccounts.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  没有找到匹配的账号
                </div>
              )}
            </div>
          )}

          {/* Step 2: Edit content */}
          {currentStep === 2 && (
            <div className="space-y-5 max-w-4xl mx-auto">
              {/* Content type */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">内容类型：</span>
                <div className="flex gap-2">
                  <Button
                    variant={contentType === 'image' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setContentType('image')}
                  >
                    <Image className="w-4 h-4 mr-1" />
                    图文
                  </Button>
                  <Button
                    variant={contentType === 'video' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setContentType('video')}
                  >
                    <Video className="w-4 h-4 mr-1" />
                    视频
                  </Button>
                </div>
              </div>

              {/* Media upload */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  {contentType === 'video' ? '视频素材' : '图片素材'}
                  <span className="text-muted-foreground font-normal ml-2 text-xs">
                    （本地文件预览，演示用）
                  </span>
                </Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                  onClick={() => (contentType === 'video' ? videoInputRef : fileInputRef).current?.click()}
                >
                  <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">点击或拖拽上传{contentType === 'video' ? '视频' : '图片'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    支持 {contentType === 'video' ? 'MP4 / MOV 格式，最大 500MB' : 'JPG / PNG 格式，最多 9 张'}
                  </p>
                  <input
                    ref={contentType === 'video' ? videoInputRef : fileInputRef}
                    type="file"
                    accept={contentType === 'video' ? 'video/*' : 'image/*'}
                    multiple={contentType === 'image'}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {uploadedFiles.map((f) => (
                      <div key={f.id} className="relative rounded-md overflow-hidden border border-border bg-muted aspect-video">
                        {f.type === 'image' && f.previewUrl ? (
                          <UIImage src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        {f.status === 'uploading' && (
                          <div className="absolute bottom-0 left-0 right-0">
                            <Progress value={f.progress} className="h-1 rounded-none" />
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeUploadedFile(f.id); }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="absolute bottom-1 left-1 right-1">
                          <div className="text-[10px] text-white truncate bg-black/50 px-1 rounded">
                            {f.name}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cover */}
              <div>
                <Label className="text-sm font-medium mb-2 block">封面图</Label>
                <div className="flex items-start gap-3">
                  <div
                    className="w-32 h-20 rounded-md border border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors bg-muted overflow-hidden"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {coverImage ? (
                      <UIImage src={coverImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <FolderPlus className="w-5 h-5 text-muted-foreground mb-0.5" />
                        <span className="text-[10px] text-muted-foreground">上传封面</span>
                      </>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCoverUpload}
                  />
                  <p className="text-xs text-muted-foreground pt-1">
                    建议尺寸 1080×1920，支持 JPG/PNG
                    <br />
                    不上传则默认使用视频首帧
                  </p>
                </div>
              </div>

              {/* Platform-differentiated content tabs */}
              <div>
                <Label className="text-sm font-medium mb-2 block">各平台内容（可单独编辑）</Label>
                <Tabs value={activePlatformTab} onValueChange={setActivePlatformTab}>
                  <TabsList className="mb-3">
                    {selectedAccountObjects
                      .filter((a, i, arr) => arr.findIndex((x) => x.platform === a.platform) === i)
                      .map((acc) => {
                        const meta = platformMeta[acc.platform];
                        const Icon = meta.icon;
                        return (
                          <TabsTrigger key={acc.platform} value={acc.platform} className="gap-1.5">
                            <Icon className="w-3.5 h-3.5" />
                            {meta.label}
                          </TabsTrigger>
                        );
                      })}
                  </TabsList>

                  {(Object.keys(platformMeta) as PlatformType[]).map((platform) => {
                    const meta = platformMeta[platform];
                    const Icon = meta.icon;
                    const hasAccount = selectedAccounts.some(
                      (id) => mockAccounts.find((a) => a.id === id)?.platform === platform
                    );
                    if (!hasAccount) return null;

                    return (
                      <TabsContent key={platform} value={platform} className="space-y-4 mt-0">
                        <Alert className="py-2">
                          <Info className="w-4 h-4 shrink-0" />
                          <AlertDescription className="text-xs">
                            {platform === 'wechat' ? (
                              <>
                                <span className="text-[hsl(26_90%_49%)] font-medium">视频号手动发布提示：</span>
                                由于视频号开放平台限制，内容编辑完成后需跳转「视频号助手」手动发布。
                              </>
                            ) : (
                              <>
                                <span className="font-medium">{meta.label} 差异化字段：</span>
                                可针对{meta.label}单独设置标题、话题等，默认同步通用内容。
                              </>
                            )}
                          </AlertDescription>
                        </Alert>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs text-muted-foreground">标题</Label>
                            <span className="text-[10px] text-muted-foreground">
                              {title.length}/{platform === 'douyin' ? 55 : platform === 'xiaohongshu' ? 20 : platform === 'wechat' ? 64 : 80}
                            </span>
                          </div>
                          <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-9"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs text-muted-foreground">
                              {platform === 'bilibili' ? '简介' : platform === 'wechat' ? '视频描述' : '正文描述'}
                            </Label>
                            <span className="text-[10px] text-muted-foreground">{content.length} 字</span>
                          </div>
                          <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="min-h-[100px] resize-none text-sm"
                          />
                        </div>

                        {/* Platform-specific fields */}
                        {platform === 'douyin' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">位置</Label>
                              <div className="flex items-center gap-1.5 mt-1">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                                <Input placeholder="添加位置" className="h-8 text-xs" />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">谁可以看</Label>
                              <Select defaultValue="public">
                                <SelectTrigger className="h-8 mt-1 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="public">公开</SelectItem>
                                  <SelectItem value="friends">互关可见</SelectItem>
                                  <SelectItem value="private">仅自己可见</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        {platform === 'xiaohongshu' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">地点</Label>
                              <div className="flex items-center gap-1.5 mt-1">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                                <Input placeholder="添加地点" className="h-8 text-xs" />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">笔记分类</Label>
                              <Select defaultValue="fashion">
                                <SelectTrigger className="h-8 mt-1 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fashion">穿搭</SelectItem>
                                  <SelectItem value="beauty">美妆</SelectItem>
                                  <SelectItem value="food">美食</SelectItem>
                                  <SelectItem value="travel">旅行</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        {platform === 'bilibili' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">投稿分区</Label>
                              <Select defaultValue="tech">
                                <SelectTrigger className="h-8 mt-1 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="tech">科技数码</SelectItem>
                                  <SelectItem value="life">生活日常</SelectItem>
                                  <SelectItem value="fashion">服饰时尚</SelectItem>
                                  <SelectItem value="food">美食制作</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">投稿类型</Label>
                              <Select defaultValue="original">
                                <SelectTrigger className="h-8 mt-1 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="original">原创</SelectItem>
                                  <SelectItem value="reprint">转载</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        {platform === 'wechat' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs text-muted-foreground">位置</Label>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                                  <Input placeholder="添加位置" className="h-8 text-xs" />
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">可见范围</Label>
                                <Select defaultValue="public">
                                  <SelectTrigger className="h-8 mt-1 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="public">公开</SelectItem>
                                    <SelectItem value="partially">部分可见</SelectItem>
                                    <SelectItem value="private">不给谁看</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 bg-[hsl(142_45%_45%)]/5 rounded-lg border border-[hsl(142_45%_45%)]/20">
                              <Info className="w-4 h-4 text-[hsl(142_45%_45%)] shrink-0" />
                              <span className="text-xs text-muted-foreground">
                                <span className="text-[hsl(142_45%_45%)] font-medium">视频号手动发布引导：</span>
                                点击发布后将跳转视频号助手，由你手动确认发布。系统不会自动操作视频号账号。
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Tags */}
                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" />
                            话题标签
                          </Label>
                          <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                            {tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="gap-1 h-6">
                                #{tag}
                                <button onClick={() => removeTag(tag)} className="hover:text-foreground">
                                  <X className="w-3 h-3" />
                                </button>
                              </Badge>
                            ))}
                            <div className="flex items-center gap-1 border border-border rounded-full px-2 py-0.5 h-6">
                              <span className="text-muted-foreground">#</span>
                              <input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                                placeholder={tags.length >= 10 ? '最多10个' : '输入话题回车添加'}
                                className="bg-transparent text-xs outline-none w-28"
                                disabled={tags.length >= 10}
                              />
                              {tagInput && (
                                <button onClick={addTag}>
                                  <Plus className="w-3 h-3 text-muted-foreground" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] text-muted-foreground pt-1">推荐：</span>
                            {recommendTags[platform].map((tag) => (
                              <button
                                key={tag}
                                onClick={() => addRecommendTag(tag)}
                                disabled={tags.includes(tag)}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                  tags.includes(tag)
                                    ? 'bg-primary/10 border-primary/30 text-primary opacity-60 cursor-default'
                                    : 'border-border hover:border-primary/50 hover:text-primary'
                                }`}
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </div>

              {/* Preview */}
              <div>
                <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  内容预览
                </Label>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex gap-1">
                    {selectedAccountObjects
                      .filter((a, i, arr) => arr.findIndex((x) => x.platform === a.platform) === i)
                      .map((acc) => {
                        const meta = platformMeta[acc.platform];
                        return (
                          <Badge key={acc.platform} variant="outline" className="gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                            {meta.label}
                          </Badge>
                        );
                      })}
                  </div>
                </div>
                <div className="max-w-[280px] border border-border rounded-xl overflow-hidden shadow-sm">
                  <div className="aspect-[9/16] bg-muted flex items-center justify-center relative">
                    {coverImage ? (
                      <UIImage src={coverImage} alt="" className="w-full h-full object-cover" />
                    ) : uploadedFiles[0]?.previewUrl ? (
                      <UIImage src={uploadedFiles[0].previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-muted-foreground text-xs">预览占位</span>
                    )}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-white/80 text-[10px] flex items-center justify-center font-medium">
                        {selectedAccountObjects[0]?.nickname.charAt(0) || '?'}
                      </div>
                      <span className="text-white text-xs font-medium drop-shadow">
                        {selectedAccountObjects[0]?.nickname || '账号'}
                      </span>
                    </div>
                  </div>
                  <div className="p-2 bg-white">
                    <p className="text-xs line-clamp-2">{title}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] text-primary">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Publish settings */}
          {currentStep === 3 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              {/* Publish mode */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  发布方式
                </h3>
                <RadioGroup value={publishMode} onValueChange={(v) => setPublishMode(v as 'now' | 'scheduled')}>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="now" id="now" />
                      <Label htmlFor="now" className="text-sm cursor-pointer">立即发布</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="scheduled" id="scheduled" />
                      <Label htmlFor="scheduled" className="text-sm cursor-pointer">定时发布</Label>
                    </div>
                  </div>
                </RadioGroup>
                {publishMode === 'scheduled' && (
                  <div className="flex items-center gap-2 pt-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <Input
                      type="datetime-local"
                      className="max-w-[240px] h-9"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Auto follow-up */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    自动追评
                  </h3>
                  <Switch checked={autoFollowUp} onCheckedChange={setAutoFollowUp} />
                </div>
                {autoFollowUp && (
                  <>
                    <Textarea
                      value={followUpContent}
                      onChange={(e) => setFollowUpContent(e.target.value)}
                      className="min-h-[80px] resize-none text-sm"
                      placeholder="输入追评内容..."
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">发布后延迟</span>
                      <Select value={followUpDelay} onValueChange={setFollowUpDelay}>
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 分钟</SelectItem>
                          <SelectItem value="10">10 分钟</SelectItem>
                          <SelectItem value="30">30 分钟</SelectItem>
                          <SelectItem value="60">1 小时</SelectItem>
                          <SelectItem value="360">6 小时</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">自动发送追评</span>
                    </div>
                  </>
                )}
              </div>

              {/* Sensitive check */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    敏感词检测
                  </h3>
                  <Button variant="outline" size="sm" onClick={runSensitiveCheck} disabled={sensitiveChecking}>
                    {sensitiveChecking ? '检测中...' : '开始检测'}
                  </Button>
                </div>
                {sensitiveResult && (
                  <div className={`p-3 rounded-lg flex items-start gap-2 ${
                    sensitiveResult.level === 'pass' ? 'bg-[hsl(130_54%_42%)]/10' :
                    sensitiveResult.level === 'warn' ? 'bg-[hsl(26_90%_49%)]/10' :
                    'bg-[hsl(2_84%_62%)]/10'
                  }`}>
                    {sensitiveResult.level === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-[hsl(130_54%_42%)] mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-[hsl(26_90%_49%)] mt-0.5" />
                    )}
                    <div className="text-sm">
                      <p className="font-medium mb-1">
                        {sensitiveResult.level === 'pass' && '检测通过，未发现敏感词'}
                        {sensitiveResult.level === 'warn' && `检测到 ${sensitiveResult.words.length} 个风险词`}
                        {sensitiveResult.level === 'block' && `检测到 ${sensitiveResult.words.length} 个违规词`}
                      </p>
                      {sensitiveResult.words.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {sensitiveResult.words.map((w) => (
                            <Badge key={w} variant="outline" className="text-[10px] h-5">{w}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!sensitiveResult && !sensitiveChecking && (
                  <p className="text-xs text-muted-foreground">建议发布前进行敏感词检测，降低违规风险</p>
                )}
              </div>

              {/* Compliance check */}
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="compliance"
                    checked={complianceChecked}
                    onCheckedChange={(v) => setComplianceChecked(!!v)}
                  />
                  <Label htmlFor="compliance" className="text-xs leading-5 cursor-pointer">
                    我确认已阅读并遵守各平台内容创作规范，承诺发布内容不违反相关法律法规和平台规则。
                    如因内容违规导致账号处罚，由我自行承担责任。
                  </Label>
                </div>
              </div>

              {/* Publish overview */}
              <div className="border border-border rounded-lg p-4 space-y-2 bg-muted/30">
                <h3 className="font-medium text-sm">发布概览</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-muted-foreground">发布账号：<span className="text-foreground">{selectedAccounts.length} 个</span></div>
                  <div className="text-muted-foreground">内容类型：<span className="text-foreground">{contentType === 'video' ? '视频' : '图文'}</span></div>
                  <div className="text-muted-foreground">发布方式：<span className="text-foreground">{publishMode === 'now' ? '立即发布' : '定时发布'}</span></div>
                  <div className="text-muted-foreground">自动追评：<span className="text-foreground">{autoFollowUp ? '开启' : '关闭'}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom nav */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={currentStep === 1}
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              上一步
            </Button>
            {currentStep < 3 ? (
              <Button size="sm" disabled={!canNext()} onClick={() => setCurrentStep(currentStep + 1)}>
                下一步
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!complianceChecked || isPublishing}
                onClick={handlePublish}
              >
                {isPublishing ? (
                  <>发布中...</>
                ) : (
                  <><Send className="w-4 h-4 mr-1" />确认发布</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sensitive check dialog */}
      <Dialog open={sensitiveCheckOpen} onOpenChange={setSensitiveCheckOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              敏感词检测结果
            </DialogTitle>
          </DialogHeader>
          {sensitiveChecking ? (
            <div className="py-8 text-center">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">正在检测内容合规性...</p>
            </div>
          ) : sensitiveResult ? (
            <div className="space-y-3">
              <div className={`p-3 rounded-lg ${
                sensitiveResult.level === 'pass' ? 'bg-[hsl(130_54%_42%)]/10' :
                sensitiveResult.level === 'warn' ? 'bg-[hsl(26_90%_49%)]/10' :
                'bg-[hsl(2_84%_62%)]/10'
              }`}>
                <p className="font-medium flex items-center gap-2">
                  {sensitiveResult.level === 'pass' && <><CheckCircle2 className="w-4 h-4 text-[hsl(130_54%_42%)]" /> 检测通过</>}
                  {sensitiveResult.level === 'warn' && <><AlertTriangle className="w-4 h-4 text-[hsl(26_90%_49%)]" /> 存在风险</>}
                  {sensitiveResult.level === 'block' && <><XCircle className="w-4 h-4 text-[hsl(2_84%_62%)]" /> 存在违规</>}
                </p>
              </div>
              {sensitiveResult.words.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">命中词汇：</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sensitiveResult.words.map((w) => (
                      <Badge key={w} variant="destructive" className="text-xs">{w}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                建议修改相关内容后再次检测，或确认后继续发布。
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSensitiveCheckOpen(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublishCreatePage;
