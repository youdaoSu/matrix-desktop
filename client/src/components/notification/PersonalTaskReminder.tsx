import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { axiosForBackend } from '@/api';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';

export default function PersonalTaskReminder() {
  const [count, setCount] = useState<number | null>(null);
  const workspace = useOfficialWorkspace();
  useEffect(() => {
    let active = true, inFlight = false;
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try { const r = await axiosForBackend.get('/api/personal/tasks', { params: { dueOnly: true, pageSize: 1 } }); if (active) setCount(r.data.data.total); }
      catch { if (active) setCount(null); }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const update = () => void refresh();
    window.addEventListener('matrix:personal-tasks-updated', update);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('matrix:personal-tasks-updated', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <Link to="/analytics/notify-monitor" onClick={workspace.hide} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted" title="提醒只在矩效运行并登录时显示，不自动执行平台操作" aria-label="查看个人待办提醒"><Clock3 size={16} /><span>{count === null ? '提醒不可用' : count ? `${count} 条到期待办` : '待办提醒'}</span></Link>;
}
