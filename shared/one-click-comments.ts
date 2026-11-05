export type CommentCommand='auto-review'|'snapshot'|'save-set'|'delete-set'|'preview'|'start'|'pause'|'cancel'|'single-state'|'single-preview'|'single-start'|'single-cancel'|'single-recheck';
export type SingleCommentSource={kind:'cached-work';accountId:string;workId:string}|{kind:'receipt';accountId:string;receiptId:string};
export interface SingleCommentState {target:{accountId:string;accountName:string;platform:string;workId:string;title:string;workUrl:string};running:boolean;batches:CommentBatch[]}
export interface CommentSet {id:string;name:string;comments:string[]}
export interface CommentRow {id:string;accountId:string;accountName:string;text:string;status:'queued'|'sending'|'sent'|'failed'|'unknown'|'skipped'|'cancelled';detail:string;commentId?:string;startedAt?:number;completedAt?:number;reviewProgress?:{attempts:number;lastAt?:number;nextAt?:number};visibility?:{state:'author-visible'|'not-observed'|'unverified';checkedAt:number}}
export interface CommentBatch {id:string;receiptId:string;primaryId:string;platform:string;workId:string;workUrl:string;title:string;setName:string;status:'preview'|'running'|'stopping'|'paused'|'attention'|'completed'|'cancelled';createdAt:number;expiresAt:number;rows:CommentRow[];detail?:string}
export interface CommentSnapshot {sets:CommentSet[];batches:CommentBatch[];running:boolean}
export interface CommentRequest {accessToken:string;command:CommentCommand;args?:unknown}
export interface CommentResponse {result?:unknown;error?:string}
