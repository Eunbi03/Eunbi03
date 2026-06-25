import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

function Field({ label, children, half }) {
  return (
    <div style={{ flex: half ? "0 0 calc(50% - 4px)" : "1 1 100%" }}>
      <label style={S.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// 일반 직원 추가/수정 모달
function WorkerModal({ worker, workplaces, onClose, onSaved }) {
  const isNew = !worker?.id;

  const [form, setForm] = useState({
    name: worker?.name || "",
    email: worker?.email || "",
    phone: worker?.phone || "",
    workplaceId: worker?.workplace_id ? String(worker.workplace_id) : "",
    corp: worker?.corp || "",
    division: worker?.division || "",
    team: worker?.team || "",
    scheduledStart: worker?.scheduled_start?.slice(0, 5) || "09:00",
    scheduledEnd: worker?.scheduled_end?.slice(0, 5) || "18:00",
    lunchStart: worker?.lunch_start?.slice(0, 5) || "12:00",
    lunchEnd: worker?.lunch_end?.slice(0, 5) || "13:00",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [initPw, setInitPw] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    if (!form.name.trim())     { setErr("이름을 입력해주세요."); return false; }
    if (!form.email.trim())    { setErr("이메일을 입력해주세요."); return false; }
    if (!form.phone.trim())    { setErr("전화번호를 입력해주세요."); return false; }
    if (!form.corp.trim())     { setErr("법인을 입력해주세요."); return false; }
    if (!form.division.trim()) { setErr("본부를 입력해주세요."); return false; }
    if (!form.team.trim())     { setErr("팀을 입력해주세요."); return false; }
    if (!form.workplaceId)     { setErr("근무지를 선택해주세요."); return false; }
    return true;
  };

  const save = async () => {
    setErr("");
    if (!validate()) return;
    setBusy(true);
    try {
      const result = isNew
        ? await api.createWorker(form)
        : await api.updateWorker(worker.id, form);
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
        <div style={{ ...S.loginCard, maxWidth: 380, width: "100%", margin: 0 }}>
          <p style={S.h1}>직원 추가 완료</p>
          <p style={{ fontSize: 13, color: C.inkSoft }}>직원에게 아래 초기 비밀번호를 전달해주세요.</p>
          <div style={{ background: C.paper, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>이메일</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 12 }}>{form.email}</div>
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>초기 비밀번호 (전화번호)</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: C.seal, letterSpacing: 2 }}>{initPw}</div>
          </div>
          <p style={{ fontSize: 11, color: C.inkSoft }}>직원이 첫 로그인 시 반드시 비밀번호를 변경합니다.</p>
          <button style={S.primary} onClick={onSaved}>확인</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, padding: 16, overflowY: "auto" }}>
      <div style={{ ...S.loginCard, maxWidth: 500, width: "100%", margin: "20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={S.h1}>{isNew ? "직원 추가" : "직원 정보 수정"}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.inkSoft, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Field label="이름 *">
            <input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="이메일 *">
            <input style={S.input} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={!isNew} />
            {!isNew && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 3 }}>이메일은 변경할 수 없습니다.</div>}
          </Field>
          <Field label={isNew ? "전화번호 * (초기 비밀번호로 사용)" : "전화번호 *"}>
            <input style={S.input} type="tel" placeholder="예: 01012345678" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            {isNew && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 3 }}>전화번호 전체가 초기 비밀번호가 됩니다.</div>}
          </Field>
          <Field label="근무지 *">
            <select style={{ ...S.input, padding: "11px 12px" }} value={form.workplaceId} onChange={(e) => set("workplaceId", e.target.value)}>
              <option value="">근무지 선택</option>
              {workplaces.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="법인 *" half>
            <input style={S.input} value={form.corp} onChange={(e) => set("corp", e.target.value)} />
          </Field>
          <Field label="본부 *" half>
            <input style={S.input} value={form.division} onChange={(e) => set("division", e.target.value)} />
          </Field>
          <Field label="팀 *">
            <input style={S.input} value={form.team} onChange={(e) => set("team", e.target.value)} />
          </Field>
          <Field label="출근 시간" half>
            <input style={S.input} type="time" value={form.scheduledStart} onChange={(e) => set("scheduledStart", e.target.value)} />
          </Field>
          <Field label="퇴근 시간" half>
            <input style={S.input} type="time" value={form.scheduledEnd} onChange={(e) => set("scheduledEnd", e.target.value)} />
          </Field>
          <Field label="점심 시작" half>
            <input style={S.input} type="time" value={form.lunchStart} onChange={(e) => set("lunchStart", e.target.value)} />
          </Field>
          <Field label="점심 종료" half>
            <input style={S.input} type="time" value={form.lunchEnd} onChange={(e) => set("lunchEnd", e.target.value)} />
          </Field>
        </div>

        {err && <div style={{ ...S.err, padding: "8px 10px", background: C.sealSoft, borderRadius: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
          <button style={{ ...S.subPrimary, background: C.ink, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>
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

  const handleTransfer = async () => {
    if (!confirm(`${worker.name}에게 권한자를 이전하시겠습니까?\n이전 후 본인은 권한자 기능을 잃습니다.`)) return;
    setBusy(true);
    try {
      await onTransfer(worker.id);
    } catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, padding: 16, overflowY: "auto" }}>
      <div style={{ ...S.loginCard, maxWidth: 480, width: "100%", margin: "20px 0" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ ...S.h1, margin: 0 }}>관리자 정보</p>
            <div style={{ display: "flex", gap: 4 }}>
              {worker?.is_authority_holder && (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberSoft, padding: "2px 8px", borderRadius: 20 }}>권한자</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2d4a7a", background: "#e8eaf6", padding: "2px 8px", borderRadius: 20 }}>
                {worker?.role === "hr" ? "인사팀" : "관리자"}
              </span>
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
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, background: d.is_approved ? C.greenSoft : C.amberSoft, borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{d.device_name || "기기"}</div>
                    <div style={{ fontSize: 10, color: C.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.device_id}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: d.is_approved ? C.green : C.amber }}>{d.is_approved ? "승인됨" : "대기 중"}</div>
                  </div>
                  {isHolder && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {!d.is_approved && (
                        <button
                          style={{ border: `1px solid ${C.green}`, background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: C.green, fontWeight: 700, cursor: "pointer" }}
                          onClick={() => onApproveDevice(d.id)}
                          disabled={busy}
                        >승인</button>
                      )}
                      <button
                        style={{ border: `1px solid ${C.seal}`, background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: C.seal, fontWeight: 700, cursor: "pointer" }}
                        onClick={() => onRemoveDevice(d.id)}
                        disabled={busy}
                      >삭제</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isHolder && !isSelf && (
            <div style={{ fontSize: 11, color: C.inkSoft }}>관리자 PC·태블릿·폰 모두 등록 가능합니다.</div>
          )}
        </div>

        {/* 권한자 이전 — 권한자가 다른 관리자 볼 때만 */}
        {isHolder && !isSelf && !worker?.is_authority_holder && (
          <button
            style={{ width: "100%", border: `1px solid ${C.amber}`, background: C.amberSoft, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: C.amber, cursor: "pointer" }}
            onClick={handleTransfer}
            disabled={busy}
          >
            이 관리자를 권한자로 지정
          </button>
        )}

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
      <div style={{ ...S.loginCard, maxWidth: 400, width: "100%", margin: 0 }}>
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
  const [workers, setWorkers] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [adminTarget, setAdminTarget] = useState(null);
  const [adminDevices, setAdminDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const isHolder = currentUser?.isAuthorityHolder;

  const load = async () => {
    setLoading(true);
    try {
      const [w, wp] = await Promise.all([api.getWorkers({}), api.getWorkplaces()]);
      setWorkers(w.workers);
      setWorkplaces(wp.workplaces || []);
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

  const handleTransferAuthority = async (targetUserId) => {
    await api.transferAuthority(targetUserId);
    setMsg("권한자가 이전되었습니다. 새로고침 후 적용됩니다.");
    setAdminTarget(null);
    load();
  };

  const handleAdminNameSave = async (userId, newName) => {
    const w = adminTarget;
    await api.updateWorker(userId, {
      name: newName,
      phone: w?.phone || "",
      corp: w?.corp || "",
      division: w?.division || "",
      team: w?.team || "",
      employeeId: w?.employee_id || "",
      scheduledStart: w?.scheduled_start?.slice(0, 5) || "09:00",
      scheduledEnd: w?.scheduled_end?.slice(0, 5) || "18:00",
      lunchStart: w?.lunch_start?.slice(0, 5) || "12:00",
      lunchEnd: w?.lunch_end?.slice(0, 5) || "13:00",
      workplaceId: w?.workplace_id ? String(w.workplace_id) : "",
    });
    load();
  };

  const handleAdminResetPw = async (userId, pw) => {
    await api.resetWorkerPassword(userId, pw);
  };

  const visible = workers.filter((w) => {
    if (filters.corp && w.corp !== filters.corp) return false;
    if (filters.team && w.team !== filters.team) return false;
    return true;
  });

  const sorted = [...visible].sort((a, b) => {
    if (a.is_authority_holder && !b.is_authority_holder) return -1;
    if (!a.is_authority_holder && b.is_authority_holder) return 1;
    const aAdmin = a.role !== "worker" ? 0 : 1;
    const bAdmin = b.role !== "worker" ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;
    return (a.name || "").localeCompare(b.name || "", "ko");
  });

  const resetDevice = async (w) => {
    if (!confirm(`${w.name}의 등록 기기를 초기화하시겠습니까?\n다음 로그인 시 현재 기기가 자동 등록됩니다.`)) return;
    try { await api.resetWorkerDevice(w.id); setMsg(`${w.name} 기기 초기화 완료`); load(); }
    catch (e) { setMsg(e.message); }
  };

  const deleteWorker = async (w) => {
    if (!confirm(`${w.name} 계정을 비활성화하시겠습니까?`)) return;
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={{ ...S.primary, padding: "8px 16px", fontSize: 13 }} onClick={() => setEditTarget({})}>
          + 직원 추가
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((w) => {
          const isAdminRole = w.role !== "worker";
          const isThisHolder = w.is_authority_holder;
          return (
            <div key={w.id} style={{
              ...S.hrRow,
              background: isThisHolder ? "#f5f0e8" : isAdminRole ? "#f8f9fc" : "#fff",
              borderColor: isThisHolder ? C.amber : C.line,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.ink, fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {w.name}
                  {isThisHolder && <span style={{ ...S.badge, background: C.amberSoft, color: C.amber, fontSize: 10 }}>권한자</span>}
                  {isAdminRole && <span style={{ ...S.badge, background: "#e8eaf6", color: "#2d4a7a", fontSize: 10 }}>{w.role === "hr" ? "인사팀" : "관리자"}</span>}
                  {!isAdminRole && w.employee_id && <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: 12 }}>#{w.employee_id}</span>}
                </div>
                <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>
                  {[w.corp, w.division, w.team].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: 11, color: C.inkSoft }}>{w.email}{w.phone && ` · ${w.phone}`}</div>
                {!isAdminRole && (
                  <div style={{ fontSize: 11, color: C.inkSoft }}>
                    근무지: {w.workplace_name || "미지정"} · {w.scheduled_start?.slice(0, 5)}~{w.scheduled_end?.slice(0, 5)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: isAdminRole ? C.blue : (w.device_id ? C.green : C.amber), fontWeight: 600 }}>
                  기기: {isAdminRole ? "다중 기기 관리" : (w.device_id ? "등록됨" : "미등록")}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginRight: 6 }}>
                {w.must_change_password && <span style={{ ...S.badge, color: C.amber, background: C.amberSoft, fontSize: 10 }}>비번미변경</span>}
                <span style={{ ...S.badge, color: w.is_locked ? C.seal : C.green, background: w.is_locked ? C.sealSoft : C.greenSoft }}>
                  {w.is_locked ? "잠김" : "정상"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {isAdminRole ? (
                  <button style={S.miniBtn} onClick={() => openAdminProfile(w)}>수정</button>
                ) : (
                  <button style={S.miniBtn} onClick={() => setEditTarget(w)}>수정</button>
                )}
                {isHR && !isAdminRole && (
                  <>
                    <button style={{ ...S.miniBtn, color: C.amber, borderColor: C.amberSoft }} onClick={() => setResetTarget(w)}>비번초기화</button>
                    <button style={{ ...S.miniBtn, color: C.blue, borderColor: C.blueSoft }} onClick={() => resetDevice(w)}>기기변경</button>
                    {w.is_locked && <button style={{ ...S.miniBtn, color: C.green }} onClick={() => unlock(w)}>잠금해제</button>}
                    <button style={{ ...S.miniBtn, color: C.seal }} onClick={() => deleteWorker(w)}>삭제</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editTarget !== null && (
        <WorkerModal
          worker={editTarget}
          workplaces={workplaces}
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
