import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth';
import attendanceRoutes from './routes/attendance';
import randomCheckRoutes from './routes/randomCheck';
import adminRoutes from './routes/admin';
import { buildIndividualReport } from './services/reportBuilder';
import { renderReportHtml } from './services/reportHtml';

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));

app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp());

app.use('/api/', rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true }));
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 5, message: { error: '잠시 후 다시 시도해주세요.' } }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/random-check', randomCheckRoutes);
app.use('/api/admin', adminRoutes);

// 공개 리포트 링크 (토큰으로 접근, 인증 불필요) — 인라인 스타일 HTML 페이지
// nginx가 /api/ 만 API로 전달하므로 /api/report 로 노출
app.get('/api/report', async (req, res) => {
  const t = req.query.t;
  if (!t || typeof t !== 'string') { res.status(400).send('잘못된 요청입니다.'); return; }
  try {
    const payload = jwt.verify(t, process.env.JWT_SECRET as string) as any;
    const rep = await buildIndividualReport(payload.uid, payload.from, payload.to);
    if (!rep) { res.status(404).send('리포트를 찾을 수 없습니다.'); return; }
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:");
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReportHtml(rep));
  } catch {
    res.status(401).send('만료되었거나 유효하지 않은 링크입니다.');
  }
});

app.use((req, res) => res.status(404).json({ error: '요청한 경로를 찾을 수 없습니다.' }));

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

export default app;
