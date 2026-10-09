import { useNavigate, Link } from 'react-router-dom';
import {
  Sun,
  Moon,
  Monitor,
  LogOut,
  KeyRound,
  Crown,
  Headphones,
  QrCode,
  Zap,
  GraduationCap,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { useTheme } from '@client/src/contexts/ThemeContext';

import type { Theme } from '@client/src/contexts/ThemeContext';

interface RightSidebarProps {
  theme?: Theme;
  onThemeChange?: (t: Theme) => void;
  onRenewClick?: () => void;
  onOnboardingClick?: () => void;
}

const RightSidebar = ({ onRenewClick, onOnboardingClick }: RightSidebarProps) => {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* Theme switch card */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            主题切换
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              className={theme === 'light' ? 'bg-primary hover:bg-primary/90 text-white' : ''}
               onClick={() => setTheme('light')}
            >
              <Sun className="w-3.5 h-3.5" />
              明亮
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              className={theme === 'dark' ? 'bg-primary hover:bg-primary/90 text-white' : ''}
               onClick={() => setTheme('dark')}
            >
              <Moon className="w-3.5 h-3.5" />
              黑暗
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              size="sm"
              className={theme === 'system' ? 'bg-primary hover:bg-primary/90 text-white' : ''}
               onClick={() => setTheme('system')}
            >
              <Monitor className="w-3.5 h-3.5" />
              系统
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User info card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3 mb-4">
            <Avatar className="w-12 h-12">
              <AvatarImage src="" />
              <AvatarFallback className="bg-primary/10 text-primary text-base font-medium">
                肆
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">肆宇</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                138****8888
              </div>
              <div className="text-xs text-muted-foreground truncate">
                siyu@example.com
              </div>
              <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                ID: user_2f8a1c93
              </div>
            </div>
          </div>
          <button
            className="w-full text-xs text-destructive/80 hover:text-destructive flex items-center justify-center gap-1 py-1.5 border border-dashed border-destructive/20 rounded-md hover:border-destructive/40 transition-colors"
            onClick={() => navigate('/login')}
          >
            <LogOut className="w-3.5 h-3.5" />
            退出账号
          </button>
          <div className="mt-3 bg-[hsl(2_84%_62%)/6] border border-[hsl(2_84%_62%)/15] rounded-md px-3 py-2">
            <div className="text-[11px] text-[hsl(2_84%_62%)] leading-4">
              <KeyRound className="w-3 h-3 inline mr-1 -mt-0.5" />
              设置登录密码后可用手机+密码登录
            </div>
            <Link
              to="/settings/password"
              className="text-[11px] text-[hsl(26_90%_49%)] hover:underline mt-0.5 inline-block"
            >
              设置密码 →
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* VIP status card */}
      <Card className="border-[hsl(46_100%_52%)]/30 bg-gradient-to-br from-[hsl(46_100%_52%)/5] to-card relative overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-[hsl(46_100%_42%)]" />
              <span className="text-sm font-semibold text-foreground">VIP 会员</span>
            </div>
            <Badge
              variant="default"
              className="text-[10px] bg-[hsl(46_100%_52%)] text-[hsl(30_60%_20%)] border-0"
            >
              专业版
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground leading-5 mb-1">
            有效期至
          </div>
          <div className="text-sm font-semibold text-foreground mb-1">
            2026-10-03 13:54
          </div>
          <div className="text-[11px] text-muted-foreground/60 mb-3">
            版本号 v3.0.0
          </div>
          <Button
            size="sm"
            className="w-full bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
            onClick={onRenewClick ?? (() => navigate('/settings/vip'))}
          >
            <Zap className="w-3.5 h-3.5" />
            续费 / 购买
          </Button>
        </CardContent>
      </Card>

      {/* Onboarding card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-card relative overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <GraduationCap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">新手引导</span>
          </div>
          <p className="text-xs text-muted-foreground leading-5 mb-3">
            1 分钟快速了解核心功能，带您玩转矩效 Matrix
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={onOnboardingClick}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重新查看引导
          </Button>
        </CardContent>
      </Card>

      {/* Customer service card */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Headphones className="w-4 h-4 text-primary" />
            联系客服
          </h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                <QrCode className="w-10 h-10 text-foreground/40" />
              </div>
              <div className="text-xs text-muted-foreground leading-4">
                扫码添加
                <br />
                <span className="text-foreground font-medium">客服微信</span>
                <br />
                7×24小时服务
              </div>
            </div>
            <div className="w-full h-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                <QrCode className="w-10 h-10 text-foreground/40" />
              </div>
              <div className="text-xs text-muted-foreground leading-4">
                关注视频号
                <br />
                <span className="text-foreground font-medium">查看教程</span>
                <br />
                每周更新
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RightSidebar;
