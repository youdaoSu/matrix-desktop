declare module '*.css';
interface MatrixFollowerResponseFacts { responseStatus:number;responseMime:number;responseEncoding:number;responseReadError:number;responseBytes:number;responseBodyKind:number;responseJsonValid:boolean;responseRosterShape:boolean;responseApiAccepted:boolean }

interface MatrixPerformanceSnapshot { at:string;electronManagedOnly:true;sampleReady:boolean;sampleIntervalMs:number;cached:boolean;truncated:boolean;groups:{type:'main'|'renderer'|'gpu'|'utility'|'other';processes:number;cpuPercent:number|null;privateMiB:number|null;workingMiB:number|null}[];pages:{total:number;webviews:number;unthrottled:number;loading:number;unavailable:number};windows:{visible:number;hidden:number;unavailable:number} }
interface MatrixSystemSettings { error?: string; version?: string; electron?: string; node?: string; platform?: string; arch?: string; packaged?: boolean; zoom?: number; accessibility?:boolean; accessibilitySupported?:boolean; autoStart?: boolean; notificationsSupported?: boolean; opened?: boolean; requested?: boolean; performance?:MatrixPerformanceSnapshot }

// Type declarations for importing static assets
declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

declare module '*.webp' {
  const value: string;
  export default value;
}

declare module '*.ico' {
  const value: string;
  export default value;
}

declare module '*.json' {
  const value: any;
  export default value;
}

declare module '*.md' {
  const value: string;
  export default value;
}

declare module '*.csv' {
  const value: string;
  export default value;
}

type MatrixDesktopPlatform = 'douyin' | 'xiaohongshu' | 'wechat' | 'bilibili';

interface MatrixDesktopLoginResult {
  platform: MatrixDesktopPlatform;
  sessionId: string;
  nickname: string;
  avatarUrl?: string;
  pageUrl: string;
  ownIdentity?: {source:'official_own_homepage';key:string};
  metrics?: {followersCount?:number;followingCount?:number;likesCount?:number};
  metricEvidence?: import('@shared/account-metrics').AccountMetricEvidence;
  metricsError?: string;
}

interface MatrixDesktopCancelledResult {
  cancelled: true;
}

interface MatrixDesktopErrorResult {
  error: string;
  pendingProfile?: boolean;
  loginLoop?: boolean;
  loginRequired?: boolean;
  accountIssue?: { kind: 'banned' | 'restricted' | 'abnormal'; message: string };
}

interface MatrixDesktopSession {
  platform: MatrixDesktopPlatform;
  sessionId: string;
  partition: string;
  url: string;
  label: string;
  engine?: 'webview2';
}
interface MatrixEdgeStatus { guestId: string; url: string; title: string; ready: boolean; back: boolean; forward: boolean; error?: string; loginLoop?: boolean; navigationComplete?: boolean; navigationRequestId?: string }
interface MatrixEdgeInput { guestId: string; accessToken: string; command: 'bounds' | 'navigate' | 'reload' | 'back' | 'forward' | 'zoom' | 'close'; x?: number; y?: number; width?: number; height?: number; visible?: boolean; url?: string; zoom?: number }
interface MatrixExtraWorkspace { id: string; provider: string; label: string; name: string; remark: string; sessionId: string; url: string; domain: string; createdAt: string; updatedAt: string; loginStatus: 'not_verified' }

