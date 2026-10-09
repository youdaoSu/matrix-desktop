import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  KeyRound,
  CreditCard,
  ScrollText,
  Settings,
  ArrowLeft,
  Shield,
  LogOut,
} from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,

} from '@client/src/components/ui/dropdown-menu';
import { getAdminToken } from '@client/src/api';

const menuItems = [
  { to: '/admin/dashboard', label: '运营总览', icon: LayoutDashboard },
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/codes', label: '授权码管理', icon: KeyRound },
  { to: '/admin/plans', label: '套餐管理', icon: CreditCard },
  { to: '/admin/logs', label: '操作日志', icon: ScrollText },
  { to: '/admin/settings', label: '系统配置', icon: Settings },
];

const AdminLayout = () => {
  const navigate = useNavigate();

  // 鉴权：没有管理员令牌则跳转登录页
  if (!getAdminToken()) {
    return <Navigate to="/admin/login" replace />;
  }

  const handleLogout = () => {
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-[hsl(220_20%_98%)] flex">
      {/* Sidebar - dark style */}
      <aside className="w-60 bg-[hsl(220_14%_14%)] text-[hsl(220_14%_90%)] flex flex-col h-screen sticky top-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-white/10 gap-2">
          <div className="w-8 h-8 rounded-lg bg-[hsl(221_83%_53%)] flex items-center justify-center text-white">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">管理后台</span>
            <span className="text-[10px] text-white/50 leading-tight">
              Matrix Admin
            </span>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 h-9 px-3 rounded-md text-sm transition-colors',
                  'hover:bg-white/10 hover:text-white',
                  isActive
                    ? 'bg-[hsl(221_83%_53%)] text-white font-medium'
                    : 'text-white/70',
                ].join(' ')
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom: back to user end */}
        <div className="border-t border-white/10 py-3 px-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-3 h-9 px-3 rounded-md text-sm text-white/70 hover:bg-white/10 hover:text-white w-full transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>返回用户端</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-6 gap-4 sticky top-0 z-30">
          <div className="text-lg font-semibold text-foreground">管理后台</div>

          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 p-1 h-auto">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-primary text-white">
                      管
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline">
                    管理员
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
                  <Settings className="w-4 h-4" />
                  系统配置
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

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-[1280px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
