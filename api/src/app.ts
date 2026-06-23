import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import authRoutes from './routes/auth';
import attendanceRoutes from './routes/attendance';
import randomCheckRoutes from './routes/randomCheck';
import adminRoutes from './routes/admin';

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

app.use((req, res) => res.status(404).json({ error: '요청한 경로를 찾을 수 없습니다.' }));

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

export default app;