interface MatrixPageActionInput {
  platform: MatrixDesktopPlatform;
  sessionId: string;
  webContentsId: number;
  edgeGuestId?: string;
  accountId: string;
  accessToken: string;
  taskId?: string;
  attemptId?: string;
  expectedTitle?: string;
  expectedVisibility?: string;
}
interface MatrixPageActionPlan {
  visibility?: string;
  nonce: string;
  nickname: string;
  expiresAt: string;
  pageUrl: string;
  fields: { label: string; value: string }[];
  materials?: { name: string; size: number; modified: number }[];
  candidates: { index: number; label: string; context: string }[];
}
interface MatrixPublishVerification {
  state: 'confirmed' | 'rejected' | 'not_found' | 'time_mismatch' | 'missing_time' | 'status_unresolved' | 'ambiguous' | 'processing' | 'visibility_mismatch' | 'not_published' | 'page_not_ready' | 'wrong_page' | 'login_required' | 'identity_mismatch' | 'identity_pending' | 'unsupported' | 'missing_reference' | 'timeout' | 'busy' | 'error';
  message: string;
  checkedAt: string;
}
interface MatrixAccountHealth {error?:string;accountId?:string;sessionId?:string;platform?:MatrixDesktopPlatform;state?:'normal'|'offline'|'abnormal'|'banned'|'unknown';verificationRequired?:boolean;nickname?:string;avatarUrl?:string;nativeAccountKey?:string;metrics?:{followersCount?:number;followingCount?:number;likesCount?:number};metricEvidence?:import('@shared/account-metrics').AccountMetricEvidence;metricsError?:string;renamed?:boolean;checkedAt?:number;message?:string}
interface MatrixPublishOutcomeObservation {startedAt:string;deadlineAt:string;checks:number;lastReason:string;lastCheckedAt?:string;finishedAt?:string;elapsedMs?:number;lastError?:string;workListLoads?:number;lastWorkListLoadAt?:string}
interface MatrixPublishTrace {error?:string;receiptId?:string;taskId?:string;attemptId?:string;status?:string;resultSource?:string;scope?:string;evidence?:MatrixPageActionReceipt['evidence'];outcomeObservation?:MatrixPublishOutcomeObservation;items?:{sequence:number;at:string;timeInferred?:boolean;status:string;checkpoint:string;clicked?:boolean;acceptedAt?:string;resultSource:string;message:string;verification?:MatrixPublishVerification;evidence?:MatrixPageActionReceipt['evidence'];outcomeObservation?:MatrixPublishOutcomeObservation}[]}
interface MatrixPageActionReceipt {
  id: string;
  accountId: string;
  platform: MatrixDesktopPlatform;
  nickname: string;
  kind: 'publish' | 'comments' | 'messages' | 'withdraw';
  taskId?: string;
  attemptId?: string;
  pageUrl: string;
  button: string;
  summary: string;
  status: 'submitting' | 'confirmed' | 'failed' | 'unknown';
  message: string;
  createdAt: string;
  completedAt?: string;
  acceptedAt?: string;
  clicked?: boolean;
  manualVerification?: boolean;
  verification?: MatrixPublishVerification;
  resultSource?: string;
  checkpoint?: string;
  outcomeObservation?: MatrixPublishOutcomeObservation;
  referenceCollection?: {state:'confirmed'|'pending'|'conflict';message:string;checkedAt:string};
  evidence?: {pageUrl?:string;publishedAt?:string;notice?:string;observedAt?:string;title?:string;visibility?:string;visibilitySource?:'official_permission_label'|'same_work_thumbnail_link';statusText?:string;timePrecision?:'minute'|'second';workId?:string;workUrl?:string;workReferenceSource?:'official_title_link'|'official_work_card'};
  followCleanup?: 'pending' | 'confirmed';
  messageStatus?: string;
  replyStatus?: string;
  followupOf?:string;
  commentId?:string;
  retryable?:boolean;
  pinResult?:{status:'confirmed'|'failed'|'unknown'|'cancelled';message:string;officialCode?:number};
  commentDeleted?:boolean;
  commentManagement?:{operation:'unpin'|'delete';status:'confirmed'|'failed'|'unknown';commentId:string;message:string;officialCode?:number};
}

interface MatrixMediaSelection {
  id: string;
  mediaType: 'video' | 'image';
  files: { name: string; size: number; modified: number }[];
}
interface MatrixPublishPreview {
  error?: string;
  previewId?: string;
  mediaType?: 'image' | 'video';
  files?: { name: string; size: number; url: string }[];
  covers?: { name: string; size: number; url: string; index: number }[];
}
interface MatrixPublishForm {
  title: string;
  body: string;
  topics: string[];
  options: { category?: string; visibility?: string; originality?: string };
  extras?: Record<string, string>;
}
interface MatrixPublishControlDiagnostic { tag: string; role: string | null; className: string; label: string }
interface MatrixPublishProbe {
  componentRoots: number; viewportWidth: number; viewportHeight: number; documentVisible: boolean;
  matchedCovers: number; matchedVideos: number;
  rejectedCoverReasons: ('no_bounds' | 'hidden_style' | 'disabled' | 'hidden_ancestor' | 'transparent_ancestor' | 'hidden_animation')[];
}
interface MatrixPublishObservation {
  version: 1;
  state: 'upload_failed' | 'uploading' | 'processing' | 'waiting_layout' | 'waiting_editor' | 'waiting_media' | 'waiting_preview' | 'ambiguous_cover' | 'cover_ready' | 'submit_ready' | 'waiting_submit';
  busySignals: ('media_notice' | 'upload_notice' | 'progress_bar')[];
  editorReady: boolean; attachedVideoInputs: number; mediaElements: number; decodedMedia: number;
  coverContainers: number; coverImages: number; decodedCoverImages: number; enabledSubmitButtons: number; uploadPercent?: number;
  probe?: MatrixPublishProbe;
}
interface MatrixPublishEvidence { accountId: string; taskId: string; attemptId: string; platform: MatrixDesktopPlatform; at: string; observation: MatrixPublishObservation }
interface MatrixPublishSyncResult { error?: string; filled?: string[]; unresolved?: string[]; topics?: string[]; topicsAsText?: boolean; submitted?: false; uploadPercent?: number; ready?: boolean; mediaReady?: boolean; coverReady?: boolean; editorReady?: boolean; processing?: boolean; uploadError?: string; validationErrors?: string[]; observation?: MatrixPublishObservation; observationAt?: string; observationStored?: boolean; observationWarning?: string; controls?: MatrixPublishControlDiagnostic[]; privacyControls?: (MatrixPublishControlDiagnostic & {text:string})[]; settingsControls?: (MatrixPublishControlDiagnostic & {text:string})[]; coverControls?: (MatrixPublishControlDiagnostic & {text:string; parents:MatrixPublishControlDiagnostic[]; children:MatrixPublishControlDiagnostic[]})[] }
type MatrixPublishEntry = MatrixPageActionInput & { nonce: string; index: number };
interface MatrixPublishResult { accountId: string; error?: string; cancelled?: boolean; mayHaveSubmitted?: boolean; receipt?: MatrixPageActionReceipt }

