import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export function generateRefreshToken(): { plainToken: string; tokenHash: string } {
  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  return { plainToken, tokenHash };
}

export function hashToken(plainToken: string): string {
  return crypto.createHash('sha256').update(plainToken).digest('hex');
}

export function generateAccessToken(payload: { userId: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '1h') as any,
  });
}

export function getRefreshTokenExpiry(): Date {
  const days = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '90', 10);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
