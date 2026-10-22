import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";
import { readWorkerSheet } from "../../utils/excelUpload.js";
import { fmtPhone } from "../../utils/format.js";

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
      if (!isNew) {
        await api.updateWorker(worker.id, form);
        onSaved();
        return;
      }
      // 신규 등록: 삭제 이력이 있으면 서버가 409(needsConfirm)로 응답 → 복구 여부 확인
      const submit = async (mode) => {
        const result = await api.createWorker(mode ? { ...form, mode } : form);
        if (result.initPassword) setInitPw(result.initPassword);
        else onSaved();
      };
      try {
        await submit();
      } catch (e) {
        if (e.status === 409 && e.payload?.needsConfirm) {
          const ph = e.payload.phone || form.phone;
          const yes = window.confirm(
            `${ph}에 대한 등록 이력이 존재합니다. 이전 정보를 복구하시겠습니까?\n\n` +
            `[확인] 이전 정보 복구 (과거 근태 기록 유지)\n[취소] 새로 등록 (보존된 기록 영구 삭제)`
          );
          await submit(yes ? "restore" : "new");
        } else {
          throw e;
        }
      }
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
            <input style={S.input} type="text" inputMode="email" placeholder="예: kpride@gmail.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
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

// 권한 팀 배열 → 표시 문자열
const teamsText = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "전체");
// 세부 권한 옵션(중복 선택). 아무것도 없으면 읽기 전용.
const PERM_OPTIONS = [
  ["staff", "직원관리 쓰기"],
  ["report_leave", "개별리포트(연차)"],
  ["report_full", "개별리포트(전체)"],
  ["settings", "설정 쓰기"],
];
const permText = (perms) => {
  const p = perms || [];
  if (!p.length) return "읽기 전용";
  return PERM_OPTIONS.filter(([k]) => p.includes(k)).map(function (o) { return o[1]; }).join(" · ");
};

