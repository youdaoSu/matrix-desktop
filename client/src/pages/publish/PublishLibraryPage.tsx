import { useState } from 'react';
import {
  Upload,
  Search,
  Image,
  Video,
  FileText,
  Trash2,
  FolderOpen,
  Info,
  Grid3X3,
  List,
  MoreVertical,
  Play,
  Check,
} from 'lucide-react';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/src/components/ui/tabs';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Checkbox } from '@client/src/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import { Image as UIImage } from '@client/src/components/ui/image';

type MaterialType = 'image' | 'video' | 'text';

interface MaterialItem {
  id: string;
  name: string;
  type: MaterialType;
  size: string;
  uploadTime: string;
  category: string;
  thumbnail?: string;
  content?: string;
}

const mockMaterials: MaterialItem[] = [
  { id: '1', name: '秋日穿搭-主图.jpg', type: 'image', size: '2.3 MB', uploadTime: '2026-09-28 14:30', category: '穿搭', thumbnail: 'https://picsum.photos/seed/lib1/400/400' },
  { id: '2', name: '美食探店vlog.mp4', type: 'video', size: '156 MB', uploadTime: '2026-09-28 10:15', category: '美食', thumbnail: 'https://picsum.photos/seed/lib2/400/400' },
  { id: '3', name: '护肤攻略文案.txt', type: 'text', size: '4.2 KB', uploadTime: '2026-09-27 16:45', category: '美妆', content: '入秋后皮肤容易干燥，分享几个亲测有效的护肤小技巧...' },
  { id: '4', name: '旅行风景-海边.jpg', type: 'image', size: '3.1 MB', uploadTime: '2026-09-27 09:20', category: '旅行', thumbnail: 'https://picsum.photos/seed/lib3/400/400' },
  { id: '5', name: '职场分享-干货.mp4', type: 'video', size: '230 MB', uploadTime: '2026-09-26 18:00', category: '职场', thumbnail: 'https://picsum.photos/seed/lib4/400/400' },
  { id: '6', name: '产品测评配图.png', type: 'image', size: '1.8 MB', uploadTime: '2026-09-26 14:10', category: '美妆', thumbnail: 'https://picsum.photos/seed/lib5/400/400' },
  { id: '7', name: '探店文案-火锅篇.txt', type: 'text', size: '3.8 KB', uploadTime: '2026-09-25 11:30', category: '美食', content: '成都最火的火锅店测评来啦！今天带大家打卡这家开了10年的老店...' },
  { id: '8', name: '秋季穿搭-街拍.jpg', type: 'image', size: '2.7 MB', uploadTime: '2026-09-25 08:45', category: '穿搭', thumbnail: 'https://picsum.photos/seed/lib6/400/400' },
  { id: '9', name: '科技开箱视频.mp4', type: 'video', size: '420 MB', uploadTime: '2026-09-24 20:15', category: '科技', thumbnail: 'https://picsum.photos/seed/lib7/400/400' },
  { id: '10', name: '好物分享清单.txt', type: 'text', size: '5.6 KB', uploadTime: '2026-09-24 15:30', category: '生活', content: '本月爱用物分享来啦，从护肤到生活方式，每一个都是我的心头好...' },
  { id: '11', name: '城市夜景-上海.jpg', type: 'image', size: '4.5 MB', uploadTime: '2026-09-23 22:00', category: '旅行', thumbnail: 'https://picsum.photos/seed/lib8/400/400' },
  { id: '12', name: '健身打卡记录.jpg', type: 'image', size: '1.9 MB', uploadTime: '2026-09-23 07:00', category: '生活', thumbnail: 'https://picsum.photos/seed/lib9/400/400' },
];

const categories = [
  { value: 'all', label: '全部' },
  { value: 'fashion', label: '穿搭' },
  { value: 'beauty', label: '美妆' },
  { value: 'food', label: '美食' },
  { value: 'travel', label: '旅行' },
  { value: 'tech', label: '科技' },
  { value: 'life', label: '生活' },
  { value: 'career', label: '职场' },
];

