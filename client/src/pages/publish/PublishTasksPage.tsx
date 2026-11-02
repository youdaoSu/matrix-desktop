import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PublishQueuePanel } from '@/components/workspace/PublishQueue';
import { PageActionHistory } from '@/components/workspace/PageActionPanel';
export default function PublishTasksPage() {
  const navigate = useNavigate();
  return <div className="matrix-task-page" data-matrix-publish-tasks><PublishQueuePanel /><details className="matrix-task-audit"><summary>官方操作回执（独立留档）</summary><div className="flex gap-2 py-2"><Button variant="outline" onClick={() => navigate('/engage/manual-tasks')}>追评 / 人工待办</Button><Button onClick={() => navigate('/publish/create')}>新建发布</Button></div><PageActionHistory /></details></div>;
}
