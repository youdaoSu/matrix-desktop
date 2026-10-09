import { useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Check,
  Info,
  Palette,
  Type,
  LayoutGrid,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Label } from '@client/src/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@client/src/components/ui/radio-group';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { useTheme, type Theme } from '@client/src/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface AccentColor {
  name: string;
  value: string;
  label: string;
}

const accentColors: AccentColor[] = [
  { name: 'orange', value: 'hsl(26 90% 49%)', label: '活力橙' },
  { name: 'blue', value: 'hsl(221 83% 53%)', label: '科技蓝' },
  { name: 'green', value: 'hsl(130 54% 42%)', label: '品牌绿' },
  { name: 'red', value: 'hsl(2 84% 62%)', label: '热情红' },
  { name: 'purple', value: 'hsl(270 70% 55%)', label: '优雅紫' },
  { name: 'yellow', value: 'hsl(46 100% 52%)', label: '活力黄' },
];

type FontSize = 'normal' | 'large' | 'xlarge';
type Density = 'compact' | 'normal' | 'comfortable';

const themeModes: { value: Theme; label: string; icon: typeof Sun; desc: string }[] = [
  { value: 'light', label: '明亮模式', icon: Sun, desc: '浅色界面，适合日间使用' },
  { value: 'dark', label: '暗黑模式', icon: Moon, desc: '深色界面，减少视觉疲劳' },
  { value: 'system', label: '跟随系统', icon: Monitor, desc: '跟随系统设置自动切换' },
];

