import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// Manual metadata only. No recurring polling, local storage or page access.
export function DesktopPerformancePanel() {
  const [snapshot,setSnapshot]=useState<MatrixPerformanceSnapshot>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(false),pending=useRef(false);
  useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const read=async()=>{
    if(pending.current)return;pending.current=true;setBusy(true);setError('');
    try{
      if(!window.matrixDesktop?.systemSettings)throw Error('请在新版远效桌面端使用');
      const result=await window.matrixDesktop.systemSettings({command:'performance'});
      if(!alive.current)return;if(result.error)throw Error(result.error);if(!result.performance)throw Error('当前版本未提供性能概览');setSnapshot(result.performance);
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'性能概览读取失败');}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  };
  const labels={main:'主进程',renderer:'页面渲染',gpu:'图形进程',utility:'辅助进程',other:'其他进程'};
  return <section aria-label="远效性能概览" className="space-y-2 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-medium">本机性能概览</h3><p className="text-xs text-muted-foreground">仅手动读取远效自身的数字统计，不读取网页内容、登录信息，不修改限速或无障碍设置。</p></div><Button variant="outline" disabled={busy||!window.matrixDesktop?.systemSettings} onClick={()=>void read()}>读取远效性能概览</Button></div>
    {error&&<p role="alert">{error}</p>}
    {snapshot&&<div role="status" aria-label="远效性能采样结果" className="space-y-1 text-xs">
      <p>远效性能：页面 {snapshot.pages.total} 个，内嵌页 {snapshot.pages.webviews} 个，关闭后台限速 {snapshot.pages.unthrottled} 个，加载中 {snapshot.pages.loading} 个；显示窗口 {snapshot.windows.visible} 个，隐藏窗口 {snapshot.windows.hidden} 个。</p>
      {snapshot.groups.map(group=><p key={group.type}>{labels[group.type]}：{group.processes} 个；CPU {group.cpuPercent===null?'待二次采样':group.cpuPercent+'%'}；私有内存 {group.privateMiB===null?'未提供':group.privateMiB+' MiB'}；工作集 {group.workingMiB===null?'未提供':group.workingMiB+' MiB'}。</p>)}
      <p>{snapshot.sampleReady?'CPU 为 Electron 两次读取间的平均值，不是拖动延迟测试。':'首次仅建立 CPU 基线，请至少间隔 5 秒后再点击一次。'}{snapshot.cached?' 当前为 5 秒内的缓存采样。':''}{snapshot.truncated?' 统计达到数量上限，结果不是全量。':''}</p>
      <p>仅统计 Electron 管理的进程，不含内置数据库及部分独立子进程。</p>
    </div>}
  </section>;
}
