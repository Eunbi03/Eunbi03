import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";
import { readHolidaySheet } from "../../utils/excelUpload.js";

// 지정 색상 팔레트
const COL = {
  black: "#3a3a3a", gray: "#787878", lgray: "#eeeeee",
  blue: "#2f6d8f", red: "#cb6156", lred: "#fff0f0", white: "#ffffff",
  formBg: "#f3f9fc",
};

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return isMobile;
}

// 포커스 시 테두리 푸른색·굵게, 기본 검정, 오류 시 붉은색
function FInput({ error, style, ...props }) {
  const [focus, setFocus] = useState(false);
  const border = error ? COL.red : focus ? COL.blue : COL.black;
  return (
    <input
      {...props}
      onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
      style={{
        width: "100%", boxSizing: "border-box", borderRadius: 8, background: COL.white,
        padding: "10px 12px", fontSize: 14, color: COL.black,
        border: `${focus || error ? 2 : 1}px solid ${border}`, outline: "none", ...style,
      }}
    />
  );
}

const labelStyle = { fontSize: 13, fontWeight: 700, color: COL.black, marginBottom: 6, display: "block" };
const formCardStyle = { background: COL.formBg, border: `1px solid ${C.lineAdmin}`, borderRadius: 14, padding: 20, marginBottom: 16 };
const formTitleStyle = { fontWeight: 800, fontSize: 17, color: COL.blue, margin: "0 0 16px" };

