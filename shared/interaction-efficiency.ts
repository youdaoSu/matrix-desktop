export interface LocalInteractionCounts { messageTotal: number; messageUnread: number; commentTotal: number; commentReplied: number }
export function localInteractionEfficiency(counts: LocalInteractionCounts) {
  const valid = (value: number) => Number.isSafeInteger(value) && value >= 0;
  const commentsValid = valid(counts.commentTotal) && valid(counts.commentReplied) && counts.commentReplied <= counts.commentTotal;
  return {
    scope: 'local-synced-records' as const,
    // There is no per-message reply link or verified reply-duration sample in
    // this schema. Unread is not unreplied; never estimate a ratio or duration.
    avgReplyTimeMinutes: null,
    messageReplyRate: null,
    commentReplyRate: commentsValid && counts.commentTotal > 0 ? Number((counts.commentReplied * 100 / counts.commentTotal).toFixed(1)) : null,
    observed: {
      messages: valid(counts.messageTotal) ? counts.messageTotal : null,
      unreadInboundMessages: valid(counts.messageUnread) && valid(counts.messageTotal) && counts.messageUnread <= counts.messageTotal ? counts.messageUnread : null,
      comments: commentsValid ? counts.commentTotal : null,
      repliedComments: commentsValid ? counts.commentReplied : null,
    },
    unavailableReasons: {
      avgReplyTimeMinutes: '尚无可核对的回复耗时样本，不生成估算时长',
      messageReplyRate: '缺少逐条私信回复关联，已读或未读不能代表已回复或未回复',
      ...(!commentsValid ? { commentReplyRate: '本地评论计数不一致，暂不计算回复率' } : counts.commentTotal === 0 ? { commentReplyRate: '尚无已同步的本地评论记录' } : {}),
    },
  };
}
