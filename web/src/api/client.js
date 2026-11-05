import { getDeviceId } from "../utils/device.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
let accessToken = null;

function setAccessToken(token) { accessToken = token; }
const getStoredRefreshToken = () => localStorage.getItem("att_refresh_token");
const setStoredRefreshToken = (t) => t ? localStorage.setItem("att_refresh_token", t) : localStorage.removeItem("att_refresh_token");
const getStoredUserId = () => localStorage.getItem("att_user_id");
const setStoredUserId = (id) => id ? localStorage.setItem("att_user_id", id) : localStorage.removeItem("att_user_id");

// access 토큰 만료(401) 시 저장된 refresh 토큰으로 재발급. 동시 요청이 몰려도 갱신은 한 번만.
//  반환: "ok"(재발급 성공) | "invalid"(세션 진짜 만료 → 로그아웃) | "transient"(네트워크·서버다운 등 일시 실패 → 토큰 보존) | "no-token"
let refreshPromise = null;
function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const userId = getStoredUserId();
    const refreshToken = getStoredRefreshToken();
    if (!userId || !refreshToken) return "no-token";
    try {
      const deviceId = await getDeviceId();
      const data = await request("/auth/auto-login",
        { method: "POST", body: { userId, deviceId, refreshToken }, auth: false, retry: false });
      setAccessToken(data.accessToken);
      return "ok";
    } catch (e) {
      // 인증 거부(401/403)만 '세션 진짜 만료'로 간주. 네트워크 오류·서버 재배포(5xx) 등은 일시 실패.
      return (e.status === 401 || e.status === 403) ? "invalid" : "transient";
    }
  })();
  refreshPromise.finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function request(path, { method = "GET", body, auth = true, retry = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* 204 */ }
  if (!res.ok) {
    // 토큰 만료 → 자동 재발급 후 원 요청 1회 재시도
    if (res.status === 401 && auth && retry) {
      const r = getStoredRefreshToken() ? await refreshAccessToken() : "no-token";
      if (r === "ok") return request(path, { method, body, auth, retry: false });
      // 세션이 '진짜로' 무효(401/403)이거나 토큰이 아예 없을 때만 로그아웃. 일시 실패(서버 재배포 등)면 토큰 보존하고 원 에러만 반환.
      if (r === "invalid" || r === "no-token") {
        setAccessToken(null); setStoredRefreshToken(null); setStoredUserId(null);
        if (typeof window !== "undefined") window.location.reload();
      }
    }
    const message = data?.error || data?.errors?.[0]?.msg || "요청 처리 중 오류가 발생했습니다.";
    const err = new Error(message);
    err.status = res.status; err.payload = data;
    throw err;
  }
  return data;
}

/* 인증 */
export async function login({ username, password, deviceId, deviceName, managerName, phone, permissions, teams }) {
  const body = { username, password, deviceId };
  if (deviceName) body.deviceName = deviceName;
  // 승인요청(미등록 기기) 추가 정보 — 전달 시 서버가 승인 대기 등록을 진행한다.
  if (managerName !== undefined) {
    body.managerName = managerName; body.phone = phone;
    body.permissions = permissions; body.teams = teams;
  }
  const data = await request("/auth/login", { method: "POST", body, auth: false });
  setAccessToken(data.accessToken); setStoredRefreshToken(data.refreshToken); setStoredUserId(data.user.id);
  return data.user;
}
// 승인요청 화면용: 권한 팀 선택 목록(로그인 전, 인증 불필요)
export const getPublicTeams = () => request("/auth/teams", { auth: false });
export async function tryAutoLogin({ deviceId }) {
  const userId = getStoredUserId(); const refreshToken = getStoredRefreshToken();
  if (!userId || !refreshToken) return null;
  // 서버 재배포 다운타임(일시 실패)을 견디도록 최대 3회 재시도.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await request("/auth/auto-login", { method: "POST", body: { userId, deviceId, refreshToken }, auth: false, retry: false });
      setAccessToken(data.accessToken); return data.user;
    } catch (e) {
      // 세션이 '진짜로' 무효(401/403)일 때만 저장 토큰 정리 후 로그인 화면으로.
      if (e.status === 401 || e.status === 403) { setStoredRefreshToken(null); setStoredUserId(null); return null; }
      // 네트워크 오류·서버 재배포(5xx) 등 일시 실패면 토큰 보존하고 잠시 후 재시도.
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null; // 끝까지 일시 실패: 토큰은 보존됨 → 서버 복구 후 다음 실행에서 자동로그인 유지
}
export function logout() { setAccessToken(null); setStoredRefreshToken(null); setStoredUserId(null); }
export const changePassword = (newPassword) => request("/auth/change-password", { method: "POST", body: { newPassword } });
export const giveLocationConsent = () => request("/auth/location-consent", { method: "POST" });
export const registerFcmToken = (token) => request("/attendance/fcm-token", { method: "POST", body: { token } });

