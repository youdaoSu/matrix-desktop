import type { PlatformType } from './api.interface';
import type { FollowerCoverage } from './account-metrics';

export interface AccountDataAuditRow {
  accountId:string;
  platform:PlatformType;
  nickname:string;
  sessionId?:string;
  followers:number|null;
  observedAt?:string;
  cachedValue?:number;
  source?:'douyin-self-profile'|'douyin-creator-profile'|'rendered-own-counter';
  status:'current'|'stale'|'legacy'|'missing'|'duplicate';
  included:boolean;
  duplicateOf?:string;
  lastAttemptAt?:string;
  error?:string;
}
export interface AccountDataAudit {coverage:FollowerCoverage;rows:AccountDataAuditRow[];capturedAt:string;}
