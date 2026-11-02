import { useEffect, useRef, useState } from 'react';
import { checkPublishMedia, type PublishMediaCheckProgress, type PublishPreflightTarget } from '@shared/publish-preflight';
import { Button } from '@/components/ui/button';

// Cancelling this read-only phase never uploads, cancels a platform operation,
// creates a task or discards editor state. Late IPC results are ignored.
export function usePublishMediaCheck(scope: string) {
  const active = useRef<AbortController | undefined>(undefined), mounted = useRef(true);
  const activeScope = useRef(scope);
  const [progress, setProgress] = useState<PublishMediaCheckProgress>();
  useEffect(() => { mounted.current=true;return () => { mounted.current=false;active.current?.abort(); }; }, []);
  useEffect(() => () => { if (activeScope.current===scope) active.current?.abort(); }, [scope]);
  const check = async (targets: PublishPreflightTarget[], validate: Parameters<typeof checkPublishMedia>[1], current: () => boolean) => {
    if (active.current) throw Error('发布前检查正在进行，请勿重复点击');
    const controller = new AbortController(); active.current=controller;activeScope.current=scope;
    try { return await checkPublishMedia(targets, validate, current, 15000, { signal:controller.signal,totalTimeoutMs:30000,onProgress:value => { if (mounted.current && active.current===controller) setProgress(value); } }); }
    finally { controller.abort(); if (active.current===controller) { active.current=undefined; if (mounted.current) setProgress(undefined); } }
  };
  return { check,progress,cancel:() => active.current?.abort() };
}

export function PublishPreflightStatus({ progress, cancel }: { progress?: PublishMediaCheckProgress; cancel(): void }) {
  if (!progress) return null;
  return <section className="matrix-preflight-status" data-publish-preflight-status>
    <div role="status"><strong>正在检查本地素材与封面：{progress.done}/{progress.total} 组</strong><small>尚未上传，也未创建发布任务；最多等待30秒。取消会保留已填内容。</small></div>
    <Button variant="outline" size="sm" onClick={cancel}>取消检查</Button>
  </section>;
}
