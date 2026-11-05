import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  SetMetadata,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, sql } from 'drizzle-orm';
import { adminUsers, appUsers } from '@server/database/schema';
import { accountAuthorityOrigin, readAuthorityUser } from '@server/common/account-authority';

export const PUBLIC_ROUTE_KEY = 'publicRoute';
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_KEY, true);

export interface JwtPayload {
  userId: string;
  role: 'user' | 'admin';
  username?: string;
  authVersion?: number;
  adminVersion?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'matrix-secret-key-dev';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function adminCredentialVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('base64url');
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('未提供认证令牌');
    }
    const authority = accountAuthorityOrigin();
    if (authority) {
      let user;
      try { user = await readAuthorityUser(authority, authHeader); }
      catch { throw new ServiceUnavailableException('统一账号服务暂不可用，请稍后重试'); }
      if (!user) throw new UnauthorizedException('登录已失效，请重新登录远效');
      const entitlement = {
        maxAccounts: user.maxAccounts,
        vipStatus: user.vipStatus,
        vipExpiresAt: user.vipExpiresAt ? new Date(user.vipExpiresAt) : null,
      };
      // Keep local application data attached to its immutable owner ID.
      // A projection has no usable password and is never a login authority.
      await this.db.insert(appUsers).values({
        id: user.id,
        username: `cloud:${user.id}`,
        passwordHash: 'cloud-account',
        ...entitlement,
      }).onConflictDoUpdate({
        target: appUsers.id,
        set: entitlement,
        setWhere: sql`(${appUsers.maxAccounts}, ${appUsers.vipStatus}, ${appUsers.vipExpiresAt})
          is distinct from (excluded.max_accounts, excluded.vip_status, excluded.vip_expires_at)`,
      });
      (request as unknown as { user: JwtPayload }).user = { userId: user.id, username: user.username, role: 'user' };
      return true;
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token);
      if (payload.role !== 'user') {
        throw new UnauthorizedException('令牌角色不匹配');
      }
      const [user] = await this.db.select({ version: appUsers.authVersion, status: appUsers.status }).from(appUsers).where(eq(appUsers.id, payload.userId)).limit(1);
      if (!user || user.status !== 'active' || (payload.authVersion ?? 0) !== user.version) throw new UnauthorizedException('登录已失效，请使用当前密码重新登录');
      (request as unknown as { user: JwtPayload }).user = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('认证令牌无效或已过期');
    }
  }
}

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (accountAuthorityOrigin()) throw new UnauthorizedException('请登录统一管理端');
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token);
      if (payload.role !== 'admin') {
        throw new UnauthorizedException('令牌角色不匹配');
      }
      if (process.env.MATRIX_ACCOUNT_SERVICE === '1') {
        const [admin] = await this.db.select({
          status: adminUsers.status, passwordHash: adminUsers.passwordHash, mustChangePwd: adminUsers.mustChangePwd,
        }).from(adminUsers).where(eq(adminUsers.id, payload.userId)).limit(1);
        if (!admin || admin.status !== 'active' || payload.adminVersion !== adminCredentialVersion(admin.passwordHash)) {
          throw new UnauthorizedException('管理员登录已失效');
        }
        if (admin.mustChangePwd && !/^\/api\/admin\/(?:me|change-password)\/?$/.test(request.path)) {
          throw new ForbiddenException('请先修改管理员初始密码');
        }
      }
      (request as unknown as { user: JwtPayload }).user = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('认证令牌无效或已过期');
    }
  }
}