// 관리자 카드 — 관리자명당 1개. 공통 정보(권한/법인/전화)는 한 번만, 기기코드는 아래에 목록으로.
function ManagerCard({ name, devices, isHolder, authorityCount = 0, corpList = [], teamList = [], onApprove, onRemove, onTransfer, onSaveInfo }) {
  const rep = devices[0] || {};                       // 공통 정보 대표 기기(권한은 그룹 동기화됨)
  const anyAuthority = devices.some((d) => d.is_authority);
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState(false);
  const [nm, setNm] = useState(name || "");
  const [corpSel, setCorpSel] = useState(rep.corp ? rep.corp.split(/[,·]/).map((s) => s.trim()).filter(Boolean) : []);
  const [phone, setPhone] = useState(rep.phone || "");
  const [permSel, setPermSel] = useState(Array.isArray(rep.permissions) ? rep.permissions : []);
  const [teamSel, setTeamSel] = useState(Array.isArray(rep.scope_teams) ? rep.scope_teams.filter((t) => t !== "전체") : []);
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const [saving, setSaving] = useState(false);
  const [mergeAsk, setMergeAsk] = useState("");

  // 이 관리자에 기기 추가(+): 관리자명·이메일·전화만, 권한은 기존 관리자명 상속
  const [addDev, setAddDev] = useState(false);
  const [addForm, setAddForm] = useState({ name: name || "", email: "", phone: "" });
  const [addMsg, setAddMsg] = useState({ text: "", ok: true });
  const [addBusy, setAddBusy] = useState(false);
  const submitAddDevice = async () => {
    if (!addForm.name.trim()) { setAddMsg({ text: "관리자명을 입력해주세요.", ok: false }); return; }
    if (!addForm.email.trim() && !addForm.phone.trim()) { setAddMsg({ text: "이메일 또는 전화번호를 입력해주세요.", ok: false }); return; }
    setAddBusy(true); setAddMsg({ text: "", ok: true });
    try {
      const r = await api.inviteAdminDevice({ managerName: addForm.name.trim(), email: addForm.email.trim(), phone: addForm.phone.trim(), confirmMerge: true });
      const ch = [r.sent?.email && "이메일", r.sent?.sms && "문자"].filter(Boolean).join("·") || "링크";
      setAddMsg({ text: `등록 링크를 ${ch}(으)로 보냈습니다.`, ok: true });
      setAddForm({ name: name || "", email: "", phone: "" });
    } catch (e) { setAddMsg({ text: e.message, ok: false }); }
    finally { setAddBusy(false); }
  };

  const buildPayload = (confirmMerge) => ({
    deviceName: nm.trim(), corp: corpSel.join(", "), phone: phone.trim(),
    permissions: permSel, teams: teamSel,
    ...(confirmMerge ? { confirmMerge: true } : {}),
  });
  const save = async (confirmMerge = false) => {
    setSaving(true);
    try {
      await onSaveInfo(rep.id, buildPayload(confirmMerge));  // 서버가 같은 관리자명 그룹 전체에 동기화
      setEditing(false); setMergeAsk("");
    } catch (e) {
      if (e.payload?.needMerge) { setMergeAsk(e.message); }
      else alert(e.message);
    } finally { setSaving(false); }
  };

  const inp = { ...S.input, padding: "7px 10px", fontSize: 13 };
  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? C.blue : C.line}`, background: active ? C.blue : "#fff", color: active ? "#fff" : C.inkSoft,
  });
  const smallBtn = (color, bg = "#fff") => ({ border: `1px solid ${color}`, background: bg, borderRadius: 8, padding: "4px 9px", fontSize: 11, color, fontWeight: 700, cursor: "pointer" });

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>
      {/* 헤더: 관리자명 + 권한자/관리자 + 정보수정/상세/+ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: C.ink, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {name || "(이름없음)"}
          {anyAuthority
            ? <span style={{ fontSize: 10, fontWeight: 700, color: "#b9820f", background: "#f6ebcf", padding: "1px 7px", borderRadius: 20 }}>권한자</span>
            : <span style={{ fontSize: 10, fontWeight: 700, color: "#468161", background: "#dcebe1", padding: "1px 7px", borderRadius: 20 }}>관리자</span>}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button style={smallBtn(C.blue)} onClick={() => { setEditing((v) => !v); setDetail(false); }}>{editing ? "닫기" : "정보 수정"}</button>
          <button style={smallBtn(C.inkSoft)} onClick={() => { setDetail((v) => !v); setEditing(false); }}>{detail ? "닫기" : "상세"}</button>
          {isHolder && <button title="이 관리자에 기기 추가" style={{ ...smallBtn(C.blue), width: 28, padding: "4px 0", textAlign: "center", background: addDev ? C.blue : "#fff", color: addDev ? "#fff" : C.blue }} onClick={() => { setAddDev((v) => !v); setAddMsg({ text: "", ok: true }); }}>＋</button>}
        </div>
      </div>

      {/* 등록 기기코드 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {devices.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, background: d.is_approved ? "#f6f8fa" : "#fef5f5", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: C.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{d.device_id}</span>
                {d.is_authority && <span style={{ fontSize: 9, fontWeight: 700, color: "#b9820f", background: "#f6ebcf", padding: "1px 6px", borderRadius: 20 }}>권한자</span>}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: d.is_approved ? C.green : C.amber }}>{d.is_approved ? "승인됨" : "대기 중"}</div>
            </div>
            {isHolder && (
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {!d.is_approved && <button style={smallBtn(C.green)} onClick={() => onApprove(d.id)}>승인</button>}
                {d.is_approved && !d.is_authority && <button style={smallBtn("#b9820f")} onClick={() => onTransfer(d)}>권한자 변경</button>}
                {(!d.is_authority || authorityCount > 1) && <button style={{ ...smallBtn(C.seal, "#fef5f5"), border: "none" }} onClick={() => onRemove(d.id)}>삭제</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      {detail && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#f6f8fa", borderRadius: 8, fontSize: 12, color: C.ink, display: "flex", flexDirection: "column", gap: 4 }}>
          <div><span style={{ color: C.inkSoft, fontWeight: 700 }}>권한 · </span>{permText(rep.permissions)}</div>
          <div><span style={{ color: C.inkSoft, fontWeight: 700 }}>권한 팀 · </span>{teamsText(rep.scope_teams)}</div>
          <div><span style={{ color: C.inkSoft, fontWeight: 700 }}>담당 법인 · </span>{rep.corp || "-"}</div>
          <div><span style={{ color: C.inkSoft, fontWeight: 700 }}>업무용 전화번호 · </span>{fmtPhone(rep.phone) || "-"}</div>
        </div>
      )}

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <input style={inp} placeholder="관리자명" value={nm} onChange={(e) => setNm(e.target.value)} />
          <input style={inp} placeholder="업무용 전화번호" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700 }}>담당 법인 (복수 선택)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {corpList.length === 0 && <span style={{ fontSize: 12, color: C.inkSoft }}>등록된 법인 없음</span>}
            {corpList.map((c) => <span key={c} style={chip(corpSel.includes(c))} onClick={() => setCorpSel(toggle(corpSel, c))}>{c}</span>)}
          </div>
          <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700 }}>권한 (복수 선택, 미선택 시 읽기 전용)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PERM_OPTIONS.map(([k, label]) => <span key={k} style={chip(permSel.includes(k))} onClick={() => setPermSel(toggle(permSel, k))}>{label}</span>)}
          </div>
          <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700 }}>권한 팀 (복수 선택, 미선택 시 전체)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflowY: "auto" }}>
            {teamList.length === 0 && <span style={{ fontSize: 12, color: C.inkSoft }}>등록된 팀 없음</span>}
            {teamList.map((tm) => <span key={tm} style={chip(teamSel.includes(tm))} onClick={() => setTeamSel(toggle(teamSel, tm))}>{tm}</span>)}
          </div>
          <button style={{ border: "none", borderRadius: 8, padding: "8px", fontSize: 13, fontWeight: 700, background: C.ink, color: "#fff", cursor: "pointer", opacity: saving ? 0.6 : 1 }} onClick={() => save(false)} disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
        </div>
      )}

      {addDev && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, padding: "10px 12px", background: "#eef5ff", border: `1px solid ${C.blueSoft}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}><b>{name || "이 관리자"}</b>에 기기를 추가합니다. 권한은 기존과 동일하게 적용돼요. 링크를 받은 사람이 <b>등록할 기기</b>에서 열면 등록됩니다.</div>
          <input style={{ ...inp }} placeholder="관리자명" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          <input style={{ ...inp }} placeholder="링크 받을 이메일" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
          <input style={{ ...inp }} placeholder="링크 받을 전화번호" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
          {addMsg.text && <div style={{ fontSize: 12, fontWeight: 600, color: addMsg.ok ? C.green : C.seal }}>{addMsg.text}</div>}
          <button style={{ border: "none", borderRadius: 8, padding: "8px", fontSize: 13, fontWeight: 700, background: C.blue, color: "#fff", cursor: "pointer", opacity: addBusy ? 0.6 : 1 }} onClick={submitAddDevice} disabled={addBusy}>{addBusy ? "발송 중…" : "등록 링크 보내기"}</button>
        </div>
      )}

      {mergeAsk && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 18px", maxWidth: 340, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 14, color: C.ink, fontWeight: 600, margin: 0, lineHeight: 1.6 }}>{mergeAsk}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ flex: 1, border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: 11, fontSize: 14, fontWeight: 700, color: C.inkSoft, cursor: "pointer" }} onClick={() => setMergeAsk("")} disabled={saving}>취소</button>
              <button style={{ flex: 1, border: "none", background: C.blue, borderRadius: 10, padding: 11, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", opacity: saving ? 0.6 : 1 }} onClick={() => save(true)} disabled={saving}>변경</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 관리자/인사팀 계정 수정 모달
function AdminProfileModal({ worker, currentUser, adminDevices, loadingDevices, onApproveDevice, onRemoveDevice, onTransfer, onResetPw, onNameSave, onSaveDeviceInfo, onClose }) {
  // 기기 관리·비밀번호 변경·권한자 변경은 '권한자'만. 이름은 모든 관리자 가능.
  // (공용 계정을 공유하므로 role이 아니라 권한자 여부로 구분)
  const isHolder = !!currentUser?.isAuthorityHolder;

  const [name, setName] = useState(worker?.name || "");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [busy, setBusy] = useState(false);

  // 기기 추가(+버튼) — 권한자만
  const canInvite = !!currentUser?.isAuthorityHolder;
  const [showInvite, setShowInvite] = useState(false);
  const [inv, setInv] = useState({ managerName: "", email: "", phone: "", corps: [], permSel: [], teamSel: [] });
  // 등록된 법인·팀 목록 (복수 선택용)
  const [corpList, setCorpList] = useState([]);
  const [teamList, setTeamList] = useState([]);
  useEffect(() => {
    api.getCorporations().then((d) => setCorpList((d.corporations || []).map((c) => c.name))).catch(() => {});
    api.getDivisions().then((d) => setTeamList((d.divisions || []).flatMap((dv) => (dv.teams || []).map((t) => t.name)))).catch(() => {});
  }, []);
  const toggleInArr = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const [invMsg, setInvMsg] = useState({ text: "", ok: true });
  const [inviteAsk, setInviteAsk] = useState("");   // 중복 관리자명 확인 팝업

  const submitInvite = async (confirmMerge = false) => {
    if (!inv.managerName.trim()) { setInvMsg({ text: "관리자명을 입력해주세요.", ok: false }); return; }
    if (!inv.email.trim() && !inv.phone.trim()) { setInvMsg({ text: "이메일 또는 전화번호를 입력해주세요.", ok: false }); return; }
    setBusy(true); setInvMsg({ text: "", ok: true });
    try {
      const r = await api.inviteAdminDevice({
        managerName: inv.managerName.trim(), email: inv.email.trim(), phone: inv.phone.trim(), corp: inv.corps.join(", "),
        permissions: inv.permSel,
        teams: inv.teamSel,
        ...(confirmMerge ? { confirmMerge: true } : {}),
      });
      const ch = [r.sent?.email && "이메일", r.sent?.sms && "문자"].filter(Boolean).join("·") || "링크";
      setInvMsg({ text: `등록 링크를 ${ch}(으)로 보냈습니다.`, ok: true });
      setInv({ managerName: "", email: "", phone: "", corps: [], permSel: [], teamSel: [] });
      setInviteAsk("");
    } catch (e) {
      if (e.payload?.needConfirm) { setInviteAsk(e.message); }   // 중복 관리자명 → 확인 팝업
      else setInvMsg({ text: e.message, ok: false });
    }
    finally { setBusy(false); }
  };

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
    if (!confirm(`이 기기(${device.device_name || "기기"})를 권한자로 지정합니다.\n지금 로그인한 기기의 권한자 권한은 해제됩니다. 계속하시겠습니까?`)) return;
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
            />
            <button
              style={{ border: "none", borderRadius: 10, padding: "0 14px", fontSize: 13, fontWeight: 700, background: C.ink, color: "#fff", cursor: "pointer", flexShrink: 0 }}
              onClick={handleSaveName}
              disabled={busy}
            >저장</button>
          </div>
        </div>

        {/* 이메일 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={S.fieldLabel}>이메일</label>
          <input style={{ ...S.input, color: C.inkSoft }} value={worker?.email || ""} disabled />
        </div>

        {/* 비밀번호 초기화 — 권한자만 노출 */}
        {isHolder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={S.fieldLabel}>비밀번호 초기화</label>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                style={{ ...S.input, paddingRight: 44 }}
                type={showPw ? "text" : "password"}
                placeholder="새 비밀번호 입력 (4자 이상)"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              <button
                onClick={() => setShowPw((v) => !v)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 2, lineHeight: 1 }}
                title={showPw ? "숨기기" : "보기"}
              >{showPw ? "🙈" : "👁️"}</button>
            </div>
            <button
              style={{ border: "none", borderRadius: 10, padding: "0 14px", fontSize: 13, fontWeight: 700, background: C.amber, color: "#fff", cursor: "pointer", flexShrink: 0 }}
              onClick={handleResetPw}
              disabled={busy}
            >변경</button>
          </div>
        </div>
        )}

        {/* 등록된 기기 — 권한자만 노출 */}
        {isHolder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={S.fieldLabel}>등록된 기기</label>
            {canInvite && (
              <button
                onClick={() => { setShowInvite((v) => !v); setInvMsg({ text: "", ok: true }); }}
                style={{ border: `1px solid ${C.blue}`, background: showInvite ? C.blue : "#fff", color: showInvite ? "#fff" : C.blue, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >{showInvite ? "닫기" : "＋ 관리자 추가"}</button>
            )}
          </div>

          {canInvite && showInvite && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#f6f8fa", border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>관리자 정보를 입력하면 등록 링크를 이메일·문자로 보냅니다. 받은 사람이 <b>등록할 기기</b>에서 링크를 열면 등록됩니다.</div>
              <input style={{ ...S.input, padding: "7px 10px", fontSize: 13 }} placeholder="관리자명" value={inv.managerName} onChange={(e) => setInv({ ...inv, managerName: e.target.value })} />
              <input style={{ ...S.input, padding: "7px 10px", fontSize: 13 }} placeholder="이메일" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
              <input style={{ ...S.input, padding: "7px 10px", fontSize: 13 }} placeholder="전화번호" value={inv.phone} onChange={(e) => setInv({ ...inv, phone: e.target.value })} />
              <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700, marginTop: 2 }}>담당 법인 (복수 선택)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {corpList.length === 0 && <span style={{ fontSize: 12, color: C.inkSoft }}>등록된 법인 없음</span>}
                {corpList.map((c) => {
                  const on = inv.corps.includes(c);
                  return <span key={c} onClick={() => setInv({ ...inv, corps: toggleInArr(inv.corps, c) })} style={{ padding: "5px 11px", borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? C.blue : C.line}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.inkSoft }}>{c}</span>;
                })}
              </div>
              <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700, marginTop: 2 }}>권한 (복수 선택, 미선택 시 읽기 전용)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PERM_OPTIONS.map(([k, label]) => {
                  const on = inv.permSel.includes(k);
                  return <span key={k} onClick={() => setInv({ ...inv, permSel: toggleInArr(inv.permSel, k) })} style={{ padding: "5px 11px", borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? C.blue : C.line}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.inkSoft }}>{label}</span>;
                })}
              </div>
              <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700, marginTop: 2 }}>권한 팀 (복수 선택, 미선택 시 전체)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                {teamList.length === 0 && <span style={{ fontSize: 12, color: C.inkSoft }}>등록된 팀 없음</span>}
                {teamList.map((tm) => {
                  const on = inv.teamSel.includes(tm);
                  return <span key={tm} onClick={() => setInv({ ...inv, teamSel: toggleInArr(inv.teamSel, tm) })} style={{ padding: "5px 11px", borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? C.blue : C.line}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.inkSoft }}>{tm}</span>;
                })}
              </div>
              {invMsg.text && <div style={{ fontSize: 12, fontWeight: 600, color: invMsg.ok ? C.green : C.seal }}>{invMsg.text}</div>}
              <button style={{ border: "none", borderRadius: 8, padding: "8px", fontSize: 13, fontWeight: 700, background: C.blue, color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }} onClick={() => submitInvite(false)} disabled={busy}>{busy ? "발송 중…" : "등록 링크 보내기"}</button>
            </div>
          )}

          {inviteAsk && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
              <div style={{ background: "#fff", borderRadius: 14, padding: "20px 18px", maxWidth: 340, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 14, color: C.ink, fontWeight: 600, margin: 0, lineHeight: 1.6 }}>{inviteAsk}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ flex: 1, border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: 11, fontSize: 14, fontWeight: 700, color: C.inkSoft, cursor: "pointer" }} onClick={() => setInviteAsk("")} disabled={busy}>취소</button>
                  <button style={{ flex: 1, border: "none", background: C.blue, borderRadius: 10, padding: 11, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }} onClick={() => submitInvite(true)} disabled={busy}>추가</button>
                </div>
              </div>
            </div>
          )}

          {loadingDevices ? (
            <div style={{ fontSize: 13, color: C.inkSoft }}>불러오는 중…</div>
          ) : adminDevices.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkSoft }}>등록된 기기가 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(adminDevices.reduce((acc, d) => {
                const k = d.device_name || "(이름없음)";
                (acc[k] ||= []).push(d); return acc;
              }, {})).map(([mName, devs]) => (
                <ManagerCard key={mName} name={mName} devices={devs} isHolder={isHolder}
                  authorityCount={adminDevices.filter((x) => x.is_authority).length}
                  corpList={corpList} teamList={teamList}
                  onApprove={onApproveDevice} onRemove={onRemoveDevice} onTransfer={handleTransfer} onSaveInfo={onSaveDeviceInfo} />
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.inkSoft }}>권한자 기기도 삭제할 수 있지만, 마지막 권한자 기기는 삭제할 수 없습니다.</div>
        </div>
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
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pw)) { setErr("비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다."); return; }
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
        <input style={S.input} value={pw} placeholder="영문·숫자 포함 8자 이상" onChange={(e) => setPw(e.target.value)} />
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
  const [pendingCount, setPendingCount] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [etcPopup, setEtcPopup] = useState(null);
  const fileRef = useRef(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("problem"); // problem(문제계정) | all(전체인원)
  const [accessMsg, setAccessMsg] = useState("");       // 권한 밖 인원 검색 안내

  const isHolder = !!currentUser?.isAuthorityHolder; // 권한자만 관리자 기기 관리(승인 대기 등)
  // 세부 권한: 직원관리 쓰기('staff')가 있어야 직원 수정/삭제/추가 등 가능
  const _perms = currentUser?.permissions || [];
  const canWrite = !!currentUser?.isAuthorityHolder || _perms.includes("staff");

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

  const handleSaveDeviceInfo = async (deviceRowId, data) => {
    await api.updateDeviceInfo(deviceRowId, data);
    setMsg("기기 정보가 저장되었습니다.");
    if (adminTarget) await refreshAdminDevices(adminTarget.id);
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
  // 문제 계정: 기기 미등록 / 비번 미변경 / 계정 잠김
  const isProblem = (w) => !w.device_id || w.must_change_password || w.is_locked;

  // 카테고리 필터 + 이름 검색
  const term = search.trim().toLowerCase();
  const matchName = (w) => !term || (w.name || "").toLowerCase().includes(term);
  const filtered = workers.filter((w) => {
    if (filters.corp     && w.corp     !== filters.corp)     return false;
    if (filters.division && w.division !== filters.division) return false;
    if (filters.team     && w.team     !== filters.team)     return false;
    if (filters.position && w.position !== filters.position) return false;
    return matchName(w);
  });

  const admins = filtered.filter(isAdmin);
  const workerRows = filtered.filter((w) => !isAdmin(w));
  // 토글: 문제계정 / 전체
  const shownWorkers = viewMode === "problem" ? workerRows.filter(isProblem) : workerRows;
  const shownAdmins = viewMode === "problem" ? admins.filter((a) => a.is_locked || a.must_change_password) : admins;

  // 본부 > 팀 그룹핑 (개별 리포트/전체현황과 동일한 방식)
  const groupByTeam = (list) => {
    const m = {};
    for (const w of list) {
      const key = [w.corp, w.division, w.team].filter(Boolean).join(" > ") || "(미지정)";
      (m[key] ||= { label: key, members: [] }).members.push(w);
    }
    return Object.values(m).sort((a, b) => a.label.localeCompare(b.label, "ko"))
      .map((g) => ({ ...g, members: g.members.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko")) }));
  };
  const workerGroups = groupByTeam(shownWorkers);
  const totalShown = shownAdmins.length + shownWorkers.length;

  // 검색했는데 결과가 없으면, 권한 밖에 존재하는 인원인지 확인해 안내
  useEffect(() => {
    if (!term || totalShown > 0) { setAccessMsg(""); return; }
    let cancelled = false;
    api.checkWorkerAccess(search.trim())
      .then((d) => { if (!cancelled) setAccessMsg(d.blocked?.length ? `${d.blocked[0]}에 대한 열람 권한이 없습니다. 인적자원팀에 문의하세요.` : ""); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [term, totalShown]);

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

  // 근로자 비밀번호를 전화번호로 자동 초기화 (관리자가 새 비번을 입력하지 않음)
  const resetPw = async (w) => {
    if (!confirm(`${w.name}의 비밀번호를 전화번호(${fmtPhone(w.phone)})로 초기화하시겠습니까?`)) return;
    try {
      const r = await api.resetWorkerPassword(w.id);
      setMsg(`${w.name} 비밀번호가 전화번호로 초기화되었습니다. (임시 비번: ${r?.initPassword || fmtPhone(w.phone)})`);
      load();
    } catch (e) { setMsg(e.message); }
  };

  // 상태 배지 + 관리 버튼 (카드 공용) — 버튼은 2열 균등 폭 그리드
  const renderActions = (w) => {
    const isAdminRole = w.role !== "worker";
    const mod = { color: "#636a7a", borderColor: "#636a7a" };
    const del = { color: "#c8594e", borderColor: "#c8594e" };
    const dev = { color: "#2f6d8f", borderColor: C.blueSoft };
    const pw  = { color: "#be8b29", borderColor: C.amberSoft };
    const base = { ...S.miniBtn, marginLeft: 0, fontSize: 13, padding: "7px 0", width: "100%", textAlign: "center" };
    const status = (
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap", marginBottom: 2 }}>
        {w.must_change_password && <span style={{ ...S.badge, color: C.amber, background: C.amberSoft, fontSize: 10 }}>비번미변경</span>}
        <span style={{ ...S.badge, color: w.is_locked ? C.seal : C.green, background: w.is_locked ? C.sealSoft : C.greenSoft }}>{w.is_locked ? "잠김" : "정상"}</span>
      </div>
    );
    if (isAdminRole) return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        {status}
        <button style={{ ...base, ...mod, width: 56 }} onClick={() => openAdminProfile(w)}>수정</button>
      </div>
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        {status}
        <div style={{ display: "grid", gridTemplateColumns: "56px 84px", gap: 6 }}>
          {canWrite && <button style={{ ...base, ...mod }} onClick={() => setEditTarget(w)}>수정</button>}
          {canWrite && <button style={{ ...base, ...pw }} onClick={() => resetPw(w)}>비번초기화</button>}
          {canWrite && <button style={{ ...base, ...del }} onClick={() => deleteWorker(w)}>삭제</button>}
          {canWrite && <button style={{ ...base, ...dev }} onClick={() => resetDevice(w)}>기기변경</button>}
          {w.is_locked && canWrite && <button style={{ ...base, color: C.green, gridColumn: "1 / -1", width: "100%" }} onClick={() => unlock(w)}>잠금해제</button>}
        </div>
      </div>
    );
  };

  const groupHeaderStyle = { fontSize: isMobile ? 13 : 14, fontWeight: 800, color: C.blue, padding: "4px 2px", borderBottom: `2px solid ${C.blueSoft}` };

  // 직원/관리자 카드 1개
  const workerCard = (w) => {
    const isAdminRole = w.role !== "worker";
    const flags = [w.note_exempt && "근무노트제외", w.irregular_worker && "비정기적 근무"].filter(Boolean).join(", ");
    const fsMain = isMobile ? 14 : 16;
    const fsSub = isMobile ? 13 : 15;
    const fsBody = isMobile ? 12 : 14;
    return (
      <div key={w.id} style={{ ...S.hrRow, alignItems: "flex-start", padding: "12px 14px 8px", background: isAdminRole ? "#eef4f9" : "#fff", borderColor: isAdminRole ? C.blue : C.lineAdmin }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: C.ink, fontSize: fsMain, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            {w.name}
            {isAdminRole ? (
              <span style={{ ...S.badge, background: "#dcebe1", color: "#468161", fontSize: fsSub - 2 }}>관리자</span>
            ) : (
              <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: fsBody }}>
                {[w.position, [w.corp, w.division, w.team].filter(Boolean).join(" · ")].filter(Boolean).join(" / ")}
              </span>
            )}
          </div>
          {isMobile ? (
            <>
              {w.email && <div style={{ fontSize: fsBody, color: C.inkSoft, lineHeight: 1.7 }}>{w.email}</div>}
              {!isAdminRole && <div style={{ fontSize: fsBody, color: C.inkSoft, lineHeight: 1.7 }}>{fmtPhone(w.phone)}</div>}
            </>
          ) : (
            (w.email || (!isAdminRole && w.phone)) && (
              <div style={{ fontSize: fsBody, color: C.inkSoft, lineHeight: 1.7 }}>
                {[w.email, !isAdminRole ? fmtPhone(w.phone) : null].filter(Boolean).join(" / ")}
              </div>
            )
          )}
          {!isAdminRole && (
            <div style={{ fontSize: fsBody, color: C.inkSoft, lineHeight: 1.7 }}>
              근무지: {w.workplace_name || "미지정"} / {w.scheduled_start?.slice(0, 5)}~{w.scheduled_end?.slice(0, 5)}
              {flags && ` (${flags})`}
            </div>
          )}
          <div style={{ fontSize: fsBody, color: isAdminRole ? C.blue : (w.device_id ? C.green : C.amber), fontWeight: 700, lineHeight: 1.7 }}>
            기기: {isAdminRole ? "다중 기기 관리" : (w.device_id ? "등록됨" : "미등록")}
          </div>
        </div>
        {renderActions(w)}
      </div>
    );
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 검색"
            style={{ ...S.input, padding: "7px 12px", fontSize: 13, width: isMobile ? 130 : 170 }}
          />
          {/* 문제계정만 보기 토글 (엑셀업로드 왼쪽) */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }} title="문제계정만 보기">
            <span style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700, whiteSpace: "nowrap" }}>문제계정만</span>
            <span onClick={() => setViewMode(viewMode === "problem" ? "all" : "problem")}
              style={{ width: 38, height: 22, borderRadius: 11, background: viewMode === "problem" ? C.blue : "#cfd6e0", position: "relative", transition: "background .15s", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 2, left: viewMode === "problem" ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }} />
            </span>
          </label>
          {canWrite && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
              <button style={{ ...S.toolbarBtn, background: "#fff", border: `1px solid ${C.blueSoft}`, color: C.blue }} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? "업로드 중…" : "엑셀 업로드"}
              </button>
              <button style={{ ...S.toolbarBtn, border: "none", background: C.blue, color: "#fff" }} onClick={() => setEditTarget({})}>
                + 직원 추가
              </button>
            </>
          )}
        </div>
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

      {accessMsg && (
        <div style={{ ...S.empty, color: C.seal, fontWeight: 700, background: C.sealSoft, borderRadius: 10 }}>{accessMsg}</div>
      )}

      {!accessMsg && totalShown === 0 && (
        <div style={{ ...S.empty, color: C.inkSoft, opacity: 0.7 }}>
          {term ? "검색 결과가 없습니다." : viewMode === "problem" ? "문제가 발생한 계정이 없습니다." : "표시할 직원이 없습니다."}
        </div>
      )}

      {/* 관리자 그룹 */}
      {shownAdmins.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={groupHeaderStyle}>관리자 <span style={{ fontWeight: 400, color: C.inkSoft }}>({shownAdmins.length})</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {shownAdmins.map(workerCard)}
          </div>
        </div>
      )}

      {/* 본부 > 팀 그룹 */}
      {workerGroups.map((g) => (
        <div key={g.label} style={{ marginBottom: 14 }}>
          <div style={groupHeaderStyle}>{g.label} <span style={{ fontWeight: 400, color: C.inkSoft }}>({g.members.length})</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {g.members.map(workerCard)}
          </div>
        </div>
      ))}

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
          onSaveDeviceInfo={handleSaveDeviceInfo}
          onClose={() => setAdminTarget(null)}
        />
      )}

    </div>
  );
}
