import 'dotenv/config';
import app from './app';
import { startScheduler } from './jobs/scheduler';
import { loadHolidayCache } from './utils/holidays';

const PORT = process.env.PORT || 3000;
const REQUIRED_ENV = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[시작 실패] 필수 환경변수 누락: ${missing.join(', ')}`);
  process.exit(1);
}

app.listen(PORT, async () => {
  console.log(`근태관리 API 서버 포트 ${PORT} 실행 중`);
  await loadHolidayCache().catch((e) => console.warn('[공휴일 캐시 로드 실패]', e.message));
  startScheduler();
  // 월간 리포트는 자동 발송하지 않고 관리자가 개별 리포트 페이지에서 수동 발송한다.
});

process.on('SIGTERM', () => { console.log('SIGTERM — 종료'); process.exit(0); });

// 전역 안전망: 요청 경로 밖(스케줄러 등)에서 처리되지 않은 Promise 거부/예외가 나도
//  프로세스를 종료(크래시 루프)시키지 않고 로그만 남긴다. (Node 20 기본은 unhandledRejection 시 종료)
//  — DB 커넥션 유실 등 복구 불가 상태는 별도 모니터링으로 대응하고, 여기선 가용성 우선.
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err instanceof Error ? err.stack : err);
});
