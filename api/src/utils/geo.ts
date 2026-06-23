export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadius(params: {
  lat: number; lng: number;
  workplaceLat: number; workplaceLng: number; radiusM: number;
}): { withinRadius: boolean; distanceM: number } {
  const distance = haversineDistanceMeters(params.lat, params.lng, params.workplaceLat, params.workplaceLng);
  return { withinRadius: distance <= params.radiusM, distanceM: distance };
}

export interface GpsValidation { isValid: boolean; reasons: string[] }

export function validateGpsReport(params: {
  lat: number; lng: number; accuracyM: number; isMocked: boolean; maxAccuracyM?: number;
}): GpsValidation {
  const { lat, lng, accuracyM, isMocked, maxAccuracyM = 50 } = params;
  const reasons: string[] = [];
  if (isMocked) reasons.push('MOCK_LOCATION_DETECTED');
  if (typeof accuracyM === 'number' && accuracyM > maxAccuracyM) reasons.push('LOW_ACCURACY');
  if (typeof lat !== 'number' || typeof lng !== 'number') reasons.push('INVALID_COORDINATES');
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) reasons.push('OUT_OF_RANGE_COORDINATES');
  return { isValid: reasons.length === 0, reasons };
}

export async function getGeofenceFromDB(pool: any): Promise<{ lat: number; lng: number; radiusM: number } | null> {
  const { rows } = await pool.query(
    'SELECT lat, lng, radius_meters FROM company_settings ORDER BY id LIMIT 1'
  );
  if (rows.length === 0) return null;
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lng), radiusM: rows[0].radius_meters };
}
