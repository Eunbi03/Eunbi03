const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

let accessToken = null;

function setAccessToken(token) { accessToken = token; }
const getStoredRefreshToken = () => localStorage.getItem("att_refresh_token");
const setStoredRefreshToken = (t) => t ? localStorage.setItem("att_refresh_token", t) : localStorage.removeItem("att_refresh_token");
const getStoredUserId = () => localStorage.getItem("att_user_id");
const setStoredUserId = (id) => id ? localStorage.setItem("att_user_id", id) : localStorage.removeItem("att_user_id");

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* 204 etc */ }

  if (!res.ok) {
    const message = data?.error || data?.errors?.[0]?.msg || "요청 처리 중 오류가 발생했습니다.";
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/* 인증 */
export async function login({ email, password, deviceId }) {
  const data = await request("/auth/login", { method: "POST", body: { email, password, deviceId }, auth: false });
  setAccessToken(data.accessToken);
  setStoredRefreshToken(data.refreshToken);
  setStoredUserId(data.user.id);
  return data.user;
}

export async function tryAutoLogin({ deviceId }) {
  const userId = getStoredUserId();
  const refreshToken = getStoredRefreshToken();
  if (!userId || !refreshToken) return null;
  try {
    const data = await request("/auth/auto-login", { method: "POST", body: { userId, deviceId, refreshToken }, auth: false });
    setAccessToken(data.accessToken);
    return data.user;
  } catch {
    setStoredRefreshToken(null);
    setStoredUserId(null);
    return null;
  }
}

export function logout() {
  setAccessToken(null);
  setStoredRefreshToken(null);
  setStoredUserId(null);
}

export const changePassword = (newPassword) => request("/auth/change-password", { method: "POST", body: { newPassword } });
export const giveLocationConsent = () => request("/auth/location-consent", { method: "POST" });
export const requestDeviceChange = (newDeviceId, reason) => request("/auth/device-change-request", { method: "POST", body: { newDeviceId, reason } });

/* 출퇴근 */
export const checkIn = (location, workplaceId) => request("/attendance/check-in", {
  method: "POST",
  body: { lat: location.lat, lng: location.lng, accuracyM: location.acc, isMocked: false, workplaceId },
});

export const startOuting = (location, destination, reason) => request("/attendance/outing/start", {
  method: "POST",
  body: { lat: location.lat, lng: location.lng, destination, reason },
});

export const endOuting = (outingId) => request(`/attendance/outing/${outingId}/end`, { method: "POST" });

export const checkOut = (location, { isFieldCheckout, workplaceId, dailyReport, tomorrowPlan }) => request("/attendance/check-out", {
  method: "POST",
  body: { lat: location.lat, lng: location.lng, accuracyM: location.acc, isMocked: false, isFieldCheckout, workplaceId, dailyReport, tomorrowPlan },
});

export const getAttendanceToday = () => request("/attendance/today");
export const getWeeklySummary = () => request("/attendance/weekly-summary");
export const requestTimeChange = (requestedEnd, reason) => request("/attendance/time-change-request", { method: "POST", body: { requestedEnd, reason } });

/* 랜덤 체크 */
export const getPendingRandomCheck = () => request("/random-check/pending");
export const submitRandomCheck = (checkId, location) => request(`/random-check/${checkId}/submit`, {
  method: "POST",
  body: { lat: location.lat, lng: location.lng, accuracyM: location.acc, isMocked: false },
});

/* 관리자 */
export const getDashboard = () => request("/admin/dashboard");

export const getWorkers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/workers${qs ? `?${qs}` : ""}`);
};

export const createWorker = (data) => request("/admin/workers", { method: "POST", body: data });
export const updateWorker = (id, data) => request(`/admin/workers/${id}`, { method: "PUT", body: data });
export const deleteWorker = (id) => request(`/admin/workers/${id}`, { method: "DELETE" });
export const resetWorkerPassword = (id, newPassword) => request(`/admin/workers/${id}/reset-password`, { method: "PUT", body: { newPassword } });

export const getAttendanceByDate = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/attendance${qs ? `?${qs}` : ""}`);
};

export const exportAttendanceCsv = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return `${API_BASE}/admin/attendance/export${qs ? `?${qs}` : ""}`;
};

export const getDeviceChangeRequests = (status = "pending") => request(`/admin/device-change-requests?status=${status}`);
export const approveDeviceChange = (id) => request(`/admin/device-change-requests/${id}/approve`, { method: "POST" });
export const rejectDeviceChange = (id) => request(`/admin/device-change-requests/${id}/reject`, { method: "POST" });
export const unlockUser = (id) => request(`/admin/users/${id}/unlock`, { method: "POST" });
export const approveTimeChange = (recordId, approve) => request(`/admin/attendance/${recordId}/approve-time-change`, { method: "POST", body: { approve } });

export const getMonthlyReports = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/monthly-reports${qs ? `?${qs}` : ""}`);
};

export const getAttendanceHistory = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/attendance/history${qs ? `?${qs}` : ""}`);
};

export const getCompanySettings = () => request("/admin/company-settings");
export const saveCompanySettings = (data) => request("/admin/company-settings", { method: "POST", body: data });

export { setAccessToken };
