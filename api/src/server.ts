import 'dotenv/config';
import app from './app';
import { startScheduler } from './jobs/scheduler';
import { startMonthlyReportScheduler } from './jobs/monthlyReport';

const PORT = process.env.PORT || 3000;
const REQUIRED_ENV = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[시작 실패] 필수 환경변수 누락: ${missing.join(', ')}`);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`근태관리 API 서버 포트 ${PORT} 실행 중`);
  startScheduler();
  startMonthlyReportScheduler();
});

process.on('SIGTERM', () => { console.log('SIGTERM — 종료'); process.exit(0); });
