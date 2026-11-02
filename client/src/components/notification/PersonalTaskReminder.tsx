import { useEffect, useRef, useState } from 'react';
import { useAppPreferences } from '@/contexts/AppPreferences';
import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { useWorkspaceIdentity } from '@/components/workspace/WorkspaceUiState';

export default function PersonalTaskReminder() {
  const lease = useWorkspaceIdentity();
  const [snapshot, setSnapshot] = useState<{lease:string; count:number|null}>({lease:'',count:null});
  const count = snapshot.lease === lease ? snapshot.count : null;
  const workspace = useOfficialWorkspace();
  const preferences = useAppPreferences(), previous = useRef<{lease:string;count:number}|null>(null);
  useEffect(() => {
    if (!preferences.dueReminders || !lease) return;
    let active = true, inFlight = false;
    let controller: AbortController | undefined;
    const current = () => active && JSON.stringify([getUser()?.id, getAuthToken()]) === lease;
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const signal = controller.signal;
      let cancelled: (() => void) | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => { cancelled = () => reject(Error('提醒读取已取消')); signal.addEventListener('abort', cancelled, {once:true}); timeout = setTimeout(() => controller?.abort(), 20000); });
        const r = await Promise.race([axiosForBackend.get('/api/personal/tasks', { params: { dueOnly: true, pageSize: 1 }, signal }), deadline]);
        const next = r.data?.data?.total;
        if (!Number.isSafeInteger(next) || next < 0) throw Error('提醒数量无效');
        if (current()) { setSnapshot({lease,count:next}); if (next>0 && (previous.current?.lease!==lease || next>previous.current.count) && preferences.desktopAlerts) void window.matrixDesktop?.systemSettings?.({command:'notify',category:'reminder'}); previous.current={lease,count:next}; }
      } catch { if (current()) setSnapshot({lease,count:null}); }
      finally { clearTimeout(timeout); if(cancelled) signal.removeEventListener('abort', cancelled); inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const update = () => void refresh();
    window.addEventListener('matrix:personal-tasks-updated', update);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener('matrix:personal-tasks-updated', update); document.removeEventListener('visibilitychange', update); };
  }, [lease, preferences.dueReminders, preferences.desktopAlerts]);
  if (!preferences.dueReminders) return null;
  return <Link to="/analytics/notify-monitor" onClick={workspace.hide} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted" title="提醒只在远效运行并登录时显示，不自动执行平台操作" aria-label="查看个人待办提醒"><Clock3 size={16} /><span>{count === null ? '提醒不可用' : preferences.unreadBadges && count ? `${count} 条到期待办` : '待办提醒'}</span></Link>;
}
