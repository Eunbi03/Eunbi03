import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload { userId: string; role: string; deviceId?: string; isAuthority?: boolean }

declare global {
  namespace Express {
    interface Request { user: AuthPayload }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ error: '인증이 필요합니다.' }); return; }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
    next();
  } catch (err: any) {
    const message = err.name === 'TokenExpiredError' ? '토큰이 만료되었습니다.' : '유효하지 않은 토큰입니다.';
    res.status(401).json({ error: message });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user.role !== 'admin' && req.user.role !== 'hr') {
    res.status(403).json({ error: '관리자만 접근 가능합니다.' }); return;
  }
  next();
}

export function requireHR(req: Request, res: Response, next: NextFunction): void {
  if (req.user.role !== 'hr') {
    res.status(403).json({ error: 'HR 권한이 필요합니다.' }); return;
  }
  next();
}
