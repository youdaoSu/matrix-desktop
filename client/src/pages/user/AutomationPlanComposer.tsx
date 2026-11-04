import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AutomationPlanComposer({kind,onKind,busy,editing,defaultChannel,form,modes,limits}:{kind:string;onKind(value:string):void;busy:boolean;editing:boolean;defaultChannel:string;form:ReactNode;modes:ReactNode;limits:ReactNode}) {
 return <div aria-label="自动化计划配置">
  {!editing&&<section className="ops-card"><label className="ops-field">要自动完成什么？<select aria-label="新建计划类型" value={kind} disabled={busy} onChange={e=>onKind(e.target.value)}>
   <option value="reply">{defaultChannel==='comment'?'收到评论后公开回复':'收到私信后自动回复'}</option>
   <option value="first-message">首次收到私信时回复</option>
   <option value="follow">有人新关注时发欢迎语</option>
   <option value="own-fans">给未联系粉丝发欢迎语（抖音）</option>
   <option value="comment-dm">评论命中关键词后由本人账号发私信（抖音）</option>
   <option value="keyword-routes">评论命中关键词后分配协作账号发私信（抖音）</option>
  </select></label><p className="ops-muted">先配置，再核对启用。打开表单和切换类型不会发送消息。</p></section>}
  <p className="ops-muted">账号平台、主账号和协作分工在 <Link to="/accounts/automation">账号管理 → 主账号与协作分工</Link> 设置。</p>
  {form}
  {kind!=='own-fans'&&kind!=='keyword-routes'&&<details className="ops-card"><summary>自动执行开关（同账号、同渠道的所有计划共用）</summary>{modes}</details>}
  <details className="ops-card"><summary>全局发送时段与额度（对所有计划生效）</summary>{limits}</details>
 </div>;
}
