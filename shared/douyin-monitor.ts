export function displayedCommentTime(value: string | undefined, capturedAt: string): number | undefined {
  const text=(value||'').split('·')[0].trim(), captured=Date.parse(capturedAt);
  if (!Number.isFinite(captured)) return;
  if (text==='刚刚') return captured;
  const relative=/^(\d+)(秒|分钟|小时|天)前$/.exec(text);
  if (relative) return captured-Number(relative[1])*({秒:1000,分钟:60000,小时:3600000,天:86400000}[relative[2]]||0);
  const dated=/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/.exec(text);
  if (dated) { const time=Date.parse(`${dated[1]}-${dated[2]}-${dated[3]}T${dated[4]||'00'}:${dated[5]||'00'}:00+08:00`); if(Number.isFinite(time)) return time; }
}