const SettingsThemePage: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [accentColor, setAccentColor] = useState('orange');
  const [fontSize, setFontSize] = useState<FontSize>('normal');
  const [density, setDensity] = useState<Density>('normal');

  const densityRowHeight: Record<Density, string> = {
    compact: 'h-8',
    normal: 'h-10',
    comfortable: 'h-12',
  };

  const fontSizeClass: Record<FontSize, string> = {
    normal: 'text-sm',
    large: 'text-base',
    xlarge: 'text-lg',
  };

  const previewRows = [
    { id: 1, name: '作品标题示例一', platform: '抖音', status: '已发布', time: '2024-09-28 14:30' },
    { id: 2, name: '作品标题示例二', platform: '小红书', status: '审核中', time: '2024-09-28 13:15' },
    { id: 3, name: '作品标题示例三', platform: '视频号', status: '已发布', time: '2024-09-28 12:00' },
  ];

  const getStatusColor = (status: string): string => {
    if (status === '已发布') return 'text-[hsl(130_54%_42%)]';
    if (status === '审核中') return 'text-[hsl(26_90%_49%)]';
    return 'text-muted-foreground';
  };

  const handleAccentChange = (name: string) => {
    setAccentColor(name);
    const color = accentColors.find((c: AccentColor) => c.name === name);
    if (color) {
      document.documentElement.style.setProperty('--accent', color.value);
    }
  };

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info">
          当前为示例数据演示
        </AlertDescription>
      </Alert>

      <div>
        <h1 className="text-xl font-semibold text-foreground">主题偏好设置</h1>
        <p className="text-sm text-muted-foreground mt-1">自定义界面外观和显示效果</p>
      </div>

      {/* Theme Mode Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="w-4 h-4" />
            主题模式
          </CardTitle>
          <CardDescription>选择适合的界面显示模式</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {themeModes.map((mode) => {
              const Icon = mode.icon;
              const isActive = theme === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() => setTheme(mode.value)}
                  className={cn(
                    'flex flex-col items-center gap-3 p-5 rounded-lg border-2 transition-all text-left',
                    isActive
                      ? 'border-[hsl(26_90%_49%)] bg-[hsl(26_90%_49%)]/5'
                      : 'border-border hover:border-primary/30 hover:bg-accent/30'
                  )}
                >
                  <div
                    className={cn(
                      'w-full h-20 rounded-md border border-border flex items-center justify-center',
                      mode.value === 'light' && 'bg-white',
                      mode.value === 'dark' && 'bg-zinc-800',
                      mode.value === 'system' &&
                        'bg-gradient-to-r from-white via-border to-zinc-800'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-6 h-6',
                        mode.value === 'dark' ? 'text-zinc-200' : 'text-foreground',
                        mode.value === 'system' && 'text-foreground'
                      )}
                    />
                  </div>
                  <div className="w-full">
                    <p className="text-sm font-medium text-foreground">{mode.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{mode.desc}</p>
                  </div>
                  {isActive && (
                    <div className="w-5 h-5 rounded-full bg-[hsl(26_90%_49%)] flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Accent Color Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">强调色</CardTitle>
          <CardDescription>选择您喜欢的主题强调色</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            {accentColors.map((color: AccentColor) => {
              const isActive = accentColor === color.name;
              return (
                <button
                  key={color.name}
                  onClick={() => handleAccentChange(color.name)}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                    isActive
                      ? 'ring-2 ring-offset-2 ring-offset-background'
                      : 'hover:scale-110'
                  )}
                  style={{
                    backgroundColor: color.value,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ['--tw-ring-color' as any]: color.value,
                  }}
                  aria-label={color.label}
                  title={color.label}
                >
                  {isActive && <Check className="w-4 h-4 text-white" />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            当前选中：{accentColors.find((c: AccentColor) => c.name === accentColor)?.label}
          </p>
        </CardContent>
      </Card>

      {/* Font Size Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Type className="w-4 h-4" />
            字体大小
          </CardTitle>
          <CardDescription>调整界面文字的显示大小</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <RadioGroup
              value={fontSize}
              onValueChange={(v) => setFontSize(v as FontSize)}
              className="flex flex-row gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="normal" id="font-normal" />
                <Label htmlFor="font-normal">标准</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="large" id="font-large" />
                <Label htmlFor="font-large">大</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="xlarge" id="font-xlarge" />
                <Label htmlFor="font-xlarge">特大</Label>
              </div>
            </RadioGroup>
            <div
              className={cn(
                'text-foreground px-4 py-2 bg-accent/30 rounded-md',
                fontSizeClass[fontSize]
              )}
            >
              预览文字 Aa
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Density Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" />
            列表密度
          </CardTitle>
          <CardDescription>控制表格和列表的行高</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={density}
            onValueChange={(v) => setDensity(v as Density)}
            className="flex flex-row gap-6"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="compact" id="density-compact" />
              <Label htmlFor="density-compact">紧凑</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="normal" id="density-normal" />
              <Label htmlFor="density-normal">标准</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="comfortable" id="density-comfortable" />
              <Label htmlFor="density-comfortable">宽松</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-4 h-4" />
            实时预览
          </CardTitle>
          <CardDescription>预览主题和密度设置效果</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className={cn('bg-muted/40 px-4 flex items-center border-b border-border', densityRowHeight[density])}>
              <div className="w-1/3 text-xs font-medium text-muted-foreground">作品名称</div>
              <div className="w-1/6 text-xs font-medium text-muted-foreground">平台</div>
              <div className="w-1/6 text-xs font-medium text-muted-foreground">状态</div>
              <div className="flex-1 text-xs font-medium text-muted-foreground">发布时间</div>
            </div>
            {previewRows.map((row, idx: number) => (
              <div
                key={row.id}
                className={cn(
                  'px-4 flex items-center border-b border-border last:border-b-0',
                  densityRowHeight[density],
                  fontSizeClass[fontSize],
                  idx % 2 === 1 ? 'bg-muted/20' : ''
                )}
              >
                <div className="w-1/3 text-foreground truncate">{row.name}</div>
                <div className="w-1/6 text-muted-foreground">{row.platform}</div>
                <div className={cn('w-1/6 font-medium', getStatusColor(row.status))}>
                  {row.status}
                </div>
                <div className="flex-1 text-muted-foreground text-xs">{row.time}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button>保存设置</Button>
        <Button variant="outline">恢复默认</Button>
      </div>
    </div>
  );
};

export default SettingsThemePage;
