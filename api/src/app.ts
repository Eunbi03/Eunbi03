import express from 'express';
import 'express-async-errors'; // async 라우트의 예외를 에러 미들웨어로 전달 (요청 멈춤 방지)
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth';
import attendanceRoutes from './routes/attendance';
import randomCheckRoutes from './routes/randomCheck';
import adminRoutes from './routes/admin';
import filesRoutes from './routes/files';
import { buildIndividualReport } from './services/reportBuilder';
import { renderReportHtml } from './services/reportHtml';

const app = express();

app.use(helmet());
// 리버스 프록시가 2단(외부 프록시 → 컨테이너 nginx)이라 사설망(도커/사내망) 홉을 모두 신뢰해야
// 실제 클라이언트 IP가 req.ip에 잡힌다. 'uniquelocal' = loopback+10/8+172.16/12+192.168/16 신뢰.
app.set('trust proxy', 'uniquelocal');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));

app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp());

// 레이트리밋 키: 로그인된 요청은 '사용자별'(공유 공인 IP에서도 서로 안 깎아먹음),
// 로그인 전(무인증) 요청은 IP별로 집계한다. (trust proxy 설정으로 req.ip = 실제 클라이언트 IP)
function rateKey(req: express.Request): string {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try {
      const p = jwt.decode(h.slice(7)) as { userId?: string } | null;
      if (p && p.userId) return 'u:' + p.userId;
    } catch { /* 토큰 파싱 실패 시 IP로 폴백 */ }
  }
  return 'ip:' + (req.ip || 'unknown');
}

// 전역: 사용자(또는 IP)당 분당 300회 — 정상 사용엔 넉넉, 폭주/오남용만 차단.
// (keyGeneratorIpFallback 검증 비활성: IPv6도 전체 주소로 키잉 — 여기선 사용자별 키가 주 경로)
app.use('/api/', rateLimit({
  windowMs: 60_000, max: 300, standardHeaders: true,
  keyGenerator: rateKey, validate: { ip: false },
}));
// 로그인(무인증): 사무실 공유 IP를 고려해 분당 30회. (비번 5회 오류 시 계정 잠금이 별도로 brute-force 방어)
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, message: { error: '잠시 후 다시 시도해주세요.' } }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/random-check', randomCheckRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', filesRoutes);   // 첨부파일 공개 다운로드(인증 불필요)

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
    res.send(renderReportHtml(rep, payload.sent));
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
