import { useState } from 'react';
import {
  Info,
  AlertTriangle,
  Hand,
  Check,
  Eye,
} from 'lucide-react';
import type { PlatformType } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Textarea } from '@client/src/components/ui/textarea';
import { Switch } from '@client/src/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';

interface WelcomeAccount {
  id: string;
  platform: PlatformType;
  nickname: string;
  avatarUrl: string;
  isEnabled: boolean;
  content: string;
  replyType: 'text' | 'image' | 'article';
  delaySeconds: number;
}

const platformLabels: Record<PlatformType, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  bilibili: 'B站',
};

const platformColors: Record<PlatformType, string> = {
  douyin: 'bg-[hsl(0_0%_8%)] text-white',
  xiaohongshu: 'bg-[hsl(350_85%_60%)] text-white',
  wechat: 'bg-[hsl(142_45%_45%)] text-white',
  bilibili: 'bg-[hsl(200_90%_55%)] text-white',
};

const replyTypeLabels: Record<string, string> = {
  text: '文本',
  image: '图片',
  article: '图文',
};

const mockAccounts: WelcomeAccount[] = [
  {
    id: 'a1',
    platform: 'douyin',
    nickname: '美食探店小队',
    avatarUrl: '',
    isEnabled: true,
    content: '你好呀 {昵称}！感谢关注美食探店小队～ 我们每天分享超好吃的美食探店视频，有什么想吃的随时私信我哦！',
    replyType: 'text',
    delaySeconds: 3,
  },
  {
    id: 'a2',
    platform: 'xiaohongshu',
    nickname: '生活种草日记',
    avatarUrl: '',
    isEnabled: true,
    content: '嗨 {昵称}～ 欢迎来到生活种草日记！点击主页查看更多好物分享，有任何问题随时私信我呀～',
    replyType: 'article',
    delaySeconds: 5,
  },
  {
    id: 'a3',
    platform: 'wechat',
    nickname: '品牌官方号',
    avatarUrl: '',
    isEnabled: false,
    content: '感谢关注品牌官方视频号！最新产品资讯、专属优惠活动第一时间送达～',
    replyType: 'text',
    delaySeconds: 2,
  },
  {
    id: 'a4',
    platform: 'bilibili',
    nickname: '科技UP主',
    avatarUrl: '',
    isEnabled: true,
    content: '欢迎关注科技UP主！硬核数码测评、趣味科技科普每周更新～ 三连支持一下吧！',
    replyType: 'text',
    delaySeconds: 10,
  },
];

const AutomationWelcomePage = () => {
  const [accounts, setAccounts] = useState<WelcomeAccount[]>(mockAccounts);
  const [selectedId, setSelectedId] = useState('a1');
  const current = accounts.find((a) => a.id === selectedId) || accounts[0];

  const updateCurrent = (patch: Partial<WelcomeAccount>) => {
    setAccounts(accounts.map((a) => (a.id === selectedId ? { ...a, ...patch } : a)));
  };

  const previewContent = current.content.replace('{昵称}', '新粉丝小明');

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <Info className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle className="font-semibold">合规提醒</AlertTitle>
        <AlertDescription>
          关注欢迎语仅在用户主动关注后触发，属合规场景。仅限已授权自有账号使用，不得用于营销骚扰或批量触达。
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">欢迎语</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">账号列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setSelectedId(acc.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  selectedId === acc.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-muted/30'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${platformColors[acc.platform]}`}>
                  {acc.nickname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{acc.nickname}</span>
                    {acc.isEnabled && (
                      <Badge variant="outline" className="text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40 text-[10px] h-4">
                        已启用
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{platformLabels[acc.platform]}</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Hand className="w-4 h-4 text-primary" />
                欢迎语配置 — {current.nickname}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">启用</span>
                <Switch
                  checked={current.isEnabled}
                  onCheckedChange={(checked) => updateCurrent({ isEnabled: checked })}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-1.5 block">回复类型</label>
              <div className="flex gap-2">
                {(['text', 'image', 'article'] as const).map((t) => (
                  <Button
                    key={t}
                    variant={current.replyType === t ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateCurrent({ replyType: t })}
                    type="button"
                  >
                    {replyTypeLabels[t]}
                  </Button>
                ))}
              </div>
            </div>

            {current.replyType === 'text' && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">欢迎语内容</label>
                <Textarea
                  value={current.content}
                  onChange={(e) => updateCurrent({ content: e.target.value })}
                  className="min-h-[120px] resize-none"
                  disabled={!current.isEnabled}
                  placeholder="输入欢迎语内容，支持 {昵称}、{时间} 等变量"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">可插入变量：</span>
                  <Badge variant="outline" className="cursor-pointer hover:bg-muted">{'{昵称}'}</Badge>
                  <Badge variant="outline" className="cursor-pointer hover:bg-muted">{'{时间}'}</Badge>
                  <Badge variant="outline" className="cursor-pointer hover:bg-muted">{'{平台}'}</Badge>
                </div>
              </div>
            )}

            {current.replyType === 'image' && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">欢迎图片</label>
                <div className="border border-dashed border-border rounded-lg h-40 flex items-center justify-center text-muted-foreground text-sm">
                  点击上传欢迎图片
                </div>
              </div>
            )}

            {current.replyType === 'article' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">图文标题</label>
                  <input className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="请输入图文标题" defaultValue="欢迎关注！" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">图文描述</label>
                  <Textarea
                    value={current.content}
                    onChange={(e) => updateCurrent({ content: e.target.value })}
                    className="min-h-[100px] resize-none"
                    disabled={!current.isEnabled}
                    placeholder="请输入图文描述"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">封面图</label>
                  <div className="border border-dashed border-border rounded-lg h-28 flex items-center justify-center text-muted-foreground text-sm">
                    点击上传封面图
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1.5 block">延迟发送时间</label>
              <Select
                value={String(current.delaySeconds)}
                onValueChange={(v) => updateCurrent({ delaySeconds: Number(v) })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">立即发送</SelectItem>
                  <SelectItem value="2">延迟 2 秒</SelectItem>
                  <SelectItem value="3">延迟 3 秒</SelectItem>
                  <SelectItem value="5">延迟 5 秒</SelectItem>
                  <SelectItem value="10">延迟 10 秒</SelectItem>
                  <SelectItem value="30">延迟 30 秒</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">用户关注后延迟自动发送，避免过于突兀</p>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button>
                <Check className="w-4 h-4" />保存设置
              </Button>
              <Button variant="outline">
                <Eye className="w-4 h-4" />预览效果
              </Button>
            </div>

            <div className="pt-4 border-t">
              <div className="text-sm font-medium mb-3">效果预览</div>
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="text-xs text-muted-foreground text-center">— 模拟新粉丝对话 —</div>
                <div className="flex justify-start">
                  <div className="bg-card border border-border px-3 py-2 rounded-lg rounded-bl-none text-sm max-w-[80%]">
                    刚关注了
                  </div>
                </div>
                <div className="text-xs text-muted-foreground ml-2">
                  {current.delaySeconds}秒后自动发送
                </div>
                <div className="flex justify-end">
                  <div className="bg-primary text-white px-3 py-2 rounded-lg rounded-br-none text-sm max-w-[80%] leading-5">
                    {previewContent}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AutomationWelcomePage;
