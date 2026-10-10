import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { BookOpen, Search, ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';

const docItems = [
  { to: '/docs/overview', label: '产品框架总览' },
  { to: '/docs/requirements', label: '功能需求清单' },
  { to: '/docs/non-functional', label: '非功能需求' },
  { to: '/docs/roadmap', label: '扩展路线图' },
  { to: '/docs/testing', label: '测试方案' },
  { to: '/docs/platforms', label: '平台接入指南' },
];

const DocsLayout = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  return (
    <div className="matrix-secondary-shell matrix-docs-shell min-h-screen flex">
      {/* Left sidebar */}
      <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground leading-tight">
              文档中心
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Matrix Docs
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-sidebar-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="搜索文档..."
              className="pl-8 h-8 text-sm bg-background"
            />
          </div>
        </div>

        {/* Doc nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {docItems.filter(item => item.label.includes(search.trim())).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 h-8 px-3 rounded-md text-sm transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/80',
                ].join(' ')
              }
            >
              <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-6 gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="hover:text-foreground cursor-pointer" onClick={() => navigate('/dashboard')}>
              工作台
            </span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-foreground font-medium">文档中心</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
              返回工作台
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-8 max-w-3xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DocsLayout;
