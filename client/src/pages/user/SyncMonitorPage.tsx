import { Link } from 'react-router-dom';
import DesktopRecordOverview from '@/components/workspace/DesktopRecordOverview';
export default function SyncMonitorPage() {
  return <div className="matrix-analytics matrix-interaction-tool-page space-y-5"><header className="matrix-data-heading"><div><h1>同步监控</h1><p>查看当前用户已有采集结果与各账号状态；不会从本页额外发起官网采集。</p></div><Link to="/settings/capabilities">接入范围与已知限制 ↗</Link></header><DesktopRecordOverview /><div className="matrix-data-panel"><h2>需要处理异常时</h2><p className="matrix-data-note">在相应功能页选择账号可优先继续采集。权限或登录问题统一去账号管理，不清缓存、不反复重试。</p><div className="matrix-data-actions"><Link to="/engage/auto-message?panel=monitor">自动私信监控 ↗</Link><Link to="/engage/auto-comment?panel=monitor">自动评论监控 ↗</Link><Link to="/engage/comments">评论管理 ↗</Link><Link to="/engage/messages">私信管理 ↗</Link><Link to="/engage/followers">粉丝管理 ↗</Link><Link to="/accounts">账号管理 ↗</Link></div></div></div>;
}
