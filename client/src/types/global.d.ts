declare module '*.css';

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
}

interface MatrixDesktopCancelledResult {
  cancelled: true;
}

interface MatrixDesktopErrorResult {
  error: string;
  pendingProfile?: boolean;
}

interface MatrixDesktopSession {
  platform: MatrixDesktopPlatform;
  sessionId: string;
  partition: string;
  url: string;
  label: string;
}

interface MatrixPageActionInput {
  platform: MatrixDesktopPlatform;
  sessionId: string;
  webContentsId: number;
  accountId: string;
  accessToken: string;
}
interface MatrixPageActionPlan {
  nonce: string;
  nickname: string;
  expiresAt: string;
  pageUrl: string;
  fields: { label: string; value: string }[];
  materials?: { name: string; size: number; modified: number }[];
  candidates: { index: number; label: string; context: string }[];
}
interface MatrixPageActionReceipt {
  id: string;
  accountId: string;
  platform: MatrixDesktopPlatform;
  nickname: string;
  kind: 'publish' | 'comments' | 'messages';
  pageUrl: string;
  button: string;
  summary: string;
  status: 'submitting' | 'confirmed' | 'failed' | 'unknown';
  message: string;
  createdAt: string;
  completedAt?: string;
}

interface MatrixMediaSelection {
  id: string;
  mediaType: 'video' | 'image';
  files: { name: string; size: number; modified: number }[];
}

interface Window {
  matrixDesktop?: {
    isDesktop: true;
    inspectPageAction(input: MatrixPageActionInput & { kind: 'publish' | 'comments' | 'messages' }): Promise<MatrixPageActionPlan | MatrixDesktopErrorResult>;
    submitPageAction(input: MatrixPageActionInput & { nonce: string; index: number }): Promise<{ error?: string; cancelled?: boolean; mayHaveSubmitted?: boolean; receipt?: MatrixPageActionReceipt }>;
    listPageActions(accessToken: string): Promise<{ error?: string; items?: MatrixPageActionReceipt[] }>;
    insertDraft(input: { platform: MatrixDesktopPlatform; sessionId: string; webContentsId: number; text: string }): Promise<{ error?: string; inserted?: boolean; sent?: false }>;
    uploadMedia(input: { platform: MatrixDesktopPlatform; sessionId: string; webContentsId: number; mediaType: 'video' | 'image'; selectionId?: string }): Promise<{ error?: string; cancelled?: boolean; uploadStarted?: boolean; count?: number; filenames?: string[] }>;
    chooseMedia(mediaType: 'video' | 'image'): Promise<{ error?: string; cancelled?: boolean; selection?: MatrixMediaSelection }>;
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
    openDataFolder(): Promise<{ path?: string; error?: string }>;
    restoreDatabaseBackup(): Promise<{ restored?: boolean; cancelled?: boolean; error?: string }>;
  };
}

declare namespace React {
  export interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
