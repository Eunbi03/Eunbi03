import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";
import { readWorkerSheet } from "../../utils/excelUpload.js";

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [breakpoint]);
  return isMobile;
}

function Field({ label, children, half }) {
  return (
    <div style={{ flex: half ? "0 0 calc(50% - 4px)" : "1 1 100%" }}>
      <label style={S.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// 일반 직원 추가/수정 모달
function WorkerModal({ worker, workplaces, positions, divisions, jobSchedules, corporations, onClose, onSaved }) {
  const isNew = !worker?.id;

  const [form, setForm] = useState({
    name: worker?.name || "",
    position: worker?.position || "",
    phone: worker?.phone || "",
    email: worker?.email || "",
    workplaceId: worker?.workplace_id ? String(worker.workplace_id) : "",
    remark: worker?.remark || "",
    corp: worker?.corp || "",
    division: worker?.division || "",
    team: worker?.team || "",
    jobTitle: worker?.job_title || "",
    scheduledStart: worker?.scheduled_start?.slice(0, 5) || "09:00",
    scheduledEnd: worker?.scheduled_end?.slice(0, 5) || "18:00",
    lunchStart: worker?.lunch_start?.slice(0, 5) || "12:00",
    lunchEnd: worker?.lunch_end?.slice(0, 5) || "13:00",
    noteExempt: !!worker?.note_exempt,
    irregularWorker: !!worker?.irregular_worker,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [initPw, setInitPw] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // 본부 선택 시 팀 후보
  const teamOptions = form.division
    ? ((divisions.find((d) => d.name === form.division)?.teams) || []).map((t) => t.name)
    : divisions.flatMap((d) => (d.teams || []).map((t) => t.name));
  const teamToDivision = {};
  divisions.forEach((d) => (d.teams || []).forEach((t) => { teamToDivision[t.name] = d.name; }));

  const setDivision = (v) => setForm((f) => ({ ...f, division: v, team: "" }));
  const setTeam = (v) => setForm((f) => ({ ...f, team: v, division: v ? (teamToDivision[v] || f.division) : f.division }));
  // 직무 선택 → 출퇴근·휴게 시간 자동 입력
  const setJob = (v) => {
    const js = jobSchedules.find((j) => j.name === v);
    setForm((f) => ({ ...f, jobTitle: v, ...(js ? { scheduledStart: js.workStart, scheduledEnd: js.workEnd, lunchStart: js.breakStart, lunchEnd: js.breakEnd } : {}) }));
  };

  const validate = () => {
    if (!form.name.trim())     { setErr("이름을 입력해주세요."); return false; }
    if (!form.phone.replace(/\D/g, "")) { setErr("전화번호를 입력해주세요."); return false; }
    if (!form.workplaceId)     { setErr("근무지를 선택해주세요."); return false; }
    if (!form.corp.trim())     { setErr("법인을 선택해주세요."); return false; }
    if (!form.division.trim()) { setErr("본부를 선택해주세요."); return false; }
    if (!form.team.trim())     { setErr("팀을 선택해주세요."); return false; }
    if (!form.jobTitle.trim()) { setErr("직무를 선택해주세요."); return false; }
    return true;
  };

  const save = async () => {
    setErr("");
    if (!validate()) return;
    setBusy(true);
    try {
      const result = isNew ? await api.createWorker(form) : await api.updateWorker(worker.id, form);
      if (isNew && result.initPassword) setInitPw(result.initPassword);
      else onSaved();
    } catch (e) {
      setErr(e.message || "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (initPw) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
        <div style={{ ...S.loginCard, background: "#eef2f6", maxWidth: 380, width: "100%", margin: 0 }}>
          <p style={S.h1}>직원 추가 완료</p>
          <p style={{ fontSize: 13, color: C.inkSoft }}>직원에게 아래 로그인 정보를 전달해주세요.</p>
          <div style={{ background: C.paper, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>아이디 · 초기 비밀번호 (전화번호)</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: C.seal, letterSpacing: 2 }}>{initPw}</div>
          </div>
          <p style={{ fontSize: 11, color: C.inkSoft }}>아이디와 비밀번호 모두 하이픈 없는 전화번호입니다. 첫 로그인 시 비밀번호를 변경합니다.</p>
          <button style={S.primary} onClick={onSaved}>확인</button>
        </div>
      </div>
    );
  }

  const selStyle = { ...S.input, padding: "11px 12px" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, padding: 16, overflowY: "auto" }}>
      <div style={{ ...S.loginCard, background: "#eef2f6", maxWidth: 620, width: "100%", margin: "20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={S.h1}>{isNew ? "새 직원 추가" : "직원 정보 수정"}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.inkSoft, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Field label="이름 *" half>
            <input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="직책" half>
            <select style={selStyle} value={form.position} onChange={(e) => set("position", e.target.value)}>
              <option value="">직책 선택</option>
              {positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={isNew ? "전화번호 * (초기 비밀번호로 사용)" : "전화번호 *"} half>
            <input style={S.input} type="tel" placeholder="예: 01012345678" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="이메일 (선택)" half>
            <input style={S.input} type="email" placeholder="예: kpride@gmail.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="근무지 *" half>
            <select style={selStyle} value={form.workplaceId} onChange={(e) => set("workplaceId", e.target.value)}>
              <option value="">근무지 선택</option>
              {workplaces.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="비고 (선택)" half>
            <input style={S.input} placeholder="예: 새말센터 외 xxx개점" value={form.remark} onChange={(e) => set("remark", e.target.value)} />
          </Field>
          <Field label="법인 *" half>
            <select style={selStyle} value={form.corp} onChange={(e) => set("corp", e.target.value)}>
              <option value="">법인 선택</option>
              {corporations.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="본부 *" half>
            <select style={selStyle} value={form.division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">본부 선택</option>
              {divisions.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="팀 *" half>
            <select style={selStyle} value={form.team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">팀 선택</option>
              {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="직무 *" half>
            <select style={selStyle} value={form.jobTitle} onChange={(e) => setJob(e.target.value)}>
              <option value="">직무 선택</option>
              {jobSchedules.map((j) => <option key={j.name} value={j.name}>{j.name}</option>)}
            </select>
          </Field>
          <Field label="출근 시간" half>
            <input style={S.input} type="time" value={form.scheduledStart} onChange={(e) => set("scheduledStart", e.target.value)} />
          </Field>
          <Field label="퇴근 시간" half>
            <input style={S.input} type="time" value={form.scheduledEnd} onChange={(e) => set("scheduledEnd", e.target.value)} />
          </Field>
          <Field label="휴게 시작 시간" half>
            <input style={S.input} type="time" value={form.lunchStart} onChange={(e) => set("lunchStart", e.target.value)} />
          </Field>
          <Field label="휴게 종료 시간" half>
            <input style={S.input} type="time" value={form.lunchEnd} onChange={(e) => set("lunchEnd", e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={form.noteExempt} onChange={(e) => set("noteExempt", e.target.checked)} /> 근무노트 제외 대상
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={form.irregularWorker} onChange={(e) => set("irregularWorker", e.target.checked)} /> 비정기적 근로자
          </label>
        </div>

        {err && <div style={{ ...S.err, padding: "8px 10px", background: C.sealSoft, borderRadius: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
          <button style={{ ...S.subPrimary, background: C.blue, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 관리자/인사팀 계정 수정 모달
function AdminProfileModal({ worker, currentUser, adminDevices, loadingDevices, onApproveDevice, onRemoveDevice, onTransfer, onResetPw, onNameSave, onClose }) {
  const isHolder = currentUser?.isAuthorityHolder;
  const isSelf = currentUser?.id === worker?.id;

  const [name, setName] = useState(worker?.name || "");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [busy, setBusy] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onNameSave(worker.id, name.trim());
      setMsg({ text: "이름이 변경되었습니다.", ok: true });
    } catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setBusy(false); }
  };

  const handleResetPw = async () => {
    if (!pw || pw.length < 4) { setMsg({ text: "비밀번호를 4자 이상 입력해주세요.", ok: false }); return; }
    setBusy(true);
    try {
      await onResetPw(worker.id, pw);
      setPw("");
      setMsg({ text: "비밀번호가 변경되었습니다.", ok: true });
    } catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setBusy(false); }
  };

  const handleTransfer = async (device) => {
    if (!confirm(`이 기기(${device.device_name || "기기"})로 권한자를 이전하시겠습니까?\n이전 후 현재 권한자는 일반 관리자가 됩니다.`)) return;
    setBusy(true);
    try {
      await onTransfer(device.id);
    } catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, padding: 16, overflowY: "auto" }}>
      <div style={{ ...S.loginCard, background: "#eef2f6", maxWidth: 480, width: "100%", margin: "20px 0" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ ...S.h1, margin: 0 }}>관리자 정보</p>
            <div style={{ display: "flex", gap: 4 }}>
              {worker?.is_authority_holder
                ? <span style={{ fontSize: 11, fontWeight: 700, color: "#b9820f", background: "#f6ebcf", padding: "2px 8px", borderRadius: 20 }}>권한자</span>
                : <span style={{ fontSize: 11, fontWeight: 700, color: "#468161", background: "#dcebe1", padding: "2px 8px", borderRadius: 20 }}>관리자</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.inkSoft, cursor: "pointer" }}>✕</button>
        </div>

        {msg.text && (
          <div style={{ fontSize: 13, color: msg.ok ? C.green : C.seal, fontWeight: 600, padding: "6px 10px", background: msg.ok ? C.greenSoft : C.sealSoft, borderRadius: 8 }}>
            {msg.text}
          </div>
        )}

        {/* 이름 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={S.fieldLabel}>이름</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...S.input, flex: 1 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isHolder && !isSelf}
            />
            {(isHolder || isSelf) && (
              <button
                style={{ border: "none", borderRadius: 10, padding: "0 14px", fontSize: 13, fontWeight: 700, background: C.ink, color: "#fff", cursor: "pointer", flexShrink: 0 }}
                onClick={handleSaveName}
                disabled={busy}
              >저장</button>
            )}
          </div>
        </div>

        {/* 이메일 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={S.fieldLabel}>이메일</label>
          <input style={{ ...S.input, color: C.inkSoft }} value={worker?.email || ""} disabled />
        </div>

        {/* 비밀번호 초기화 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={S.fieldLabel}>비밀번호 초기화{!isHolder ? " (권한자만 가능)" : ""}</label>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                style={{ ...S.input, paddingRight: 44, opacity: isHolder ? 1 : 0.55 }}
                type={showPw ? "text" : "password"}
                placeholder={isHolder ? "새 비밀번호 입력 (4자 이상)" : "권한자만 변경 가능"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                disabled={!isHolder}
              />
              <button
                onClick={() => setShowPw((v) => !v)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 2, lineHeight: 1 }}
                title={showPw ? "숨기기" : "보기"}
              >{showPw ? "🙈" : "👁️"}</button>
            </div>
            {isHolder && (
              <button
                style={{ border: "none", borderRadius: 10, padding: "0 14px", fontSize: 13, fontWeight: 700, background: C.amber, color: "#fff", cursor: "pointer", flexShrink: 0 }}
                onClick={handleResetPw}
                disabled={busy}
              >변경</button>
            )}
          </div>
        </div>

        {/* 등록된 기기 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={S.fieldLabel}>등록된 기기</label>
          {!isHolder && !isSelf ? (
            <div style={{ fontSize: 13, color: C.inkSoft }}>권한자만 기기를 관리할 수 있습니다.</div>
          ) : loadingDevices ? (
            <div style={{ fontSize: 13, color: C.inkSoft }}>불러오는 중…</div>
          ) : adminDevices.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkSoft }}>등록된 기기가 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {adminDevices.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, background: d.is_approved ? "#fff" : "#fef5f5", border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
                      {d.device_name || "기기"}
                      {d.is_authority
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: "#b9820f", background: "#f6ebcf", padding: "1px 7px", borderRadius: 20 }}>권한자</span>
                        : <span style={{ fontSize: 10, fontWeight: 700, color: "#468161", background: "#dcebe1", padding: "1px 7px", borderRadius: 20 }}>관리자</span>}
                    </div>
                    <div style={{ fontSize: 10, color: C.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.device_id}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: d.is_approved ? C.green : C.amber }}>{d.is_approved ? "승인됨" : "대기 중"}</div>
                  </div>
                  {isHolder && !d.is_authority && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {!d.is_approved && (
                        <button
                          style={{ border: `1px solid ${C.green}`, background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: C.green, fontWeight: 700, cursor: "pointer" }}
                          onClick={() => onApproveDevice(d.id)}
                          disabled={busy}
                        >승인</button>
                      )}
                      {d.is_approved && (
                        <button
                          style={{ border: `1px solid #b9820f`, background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: "#b9820f", fontWeight: 700, cursor: "pointer" }}
                          onClick={() => handleTransfer(d)}
                          disabled={busy}
                        >권한자 변경</button>
                      )}
                      <button
                        style={{ border: "none", background: "#fef5f5", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: C.seal, fontWeight: 700, cursor: "pointer" }}
                        onClick={() => onRemoveDevice(d.id)}
                        disabled={busy}
                      >삭제</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isHolder && (
            <div style={{ fontSize: 11, color: C.inkSoft }}>권한자 기기는 삭제할 수 없고, 권한 이전 후 삭제할 수 있습니다.</div>
          )}
        </div>

        <button style={{ ...S.subGhost, width: "100%" }} onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

function ResetPasswordModal({ worker, onClose, onDone }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!pw.trim()) { setErr("새 비밀번호를 입력해주세요."); return; }
    setBusy(true); setErr("");
    try { await api.resetWorkerPassword(worker.id, pw); onDone(pw); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div style={{ ...S.loginCard, background: "#eef2f6", maxWidth: 400, width: "100%", margin: 0 }}>
        <p style={S.h1}>비밀번호 초기화</p>
        <p style={{ fontSize: 13, color: C.inkSoft }}><b style={{ color: C.ink }}>{worker.name}</b> ({worker.email})</p>
        <label style={S.fieldLabel}>새 임시 비밀번호</label>
        <input style={S.input} value={pw} placeholder="전화번호 전체 권장" onChange={(e) => setPw(e.target.value)} />
        {err && <div style={S.err}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
          <button style={{ ...S.subPrimary, background: C.amber, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
            {busy ? "처리 중…" : "초기화"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminStaff({ filters, isHR, currentUser }) {
  const isMobile = useIsMobile();
  const [workers, setWorkers] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [positions, setPositions] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [jobSchedules, setJobSchedules] = useState([]);
  const [corporations, setCorporations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [adminTarget, setAdminTarget] = useState(null);
  const [adminDevices, setAdminDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [etcPopup, setEtcPopup] = useState(null);
  const fileRef = useRef(null);

  const isHolder = currentUser?.isAuthorityHolder;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (e.target) e.target.value = "";
    if (!file) return;
    setUploading(true); setMsg("");
    try {
      const rows = await readWorkerSheet(file);
      if (!rows.length) { setMsg("'직원 관리' 시트에 데이터가 없습니다."); return; }
      const r = await api.bulkWorkers(rows);
      setUploadResult(r);
      load();
    } catch (err) { setMsg("업로드 실패: " + err.message); }
    finally { setUploading(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [w, wp, pos, div, js, corp] = await Promise.all([
        api.getWorkers({ limit: 500 }), api.getWorkplaces(),
        api.getPositions().catch(() => ({ positions: [] })),
        api.getDivisions().catch(() => ({ divisions: [] })),
        api.getJobSchedules().catch(() => ({ jobSchedules: [] })),
        api.getCorporations().catch(() => ({ corporations: [] })),
      ]);
      setWorkers(w.workers);
      setWorkplaces(wp.workplaces || []);
      setPositions((pos.positions || []).map((p) => p.name));
      setDivisions(div.divisions || []);
      setJobSchedules(js.jobSchedules || []);
      setCorporations((corp.corporations || []).map((c) => c.name));
    } catch (e) {
      setMsg(e.message);
    } finally { setLoading(false); }
  };

  const loadPending = async () => {
    if (!isHolder) return;
    try {
      const d = await api.getMyAdminDevices();
      setPendingCount((d.pendingDevices || []).length);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadPending(); }, [isHolder]);

  const openAdminProfile = async (worker) => {
    setAdminTarget(worker);
    setAdminDevices([]);
    setLoadingDevices(true);
    try {
      let devices = [];
      if (isHolder) {
        const d = await api.getAdminDevices(worker.id);
        devices = d.devices || [];
      } else if (currentUser?.id === worker.id) {
        const d = await api.getMyAdminDevices();
        devices = d.myDevices || [];
      }
      setAdminDevices(devices);
    } catch { /* ignore */ }
    finally { setLoadingDevices(false); }
  };

  const refreshAdminDevices = async (userId) => {
    setLoadingDevices(true);
    try {
      let devices = [];
      if (isHolder) {
        const d = await api.getAdminDevices(userId);
        devices = d.devices || [];
      } else {
        const d = await api.getMyAdminDevices();
        devices = d.myDevices || [];
      }
      setAdminDevices(devices);
      await loadPending();
    } catch { /* ignore */ }
    finally { setLoadingDevices(false); }
  };

  const handleApproveDevice = async (deviceRowId) => {
    try {
      await api.approveAdminDevice(deviceRowId);
      setMsg("기기가 승인되었습니다.");
      if (adminTarget) await refreshAdminDevices(adminTarget.id);
    } catch (e) { setMsg(e.message); }
  };

  const handleRemoveDevice = async (deviceRowId) => {
    if (!confirm("이 기기를 삭제하시겠습니까?")) return;
    try {
      await api.removeAdminDevice(deviceRowId);
      setMsg("기기가 삭제되었습니다.");
      if (adminTarget) await refreshAdminDevices(adminTarget.id);
    } catch (e) { setMsg(e.message); }
  };

  const handleTransferAuthority = async (targetDeviceId) => {
    await api.transferAuthority(targetDeviceId);
    setMsg("권한자가 이전되었습니다. 새로고침 후 적용됩니다.");
    setAdminTarget(null);
    load();
  };

  const handleAdminNameSave = async (userId, newName) => {
    const w = adminTarget;
    await api.updateWorker(userId, {
      name: newName,
      phone: w?.phone || "",
      email: w?.email || "",
      position: w?.position || "",
      corp: w?.corp || "",
      division: w?.division || "",
      team: w?.team || "",
      jobTitle: w?.job_title || "",
      remark: w?.remark || "",
      scheduledStart: w?.scheduled_start?.slice(0, 5) || "09:00",
      scheduledEnd: w?.scheduled_end?.slice(0, 5) || "18:00",
      lunchStart: w?.lunch_start?.slice(0, 5) || "12:00",
      lunchEnd: w?.lunch_end?.slice(0, 5) || "13:00",
      workplaceId: w?.workplace_id ? String(w.workplace_id) : "",
      noteExempt: !!w?.note_exempt,
      irregularWorker: !!w?.irregular_worker,
    });
    load();
  };

  const handleAdminResetPw = async (userId, pw) => {
    await api.resetWorkerPassword(userId, pw);
  };

  const isAdmin = (w) => w.role !== "worker";
  // 기기 미등록·비번 미변경, 또는 필수 정보(전화/근무지/법인/본부/팀/직무) 누락자
  const needsAttention = (w) => !isAdmin(w) && (
    !w.device_id || w.must_change_password ||
    !w.phone || !w.workplace_id || !w.corp || !w.division || !w.team || !w.job_title
  );

  // 카테고리 필터
  const filtered = workers.filter((w) => {
    if (filters.corp     && w.corp     !== filters.corp)     return false;
    if (filters.division && w.division !== filters.division) return false;
    if (filters.team     && w.team     !== filters.team)     return false;
    if (filters.position && w.position !== filters.position) return false;
    return true;
  });

  // 게이팅: 관리자는 항상 노출. 근로자는 본부 필터가 있어야 전체 노출,
  // 없으면 기기 미등록/비번 미변경 근로자만 노출.
  const hasDivision = !!filters.division;
  const visible = filtered.filter((w) => isAdmin(w) || hasDivision || needsAttention(w));
  const nonAdminVisible = visible.filter((w) => !isAdmin(w));
  const showGuidance = !hasDivision && nonAdminVisible.length === 0;

  const sorted = [...visible].sort((a, b) => {
    if (a.is_authority_holder !== b.is_authority_holder) return a.is_authority_holder ? -1 : 1;
    if (isAdmin(a) !== isAdmin(b)) return isAdmin(a) ? -1 : 1;               // 관리자 먼저
    if (needsAttention(a) !== needsAttention(b)) return needsAttention(a) ? -1 : 1; // 미변경자 먼저
    return (a.name || "").localeCompare(b.name || "", "ko");
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

  // 법인별 인원 집계 (마스터 순서 → 기타는 맨 뒤)
  const corpBreakdown = (() => {
    const byCorp = {};
    workers.filter((w) => !isAdmin(w)).forEach((w) => { const k = (w.corp || "").trim() || "기타"; (byCorp[k] ||= []).push(w); });
    const out = [];
    corporations.forEach((name) => { if (byCorp[name]) out.push({ key: name, list: byCorp[name] }); });
    Object.keys(byCorp).forEach((k) => { if (k !== "기타" && !corporations.includes(k)) out.push({ key: k, list: byCorp[k] }); });
    if (byCorp["기타"]) out.push({ key: "기타", list: byCorp["기타"] });
    return out;
  })();

  const resetDevice = async (w) => {
    if (!confirm(`${w.name}의 등록 기기를 초기화하시겠습니까?\n다음 로그인 시 현재 기기가 자동 등록됩니다.`)) return;
    try { await api.resetWorkerDevice(w.id); setMsg(`${w.name} 기기 초기화 완료`); load(); }
    catch (e) { setMsg(e.message); }
  };

  const deleteWorker = async (w) => {
    if (!confirm(`삭제하시면, 이전 정보를 복구할 수 없습니다.\n정말 삭제하시겠습니까?`)) return;
    try { await api.deleteWorker(w.id); setMsg(`${w.name} 비활성화 완료`); load(); }
    catch (e) { setMsg(e.message); }
  };

  const unlock = async (w) => {
    try { await api.unlockUser(w.id); setMsg(`${w.name} 잠금 해제 완료`); load(); }
    catch (e) { setMsg(e.message); }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  return (
    <div>
      {/* 기기 승인 대기 배너 */}
      {isHolder && pendingCount > 0 && (
        <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.amber, fontWeight: 700 }}>
          승인 대기 중인 기기가 {pendingCount}개 있습니다. 해당 관리자 계정의 [수정]을 눌러 승인해주세요.
        </div>
      )}

      {msg && <div style={{ ...S.busy, marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: isMobile ? 14 : 16, fontWeight: 800, color: C.blue, whiteSpace: "nowrap" }}>
            총 사용자: {workers.filter((w) => !isAdmin(w)).length}명
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: isMobile ? 12 : 14, color: C.inkSoft }}>
            {corpBreakdown.map((c) => (
              c.key === "기타"
                ? <button key="기타" onClick={() => setEtcPopup(c.list)} style={{ whiteSpace: "nowrap", border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontSize: "inherit", padding: 0, textDecoration: "underline" }}>기타 {c.list.length}명</button>
                : <span key={c.key} style={{ whiteSpace: "nowrap" }}>{c.key} {c.list.length}명</span>
            ))}
          </div>
        </div>
        {isHR && (
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
            <button style={{ ...S.miniBtn, padding: "8px 14px", fontSize: 13, color: C.blue, borderColor: C.blueSoft }} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "업로드 중…" : "엑셀 업로드"}
            </button>
            <button style={{ ...S.primary, padding: "8px 16px", fontSize: 13, background: C.blue }} onClick={() => setEditTarget({})}>
              + 직원 추가
            </button>
          </div>
        )}
      </div>

      {etcPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 16 }} onClick={() => setEtcPopup(null)}>
          <div style={{ ...S.loginCard, background: "#eef2f6", maxWidth: 420, width: "100%", margin: 0, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <p style={S.h1}>법인 미지정 인원 ({etcPopup.length}명)</p>
            <p style={{ fontSize: 13, color: C.inkSoft }}>법인 정보가 비어 있는 직원입니다.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {etcPopup.map((w) => (
                <div key={w.id} style={{ fontSize: 13, color: C.ink, background: "#fff", borderRadius: 8, padding: "8px 10px" }}>
                  <b>{w.name}</b>
                  <span style={{ color: C.inkSoft, marginLeft: 8 }}>{[w.division, w.team].filter(Boolean).join(" · ") || "본부·팀 미지정"}</span>
                </div>
              ))}
            </div>
            <button style={{ ...S.primary, marginTop: 10 }} onClick={() => setEtcPopup(null)}>확인</button>
          </div>
        </div>
      )}

      {uploadResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 16 }} onClick={() => setUploadResult(null)}>
          <div style={{ ...S.loginCard, background: "#eef2f6", maxWidth: 460, width: "100%", margin: 0, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <p style={S.h1}>직원 일괄 등록 결과</p>
            <p style={{ fontSize: 14, color: C.ink }}>성공 <b style={{ color: C.green }}>{uploadResult.success}</b>건 · 실패 <b style={{ color: C.seal }}>{uploadResult.failed.length}</b>건</p>
            {uploadResult.failed.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {uploadResult.failed.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.ink, background: C.sealSoft, borderRadius: 8, padding: "8px 10px" }}>
                    <b>{[f.corp, f.division, f.team, f.jobTitle, f.name].filter(Boolean).join(" · ")}</b>
                    <div style={{ color: C.seal }}>사유: {f.reason}</div>
                  </div>
                ))}
              </div>
            )}
            <button style={{ ...S.primary, marginTop: 10 }} onClick={() => setUploadResult(null)}>확인</button>
          </div>
        </div>
      )}

      {showGuidance && (
        <div style={{ ...S.empty, color: C.inkSoft, opacity: 0.7 }}>본부를 설정해 주세요.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pageRows.map((w) => {
          const isAdminRole = w.role !== "worker";
          const isThisHolder = w.is_authority_holder;
          return (
            <div key={w.id} style={{
              ...S.hrRow,
              background: isThisHolder ? C.blueSoft : isAdminRole ? "#f0f6fa" : "#fff",
              borderColor: isThisHolder ? C.blue : isAdminRole ? C.blue : C.lineAdmin,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.ink, fontSize: isMobile ? 14 : 18, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {w.name}
                  {isAdminRole ? (
                    <span style={{ ...S.badge, background: "#dcebe1", color: "#468161", fontSize: isMobile ? 10 : 13 }}>관리자</span>
                  ) : (
                    <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: isMobile ? 12 : 15 }}>
                      {[w.position, [w.corp, w.division, w.team].filter(Boolean).join(" · ")].filter(Boolean).join(" / ")}
                    </span>
                  )}
                </div>
                {w.email && <div style={{ fontSize: isMobile ? 11 : 14, color: C.inkSoft, lineHeight: 1.6 }}>{w.email}</div>}
                {!isAdminRole && <div style={{ fontSize: isMobile ? 11 : 14, color: C.inkSoft, lineHeight: 1.6 }}>{w.phone}</div>}
                {!isAdminRole && (
                  <div style={{ fontSize: isMobile ? 11 : 14, color: C.inkSoft, lineHeight: 1.6 }}>
                    근무지: {w.workplace_name || "미지정"} / {w.scheduled_start?.slice(0, 5)}~{w.scheduled_end?.slice(0, 5)}
                  </div>
                )}
                {!isAdminRole && (w.note_exempt || w.irregular_worker) && (
                  <div style={{ fontSize: isMobile ? 11 : 14, color: C.amber, lineHeight: 1.6 }}>
                    {[w.note_exempt && "근무노트제외", w.irregular_worker && "비정기적 근무"].filter(Boolean).join(" · ")}
                  </div>
                )}
                <div style={{ fontSize: isMobile ? 11 : 14, color: isAdminRole ? C.blue : (w.device_id ? C.green : C.amber), fontWeight: 600, lineHeight: 1.6 }}>
                  기기: {isAdminRole ? "다중 기기 관리" : (w.device_id ? "등록됨" : "미등록")}
                </div>
              </div>

              {(() => {
                const mod = { color: "#636a7a", borderColor: "#636a7a" }; // 수정
                const del = { color: "#c8594e", borderColor: "#c8594e" }; // 삭제
                const dev = { color: "#2f6d8f", borderColor: C.blueSoft }; // 기기변경
                const pw  = { color: "#be8b29", borderColor: C.amberSoft }; // 비번초기화
                const base = isMobile ? { ...S.miniBtn, flex: 1 } : { ...S.miniBtn, fontSize: 13, padding: "7px 12px" };
                const status = (
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap", marginBottom: 2 }}>
                    {w.must_change_password && <span style={{ ...S.badge, color: C.amber, background: C.amberSoft, fontSize: 10 }}>비번미변경</span>}
                    <span style={{ ...S.badge, color: w.is_locked ? C.seal : C.green, background: w.is_locked ? C.sealSoft : C.greenSoft }}>{w.is_locked ? "잠김" : "정상"}</span>
                  </div>
                );
                if (isAdminRole) return (
                  <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 3 : 4, alignItems: "flex-end" }}>
                    {status}
                    <button style={{ ...base, ...mod }} onClick={() => openAdminProfile(w)}>수정</button>
                  </div>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 3 : 4, alignItems: "flex-end" }}>
                    {status}
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={{ ...base, ...mod }} onClick={() => setEditTarget(w)}>수정</button>
                      {isHR && <button style={{ ...base, ...pw }} onClick={() => setResetTarget(w)}>비번초기화</button>}
                    </div>
                    {isHR && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={{ ...base, ...del }} onClick={() => deleteWorker(w)}>삭제</button>
                        <button style={{ ...base, ...dev }} onClick={() => resetDevice(w)}>기기변경</button>
                      </div>
                    )}
                    {w.is_locked && isHR && <button style={{ ...base, color: C.green }} onClick={() => unlock(w)}>잠금해제</button>}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 16 }}>
          <button style={{ ...S.miniBtn, color: C.inkSoft }} disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: n === pageSafe ? 800 : 400, color: n === pageSafe ? C.blue : C.inkSoft, minWidth: 24 }}>{n}</button>
          ))}
          <button style={{ ...S.miniBtn, color: C.inkSoft }} disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
        </div>
      )}

      {editTarget !== null && (
        <WorkerModal
          worker={editTarget}
          workplaces={workplaces}
          positions={positions}
          divisions={divisions}
          jobSchedules={jobSchedules}
          corporations={corporations}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}

      {adminTarget !== null && (
        <AdminProfileModal
          worker={adminTarget}
          currentUser={currentUser}
          adminDevices={adminDevices}
          loadingDevices={loadingDevices}
          onApproveDevice={handleApproveDevice}
          onRemoveDevice={handleRemoveDevice}
          onTransfer={handleTransferAuthority}
          onResetPw={handleAdminResetPw}
          onNameSave={handleAdminNameSave}
          onClose={() => setAdminTarget(null)}
        />
      )}

      {resetTarget !== null && (
        <ResetPasswordModal
          worker={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={(pw) => { setMsg(`${resetTarget.name} 비밀번호 초기화: ${pw}`); setResetTarget(null); load(); }}
        />
      )}
    </div>
  );
}
