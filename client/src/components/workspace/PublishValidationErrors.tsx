import { publishPreflightMessage, type PublishPreflightIssue } from '@shared/publish-preflight';
import { useEffect, useRef } from 'react';

export function PublishValidationErrors({ issues }: { issues: PublishPreflightIssue[] }) {
  const region = useRef<HTMLElement>(null);
  useEffect(() => { if (issues.length) { region.current?.focus({ preventScroll: true }); region.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, [issues]);
  if (!issues.length) return null;
  return <section ref={region} role="alert" className="matrix-publish-alert" data-publish-preflight-errors tabIndex={-1}>
    <strong>请先补全以下信息；尚未创建发布任务</strong>
    <ul className="list-disc pl-5 mt-2 space-y-1">{issues.map((issue, index) => <li key={index} data-preflight-field={issue.field}>{publishPreflightMessage(issue)}</li>)}</ul>
  </section>;
}
