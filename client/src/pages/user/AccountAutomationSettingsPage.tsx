import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useWorkspaceIdentity } from '@/components/workspace/WorkspaceUiState';
import { operationsCall } from '@/components/workspace/account-operations-client';
import type { OperationsCommand, OperationsSnapshot } from '@shared/account-operations';
import { OperationsConnections } from './OperationsConnections';
import './account-operations.css';

export default function AccountAutomationSettingsPage(){const owner=useWorkspaceIdentity();return <AccountSettings key={owner}/>;}
function AccountSettings(){
 const [data,setData]=useState<OperationsSnapshot>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const live=useRef(true),locked=useRef(false);
 const read=async()=>{const next=await operationsCall('snapshot',{inbox:{offset:0,limit:1},replies:{offset:0,limit:1},outreach:{offset:0,limit:1}}) as OperationsSnapshot;if(live.current)setData(next);};
 const run=async(command:OperationsCommand,args?:unknown)=>{if(locked.current)throw Error('正在处理上一步');locked.current=true;setBusy(true);setError('');try{const result=await operationsCall(command,command==='snapshot'?{inbox:{offset:0,limit:1},replies:{offset:0,limit:1},outreach:{offset:0,limit:1}}:args);if(command==='snapshot'){if(live.current)setData(result as OperationsSnapshot);}else await read();return result;}catch(e){if(live.current)setError(e instanceof Error?e.message:'账号设置读取失败');throw e;}finally{locked.current=false;if(live.current)setBusy(false);}};
 useEffect(()=>{live.current=true;void run('snapshot',{inbox:{offset:0,limit:1},replies:{offset:0,limit:1},outreach:{offset:0,limit:1}}).catch(()=>{});return()=>{live.current=false;};},[]);
 return <div className="ops-page"><header className="ops-header"><div><h1>主账号与协作分工</h1><p>按平台设置账号分工和官网连接。保存账号分工不会创建计划或发送消息。</p></div><Button disabled={busy} variant="outline" onClick={()=>void run('snapshot',{}).catch(()=>{})}>刷新账号设置</Button></header>
  <p><Link to="/accounts">返回账号工作区</Link> · <Link to="/engage/auto-message">查看自动私信计划</Link></p>
  {error&&<p role="alert">{error}</p>}{!data&&!error&&<p>正在读取账号…</p>}
  <OperationsConnections data={data} busy={busy} run={run}/>
 </div>;
}