function AddButton({ children, onClick }) {
  return (
    <button onClick={onClick}
      style={{ border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, background: COL.blue, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}
function DeleteButton({ onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ border: `1px solid ${COL.lred}`, background: COL.lred, borderRadius: 8, padding: "7px 14px", fontSize: 13, color: COL.red, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
      삭제
    </button>
  );
}
function EditButton({ onClick }) {
  return (
    <button onClick={onClick}
      style={{ border: `1px solid ${C.lineAdmin}`, background: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, color: COL.gray, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
      수정
    </button>
  );
}
function Msg({ msg }) {
  if (!msg?.text) return null;
  return <div style={{ fontSize: 13, color: msg.ok ? C.green : COL.red, fontWeight: 600, marginBottom: 12 }}>{msg.text}</div>;
}
function CardRow({ children }) {
  return <div style={{ border: `1px solid ${C.lineAdmin}`, borderRadius: 12, padding: "14px 18px", marginBottom: 8, background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>{children}</div>;
}

/* ── 근무지 관리 (좌표 입력 방식 유지 — 주소검색은 주소 API 단계에서) ───────── */
function WorkplaceSection() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false); const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", lat: "", lng: "", radius_m: 300 });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const load = () => { setLoading(true); api.getWorkplaces().then((d) => setList(d.workplaces || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const reset = () => { setForm({ name: "", lat: "", lng: "", radius_m: 300 }); setAdding(false); setEditing(null); };
  const save = async () => {
    if (!form.name.trim()) { setMsg({ text: "근무지명을 입력해주세요.", ok: false }); return; }
    if (!form.lat || !form.lng) { setMsg({ text: "위도·경도를 입력해주세요.", ok: false }); return; }
    setBusy(true); setMsg(null);
    const body = { name: form.name.trim(), lat: parseFloat(form.lat), lng: parseFloat(form.lng), radiusM: parseInt(form.radius_m, 10) || 300 };
    try {
      if (editing) await api.updateWorkplace(editing, body); else await api.createWorkplace(body);
      reset(); setMsg({ text: "저장되었습니다.", ok: true }); load();
    } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const del = async (id) => { if (!window.confirm("이 근무지를 삭제하시겠습니까?")) return; setBusy(true); try { await api.deleteWorkplace(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>근무지 관리</p>
        {!adding && !editing && <AddButton onClick={() => { setForm({ name: "", lat: "", lng: "", radius_m: 300 }); setAdding(true); setMsg(null); }}>+ 근무지 추가</AddButton>}
      </div>
      <Msg msg={msg} />
      {(adding || editing) && (
        <div style={formCardStyle}>
          <p style={formTitleStyle}>{editing ? "근무지 수정" : "새 근무지 추가"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>근무지명 *</label><FInput placeholder="예: 새말센터" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={labelStyle}>참고 반경 (미터) *</label><FInput type="number" value={form.radius_m} onChange={(e) => setForm((f) => ({ ...f, radius_m: e.target.value }))} /></div>
            <div><label style={labelStyle}>위도 *</label><FInput type="number" step="any" placeholder="예: 37.5665" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} /></div>
            <div><label style={labelStyle}>경도 *</label><FInput type="number" step="any" placeholder="예: 126.9780" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ ...S.subGhost, flex: 1 }} onClick={reset} disabled={busy}>취소</button>
            <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}
      {loading ? <div style={S.empty}>불러오는 중…</div> : !list.length && !adding ? <div style={S.empty}>등록된 근무지가 없습니다.</div> : list.map((wp) => (
        <CardRow key={wp.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: C.ink, margin: "0 0 3px" }}>{wp.name} <span style={{ fontSize: 12, color: COL.gray, fontWeight: 400 }}>반경 {wp.radius_m || 300}m</span></p>
            <p style={{ fontSize: 13, color: COL.gray, margin: 0 }}>위도 {wp.lat} · 경도 {wp.lng}</p>
          </div>
          <EditButton onClick={() => { setForm({ name: wp.name || "", lat: wp.lat, lng: wp.lng, radius_m: wp.radius_m || 300 }); setEditing(wp.id); setAdding(false); setMsg(null); }} />
          <DeleteButton onClick={() => del(wp.id)} disabled={busy} />
        </CardRow>
      ))}
    </div>
  );
}

/* ── 근무시간(직무) 관리 ─────────────────────────────────────────────────── */
function JobScheduleSection() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false); const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", workStart: "09:00", workEnd: "18:00", breakStart: "12:00", breakEnd: "13:00" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const load = () => { setLoading(true); api.getJobSchedules().then((d) => setList(d.jobSchedules || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const reset = () => { setForm({ name: "", workStart: "09:00", workEnd: "18:00", breakStart: "12:00", breakEnd: "13:00" }); setAdding(false); setEditing(null); };
  const save = async () => {
    if (!form.name.trim()) { setMsg({ text: "직무명을 입력해주세요.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      if (editing) await api.updateJobSchedule(editing, form); else await api.createJobSchedule(form);
      reset(); setMsg({ text: "저장되었습니다.", ok: true }); load();
    } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const del = async (id) => { if (!window.confirm("이 근무시간을 삭제하시겠습니까?")) return; setBusy(true); try { await api.deleteJobSchedule(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };
  const timeField = (label, key) => (
    <div><label style={labelStyle}>{label}</label><FInput type="time" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} /></div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>근무시간 관리</p>
        {!adding && !editing && <AddButton onClick={() => { reset(); setAdding(true); setMsg(null); }}>+ 근무시간 추가</AddButton>}
      </div>
      <Msg msg={msg} />
      {(adding || editing) && (
        <div style={formCardStyle}>
          <p style={formTitleStyle}>{editing ? "근무시간 수정" : "새 근무시간 추가"}</p>
          <label style={labelStyle}>직무명 *</label>
          <FInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{timeField("출근 시간 *", "workStart")}{timeField("퇴근 시간 *", "workEnd")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{timeField("휴게 시작 *", "breakStart")}{timeField("휴게 종료 *", "breakEnd")}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ ...S.subGhost, flex: 1 }} onClick={reset} disabled={busy}>취소</button>
            <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}
      {loading ? <div style={S.empty}>불러오는 중…</div> : !list.length && !adding ? <div style={S.empty}>등록된 근무시간이 없습니다.</div> : list.map((j) => (
        <CardRow key={j.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: C.ink, margin: "0 0 3px" }}>{j.name}</p>
            <p style={{ fontSize: 13, color: COL.gray, margin: 0 }}>근무시간: {j.workStart}~{j.workEnd} / 휴게시간: {j.breakStart}~{j.breakEnd}</p>
          </div>
          <EditButton onClick={() => { setForm({ name: j.name, workStart: j.workStart, workEnd: j.workEnd, breakStart: j.breakStart, breakEnd: j.breakEnd }); setEditing(j.id); setAdding(false); setMsg(null); }} />
          <DeleteButton onClick={() => del(j.id)} disabled={busy} />
        </CardRow>
      ))}
    </div>
  );
}

/* ── 법인 관리 ────────────────────────────────────────────────────────────── */
function CorporationSection() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const load = () => { setLoading(true); api.getCorporations().then((d) => setList(d.corporations || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.name.trim()) { setMsg({ text: "법인명을 입력해주세요.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try { await api.createCorporation(form.name.trim(), form.address.trim()); setForm({ name: "", address: "" }); setAdding(false); setMsg({ text: "저장되었습니다.", ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const del = async (id) => { if (!window.confirm("이 법인을 삭제하시겠습니까?")) return; setBusy(true); try { await api.deleteCorporation(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>법인 관리</p>
        {!adding && <AddButton onClick={() => { setForm({ name: "", address: "" }); setAdding(true); setMsg(null); }}>+ 법인 추가</AddButton>}
      </div>
      <Msg msg={msg} />
      {adding && (
        <div style={formCardStyle}>
          <p style={formTitleStyle}>새 법인 추가</p>
          <label style={labelStyle}>법인명 *</label>
          <FInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <label style={{ ...labelStyle, marginTop: 12 }}>주소</label>
          <FInput value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ ...S.subGhost, flex: 1 }} onClick={() => { setAdding(false); setMsg(null); }} disabled={busy}>취소</button>
            <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}
      {loading ? <div style={S.empty}>불러오는 중…</div> : !list.length && !adding ? <div style={S.empty}>등록된 법인이 없습니다.</div> : list.map((c) => (
        <CardRow key={c.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: C.ink, margin: "0 0 3px" }}>{c.name}</p>
            <p style={{ fontSize: 13, color: COL.gray, margin: 0 }}>{c.address || "주소 없음"}</p>
          </div>
          <DeleteButton onClick={() => del(c.id)} disabled={busy} />
        </CardRow>
      ))}
    </div>
  );
}

/* ── 본부 및 팀 관리 ──────────────────────────────────────────────────────── */
function DivisionSection() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", teams: "" }); // teams: 쉼표 구분
  const [teamInput, setTeamInput] = useState({}); // divisionId -> 입력값
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const load = () => { setLoading(true); api.getDivisions().then((d) => setList(d.divisions || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const saveDivision = async () => {
    if (!form.name.trim()) { setMsg({ text: "본부명을 입력해주세요.", ok: false }); return; }
    const teams = form.teams.split(",").map((t) => t.trim()).filter(Boolean);
    setBusy(true); setMsg(null);
    try { await api.createDivision(form.name.trim(), teams); setForm({ name: "", teams: "" }); setAdding(false); setMsg({ text: "본부가 추가되었습니다.", ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const addTeam = async (divId) => {
    const name = (teamInput[divId] || "").trim(); if (!name) return;
    setBusy(true); try { await api.addTeam(divId, name); setTeamInput((t) => ({ ...t, [divId]: "" })); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const delDivision = async (id) => { if (!window.confirm("이 본부와 소속 팀을 모두 삭제하시겠습니까?")) return; setBusy(true); try { await api.deleteDivision(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };
  const delTeam = async (id) => { setBusy(true); try { await api.deleteTeam(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>본부 및 팀 관리</p>
        {!adding && <AddButton onClick={() => { setForm({ name: "", teams: "" }); setAdding(true); setMsg(null); }}>+ 본부 추가</AddButton>}
      </div>
      <Msg msg={msg} />
      {adding && (
        <div style={formCardStyle}>
          <p style={formTitleStyle}>새 본부 추가</p>
          <label style={labelStyle}>본부명 *</label>
          <FInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <label style={{ ...labelStyle, marginTop: 12 }}>팀 (쉼표로 여러 개, 선택)</label>
          <FInput placeholder="예: A팀, B팀, C팀" value={form.teams} onChange={(e) => setForm((f) => ({ ...f, teams: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ ...S.subGhost, flex: 1 }} onClick={() => { setAdding(false); setMsg(null); }} disabled={busy}>취소</button>
            <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={saveDivision} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}
      {loading ? <div style={S.empty}>불러오는 중…</div> : !list.length && !adding ? <div style={S.empty}>등록된 본부가 없습니다.</div> : list.map((d) => (
        <div key={d.id} style={{ border: `1px solid ${C.lineAdmin}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <p style={{ flex: 1, fontWeight: 800, fontSize: 15, color: COL.blue, margin: 0 }}>{d.name}</p>
            <DeleteButton onClick={() => delDivision(d.id)} disabled={busy} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {d.teams.length === 0 && <span style={{ fontSize: 13, color: COL.gray }}>등록된 팀 없음</span>}
            {d.teams.map((t) => (
              <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COL.lgray, borderRadius: 999, padding: "5px 10px 5px 12px", fontSize: 13, color: COL.black }}>
                {t.name}
                <button onClick={() => delTeam(t.id)} disabled={busy} aria-label="팀 삭제"
                  style={{ border: "none", background: "transparent", color: COL.gray, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <FInput placeholder="팀 추가" value={teamInput[d.id] || ""} style={{ flex: 1 }}
              onChange={(e) => setTeamInput((t) => ({ ...t, [d.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") addTeam(d.id); }} />
            <button style={{ ...S.subGhost, padding: "8px 16px" }} onClick={() => addTeam(d.id)} disabled={busy}>추가</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 직책 관리 (여러 개 동시 추가) ────────────────────────────────────────── */
function PositionSection() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState(""); // 쉼표/줄바꿈 구분
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const load = () => { setLoading(true); api.getPositions().then((d) => setList(d.positions || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const save = async () => {
    const names = text.split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) { setMsg({ text: "직책명을 입력해주세요.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try { await api.createPositions(names); setText(""); setAdding(false); setMsg({ text: "저장되었습니다.", ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const del = async (id) => { if (!window.confirm("이 직책을 삭제하시겠습니까?")) return; setBusy(true); try { await api.deletePosition(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>직책 관리</p>
        {!adding && <AddButton onClick={() => { setText(""); setAdding(true); setMsg(null); }}>+ 직책 추가</AddButton>}
      </div>
      <Msg msg={msg} />
      {adding && (
        <div style={formCardStyle}>
          <p style={formTitleStyle}>새 직책 추가</p>
          <label style={labelStyle}>직책명 (쉼표 또는 줄바꿈으로 여러 개)</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder="예: 사원, 선임, 책임, 수석"
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, background: COL.white, padding: "10px 12px", fontSize: 14, color: COL.black, border: `1px solid ${COL.black}`, outline: "none", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ ...S.subGhost, flex: 1 }} onClick={() => { setAdding(false); setMsg(null); }} disabled={busy}>취소</button>
            <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}
      {loading ? <div style={S.empty}>불러오는 중…</div> : !list.length && !adding ? <div style={S.empty}>등록된 직책이 없습니다.</div> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {list.map((p) => (
            <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${C.lineAdmin}`, background: "#fff", borderRadius: 999, padding: "7px 12px 7px 14px", fontSize: 14, color: C.ink, fontWeight: 700 }}>
              {p.name}
              <button onClick={() => del(p.id)} disabled={busy} aria-label="직책 삭제" style={{ border: "none", background: "transparent", color: COL.red, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 공휴일 관리 (연도 이동) ──────────────────────────────────────────────── */
function HolidaySection() {
  const [all, setAll] = useState([]); const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: "", name: "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const load = () => { setLoading(true); api.getHolidays().then((d) => setAll(d.holidays || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const yearList = all.filter((h) => h.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date));
  const save = async () => {
    if (!form.date) { setMsg({ text: "날짜를 입력해주세요.", ok: false }); return; }
    if (!form.name.trim()) { setMsg({ text: "이름을 입력해주세요.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try { await api.createHoliday(form.date, form.name.trim()); setForm({ date: "", name: "" }); setAdding(false); setMsg({ text: "추가되었습니다.", ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const del = async (id) => { if (!window.confirm("이 공휴일을 삭제하시겠습니까?")) return; setBusy(true); try { await api.deleteHoliday(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };
  const fileRef = useRef(null);
  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (e.target) e.target.value = "";
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const rows = await readHolidaySheet(file);
      if (!rows.length) { setMsg({ text: "'공휴일 관리' 시트에 데이터가 없습니다.", ok: false }); return; }
      const r = await api.bulkHolidays(rows);
      setMsg({ text: `성공 ${r.success}건 · 실패 ${r.failed.length}건${r.failed.length ? " (" + r.failed.map((f) => f.date).join(", ") + ")" : ""}`, ok: r.failed.length === 0 });
      load();
    } catch (err) { setMsg({ text: "업로드 실패: " + err.message, ok: false }); }
    finally { setBusy(false); }
  };
  const fmt = (d) => { const [y, m, day] = d.split("-"); return `${y.slice(2)}-${m}-${day}`; };
  const arrow = (dir) => (
    <button onClick={() => setYear((y) => y + dir)} aria-label={dir > 0 ? "다음 해" : "지난 해"}
      style={{ border: `1px solid ${C.lineAdmin}`, background: "#fff", borderRadius: 8, width: 34, height: 34, cursor: "pointer", color: COL.blue, fontSize: 16, fontWeight: 800 }}>{dir > 0 ? "›" : "‹"}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>공휴일 관리</p>
        {!adding && (
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              style={{ border: `1px solid ${C.lineAdmin}`, background: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 700, color: COL.blue, cursor: "pointer" }}>엑셀 업로드</button>
            <AddButton onClick={() => { setForm({ date: "", name: "" }); setAdding(true); setMsg(null); }}>+ 공휴일 추가</AddButton>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {arrow(-1)}
        <span style={{ fontWeight: 800, fontSize: 17, color: C.ink, minWidth: 64, textAlign: "center" }}>{year}년</span>
        {arrow(1)}
      </div>
      <Msg msg={msg} />
      {adding && (
        <div style={formCardStyle}>
          <p style={formTitleStyle}>새 공휴일 추가</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <div><label style={labelStyle}>날짜 *</label><FInput type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
            <div><label style={labelStyle}>이름 *</label><FInput placeholder="예: 추석" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ ...S.subGhost, flex: 1 }} onClick={() => { setAdding(false); setMsg(null); }} disabled={busy}>취소</button>
            <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}
      {loading ? <div style={S.empty}>불러오는 중…</div> : !yearList.length ? <div style={S.empty}>{year}년 등록된 공휴일이 없습니다.</div> : yearList.map((h) => (
        <CardRow key={h.id}>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{fmt(h.date)}</span>
          <span style={{ flex: 1, fontSize: 15, color: COL.gray, marginLeft: 10 }}>{h.name}</span>
          <DeleteButton onClick={() => del(h.id)} disabled={busy} />
        </CardRow>
      ))}
    </div>
  );
}

/* ── 설정 페이지 (단일 카테고리 드롭다운) ─────────────────────────────────── */
const CATEGORIES = [
  { key: "workplace", label: "근무지 관리" },
  { key: "jobSchedule", label: "근무시간 관리" },
  { key: "corporation", label: "법인 관리" },
  { key: "division", label: "본부 및 팀 관리" },
  { key: "position", label: "직책 관리" },
  { key: "holiday", label: "공휴일 관리" },
];

export default function AdminSettings() {
  const [cat, setCat] = useState("workplace");
  return (
    <div>
      <select value={cat} onChange={(e) => setCat(e.target.value)}
        style={{ ...S.select, maxWidth: 320, marginBottom: 20, padding: "11px 14px", fontSize: 15, borderColor: COL.black, fontWeight: 700, color: C.ink }}>
        {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      {cat === "workplace" && <WorkplaceSection />}
      {cat === "jobSchedule" && <JobScheduleSection />}
      {cat === "corporation" && <CorporationSection />}
      {cat === "division" && <DivisionSection />}
      {cat === "position" && <PositionSection />}
      {cat === "holiday" && <HolidaySection />}
    </div>
  );
}
