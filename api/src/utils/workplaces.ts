import { pool } from '../db/pool';
import { haversineDistanceMeters } from './geo';

export interface NearestResult {
  distanceM: number | null;   // 가장 가까운 근무지까지 거리(m)
  withinAny: boolean;         // 등록된 어느 근무지든 참고반경 이내인가(초록불 기준)
  wpName: string | null;      // 가장 가까운 근무지명
  wpId: string | null;
}

// 등록된 모든(활성) 근무지 중 가장 가까운 곳을 찾고, 어느 반경이든 이내면 withinAny=true.
// 기본 근무지 개념을 쓰지 않고 전체 근무지를 기준으로 판정한다.
export async function nearestWorkplace(lat: number, lng: number): Promise<NearestResult> {
  const { rows } = await pool.query(
    'SELECT id, name, lat, lng, radius_m FROM workplaces WHERE is_active=TRUE AND lat IS NOT NULL AND lng IS NOT NULL'
  );
  if (!rows.length) return { distanceM: null, withinAny: false, wpName: null, wpId: null };
  let best: any = null, bestD = Infinity, within = false;
  for (const w of rows) {
    const d = haversineDistanceMeters(lat, lng, w.lat, w.lng);
    if (d <= (w.radius_m || 300)) within = true;
    if (d < bestD) { bestD = d; best = w; }
  }
  return {
    distanceM: Math.round(bestD * 10) / 10,
    withinAny: within,
    wpName: best?.name ?? null,
    wpId: best?.id ?? null,
  };
}
