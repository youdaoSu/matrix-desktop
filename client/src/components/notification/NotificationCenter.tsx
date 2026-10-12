import { useState, useMemo, useEffect, useCallback } from 'react';
import { axiosForBackend } from '@/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Search,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import {
  ScrollArea,
} from '@client/src/components/ui/scroll-area';
import {
  notificationFilterTabs,
  getNotificationTypeMeta,
} from '@client/src/pages/user/dashboard-data';
import type { Notification, NotificationType } from '@shared/api.interface';
import { cn } from '@/lib/utils';
import { useAppPreferences } from '@/contexts/AppPreferences';

interface NotificationCenterProps {
  className?: string;
}

const NotificationCenter = ({ className }: NotificationCenterProps) => {
  const navigate = useNavigate();
  const preferences = useAppPreferences();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadError, setLoadError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await axiosForBackend.get('/api/notifications', { params: { page: 1, pageSize: 100 } });
      setNotifications(response.data?.data?.items || []);
      setLoadError(false);
    } catch { setLoadError(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, open]);
  const [activeTab, setActiveTab] = useState<string>('all');

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => n.type === activeTab);
  }, [notifications, activeTab]);

  const handleMarkAllRead = async () => {
    try { await axiosForBackend.post('/api/notifications/read-all'); }
    catch { toast.error('标记已读失败，请重试'); return; }
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true }))
    );
  };

  const handleNotificationClick = async (notification: Notification) => {
    try { await axiosForBackend.post(`/api/notifications/${notification.id}/read`); }
    catch { toast.error('标记已读失败，请重试'); return; }
    // 标记为已读
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
    );
    setOpen(false);

    // 根据类型跳转到对应模块
    const navigateMap: Record<string, string> = {
      system: '/settings/profile',
      publish_result: '/publish/tasks',
      follow_up: '/engage/comments',
      auto_message: '/automation/keywords',
      vip_expire: '/settings/vip',
      monitor_alert: '/analytics/notify-monitor',
      follower: '/engage/followers',
      violation: '/analytics/violation',
    };
    const target = navigateMap[notification.type] || '/dashboard';
    navigate(target);
  };

  const handleViewAll = () => {
    void refresh();
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          aria-label="通知"
        >
          <Bell className="w-5 h-5" />
          {preferences.unreadBadges && unreadCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] rounded-full bg-destructive text-white border-0 justify-center items-center flex font-medium"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-96 p-0 shadow-lg border border-border rounded-lg overflow-hidden bg-popover"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">通知中心</span>
            {unreadCount > 0 && (
              <Badge
                variant="default"
                className="text-[10px] h-4 min-w-4 px-1 rounded-full bg-destructive text-white border-0 justify-center items-center flex"
              >
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[hsl(26_90%_49%)] hover:text-[hsl(26_90%_45%)] hover:bg-[hsl(26_90%_49%)/8] px-2"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              全部已读
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="px-2 pt-2 border-b border-border bg-card">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full bg-muted/40 h-8">
              {notificationFilterTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-xs px-2 h-7 flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-card"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Notification list */}
        <ScrollArea className="h-[420px]">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Bell className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">暂无通知</p>
            </div>
          ) : (
            <div className="py-1">
              {filteredNotifications.map((notification) => {
                const meta = getNotificationTypeMeta(notification.type);
                const Icon = meta.icon;
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 relative',
                      !notification.isRead && 'bg-[hsl(221_83%_53%)/4] dark:bg-[hsl(221_83%_60%)/8]'
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {/* Unread indicator bar */}
                    {!notification.isRead && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                    )}
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
                          meta.color.split(' ')[1],
                          meta.color.split(' ')[0]
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <span className="text-sm font-medium text-foreground line-clamp-1">
                            {notification.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-4">
                          {notification.content}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1.5 bg-muted/60 border-0 text-muted-foreground"
                          >
                            {meta.label}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-card">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-[hsl(26_90%_49%)] hover:text-[hsl(26_90%_45%)] hover:bg-[hsl(26_90%_49%)/8] justify-center"
            onClick={handleViewAll}
          >
            {loadError ? '加载失败，点击重试' : '刷新通知'}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationCenter;
