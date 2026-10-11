import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Send,
  MessageCircle,
  Bot,
  BarChart3,
  Settings,
  BookOpen,
  Shield,
  Search,
  Crown,
  LogOut,
  User,
  ChevronDown,
  Megaphone,
  Eye,
  MessageSquareText,
  FileText,
  PlaySquare,
  ListVideo,
  MessageSquare,
  UserPlus,
  Activity,
  Monitor,
  Mail,
  ListOrdered,
  Bell,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@client/src/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import NotificationCenter from '@client/src/components/notification/NotificationCenter';
import PersonalTaskReminder from '@/components/notification/PersonalTaskReminder';
import { clearAuthToken, getAuthToken, getUser } from '@client/src/api';
import { Globe2 } from 'lucide-react';
import { OfficialWorkspaceDeck, OfficialWorkspaceProvider, useOfficialWorkspace, WorkspaceTabs } from '@/components/workspace/OfficialWorkspace';

interface SubMenuItem {
  to: string;
  label: string;
}

interface MenuGroup {
  label: string;
  icon?: typeof LayoutDashboard;
  items: SubMenuItem[];
}

interface TopMenuItem {
  label: string;
  icon: typeof LayoutDashboard;
  basePath: string;
  groups: MenuGroup[];
}

const topMenuItems: TopMenuItem[] = [
  {
    label: '首页',
    icon: LayoutDashboard,
    basePath: '/dashboard',
    groups: [{ label: '工作台', items: [{ to: '/dashboard', label: '数据总览' }] }],
  },
  {
    label: '账号管理',
    icon: Users,
    basePath: '/accounts',
    groups: [
      { label: '账号管理', items: [{ to: '/accounts', label: '账号列表' }] },
      { label: '账号分组', items: [{ to: '/accounts/groups', label: '分组管理' }] },
    ],
  },
  {
    label: '一键发布',
    icon: Send,
    basePath: '/publish',
    groups: [
      {
        label: '内容发布',
        items: [
          { to: '/publish/create', label: '发条单视频' },
          { to: '/publish/batch-video', label: '批量发视频' },
          { to: '/publish/batch-image', label: '批量发图文' },
        ],
      },
      {
        label: '内容管理',
        items: [
          { to: '/publish/drafts', label: '本地草稿箱' },
          { to: '/publish/tasks', label: '任务记录' },
          { to: '/publish/stats', label: '任务统计' },
        ],
      },
    ],
  },
  {
    label: '粉丝互动',
    icon: MessageCircle,
    basePath: '/engage',
    groups: [
      {
        label: '评论',
        icon: MessageSquareText,
        items: [
          { to: '/engage/comments', label: '评论管理' },
          { to: '/engage/comments-agg', label: '评论聚合' },
          { to: '/engage/auto-comment', label: '评论回复待办' },
          { to: '/engage/batch-tasks', label: '批量任务' },
        ],
      },
      {
        label: '私信',
        icon: MessageSquare,
        items: [
          { to: '/engage/messages', label: '私信管理' },
          { to: '/engage/messages-agg', label: '私信聚合' },
          { to: '/engage/auto-message', label: '私信回复待办' },
        ],
      },
      {
        label: '粉丝',
        icon: UserPlus,
        items: [
          { to: '/engage/followers', label: '粉丝管理' },
          { to: '/engage/follower-monitor', label: '粉丝监控' },
        ],
      },
      {
        label: '自动化',
        icon: Bot,
        items: [
          { to: '/automation/keywords', label: '关键词回复' },
          { to: '/automation/welcome', label: '欢迎语' },
          { to: '/automation/offline', label: '离线回复' },
          { to: '/automation/monitor', label: '监控任务' },
          { to: '/automation/active-messages', label: '个人操作待办' },
          { to: '/automation/templates', label: '消息模板' },
        ],
      },
    ],
  },
  {
    label: '数据中心',
    icon: BarChart3,
    basePath: '/analytics',
    groups: [
      {
        label: '作品监控',
        items: [
          { to: '/analytics', label: '作品监控' },
          { to: '/analytics/flow', label: '播放流速' },
        ],
      },
      {
        label: '账号与通知',
        items: [
          { to: '/analytics/account-monitor', label: '账号会话检查' },
          { to: '/analytics/notify-monitor', label: '待办提醒' },
        ],
      },
      {
        label: '合规与草稿',
        items: [
          { to: '/analytics/violation', label: '作品违规' },
          { to: '/analytics/drafts', label: '本地草稿管理' },
        ],
      },
    ],
  },
  {
    label: '文档中心',
    icon: BookOpen,
    basePath: '/docs',
    groups: [
      {
        label: '产品文档',
        items: [
          { to: '/docs/overview', label: '产品框架' },
          { to: '/docs/requirements', label: '功能需求' },
          { to: '/docs/non-functional', label: '非功能需求' },
          { to: '/docs/roadmap', label: '扩展路线图' },
          { to: '/docs/testing', label: '测试方案' },
          { to: '/docs/platforms', label: '平台接入指南' },
        ],
      },
    ],
  },
  {
    label: '设置',
    icon: Settings,
    basePath: '/settings',
    groups: [
      {
        label: '账户设置',
        items: [
          { to: '/settings/profile', label: '个人资料' },
          { to: '/settings/password', label: '修改密码' },
          { to: '/settings/vip', label: 'VIP 状态' },
          { to: '/settings/logins', label: '登录记录' },
          { to: '/settings/notify', label: '消息通知' },
          { to: '/settings/theme', label: '主题偏好' },
          { to: '/settings/data', label: '数据与备份' },
        ],
      },
    ],
  },
];

const UserLayoutContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useOfficialWorkspace();
  const user = getUser();

  // 鉴权：未登录则跳转登录页
  if (!getAuthToken()) {
    return <Navigate to="/login" replace />;
  }
  const vipActive = user?.vipStatus === 'active';

  const getActiveTopMenu = (): string => {
    const path = location.pathname;
    if (path.startsWith('/automation')) return '/engage';
    for (const item of topMenuItems) {
      if (path === item.basePath || path.startsWith(item.basePath + '/')) {
        return item.basePath;
      }
    }
    if (path.startsWith('/docs')) return '/docs';
    if (path.startsWith('/settings')) return '/settings';
    return '/dashboard';
  };

  const activeTopMenu = getActiveTopMenu();
  const activeMenu = topMenuItems.find((m) => m.basePath === activeTopMenu) || topMenuItems[0];
  const showSidebar = activeMenu.groups.reduce((count, group) => count + group.items.length, 0) > 1;

  const handleLogout = () => {
    clearAuthToken();
    navigate('/login');
  };

  return (
      <div className="matrix-shell h-screen bg-background flex flex-col overflow-hidden">
      {/* Top navigation bar */}
      <header className="matrix-topbar h-14 bg-card border-b border-border flex items-center px-4 gap-2 z-30 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-6">
          <div className="matrix-brand-icon w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shrink-0">
            <PlaySquare className="w-4 h-4" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold text-foreground leading-tight truncate">
              矩效 Matrix
            </span>
          </div>
        </div>

        {/* Top menu */}
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
          {topMenuItems.map((item) => {
            const isActive = activeTopMenu === item.basePath;
            return (
              <NavLink
                key={item.basePath}
                onClick={workspace.hide}
                to={item.groups[0]?.items[0]?.to || item.basePath}
                end
                className={({ isActive: linkActive }) =>
                  cn(
                    'flex items-center gap-1.5 h-9 px-3 rounded-md text-sm transition-colors whitespace-nowrap',
                    'hover:bg-sidebar-accent/60 hover:text-foreground',
                    (isActive || linkActive)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground/70'
                  )
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Right section */}
        <div className="flex items-center gap-2 ml-auto">
          {vipActive ? (
            <Badge variant="default" className="gap-1 bg-[hsl(46_100%_52%)] text-[hsl(30_60%_20%)] border-[hsl(46_100%_40%)]">
              <Crown className="w-3 h-3" />
              VIP
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              未激活
            </Badge>
          )}

          <PersonalTaskReminder />
          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 p-1 h-auto">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={user?.avatarUrl || ''} />
                  <AvatarFallback>{(user?.nickname || user?.username || '用').slice(0, 1)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <div className="text-sm font-medium">{user?.nickname || user?.username || '个人用户'}</div>
                <div className="text-xs text-muted-foreground">{user?.email || '个人创作工作区'}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
                <User className="w-4 h-4" />
                个人设置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/docs/overview')}>
                <BookOpen className="w-4 h-4" />
                文档中心
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <WorkspaceTabs />

      {/* Main body: sidebar + content */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar with groups */}
        {showSidebar && (
          <aside className="matrix-module-sidebar w-52 bg-card border-r border-border flex flex-col shrink-0 overflow-y-auto">
            <div className="py-3 px-2 space-y-4">
              {activeMenu.groups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    {group.icon && <group.icon className="w-3 h-3" />}
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((subItem) => (
                      <NavLink
                        key={subItem.to}
                        to={subItem.to}
                        end
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 h-8 px-3 rounded text-sm transition-colors',
                            'hover:bg-sidebar-accent/60 hover:text-foreground',
                            isActive
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-foreground/70'
                          )
                        }
                      >
                        <span className="truncate">{subItem.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Content area */}
        <main className={`matrix-main flex-1 min-w-0 min-h-0 ${workspace.visible ? 'matrix-main-browser' : ''} ${workspace.visible && activeTopMenu !== '/accounts' ? 'matrix-main-integrated' : ''}`}>
          <div className="matrix-page-content" hidden={workspace.visible && activeTopMenu === '/accounts'}><Outlet /></div>
          <OfficialWorkspaceDeck />
        </main>
      </div>

      {/* VIP banner (if inactive) */}
      {!vipActive && !workspace.visible && (
        <div className="bg-gradient-to-r from-primary to-primary/80 text-white py-3 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <Crown className="w-5 h-5" />
            <span>您尚未激活 VIP，激活后可使用全部功能</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate('/activate')}>
            立即激活
          </Button>
        </div>
      )}
    </div>
  );
};

const UserLayout = () => <OfficialWorkspaceProvider><UserLayoutContent /></OfficialWorkspaceProvider>;

export default UserLayout;