const PublishLibraryPage = () => {
  const [activeTab, setActiveTab] = useState<MaterialType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredMaterials = mockMaterials.filter((item) => {
    const typeMatch = activeTab === 'all' || item.type === activeTab;
    const keywordMatch = !searchKeyword || item.name.toLowerCase().includes(searchKeyword.toLowerCase());
    const categoryMatch = activeCategory === 'all' || item.category === categories.find((c) => c.value === activeCategory)?.label;
    return typeMatch && keywordMatch && categoryMatch;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredMaterials.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMaterials.map((m) => m.id));
    }
  };

  const getTypeBadge = (type: MaterialType) => {
    switch (type) {
      case 'image':
        return <Badge variant="secondary" className="gap-1"><Image className="w-3 h-3" />图片</Badge>;
      case 'video':
        return <Badge className="gap-1 bg-[hsl(200_90%_55%)] text-white border-none"><Video className="w-3 h-3" />视频</Badge>;
      case 'text':
        return <Badge variant="outline" className="gap-1"><FileText className="w-3 h-3" />文案</Badge>;
    }
  };

  return (
    <div className="space-y-4 p-4">
      <Alert variant="warning">
        <Info className="w-4 h-4" />
        <AlertDescription>
          当前展示示例数据，绑定真实平台账号后可同步实际内容
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">素材库</h1>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">已选 {selectedIds.length} 项</span>
              <Button variant="outline" size="sm">
                <FolderOpen className="w-4 h-4 mr-1" />
                移动分类
              </Button>
              <Button variant="destructive" size="sm">
                <Trash2 className="w-4 h-4 mr-1" />
                批量删除
              </Button>
            </>
          )}
          <Button>
            <Upload className="w-4 h-4 mr-1" />
            上传素材
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 min-w-[300px]">
              <TabsList className="grid w-full grid-cols-4 max-w-md">
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="image">图片</TabsTrigger>
                <TabsTrigger value="video">视频</TabsTrigger>
                <TabsTrigger value="text">文案</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索素材名称..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">分类：</span>
            {categories.map((cat) => (
              <Button
                key={cat.value}
                variant={activeCategory === cat.value ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setActiveCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <Checkbox checked={selectedIds.length === filteredMaterials.length && filteredMaterials.length > 0} onCheckedChange={toggleSelectAll} />
            <span className="text-sm text-muted-foreground">全选</span>
            <span className="text-sm text-muted-foreground ml-auto">共 {filteredMaterials.length} 个素材</span>
          </div>
        </CardContent>
      </Card>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredMaterials.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <Card key={item.id} className={`overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${isSelected ? 'ring-2 ring-primary' : ''}`}>
                <div className="relative aspect-square bg-muted">
                  {item.type === 'image' && item.thumbnail && (
                    <UIImage src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
                  )}
                  {item.type === 'video' && item.thumbnail && (
                    <>
                      <UIImage src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                          <Play className="w-5 h-5 text-foreground ml-0.5" />
                        </div>
                      </div>
                    </>
                  )}
                  {item.type === 'text' && (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3">
                      <FileText className="w-10 h-10 text-muted-foreground mb-2" />
                      <p className="text-xs text-muted-foreground text-center line-clamp-3">{item.content}</p>
                    </div>
                  )}
                  <div
                    className={`absolute top-2 left-2 w-5 h-5 rounded-sm border-2 flex items-center justify-center ${
                      isSelected ? 'bg-primary border-primary' : 'bg-white/80 border-white'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.id);
                    }}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="absolute top-2 right-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/30 text-white hover:bg-black/50" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>重命名</DropdownMenuItem>
                        <DropdownMenuItem>移动分类</DropdownMenuItem>
                        <DropdownMenuItem>下载</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">删除</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <CardContent className="p-2.5">
                  <p className="text-sm font-medium truncate" title={item.name}>{item.name}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    {getTypeBadge(item.type)}
                    <span className="text-xs text-muted-foreground">{item.size}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.uploadTime}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 w-10">
                    <Checkbox checked={selectedIds.length === filteredMaterials.length && filteredMaterials.length > 0} onCheckedChange={toggleSelectAll} />
                  </th>
                  <th className="text-left py-3 px-4 font-medium">素材名称</th>
                  <th className="text-left py-3 px-4 font-medium w-24">类型</th>
                  <th className="text-left py-3 px-4 font-medium w-24">分类</th>
                  <th className="text-left py-3 px-4 font-medium w-28">大小</th>
                  <th className="text-left py-3 px-4 font-medium w-40">上传时间</th>
                  <th className="text-right py-3 px-4 font-medium w-32">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 px-4">
                      <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
                    </td>
                    <td className="py-3 px-4 font-medium flex items-center gap-3">
                      {item.type === 'image' && item.thumbnail && (
                        <UIImage src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                      )}
                      {item.type === 'video' && item.thumbnail && (
                        <div className="relative w-10 h-10 rounded overflow-hidden">
                          <UIImage src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          <Play className="w-4 h-4 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                      )}
                      {item.type === 'text' && (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      {item.name}
                    </td>
                    <td className="py-3 px-4">{getTypeBadge(item.type)}</td>
                    <td className="py-3 px-4">{item.category}</td>
                    <td className="py-3 px-4 text-muted-foreground">{item.size}</td>
                    <td className="py-3 px-4 text-muted-foreground">{item.uploadTime}</td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="sm">编辑</Button>
                      <Button variant="ghost" size="sm" className="text-destructive">删除</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PublishLibraryPage;
