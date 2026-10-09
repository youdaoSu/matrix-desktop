import { useState } from 'react';
import {
  Info,
  AlertTriangle,
  WifiOff,
  Clock,
  Bot,
  User,
  Check,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/src/components/ui/tabs';
import { Switch } from '@client/src/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';

const AutomationOfflinePage = () => {
  const [offlineEnabled, setOfflineEnabled] = useState(true);
  const [offlineContent, setOfflineContent] = useState('您好，当前为非工作时间，客服不在线。我们会在明天9:00上班后第一时间回复您的消息，感谢理解～');
  const [offlineStart, setOfflineStart] = useState('22:00');
  const [offlineEnd, setOfflineEnd] = useState('09:00');
  const [offlineReplyType, setOfflineReplyType] = useState<'text' | 'image'>('text');
  const [offlineAccount, setOfflineAccount] = useState('all');

  const [timeoutEnabled, setTimeoutEnabled] = useState(false);
  const [timeoutContent, setTimeoutContent] = useState('非常抱歉让您久等了！客服正在处理您的问题，请稍等片刻，马上回复您～');
  const [timeoutSeconds, setTimeoutSeconds] = useState('120');

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
          离线/超时自动回复仅限已授权自有账号被动响应用户已发起的私信，属于客服辅助功能，不涉及主动营销或批量触达。
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">离线 / 超时回复</h1>
      </div>

      <Tabs defaultValue="offline" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="offline">
            <WifiOff className="w-4 h-4" />离线自动回复
          </TabsTrigger>
          <TabsTrigger value="timeout">
            <Clock className="w-4 h-4" />超时自动回复
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offline">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <WifiOff className="w-4 h-4 text-primary" />
                    离线自动回复配置
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">启用</span>
                    <Switch checked={offlineEnabled} onCheckedChange={setOfflineEnabled} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">适用账号</label>
                  <Select value={offlineAccount} onValueChange={setOfflineAccount}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择账号" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部账号</SelectItem>
                      <SelectItem value="a1">美食探店小队（抖音）</SelectItem>
                      <SelectItem value="a2">生活种草日记（小红书）</SelectItem>
                      <SelectItem value="a3">品牌官方号（视频号）</SelectItem>
                      <SelectItem value="a4">科技UP主（B站）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">离线时段</label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="time"
                      value={offlineStart}
                      onChange={(e) => setOfflineStart(e.target.value)}
                      className="w-32"
                      disabled={!offlineEnabled}
                    />
                    <span className="text-muted-foreground text-sm">至次日</span>
                    <Input
                      type="time"
                      value={offlineEnd}
                      onChange={(e) => setOfflineEnd(e.target.value)}
                      className="w-32"
                      disabled={!offlineEnabled}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    在此时间段内收到私信将自动触发离线回复。支持跨日设置（如 22:00 至次日 09:00）
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">回复类型</label>
                  <div className="flex gap-2">
                    <Button
                      variant={offlineReplyType === 'text' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setOfflineReplyType('text')}
                      type="button"
                      disabled={!offlineEnabled}
                    >
                      文本
                    </Button>
                    <Button
                      variant={offlineReplyType === 'image' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setOfflineReplyType('image')}
                      type="button"
                      disabled={!offlineEnabled}
                    >
                      图片
                    </Button>
                  </div>
                </div>

                {offlineReplyType === 'text' ? (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">回复内容</label>
                    <Textarea
                      value={offlineContent}
                      onChange={(e) => setOfflineContent(e.target.value)}
                      className="min-h-[120px] resize-none"
                      disabled={!offlineEnabled}
                      placeholder="请输入离线回复内容"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">回复图片</label>
                    <div className="border border-dashed border-border rounded-lg h-32 flex items-center justify-center text-muted-foreground text-sm">
                      点击上传离线回复图片
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  <Button disabled={!offlineEnabled}>
                    <Check className="w-4 h-4" />保存设置
                  </Button>
                  <Button variant="outline" disabled={!offlineEnabled}>
                    <Eye className="w-4 h-4" />预览
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">切换说明</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">机器人自动回复</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      离线时段内，用户私信由系统自动回复，响应及时
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-[hsl(130_54%_42%)]/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[hsl(130_54%_42%)]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">人工接待</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      工作时段内，由人工客服实时回复用户私信
                    </p>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium">切换逻辑</div>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                    <li>到达离线开始时间 → 自动切换到机器人</li>
                    <li>到达离线结束时间 → 自动切换回人工</li>
                    <li>同一条会话内已有人工回复的，不会再触发自动回复</li>
                    <li>每个用户每天最多接收 3 条自动离线回复</li>
                  </ul>
                </div>
                <div className="bg-[hsl(26_90%_49%)]/10 border border-[hsl(26_90%_49%)]/30 rounded-lg p-3">
                  <div className="text-sm font-medium text-[hsl(26_90%_49%)] flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/50 text-[10px]">当前状态</Badge>
                    {offlineEnabled ? '离线回复已开启' : '离线回复已关闭'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {offlineEnabled ? `每天 ${offlineStart} ~ 次日 ${offlineEnd} 自动生效` : '所有时段均由人工接待'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timeout">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    超时自动回复配置
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">启用</span>
                    <Switch checked={timeoutEnabled} onCheckedChange={setTimeoutEnabled} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">超时时间（秒）</label>
                  <Select value={timeoutSeconds} onValueChange={setTimeoutSeconds} disabled={!timeoutEnabled}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">60 秒（1分钟）</SelectItem>
                      <SelectItem value="120">120 秒（2分钟）</SelectItem>
                      <SelectItem value="180">180 秒（3分钟）</SelectItem>
                      <SelectItem value="300">300 秒（5分钟）</SelectItem>
                      <SelectItem value="600">600 秒（10分钟）</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    用户发送消息后，若在此时间内未收到人工回复，则自动触发超时回复
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">回复内容</label>
                  <Textarea
                    value={timeoutContent}
                    onChange={(e) => setTimeoutContent(e.target.value)}
                    className="min-h-[120px] resize-none"
                    disabled={!timeoutEnabled}
                    placeholder="请输入超时回复内容"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    每条会话仅触发一次超时回复，避免重复打扰用户
                  </p>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button disabled={!timeoutEnabled}>
                    <Check className="w-4 h-4" />保存设置
                  </Button>
                  <Button variant="outline" disabled={!timeoutEnabled}>
                    <Eye className="w-4 h-4" />预览
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">使用场景</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="font-medium">场景一：客服繁忙</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    高峰期客服回复不及时，自动发送安抚消息，提升用户体验
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="font-medium">场景二：非整点交接</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    客服交接班间隙，自动回复让用户知道消息已收到
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="font-medium">场景三：复杂问题处理</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    遇到需要查询的问题，先自动回复正在处理，避免用户等待焦虑
                  </p>
                </div>
                <div className="pt-3 border-t">
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">注意：</strong>
                    超时回复仅对当前会话中最新一条未回复的用户消息触发一次，不会重复发送。
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AutomationOfflinePage;
