import { useState } from 'react';
import {
  Image,
  Upload,
  Users,
  Settings,
  Send,
  AlertCircle,
  Grid3X3,
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
import { Image as UIImage } from '@client/src/components/ui/image';

const mockImages = [
  { id: '1', name: '秋日穿搭-01.jpg', size: '2.3MB', thumbnail: 'https://picsum.photos/seed/i1/150/150' },
  { id: '2', name: '美食摆盘-02.jpg', size: '3.1MB', thumbnail: 'https://picsum.photos/seed/i2/150/150' },
  { id: '3', name: '旅行风景-03.jpg', size: '4.5MB', thumbnail: 'https://picsum.photos/seed/i3/150/150' },
  { id: '4', name: '美妆教程-04.jpg', size: '1.8MB', thumbnail: 'https://picsum.photos/seed/i4/150/150' },
  { id: '5', name: '家居好物-05.jpg', size: '2.7MB', thumbnail: 'https://picsum.photos/seed/i5/150/150' },
  { id: '6', name: '健身对比-06.jpg', size: '3.9MB', thumbnail: 'https://picsum.photos/seed/i6/150/150' },
  { id: '7', name: '穿搭合集-07.jpg', size: '2.2MB', thumbnail: 'https://picsum.photos/seed/i7/150/150' },
  { id: '8', name: '探店环境-08.jpg', size: '3.5MB', thumbnail: 'https://picsum.photos/seed/i8/150/150' },
];

const mockAccounts = [
  { id: '1', platform: 'xiaohongshu', name: '生活种草日记' },
  { id: '2', platform: 'xiaohongshu', name: '时尚穿搭指南' },
  { id: '3', platform: 'douyin', name: '美食探店小队' },
  { id: '4', platform: 'wechat', name: '职场成长笔记' },
];

const PublishBatchImagePage = () => {
  const [selectedImages, setSelectedImages] = useState<string[]>(['1', '2', '5']);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['1', '2']);
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggleImage = (id: string) => {
    setSelectedImages((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
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
        return p + 8;
      });
    }, 250);
  };

  return (
    <div className="space-y-4 p-4">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          <span className="text-[hsl(26_90%_49%)] font-medium">示例数据 / 演示流程</span>
          ，批量图文发布为前端模拟
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">批量发图文</h1>
          <p className="text-sm text-muted-foreground mt-1">多图多账号一键编排，高效发布图文内容</p>
        </div>
        <Button onClick={handleStartPublish} disabled={selectedImages.length === 0 || selectedAccounts.length === 0 || isPublishing}>
          <Send className="w-4 h-4 mr-1" />
          {isPublishing ? '发布中...' : '开始批量发布'}
        </Button>
      </div>

      {isPublishing && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">批量发布进度</span>
              <span className="text-sm text-muted-foreground">{Math.min(progress, 100)}%</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-2" />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4" />
                  选择图片素材
                </CardTitle>
                <Badge variant="secondary">{selectedImages.length} / {mockImages.length} 已选</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Input placeholder="搜索图片文件名..." className="h-9" />
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {mockImages.map((img) => {
                  const selected = selectedImages.includes(img.id);
                  return (
                    <div
                      key={img.id}
                      onClick={() => toggleImage(img.id)}
                      className={`aspect-square rounded-lg overflow-hidden border cursor-pointer transition-all relative ${
                        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <UIImage src={img.thumbnail} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 left-1.5">
                        <Checkbox checked={selected} />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                        <div className="text-[10px] text-white truncate">{img.name}</div>
                        <div className="text-[9px] text-white/70">{img.size}</div>
                      </div>
                    </div>
                  );
                })}
                <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                  <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">上传图片</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
                图文发布设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm">图片排列方式</Label>
                <Select defaultValue="auto">
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动分组</SelectItem>
                    <SelectItem value="9">9 图一组</SelectItem>
                    <SelectItem value="6">6 图一组</SelectItem>
                    <SelectItem value="3">3 图一组</SelectItem>
                    <SelectItem value="1">单图独立</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">发布间隔</Label>
                <Select defaultValue="3">
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 分钟</SelectItem>
                    <SelectItem value="3">3 分钟</SelectItem>
                    <SelectItem value="5">5 分钟</SelectItem>
                    <SelectItem value="10">10 分钟</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">自动生成话题</Label>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">首图一致</Label>
                <Switch />
              </div>
              <div className="pt-2 border-t border-border text-xs text-muted-foreground space-y-1">
                <p>图片数量：{selectedImages.length}</p>
                <p>账号数量：{selectedAccounts.length}</p>
                <p>预计生成：{selectedImages.length * selectedAccounts.length} 条图文</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PublishBatchImagePage;
