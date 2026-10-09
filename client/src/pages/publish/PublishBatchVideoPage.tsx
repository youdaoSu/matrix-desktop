import { useState } from 'react';
import {
  Video,
  Upload,
  Play,
  Users,
  Clock,
  AlertCircle,
  Settings,
  Send,
  FileVideo,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
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
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Progress } from '@client/src/components/ui/progress';
import { Image } from '@client/src/components/ui/image';

const mockVideos = [
  { id: '1', name: '秋日穿搭vlog.mp4', size: '45.2MB', duration: '02:15', thumbnail: 'https://picsum.photos/seed/v1/160/90' },
  { id: '2', name: '美食探店系列01.mp4', size: '89.1MB', duration: '03:42', thumbnail: 'https://picsum.photos/seed/v2/160/90' },
  { id: '3', name: '旅行大理攻略.mp4', size: '128.6MB', duration: '05:30', thumbnail: 'https://picsum.photos/seed/v3/160/90' },
  { id: '4', name: '健身训练教程.mp4', size: '156.8MB', duration: '08:15', thumbnail: 'https://picsum.photos/seed/v4/160/90' },
  { id: '5', name: '数码开箱测评.mp4', size: '72.4MB', duration: '04:08', thumbnail: 'https://picsum.photos/seed/v5/160/90' },
  { id: '6', name: '护肤教程分享.mp4', size: '38.9MB', duration: '01:55', thumbnail: 'https://picsum.photos/seed/v6/160/90' },
];

const mockAccounts = [
  { id: '1', platform: 'douyin', name: '美食探店小队' },
  { id: '2', platform: 'douyin', name: '旅行日记Vlog' },
  { id: '3', platform: 'xiaohongshu', name: '生活种草日记' },
  { id: '5', platform: 'wechat', name: '职场成长笔记' },
  { id: '6', platform: 'bilibili', name: '科技宅频道' },
];

const PublishBatchVideoPage = () => {
  const [selectedVideos, setSelectedVideos] = useState<string[]>(['1', '3']);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['1', '3']);
  const [publishMode, setPublishMode] = useState<string>('interval');
  const [intervalMinutes, setIntervalMinutes] = useState('5');
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggleVideo = (id: string) => {
    setSelectedVideos((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  };

  const handleStartPublish = () => {
    setIsPublishing(true);
    setProgress(0);
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          return 100;
        }
        return p + 5;
      });
    }, 300);
  };

  return (
    <div className="space-y-4 p-4">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          <span className="text-[hsl(26_90%_49%)] font-medium">示例数据 / 演示流程</span>
          ，批量编排与发布为前端模拟
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">批量发视频</h1>
          <p className="text-sm text-muted-foreground mt-1">一次性编排多个视频，批量发布到多个账号</p>
        </div>
        <Button onClick={handleStartPublish} disabled={selectedVideos.length === 0 || selectedAccounts.length === 0 || isPublishing}>
          <Send className="w-4 h-4 mr-1" />
          {isPublishing ? '发布中...' : '开始批量发布'}
        </Button>
      </div>

      {isPublishing && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">批量发布进度</span>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              共 {selectedVideos.length * selectedAccounts.length} 条发布任务，当前正在处理第 {Math.ceil(progress / 100 * selectedVideos.length * selectedAccounts.length) || 1} 条
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Video library */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">选择视频素材</CardTitle>
                <Badge variant="secondary">{selectedVideos.length} / {mockVideos.length} 已选</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Input placeholder="搜索视频文件名..." className="h-9" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {mockVideos.map((video) => {
                  const selected = selectedVideos.includes(video.id);
                  return (
                    <div
                      key={video.id}
                      onClick={() => toggleVideo(video.id)}
                      className={`rounded-lg overflow-hidden border cursor-pointer transition-all ${
                        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="relative aspect-video bg-muted">
                        <Image src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100">
                          <Play className="w-8 h-8 text-white" />
                        </div>
                        <div className="absolute top-1.5 left-1.5">
                          <Checkbox checked={selected} />
                        </div>
                        <div className="absolute bottom-1 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                          {video.duration}
                        </div>
                      </div>
                      <div className="p-2">
                        <div className="text-sm truncate">{video.name}</div>
                        <div className="text-xs text-muted-foreground">{video.size}</div>
                      </div>
                    </div>
                  );
                })}
                <div className="aspect-video rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">上传视频</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                选择发布账号
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mockAccounts.map((acc) => {
                  const selected = selectedAccounts.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors border ${
                        selected ? 'bg-primary/10 border-primary/30' : 'hover:bg-muted border-transparent'
                      }`}
                    >
                      <Checkbox checked={selected} />
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {acc.name.charAt(0)}
                      </div>
                      <span className="text-sm flex-1 truncate">{acc.name}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" />
                发布编排设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm">发布模式</Label>
                <Select value={publishMode} onValueChange={setPublishMode}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval">间隔发布</SelectItem>
                    <SelectItem value="schedule">定时发布</SelectItem>
                    <SelectItem value="now">全部立即</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {publishMode === 'interval' && (
                <div>
                  <Label className="text-sm">每条间隔（分钟）</Label>
                  <Input className="h-9 mt-1" value={intervalMinutes} onChange={(e) => setIntervalMinutes(e.target.value)} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label className="text-sm">自动追评</Label>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">频控保护</Label>
                <Switch defaultChecked />
              </div>
              <div className="pt-2 border-t border-border text-xs text-muted-foreground space-y-1">
                <p>视频数量：{selectedVideos.length}</p>
                <p>账号数量：{selectedAccounts.length}</p>
                <p>预计总任务：{selectedVideos.length * selectedAccounts.length} 条</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PublishBatchVideoPage;
