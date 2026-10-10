import { Cable, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { OfficialActionButton } from '@/components/workspace/OfficialWorkspace';

const labels: Record<string, string> = {
  '/publish/batch-video': '批量发布视频', '/publish/batch-image': '批量发布图文',
  '/engage/comments-agg': '评论聚合', '/engage/auto-comment': '自动评论', '/engage/batch-tasks': '批量互动任务',
  '/engage/messages-agg': '私信聚合', '/engage/auto-message': '主动私信', '/engage/follower-monitor': '粉丝监控',
  '/automation/keywords': '关键词回复', '/automation/welcome': '欢迎语', '/automation/offline': '离线回复',
  '/automation/active-messages': '主动私信自动化', '/automation/monitor': '监控任务', '/automation/templates': '消息模板', '/automation/logs': '自动化日志',
  '/analytics/flow': '播放流速', '/analytics/account-monitor': '账号监控', '/analytics/notify-monitor': '通知监控',
  '/analytics/violation': '作品违规监控', '/analytics/drafts': '草稿监控', '/analytics/data-screen': '数据大屏',
};

export default function CapabilityPendingPage() {
  const { pathname } = useLocation();
  const name = labels[pathname] || '平台能力';
  return <div className="mx-auto max-w-3xl space-y-5 py-10">
    <Alert className="border-amber-500/30 bg-amber-500/5"><ShieldAlert className="h-4 w-4 text-amber-600" /><AlertDescription>自动执行能力尚未接通。日常发布、评论和私信可进入官方工作区手动完成。</AlertDescription></Alert>
    <Card><CardHeader><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Cable className="h-6 w-6 text-primary" /></div><CardTitle>{name}尚未接通平台正式接口</CardTitle></CardHeader><CardContent className="space-y-5 text-sm text-muted-foreground"><p>页面框架已经保留，但实际执行需要对应平台开放能力、应用凭证和审核通过的权限范围。只完成网页登录并不等于拥有这些接口。</p><div className="space-y-2 rounded-lg border p-4"><div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />当前已完成</div><ul className="ml-6 list-disc space-y-1"><li>账号在矩效窗口内登录</li><li>本地会话隔离保存</li><li>真实账号与业务数据库</li><li>未获批操作不会伪造成功</li></ul></div><p>取得平台权限后，可在保留当前界面的基础上接入真实同步和执行器。</p><div className="flex flex-wrap gap-2"><OfficialActionButton intent={pathname.startsWith("/publish") ? "publish" : pathname.includes("comment") ? "comments" : pathname.includes("message") ? "messages" : "manage"}>打开官方工作区</OfficialActionButton><Button asChild><Link to="/accounts">检查账号授权</Link></Button><Button variant="outline" asChild><Link to="/dashboard">返回工作台</Link></Button></div></CardContent></Card>
  </div>;
}
