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

function WorkerModal({ worker, workplaces, onClose, onSaved }) {
  const isNew = !worker?.id;
  const [form, setForm] = useState({
    name: worker?.name || "",
    employeeId: worker?.employee_id || "",
    email: worker?.email || "",
    phone: worker?.phone || "",
    workplaceId: worker?.workplace_id || "",
    corp: worker?.corp || "",
    division: worker?.division || "",
    team: worker?.team || "",
    jobTitle: worker?.job_title || "",
    scheduledStart: worker?.scheduled_start?.slice(0, 5) || "09:00",
    scheduledEnd:   worker?.scheduled_end?.slice(0, 5)   || "18:00",
    lunchStart:     worker?.lunch_start?.slice(0, 5)     || "12:00",
    lunchEnd:       worker?.lunch_end?.slice(0, 5)       || "13:00",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [initPw, setInitPw] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      const result = isNew ? await api.createWorker(form) : await api.updateWorker(worker.id, form);
      if (isNew && result.initPassword) setInitPw(result.initPassword);
      else onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
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
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>초기 비밀번호</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: C.seal, letterSpacing: 4 }}>{initPw}</div>
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
          <Field label="이름 *" half>
            <input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="사원번호" half>
            <input style={S.input} value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} />
          </Field>

          <Field label="이메일 *">
            <input style={S.input} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={!isNew} />
            {!isNew && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 3 }}>이메일은 변경할 수 없습니다.</div>}
          </Field>

          <Field label={isNew ? "전화번호 * (초기 비밀번호로 사용)" : "전화번호"}>
            <input style={S.input} type="tel" placeholder="예: 01012345678" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            {isNew && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 3 }}>전화번호 뒷 8자리가 초기 비밀번호가 됩니다.</div>}
          </Field>

          <Field label="근무지">
            <select style={{ ...S.input, padding: "11px 12px" }} value={form.workplaceId} onChange={(e) => set("workplaceId", e.target.value)}>
              <option value="">미지정</option>
              {workplaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>

          <Field label="법인" half>
            <input style={S.input} value={form.corp} onChange={(e) => set("corp", e.target.value)} />
          </Field>
          <Field label="본부" half>
            <input style={S.input} value={form.division} onChange={(e) => set("division", e.target.value)} />
          </Field>
          <Field label="팀" half>
            <input style={S.input} value={form.team} onChange={(e) => set("team", e.target.value)} />
          </Field>
          <Field label="직무" half>
            <input style={S.input} value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
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

        {err && <div style={S.err}>{err}</div>}
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
    <Modal>
      <p style={S.h1}>비밀번호 초기화</p>
      <p style={{ fontSize: 13, color: C.inkSoft }}><b style={{ color: C.ink }}>{worker.name}</b> ({worker.email})</p>
      <label style={S.fieldLabel}>새 임시 비밀번호</label>
      <input style={S.input} value={pw} placeholder="전화번호 뒷 8자리 권장" onChange={(e) => setPw(e.target.value)} />
      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
        <button style={{ ...S.subPrimary, background: C.amber, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? "처리 중…" : "초기화"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div style={{ ...S.loginCard, maxWidth: 400, width: "100%", margin: 0 }}>{children}</div>
    </div>
  );
}

export default function AdminStaff({ filters, isHR }) {
  const [workers, setWorkers] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [w, wp] = await Promise.all([api.getWorkers({}), api.getWorkplaces()]);
      setWorkers(w.workers);
      setWorkplaces(wp.workplaces);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const visible = workers.filter((w) => {
    if (filters.corp && w.corp !== filters.corp) return false;
    if (filters.team && w.team !== filters.team) return false;
    if (filters.jobTitle && w.job_title !== filters.jobTitle) return false;
    return true;
  });

  // 관리자 계정은 항상 최상단
  const sorted = [...visible].sort((a, b) => {
    const aAdmin = a.role !== "worker" ? 0 : 1;
    const bAdmin = b.role !== "worker" ? 0 : 1;
    return aAdmin - bAdmin;
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
      {msg && <div style={{ ...S.busy, marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={{ ...S.primary, padding: "8px 16px", fontSize: 13 }} onClick={() => setEditTarget({})}>
          + 직원 추가
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((w) => {
          const isAdminRole = w.role !== "worker";
          return (
            <div key={w.id} style={{ ...S.hrRow, background: isAdminRole ? "#f8f9fc" : "#fff" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.ink, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  {w.name}
                  {isAdminRole && <span style={{ ...S.badge, background: "#e8eaf6", color: "#2d4a7a", fontSize: 10 }}>{w.role === "hr" ? "인사팀" : "관리자"}</span>}
                  {w.employee_id && <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: 12 }}>#{w.employee_id}</span>}
                </div>
                <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>
                  {[w.corp, w.division, w.team, w.job_title].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: 11, color: C.inkSoft }}>{w.email}{w.phone && ` · ${w.phone}`}</div>
                <div style={{ fontSize: 11, color: C.inkSoft }}>
                  근무지: {w.workplace_name || "미지정"} · {w.scheduled_start?.slice(0,5)}~{w.scheduled_end?.slice(0,5)}
                </div>
                <div style={{ fontSize: 11, color: w.device_id ? C.green : C.amber, fontWeight: 600 }}>
                  기기: {w.device_id ? "등록됨" : "미등록"}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginRight: 6 }}>
                {w.must_change_password && <span style={{ ...S.badge, color: C.amber, background: C.amberSoft, fontSize: 10 }}>비번미변경</span>}
                <span style={{ ...S.badge, color: w.is_locked ? C.seal : C.green, background: w.is_locked ? C.sealSoft : C.greenSoft }}>
                  {w.is_locked ? "잠김" : "정상"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <button style={S.miniBtn} onClick={() => setEditTarget(w)}>수정</button>
                {isHR && <button style={{ ...S.miniBtn, color: C.amber, borderColor: C.amberSoft }} onClick={() => setResetTarget(w)}>비번초기화</button>}
                {isHR && <button style={{ ...S.miniBtn, color: C.blue, borderColor: C.blueSoft }} onClick={() => resetDevice(w)}>기기변경</button>}
                {isHR && w.is_locked && <button style={{ ...S.miniBtn, color: C.green }} onClick={() => unlock(w)}>잠금해제</button>}
                {isHR && !isAdminRole && <button style={{ ...S.miniBtn, color: C.seal }} onClick={() => deleteWorker(w)}>삭제</button>}
              </div>
            </div>
          );
        })}
      </div>

      {editTarget !== null && (
        <WorkerModal worker={editTarget} workplaces={workplaces}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }} />
      )}
      {resetTarget !== null && (
        <ResetPasswordModal worker={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={(pw) => { setMsg(`${resetTarget.name} 비밀번호 초기화: ${pw}`); setResetTarget(null); load(); }} />
      )}
    </div>
  );
}
