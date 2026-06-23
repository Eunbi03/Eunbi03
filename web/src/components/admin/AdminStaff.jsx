import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

function WorkerModal({ worker, onClose, onSaved }) {
  const isNew = !worker?.id;
  const [form, setForm] = useState({
    email: worker?.email || "",
    name: worker?.name || "",
    role: worker?.role || "worker",
    corp: worker?.corp || "",
    team: worker?.team || "",
    department: worker?.department || "",
    employeeId: worker?.employee_id || "",
    scheduledStart: worker?.scheduled_start?.slice(0, 5) || "09:00",
    scheduledEnd: worker?.scheduled_end?.slice(0, 5) || "18:00",
    lunchStart: worker?.lunch_start?.slice(0, 5) || "12:00",
    lunchEnd: worker?.lunch_end?.slice(0, 5) || "13:00",
    workType: worker?.work_type || "",
    initialPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      if (isNew) {
        await api.createWorker(form);
      } else {
        await api.updateWorker(worker.id, form);
      }
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16, overflowY: "auto" }}>
      <div style={{ ...S.loginCard, maxWidth: 480, width: "100%", margin: 0 }}>
        <p style={S.h1}>{isNew ? "직원 추가" : "직원 수정"}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>이름 *</label>
            <input style={S.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>사원번호</label>
            <input style={S.input} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
          </div>
        </div>
        {isNew && (
          <>
            <label style={S.fieldLabel}>이메일 *</label>
            <input style={S.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label style={S.fieldLabel}>초기 비밀번호</label>
            <input style={S.input} value={form.initialPassword} placeholder="미입력 시 '초기비밀번호1234'" onChange={(e) => setForm({ ...form, initialPassword: e.target.value })} />
          </>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>역할</label>
            <select style={{ ...S.input, padding: "11px 12px" }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="worker">직원</option>
              <option value="admin">관리자</option>
              <option value="hr">인사팀</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>근무 유형</label>
            <input style={S.input} value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>법인</label>
            <input style={S.input} value={form.corp} onChange={(e) => setForm({ ...form, corp: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>팀</label>
            <input style={S.input} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>부서</label>
            <input style={S.input} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>출근 시간</label>
            <input style={S.input} type="time" value={form.scheduledStart} onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>퇴근 시간</label>
            <input style={S.input} type="time" value={form.scheduledEnd} onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>점심 시작</label>
            <input style={S.input} type="time" value={form.lunchStart} onChange={(e) => setForm({ ...form, lunchStart: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>점심 종료</label>
            <input style={S.input} type="time" value={form.lunchEnd} onChange={(e) => setForm({ ...form, lunchEnd: e.target.value })} />
          </div>
        </div>
        {err && <div style={S.err}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
          <button style={{ ...S.subPrimary, background: C.ink, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminStaff({ corp, team, isHR }) {
  const [workers, setWorkers] = useState([]);
  const [deviceRequests, setDeviceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editTarget, setEditTarget] = useState(null); // null=모달 닫힘, {}=신규, {id,...}=수정

  const load = async () => {
    setLoading(true);
    try {
      const [w, d] = await Promise.all([
        api.getWorkers({ corp: corp || "", team: team || "" }),
        isHR ? api.getDeviceChangeRequests("pending") : Promise.resolve({ requests: [] }),
      ]);
      setWorkers(w.workers);
      setDeviceRequests(d.requests);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [corp, team]);

  const unlock = async (id, name) => {
    try { await api.unlockUser(id); setMsg(`${name} 계정 잠금 해제`); load(); }
    catch (e) { setMsg(e.message); }
  };

  const deleteWorker = async (id, name) => {
    if (!confirm(`${name} 계정을 비활성화하시겠습니까?`)) return;
    try { await api.deleteWorker(id); setMsg(`${name} 비활성화`); load(); }
    catch (e) { setMsg(e.message); }
  };

  const handleDeviceRequest = async (id, approve) => {
    try {
      if (approve) await api.approveDeviceChange(id);
      else await api.rejectDeviceChange(id);
      setMsg(approve ? "기기 변경 승인" : "기기 변경 거부");
      load();
    } catch (e) { setMsg(e.message); }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  return (
    <div>
      {msg && <div style={{ ...S.busy, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={{ ...S.primary, padding: "8px 16px", fontSize: 13 }} onClick={() => setEditTarget({})}>
          + 직원 추가
        </button>
      </div>

      {isHR && deviceRequests.length > 0 && (
        <div style={{ ...S.formCard, marginBottom: 16, marginTop: 0 }}>
          <p style={S.formTitle}>기기 변경 승인 대기 ({deviceRequests.length}건)</p>
          {deviceRequests.map((req) => (
            <div key={req.id} style={{ ...S.hrRow, flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <div style={{ fontWeight: 700, color: C.ink }}>{req.name} <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: 12 }}>({req.email})</span></div>
              <div style={{ fontSize: 12, color: C.inkSoft }}>사유: {req.reason}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button style={{ ...S.miniBtn, color: C.green, borderColor: C.greenSoft }} onClick={() => handleDeviceRequest(req.id, true)}>승인</button>
                <button style={{ ...S.miniBtn, color: C.seal, borderColor: C.sealSoft }} onClick={() => handleDeviceRequest(req.id, false)}>거부</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {workers.map((w) => (
          <div key={w.id} style={S.hrRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>
                {w.name}
                {w.employee_id && <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: 12, marginLeft: 6 }}>#{w.employee_id}</span>}
                <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: 12, marginLeft: 6 }}>{w.corp} · {w.team} · {w.department}</span>
              </div>
              <div style={{ fontSize: 11, color: C.inkSoft }}>{w.email}</div>
              <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>
                근무지: {w.workplace_name || "미지정"} · {w.scheduled_start?.slice(0, 5)}~{w.scheduled_end?.slice(0, 5)}
              </div>
              <div style={{ fontSize: 11, color: C.inkSoft }}>기기: {w.device_id ? "등록됨" : "미등록"}</div>
            </div>
            <span style={{ ...S.badge, color: w.is_locked ? C.seal : C.green, background: w.is_locked ? C.sealSoft : C.greenSoft, marginRight: 8 }}>
              {w.is_locked ? "잠김" : "정상"}
            </span>
            <button style={S.miniBtn} onClick={() => setEditTarget(w)}>수정</button>
            {isHR && w.is_locked && (
              <button style={{ ...S.miniBtn, marginLeft: 4 }} onClick={() => unlock(w.id, w.name)}>잠금해제</button>
            )}
            {isHR && (
              <button style={{ ...S.miniBtn, marginLeft: 4, color: C.seal }} onClick={() => deleteWorker(w.id, w.name)}>삭제</button>
            )}
          </div>
        ))}
      </div>

      {editTarget !== null && (
        <WorkerModal
          worker={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}
