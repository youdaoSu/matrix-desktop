import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq } from 'drizzle-orm';
import { appUsers } from '@server/database/schema';

export const PUBLIC_ROUTE_KEY = 'publicRoute';
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_KEY, true);

export interface JwtPayload {
  userId: string;
  role: 'user' | 'admin';
  username?: string;
  authVersion?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'matrix-secret-key-dev';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
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
  canActivate(context: ExecutionContext): boolean {
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
      (request as unknown as { user: JwtPayload }).user = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('认证令牌无效或已过期');
    }
  }
}
