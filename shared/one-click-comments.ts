export type CommentCommand='snapshot'|'save-set'|'delete-set'|'preview'|'start'|'pause'|'cancel';
export interface CommentSet {id:string;name:string;comments:string[]}
export interface CommentRow {id:string;accountId:string;accountName:string;text:string;status:'queued'|'sending'|'sent'|'failed'|'unknown'|'skipped'|'cancelled';detail:string;commentId?:string;startedAt?:number;completedAt?:number}
export interface CommentBatch {id:string;receiptId:string;primaryId:string;platform:string;workId:string;workUrl:string;title:string;setName:string;status:'preview'|'running'|'stopping'|'paused'|'attention'|'completed'|'cancelled';createdAt:number;expiresAt:number;rows:CommentRow[];detail?:string}
export interface CommentSnapshot {sets:CommentSet[];batches:CommentBatch[];running:boolean}
export interface CommentRequest {accessToken:string;command:CommentCommand;args?:unknown}
export interface CommentResponse {result?:unknown;error?:string}