interface Window {
  matrixDesktop?: {
    isDesktop: true;
    douyinInbox(input: import('@shared/douyin-inbox').DouyinInboxInput): Promise<import('@shared/douyin-inbox').DouyinInboxResult>;
    accountOperations(input: import('@shared/account-operations').OperationsInput): Promise<import('@shared/account-operations').OperationsResult>;
    onAccountOperationsHeartbeat?(listener: (workspaceId: string) => void): () => void;
    douyinEmojiCatalog(): Promise<{entries?:{name:string;img:string}[];error?:string}>;
    douyinInteractions(input: import('@shared/douyin-interactions').DouyinInteractionInput): Promise<import('@shared/douyin-interactions').DouyinInteractionResult>;
    readOpenDouyinFollowers(input:{accessToken:string;accountId:string;webContentsId:number}):Promise<{error?:string;accountId?:string;sessionId?:string;loaded?:number;avatars?:number;complete?:false}>;
    syncDouyinFollowers(input:{accessToken:string;accountId:string;webContentsId:number;command:'prepare'|'inspect'|'start'|'next'|'pause'|'resume';cursor?:string}):Promise<{error?:string;accountId?:string;sessionId?:string;cursor?:string;loaded?:number;avatars?:number;complete?:boolean;status?:'running'|'paused'|'complete';reason?:string;retryAfterMs?:number;ready?:boolean;waiting?:boolean;inspection?:MatrixFollowerResponseFacts;platformCode?:number}>;
    douyinInteractionImage(input: import('@shared/douyin-interactions').DouyinInteractionImageInput): Promise<import('@shared/douyin-interactions').DouyinInteractionImageResult>;
    inspectAccountHealth(input:{accessToken:string;accountId:string;purpose?:'publish-identity'}):Promise<MatrixAccountHealth>;
    readPublishTrace(input:{accessToken:string;receiptId:string}):Promise<MatrixPublishTrace>;
    resolvePublishReceipt(input:{accessToken:string;receiptId:string;kind:'identity_rename'|'not_published'}):Promise<{error?:string;cancelled?:boolean;receipt?:MatrixPageActionReceipt}>;
    extraPlatformWorkspaces(input: { command: 'list' | 'add' | 'open'; accessToken: string; provider?: string; name?: string; remark?: string; url?: string; id?: string }): Promise<{ error?: string; items?: MatrixExtraWorkspace[]; item?: MatrixExtraWorkspace; session?: { partition: string; url: string } }>;
    openEdgeGuest(input: { platform: 'wechat'; sessionId: string; accountId?: string; accessToken: string }): Promise<{ guestId: string; engine: 'webview2'; embedded: true } | MatrixDesktopErrorResult>;
    controlEdgeGuest(input: MatrixEdgeInput): Promise<{ ok?: boolean; error?: string; navigationRequestId?: string }>;
    bindEdgeGuest(input: { guestId: string; accessToken: string }): Promise<MatrixDesktopLoginResult | MatrixDesktopErrorResult>;
    onEdgeStatus(listener: (status: MatrixEdgeStatus) => void): () => void;
    systemSettings(input: { command: 'read' | 'performance' | 'zoom' | 'accessibility' | 'auto-start' | 'releases' | 'notify'; zoom?: number; enabled?: boolean; category?: 'test' | 'publish' | 'reminder' }): Promise<MatrixSystemSettings>;
    douyinCommentWorkflow(input: MatrixPageActionInput & { operation?: 'cleanup'; recordId?: string; author?: string; authorProfileUrl?: string; comment?: string; message?: string; successReply?: string; failedReply?: string }): Promise<{ error?: string; cancelled?: boolean; receipt?: MatrixPageActionReceipt & { followCleanup?: 'pending' | 'confirmed'; messageStatus?: string; replyStatus?: string; cleanupError?: string } }>;
    douyinCommentScan(input: MatrixPageActionInput & { operation: 'inventory' | 'scan'; videoUrl?: string }): Promise<{ error?: string; nickname?: string; urls?: string[]; capped?: boolean; records?: { platformId: string; author: string; content: string; authorProfileUrl?: string; displayTime?: string; replies?: { author: string; content: string }[] }[]; source?: string; capturedAt?: string; partial?: boolean }>;
    onDouyinWorkflowProgress(listener: (progress: { webContentsId: number; stage: string; message: string }) => void): () => void;
    officialData(input: MatrixPageActionInput & { command: 'options' | 'open-options' | 'select-option' | 'read-interactions' | 'open-message-list'; field?: '音乐' | '商品' | '合集'; kind?: 'comments' | 'messages' | 'followers'; nonce?: string; index?: number }): Promise<{ error?: string; retryable?: boolean; nonce?: string; items?: { index: number; label: string }[]; records?: { platformId: string; author: string; content: string; authorProfileUrl?: string; avatarUrl?: string; displayTime?: string; unreadState?: 'unread' | 'read'; unreadCount?: number; unreadCountCapped?: boolean }[]; source?: string; capturedAt?: string; accountId?: string; sessionId?: string; platform?: string; kind?: 'comments' | 'messages' | 'followers'; applied?: boolean; requiresReview?: boolean; opened?: boolean }>;
    bilibiliInteractions(input: { accessToken: string; accountId: string; kind: 'comments' | 'messages' | 'followers'; workId?: string; cursor?: string }): Promise<{ error?: string; accountId?: string; sessionId?: string; platform?: string; kind?: string; capturedAt?: string; source?: string; complete?: boolean; nextCursor?: string; total?: number; coverage?: string; records?: { platformId: string; author: string; content: string; avatarUrl?: string; displayTime?: string; unreadState?: 'unread' | 'read'; unreadCount?: number; parentPlatformId?: string; workId?: string }[] }>;
    openEdgePublishEntry(input: MatrixPageActionInput & { mediaType: 'image' | 'video' }): Promise<{ error?: string; opened?: boolean; waiting?: boolean; navigating?: boolean }>;
    onOfficialPageOpen(listener: (event: { webContentsId: number; url: string; blocked: boolean }) => void): () => void;
    inspectPageAction(input: MatrixPageActionInput & { kind: 'publish' | 'comments' | 'messages' | 'withdraw' }): Promise<MatrixPageActionPlan | MatrixDesktopErrorResult>;
    submitPageAction(input: MatrixPageActionInput & { nonce: string; index: number }): Promise<{ error?: string; cancelled?: boolean; mayHaveSubmitted?: boolean; receipt?: MatrixPageActionReceipt }>;
    listPageActions(accessToken: string): Promise<{ error?: string; items?: MatrixPageActionReceipt[] }>;
    verifyPublishResult(input: { accessToken: string; receiptId: string }): Promise<{ error?: string; receipt?: MatrixPageActionReceipt }>;
    verifyManualPublish(input: { accessToken:string;accountId:string;taskId:string;attemptId:string;platform:'douyin'|'xiaohongshu';expectedTitle:string;body?:string;topics?:string[];startedAt:string;visibility?:string;expectedWorkId?:string }): Promise<{error?:string;receipt?:MatrixPageActionReceipt}>;
    collectPublishReference(input:{accessToken:string;receiptId:string}):Promise<{error?:string;receipt?:MatrixPageActionReceipt}>;
    oneClickComments(input:import('@shared/one-click-comments').CommentRequest):Promise<import('@shared/one-click-comments').CommentResponse>;
    publishFollowup(input:{accessToken:string;accountId:string;receiptId:string;requestId?:string;operation?:'start'|'verify'|'pin'|'unpin'|'delete';expectedCommentId?:string;expectedComment?:string;comment?:string;pin?:boolean}):Promise<{error?:string;pending?:boolean;message?:string;mayHaveSubmitted?:boolean;receipt?:MatrixPageActionReceipt}>;
    insertDraft(input: { platform: MatrixDesktopPlatform; sessionId: string; webContentsId: number; text: string }): Promise<{ error?: string; inserted?: boolean; sent?: false }>;
    uploadMedia(input: { platform: MatrixDesktopPlatform; sessionId: string; webContentsId: number; mediaType: 'video' | 'image'; selectionId?: string; coverIndex?: number }): Promise<{ error?: string; cancelled?: boolean; uploadStarted?: boolean; handoffUncertain?: boolean; coverConfirmed?: boolean; count?: number; filenames?: string[] }>;
    rememberPublishMedia(input: { accessToken: string; selectionId: string; covers: { id: string; index: number }[] }): Promise<{ error?: string; recoveryId?: string; thumbnail?: string }>;
    restorePublishMedia(input: { accessToken: string; recoveryId: string; skipCovers?: boolean }): Promise<{ error?: string; code?: 'PUBLISH_MEDIA_RESELECT_REQUIRED'; selection?: MatrixMediaSelection; covers?: { id: string; name: string; index: number }[] }>;
    readPublishStorageStatus(input: { accessToken: string; receiptId?: string; recoveryId?: string }): Promise<{ error?: string; userId?: string; dataDirectory?: string; ownedReceiptCount?: number; receiptFound?: boolean; receiptStatus?: string; mediaReferenceFound?: boolean }>;
    previewPublishMedia(input: { accessToken: string; recoveryId: string }): Promise<MatrixPublishPreview>;
    capturePublishFrame(input: { accessToken: string; selectionId: string; dataUrl: string; at: number }): Promise<{ error?: string; selection?: MatrixMediaSelection }>;
    closePublishPreview(previewId: string): Promise<{ error?: string; closed?: boolean }>;
    chooseMedia(mediaType: 'video' | 'image'): Promise<{ error?: string; cancelled?: boolean; selection?: MatrixMediaSelection }>;
    extractPublishMedia(input: { accessToken: string; selectionId: string; options: { body: boolean; cover: boolean } }): Promise<{ error?: string; body?: string; cover?: { id: string; name: string; index: number }; notices?: string[] }>;
    importMedia(files: File[], mediaType: 'video' | 'image'): Promise<{ error?: string; selection?: MatrixMediaSelection }>;
    syncPublishForm(input: MatrixPageActionInput & { command: 'fill' | 'topics' | 'progress' | 'describe'; form?: MatrixPublishForm }): Promise<MatrixPublishSyncResult>;
    validatePublishMedia(input: { accessToken: string; selectionId: string; covers: { id: string; index: number }[] }): Promise<{ valid?: true; error?: string }>;
    readPublishEvidence(input: { accessToken: string; taskId: string; attemptId: string }): Promise<{ error?: string; items?: MatrixPublishEvidence[] }>;
    submitPublishBatch(entries: MatrixPublishEntry[], batchId?: string): Promise<{ error?: string; cancelled?: boolean; results?: MatrixPublishResult[]; remaining?: string[] }>;
    cancelPublishBatch(batchId: string, accessToken: string): Promise<{ error?: string; stopped?: boolean }>;
    onPublishProgress(listener: (event: { batchId: string; accountId: string; status: string; message: string }) => void): () => void;
    openPlatformLogin(platform: MatrixDesktopPlatform): Promise<MatrixDesktopLoginResult | MatrixDesktopCancelledResult | MatrixDesktopErrorResult>;
    openAccountSession(sessionId: string, platform: MatrixDesktopPlatform): Promise<void>;
    preparePlatformLogin(platform: MatrixDesktopPlatform, sessionId?: string): Promise<MatrixDesktopSession | MatrixDesktopErrorResult>;
    completePlatformLogin(input: {
      platform: MatrixDesktopPlatform;
      sessionId: string;
      webContentsId: number;
    }): Promise<MatrixDesktopLoginResult | MatrixDesktopErrorResult>;
    checkPlatformSession(platform: MatrixDesktopPlatform, sessionId: string): Promise<{
      healthy: boolean;
      message: string;
    }>;
    createDatabaseBackup(): Promise<{ path?: string; cancelled?: boolean; error?: string }>;
    openRecoveryMailSettings(): Promise<{ opened?: boolean; cancelled?: boolean; restartRequired?: boolean; error?: string }>;
    openDataFolder(): Promise<{ path?: string; error?: string }>;
    restoreDatabaseBackup(): Promise<{ restored?: boolean; cancelled?: boolean; error?: string }>;
  };
}

declare namespace React {
  export interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