/* 출퇴근 */
export const checkIn = (location) => request("/attendance/check-in", {
  method: "POST", body: { lat: location.lat, lng: location.lng, accuracyM: location.acc, isMocked: false },
});
export const startOuting = (location, destination, reason, workplaceId) => request("/attendance/outing/start", {
  method: "POST", body: { lat: location.lat, lng: location.lng, destination, reason, workplaceId: workplaceId || null },
});
export const getOutingWorkplaces = () => request("/attendance/workplaces");
export const endOuting = (outingId, body) => request(`/attendance/outing/${outingId}/end`, { method: "POST", body: body || {} });
// 연장 근무 (근로자)
export const getMyOvertime = () => request("/attendance/overtime");
export const createOvertime = (body) => request("/attendance/overtime", { method: "POST", body });
export const updateOvertime = (id, body) => request(`/attendance/overtime/${id}`, { method: "PUT", body });
export const deleteOvertime = (id) => request(`/attendance/overtime/${id}`, { method: "DELETE" });
export const checkOut = (location, { workNoteIn, workNoteOut, workNoteField, workNoteToday }) => request("/attendance/check-out", {
  method: "POST", body: { lat: location.lat, lng: location.lng, accuracyM: location.acc, isMocked: false, workNoteIn, workNoteOut, workNoteField, workNoteToday },
});
export const saveWorkNote = ({ workNoteToday, workNoteField }) => request("/attendance/work-note", { method: "PUT", body: { workNoteToday, workNoteField } });
export const getAttendanceToday = () => request("/attendance/today");
export const getWeeklySummary = () => request("/attendance/weekly-summary");
export const getMonthlySummary = () => request("/attendance/monthly-summary");
export const getAttendanceHistory = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/attendance/history${qs ? `?${qs}` : ""}`); };

/* 랜덤 체크 */
export const getPendingRandomCheck = () => request("/random-check/pending");
export const getRandomCheckTokens = () => request("/random-check/today-tokens");
export const submitRandomCheck = (checkId, location) => request(`/random-check/${checkId}/submit`, {
  method: "POST", body: { lat: location.lat, lng: location.lng, accuracyM: location.acc, isMocked: false },
});

/* 관리자 — 근무지 */
export const getWorkplaces = () => request("/admin/workplaces");
export const createWorkplace = (data) => request("/admin/workplaces", { method: "POST", body: data });
export const updateWorkplace = (id, data) => request(`/admin/workplaces/${id}`, { method: "PUT", body: data });
export const updateWorkplaceClient = (data) => request("/admin/workplaces/client", { method: "PUT", body: data });
export const deleteWorkplace = (id) => request(`/admin/workplaces/${id}`, { method: "DELETE" });
export const deleteWorkplaceClient = (clientName) => request("/admin/workplaces/client", { method: "DELETE", body: { clientName } });
export const deleteWorkplaceBranches = (ids) => request("/admin/workplaces/delete-branches", { method: "POST", body: { ids } });
export const geocodeAddress = (address) => request(`/admin/geocode?address=${encodeURIComponent(address)}`);
export const bulkWorkplaces = (rows) => request("/admin/workplaces/bulk", { method: "POST", body: { rows } });

/* 관리자 — 직원 */
export const getWorkers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/workers${qs ? `?${qs}` : ""}`);
};
export const createWorker = (data) => request("/admin/workers", { method: "POST", body: data });
export const updateWorker = (id, data) => request(`/admin/workers/${id}`, { method: "PUT", body: data });
export const deleteWorker = (id) => request(`/admin/workers/${id}`, { method: "DELETE" });
export const resetWorkerPassword = (id, newPassword) => request(`/admin/workers/${id}/reset-password`, { method: "PUT", body: { newPassword } });
export const resetWorkerDevice = (id) => request(`/admin/workers/${id}/reset-device`, { method: "POST" });
export const unlockUser = (id) => request(`/admin/users/${id}/unlock`, { method: "POST" });

