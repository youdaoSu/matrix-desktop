import { Link } from 'react-router-dom';

export function InteractionTaskNotice({ pageName }: { pageName: string }) {
  return <p className="matrix-interaction-hint"><strong>{pageName} · 人工待办模式</strong> 下表只记录本人操作待办，不是自动运行计划或平台回执；不会因进入本页而发送评论或私信。自动回复规则和运行开关在 <Link to="/engage/account-operations">账号运营</Link> 中独立配置；两处记录不会自动转换，平台和账号能力以该页面为准。</p>;
}
