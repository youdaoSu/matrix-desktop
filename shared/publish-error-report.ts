// Deliberately excludes titles, bodies, file names/paths, screenshots, DOM
// values, avatars, cookies and account sessions. Reapply on the server too.
export interface PublishErrorReport {
  schemaVersion: 1; reportId: string; taskId: string; attempt: number;
  platform: string; version: string; stage: string; executionStage: string;
  submission: string; error: string; updatedAt: string;
  history: { at: string; stage: string; message: string }[];
  verification?: { state: string; message: string; checkedAt: string };
  relatedOperations?: { operation:'followup'|'pin';status:string;message:string }[];
}
export function redactPublishError(value: unknown): string {
  return String(value ?? '').slice(0, 6000)
    .replace(/(?:set-cookie|cookie|authorization|password|passwd|access[_-]?token|refresh[_-]?token|csrf|sessdata|bili_jct|sid_guard|sessionid(?:_ss)?|secret|验证码|密码)\s*[:=：]\s*[^\n]+/gi, '[敏感信息已移除]')
    .replace(/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, '[认证信息已移除]')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[网址已移除]')
    .replace(/(?:标题|简介|正文|文案|文件名|昵称)\s*[:：]\s*[^\r\n;；]+/g, '[内容已移除]')
    .replace(/[^\s;；,:：=\\/"']+\.(?:mp4|mov|mkv|avi|jpg|jpeg|png|webp|gif)(?=\s|$|[;；,:：])/gi, '[素材名称已移除]')
    .replace(/(?:[a-z]:[\\/]|\\\\)[^\r\n;；"<>]+/gi, '[本地路径已移除]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已移除]')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 600);
}
const id = (value: unknown) => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value) ? value : '';
const atom = (value: unknown) => typeof value === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(value) ? value : 'unknown';
const date = (value: unknown) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
export function sanitizePublishErrorReport(raw: unknown): PublishErrorReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('错误报告格式无效');
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 1 || !id(value.reportId) || !id(value.taskId) || !date(value.updatedAt) || typeof value.error !== 'string' || !value.error.trim()) throw Error('错误报告缺少有效的任务、时间或错误原因');
  if (!['douyin','xiaohongshu','wechat','bilibili'].includes(String(value.platform))) throw Error('错误报告平台无效');
  if (!Array.isArray(value.history) || value.history.length > 20) throw Error('错误报告阶段记录过多');
  if(value.relatedOperations!==undefined&&(!Array.isArray(value.relatedOperations)||value.relatedOperations.length>2))throw Error('关联操作错误记录过多或格式无效');
  const related=Array.isArray(value.relatedOperations)?value.relatedOperations.map(entry=>{
    const item=entry&&typeof entry==='object'?entry as Record<string,unknown>:{};
    if(!['followup','pin'].includes(String(item.operation))||!['pending','running','save_failed','confirmed','failed','unknown'].includes(String(item.status))||typeof item.message!=='string')throw Error('关联操作错误记录无效');
    return{operation:item.operation as 'followup'|'pin',status:String(item.status),message:redactPublishError(item.message)};
  }):undefined;
  const check=value.verification&&typeof value.verification==='object'&&!Array.isArray(value.verification)?value.verification as Record<string,unknown>:undefined;
  const verification=check&&date(check.checkedAt)&&typeof check.message==='string'?{state:atom(check.state),message:redactPublishError(check.message),checkedAt:date(check.checkedAt)}:undefined;
  return { schemaVersion: 1, reportId: id(value.reportId), taskId: id(value.taskId), platform: String(value.platform),
    version: atom(value.version), stage: atom(value.stage), executionStage: atom(value.executionStage), submission: atom(value.submission),
    attempt: typeof value.attempt === 'number' && Number.isSafeInteger(value.attempt) && value.attempt > 0 && value.attempt <= 100000 ? value.attempt : 1,
    error: redactPublishError(value.error), updatedAt: date(value.updatedAt),
    history: value.history.map(entry => { const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}; return { at: date(item.at), stage: atom(item.stage), message: redactPublishError(item.message) }; }).filter(entry => entry.at),
    ...(related?.length?{relatedOperations:related}:{}),
    ...(verification?{verification}:{}),
  };
}