/* 관리자 — 현황/리포트 */
export const getIndividualReport = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/admin/individual-report${qs ? `?${qs}` : ""}`); };
export const getMonthlyOverview = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/admin/monthly-overview${qs ? `?${qs}` : ""}`); };
export const searchWorkers = (name) => request(`/admin/worker-search?name=${encodeURIComponent(name)}`);
export const checkWorkerAccess = (name) => request(`/admin/worker-access-check?name=${encodeURIComponent(name)}`);
export const getAuditLogs = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/admin/logs${qs ? `?${qs}` : ""}`); };
export const getMyPerms = () => request("/admin/me");
export const getReportScores = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/admin/report-scores${qs ? `?${qs}` : ""}`); };
export const sendMonthlyReport = ({ userIds, from, to, label }) => request("/admin/send-report", { method: "POST", body: { userIds, from, to, label } });
export const sendFreeMessage = ({ userIds, channel, attachmentIds }) => request("/admin/send-message", { method: "POST", body: { userIds, channel, attachmentIds } });
export async function uploadMessageAttachment(file) {
  const fd = new FormData();
  fd.append("file", file);
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}/admin/message-attachment`, { method: "POST", headers, body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "첨부 업로드에 실패했습니다.");
  return data; // { id, filename, url }
}

/* 관리자 — 연차 */
export const setLeaveDday = (data) => request("/admin/attendance/set-leave-day", { method: "POST", body: data });

/* 관리자 — 관리자 기기 관리 */
export const getMyAdminDevices = () => request("/admin/my-devices");
export const getAdminDevices = (userId) => request(`/admin/admin-devices/${userId}`);
export const approveAdminDevice = (deviceRowId) => request(`/admin/devices/${deviceRowId}/approve`, { method: "POST" });
export const unlockAdminDevice = (deviceRowId) => request(`/admin/devices/${deviceRowId}/unlock`, { method: "POST" });
export const removeAdminDevice = (deviceRowId) => request(`/admin/devices/${deviceRowId}`, { method: "DELETE" });
export const transferAuthority = (targetDeviceId) => request("/admin/authority/transfer", { method: "PUT", body: { targetDeviceId } });
export const updateDeviceInfo = (deviceRowId, data) => request(`/admin/devices/${deviceRowId}/info`, { method: "PUT", body: data });
export const inviteAdminDevice = (data) => request("/admin/devices/invite", { method: "POST", body: data });
export const registerDeviceLink = (t, deviceId) => request("/auth/register-device-link", { method: "POST", body: { t, deviceId }, auth: false });

/* 관리자 — 공휴일 관리 */
export const getHolidays = () => request("/admin/holidays");
export const createHoliday = (date, name) => request("/admin/holidays", { method: "POST", body: { date, name } });
export const deleteHoliday = (id) => request(`/admin/holidays/${id}`, { method: "DELETE" });
export const bulkHolidays = (rows) => request("/admin/holidays/bulk", { method: "POST", body: { rows } });
export const bulkWorkers = (rows) => request("/admin/workers/bulk", { method: "POST", body: { rows } });

/* 관리자 — 조직 마스터 (법인/본부·팀/직책/근무시간) */
export const getCorporations = () => request("/admin/corporations");
export const createCorporation = (name, address) => request("/admin/corporations", { method: "POST", body: { name, address } });
export const updateCorporation = (id, data) => request(`/admin/corporations/${id}`, { method: "PUT", body: data });
export const deleteCorporation = (id) => request(`/admin/corporations/${id}`, { method: "DELETE" });

export const getDivisions = () => request("/admin/divisions");
export const createDivision = (name, teams) => request("/admin/divisions", { method: "POST", body: { name, teams } });
export const updateDivision = (id, name) => request(`/admin/divisions/${id}`, { method: "PUT", body: { name } });
export const deleteDivision = (id) => request(`/admin/divisions/${id}`, { method: "DELETE" });
export const addTeam = (divisionId, name, grantTo = []) => request(`/admin/divisions/${divisionId}/teams`, { method: "POST", body: { name, grantTo } });
export const updateTeam = (id, name) => request(`/admin/teams/${id}`, { method: "PUT", body: { name } });
export const getManagers = () => request("/admin/managers");
export const getMessageTemplates = () => request("/admin/message-templates");
export const updateMessageTemplate = (key, data) => request(`/admin/message-templates/${key}`, { method: "PUT", body: data });
export const deleteTeam = (id) => request(`/admin/teams/${id}`, { method: "DELETE" });

export const getPositions = () => request("/admin/positions");
// 필터 선택지(법인/본부·팀/직책) — 본인 권한 범위로 제한(조직도 노출 방지)
export const getFilterOptions = () => request("/admin/filter-options");
// 연장 근무 승인 (관리자: 팀장·본부장)
export const getOvertimeRequests = (status = "pending") => request(`/admin/overtime-requests?status=${status}`);
export const decideOvertime = (id, approve, reason) => request(`/admin/overtime-requests/${id}/decision`, { method: "POST", body: { approve, reason } });
export const createPositions = (names) => request("/admin/positions", { method: "POST", body: { names } });
export const updatePosition = (id, name) => request(`/admin/positions/${id}`, { method: "PUT", body: { name } });
export const deletePosition = (id) => request(`/admin/positions/${id}`, { method: "DELETE" });

export const getJobSchedules = () => request("/admin/job-schedules");
export const createJobSchedule = (data) => request("/admin/job-schedules", { method: "POST", body: data });
export const updateJobSchedule = (id, data) => request(`/admin/job-schedules/${id}`, { method: "PUT", body: data });
export const deleteJobSchedule = (id) => request(`/admin/job-schedules/${id}`, { method: "DELETE" });

export { setAccessToken };
