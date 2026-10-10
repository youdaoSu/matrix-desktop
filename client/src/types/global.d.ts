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
}

interface MatrixDesktopSession {
  platform: MatrixDesktopPlatform;
  sessionId: string;
  partition: string;
  url: string;
  label: string;
}

interface Window {
  matrixDesktop?: {
    isDesktop: true;
    uploadMedia(input: { platform: MatrixDesktopPlatform; sessionId: string; webContentsId: number; mediaType: 'video' | 'image' }): Promise<{ error?: string; cancelled?: boolean; uploadStarted?: boolean; count?: number; filenames?: string[] }>;
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
