import type { AutoReplyRule, MessageTemplate } from '@shared/api.interface';
import type { OperationsAccount, OperationsSnapshot } from '@shared/account-operations';

export function replyPlanAccount(accounts:OperationsSnapshot['accounts'],accountId:string):OperationsAccount {
  const matches=accounts.filter(account=>account.accountId===accountId);
  if(matches.length!==1||!['douyin','xiaohongshu'].includes(matches[0].platform))throw Error('当前账号没有唯一可用的互动绑定，请先在连接设置核对');
  return matches[0];
}
export function replyToolDraft(item:AutoReplyRule|MessageTemplate,account:OperationsAccount,text:string,templateKeywords:string[]) {
  const isRule='ruleName' in item;
  if(isRule&&item.ruleType==='offline')throw Error('离线文案不代表软件关闭后自动回复，请在软件运行时使用');
  if(isRule&&item.ruleType==='keyword'&&!['contains','exact'].includes(item.matchMode))throw Error('顺序字符匹配不能直接转为自动规则，请先改为包含或精确匹配');
  const welcome=isRule&&item.ruleType==='welcome';
  const keywords=welcome?[]:(isRule?item.keywords:templateKeywords).map(value=>value.trim()).filter(Boolean);
  const replyText=text.trim();
  if(!replyText||replyText.length>2000)throw Error('自动私信正文需为1至2000字，原文案会保留');
  if(!welcome&&!keywords.length)throw Error('请填写新计划的关键词');
  return {name:(isRule?item.ruleName:item.templateName).trim(),platform:account.platform,accountIds:[account.id],channel:'dm' as const,trigger:welcome?'first-message' as const:'message' as const,match:welcome?'any' as const:isRule&&item.matchMode==='exact'?'exact' as const:'contains' as const,keywords,replyText,replyVariants:[],enabled:false,priority:0,cooldownMinutes:60,delaySeconds:15};
}
