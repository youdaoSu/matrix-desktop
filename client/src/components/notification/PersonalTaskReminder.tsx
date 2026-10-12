import { useEffect, useRef, useState } from 'react';
import { useAppPreferences } from '@/contexts/AppPreferences';
import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { axiosForBackend } from '@/api';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';

export default function PersonalTaskReminder() {
  const [count, setCount] = useState<number | null>(null);
  const workspace = useOfficialWorkspace();
  const preferences = useAppPreferences(), previous = useRef<number | null>(null);
  useEffect(() => {
    if (!preferences.dueReminders) { setCount(null); return; }
    let active = true, inFlight = false;
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try { const r = await axiosForBackend.get('/api/personal/tasks', { params: { dueOnly: true, pageSize: 1 } }); if (active) { const next=r.data.data.total; setCount(next); if (next>0 && (previous.current===null || next>previous.current) && preferences.desktopAlerts) void window.matrixDesktop?.systemSettings?.({command:'notify',category:'reminder'}); previous.current=next; } }
      catch { if (active) setCount(null); }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const update = () => void refresh();
    window.addEventListener('matrix:personal-tasks-updated', update);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('matrix:personal-tasks-updated', update); document.removeEventListener('visibilitychange', update); };
  }, [preferences.dueReminders, preferences.desktopAlerts]);
  if (!preferences.dueReminders) return null;
  return <Link to="/analytics/notify-monitor" onClick={workspace.hide} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted" title="提醒只在矩效运行并登录时显示，不自动执行平台操作" aria-label="查看个人待办提醒"><Clock3 size={16} /><span>{count === null ? '提醒不可用' : preferences.unreadBadges && count ? `${count} 条到期待办` : '待办提醒'}</span></Link>;
}
