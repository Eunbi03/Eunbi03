import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";
import { readHolidaySheet, readWorkplaceSheet } from "../../utils/excelUpload.js";

// 지정 색상 팔레트
const COL = {
  black: "#3a3a3a", gray: "#787878", lgray: "#eeeeee",
  blue: "#2f6d8f", red: "#cb6156", lred: "#fff0f0", white: "#ffffff",
  formBg: "#f3f9fc",
};
const HEADER_BG_H = "#d8e8f0"; // 공휴일 그리드 헤더 배경

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
      style={{ border: "none", background: COL.lred, borderRadius: 8, padding: "7px 14px", fontSize: 13, color: COL.red, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
      삭제
    </button>
  );
}
// 행 단위 '추가' 버튼 (수정/삭제와 동일 크기)
function RowAddButton({ onClick }) {
  return (
    <button onClick={onClick}
      style={{ border: `1px solid ${COL.blue}`, background: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, color: COL.blue, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
      추가
    </button>
  );
}
function EditButton({ onClick }) {
  return (
    <button onClick={onClick}
      style={{ border: `1px solid ${COL.gray}`, background: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, color: COL.gray, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
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

/* ── 근무지 관리: 거래처(client) > 지점(branch) 묶음 ───────────────────────── */
const emptyWp = { clientName: "", branchName: "", radius_m: 500, address: "", detailAddress: "", postalCode: "", lat: "", lng: "" };
function WorkplaceSection({ canEdit }) {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef(null);

  // 근무지 행 추가/수정 폼 (주소 검색 포함). kind: 'add' | 'single' | 'branch'
  const [rowForm, setRowForm] = useState(null); // { kind, id, ...emptyWp }
  // 거래처 수정 폼 (거래처명 + 참고반경)
  const [clientForm, setClientForm] = useState(null); // { oldClientName, clientName, radius_m }
  const [openClient, setOpenClient] = useState(null); // 펼친 거래처명
  const [delMode, setDelMode] = useState(null);  // 지점 삭제모드인 거래처명
  const [sel, setSel] = useState({});            // 선택된 지점 id

  const load = () => { setLoading(true); api.getWorkplaces().then((d) => setList(d.workplaces || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const closeForms = () => { setRowForm(null); setClientForm(null); };
  const setRF = (k, v) => setRowForm((f) => ({ ...f, [k]: v }));

  // 거래처별 그룹핑 (list는 서버에서 client_name, branch 순으로 정렬됨)
  const groups = [];
  const byClient = {};
  for (const wp of list) {
    const c = wp.client_name || wp.name;
    if (!byClient[c]) { byClient[c] = { clientName: c, radius_m: wp.radius_m || 500, branches: [] }; groups.push(byClient[c]); }
    byClient[c].branches.push(wp);
  }
  const isSingle = (g) => g.branches.length === 1 && !g.branches[0].branch_name;

  const search = async () => {
    if (!rowForm?.address.trim()) { setMsg({ text: "주소를 입력한 뒤 검색하세요.", ok: false }); return; }
    setSearching(true); setMsg(null);
    try {
      const g = await api.geocodeAddress(rowForm.address.trim());
      setRowForm((f) => ({ ...f, address: g.road || f.address, postalCode: g.zone || "", lat: g.lat, lng: g.lng }));
    } catch (e) { setMsg({ text: "주소 검색 실패: " + e.message, ok: false }); }
    finally { setSearching(false); }
  };

  const saveRow = async () => {
    const f = rowForm;
    if (f.kind !== "branch" && !f.clientName.trim()) { setMsg({ text: "거래처명을 입력해주세요.", ok: false }); return; }
    if ((f.kind === "branch" || f.kind === "addBranch") && !f.branchName.trim()) { setMsg({ text: "지점명을 입력해주세요.", ok: false }); return; }
    if (f.lat === "" || f.lng === "") { setMsg({ text: "주소를 검색해 좌표를 채워주세요.", ok: false }); return; }
    // '새 근무지 추가'인데 같은 거래처가 이미 있으면 → 지점으로 추가할지 확인
    if (f.kind === "add") {
      const exists = groups.some((g) => g.clientName === f.clientName.trim());
      if (exists) {
        if (!f.branchName.trim()) { setMsg({ text: "이미 있는 거래처입니다. 지점명을 입력해 지점으로 추가하세요.", ok: false }); return; }
        if (!window.confirm("동일한 거래처가 존재합니다. 지점으로 추가하시겠습니까?")) return;
      }
    }
    setBusy(true); setMsg(null);
    const base = { lat: parseFloat(f.lat), lng: parseFloat(f.lng), address: f.address.trim(), postalCode: f.postalCode, detailAddress: f.detailAddress.trim() };
    try {
      if (f.kind === "add" || f.kind === "addBranch") {
        await api.createWorkplace({ ...base, clientName: f.clientName.trim(), branchName: f.branchName.trim(), radiusM: parseInt(f.radius_m, 10) || 500 });
      } else if (f.kind === "single") {
        await api.updateWorkplace(f.id, { ...base, clientName: f.clientName.trim(), radiusM: parseInt(f.radius_m, 10) || 500 });
      } else { // branch
        await api.updateWorkplace(f.id, { ...base, branchName: f.branchName.trim() });
      }
      closeForms(); setMsg({ text: "저장되었습니다.", ok: true }); load();
    } catch (e) {
      if (e.status === 409 && e.payload?.dup) setMsg({ text: "이미 등록된 근무지명 또는 주소입니다.", ok: false });
      else setMsg({ text: e.message, ok: false });
    } finally { setBusy(false); }
  };

  const saveClient = async () => {
    const f = clientForm;
    if (!f.clientName.trim()) { setMsg({ text: "거래처명을 입력해주세요.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.updateWorkplaceClient({ oldClientName: f.oldClientName, clientName: f.clientName.trim(), radiusM: parseInt(f.radius_m, 10) || 500 });
      closeForms(); setMsg({ text: "저장되었습니다.", ok: true }); load();
    } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };

  const delClient = async (g) => {
    const n = g.branches.length;
    if (!window.confirm(`'${g.clientName}' 거래처${n > 1 ? ` (지점 ${n}개)` : ""}를 모두 삭제하시겠습니까?\n(과거 기록은 보존됩니다)`)) return;
    setBusy(true); setMsg(null);
    try {
      if (isSingle(g)) await api.deleteWorkplace(g.branches[0].id);
      else await api.deleteWorkplaceClient(g.clientName);
      load();
    } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };

  const toggleDel = async (clientName) => {
    if (delMode === clientName) { // '확인' → 선택 삭제
      const ids = Object.keys(sel).filter((id) => sel[id]);
      if (ids.length) {
        if (!window.confirm(`선택한 ${ids.length}개 지점을 삭제하시겠습니까?\n(과거 기록은 보존됩니다)`)) return;
        setBusy(true);
        try { await api.deleteWorkplaceBranches(ids); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
      }
      setDelMode(null); setSel({});
    } else { setDelMode(clientName); setSel({}); }
  };

  const openRowAdd = () => { closeForms(); setRowForm({ ...emptyWp, kind: "add" }); setMsg(null); };
  const openBranchAdd = (g) => { closeForms(); setRowForm({ ...emptyWp, kind: "addBranch", clientName: g.clientName, radius_m: g.radius_m }); setMsg(null); };
  const openSingleEdit = (wp) => { closeForms(); setRowForm({ kind: "single", id: wp.id, clientName: wp.client_name || wp.name, branchName: "", radius_m: wp.radius_m || 500, address: wp.address || "", detailAddress: wp.detail_address || "", postalCode: wp.postal_code || "", lat: wp.lat, lng: wp.lng }); setMsg(null); };
  const openBranchEdit = (wp) => { closeForms(); setRowForm({ kind: "branch", id: wp.id, clientName: wp.client_name || "", branchName: wp.branch_name || "", radius_m: wp.radius_m || 500, address: wp.address || "", detailAddress: wp.detail_address || "", postalCode: wp.postal_code || "", lat: wp.lat, lng: wp.lng }); setMsg(null); };
  const openClientEdit = (g) => { closeForms(); setClientForm({ oldClientName: g.clientName, clientName: g.clientName, radius_m: g.radius_m }); setMsg(null); };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (e.target) e.target.value = "";
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const rows = await readWorkplaceSheet(file);
      if (!rows.length) { setMsg({ text: "'근무지 추가' 시트에 데이터가 없습니다.", ok: false }); return; }
      const r = await api.bulkWorkplaces(rows);
      const failText = r.failed.map((f) => `${f.name}(${f.reason})`).join(", ");
      setMsg({ text: `성공 ${r.success}건 · 실패 ${r.failed.length}건${failText ? " — " + failText : ""}`, ok: r.failed.length === 0 });
      load();
    } catch (err) { setMsg({ text: "업로드 실패: " + err.message, ok: false }); }
    finally { setBusy(false); }
  };

  // 근무지 행 추가/수정 폼 렌더
  const renderRowForm = () => {
    const f = rowForm; if (!f) return null;
    const title = f.kind === "add" ? "새 근무지 추가" : f.kind === "single" ? "근무지 수정" : f.kind === "addBranch" ? "지점 추가" : "지점 수정";
    const fixedClient = f.kind === "branch" || f.kind === "addBranch"; // 거래처명 고정(지점 작업)
    return (
      <div style={formCardStyle}>
        <p style={formTitleStyle}>{title}</p>
        {fixedClient && <div style={{ fontSize: 12, color: COL.gray, marginBottom: 8 }}>거래처: <b style={{ color: C.ink }}>{f.clientName}</b> <span style={{ color: COL.gray }}>· 반경 {f.radius_m}m</span></div>}
        {!fixedClient ? (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>{f.kind === "add" ? "거래처명 *" : "근무지명 *"}</label><FInput placeholder="예: 이마트" value={f.clientName} onChange={(e) => setRF("clientName", e.target.value)} /></div>
            <div><label style={labelStyle}>참고 반경 (미터) *</label><FInput type="number" value={f.radius_m} onChange={(e) => setRF("radius_m", e.target.value)} /></div>
          </div>
        ) : null}
        {(f.kind === "add" || f.kind === "branch" || f.kind === "addBranch") && (
          <div style={{ marginTop: 12 }}><label style={labelStyle}>지점명 {f.kind === "add" ? "(단일 근무지면 비워두세요)" : "*"}</label><FInput placeholder="예: 강릉점" value={f.branchName} onChange={(e) => setRF("branchName", e.target.value)} /></div>
        )}
        <label style={{ ...labelStyle, marginTop: 12 }}>주소 *</label>
        <div style={{ display: "flex", gap: 8 }}>
          <FInput placeholder="주소 입력 후 검색" value={f.address} style={{ flex: 1 }}
            onChange={(e) => { setRF("address", e.target.value); setRF("lat", ""); setRF("lng", ""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
          <button onClick={search} disabled={searching} style={{ ...S.subGhost, padding: "8px 16px", whiteSpace: "nowrap" }}>{searching ? "검색 중…" : "검색"}</button>
        </div>
        <label style={{ ...labelStyle, marginTop: 12 }}>상세주소</label>
        <FInput placeholder="상세주소 (동/호 등)" value={f.detailAddress} onChange={(e) => setRF("detailAddress", e.target.value)} />
        <div style={{ fontSize: 12, color: COL.gray, marginTop: 8 }}>우편번호: {f.postalCode || "—"} &nbsp; 위도: {f.lat || "—"} &nbsp; 경도: {f.lng || "—"}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={{ ...S.subGhost, flex: 1 }} onClick={closeForms} disabled={busy}>취소</button>
          <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={saveRow} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    );
  };

  const miniBtn = (color, bg) => ({ border: `1px solid ${color}`, color, background: bg || "#fff", borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" });

  // 거래처 수정 폼 (거래처명 + 참고반경)
  const renderClientForm = () => (
    <div style={formCardStyle}>
      <p style={formTitleStyle}>거래처 수정</p>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div><label style={labelStyle}>거래처명 *</label><FInput value={clientForm.clientName} onChange={(e) => setClientForm((f) => ({ ...f, clientName: e.target.value }))} /></div>
        <div><label style={labelStyle}>참고 반경 (미터) *</label><FInput type="number" value={clientForm.radius_m} onChange={(e) => setClientForm((f) => ({ ...f, radius_m: e.target.value }))} /></div>
      </div>
      <div style={{ fontSize: 12, color: COL.gray, marginTop: 8 }}>※ 거래처명·참고반경은 이 거래처의 모든 지점에 함께 적용됩니다.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={{ ...S.subGhost, flex: 1 }} onClick={closeForms} disabled={busy}>취소</button>
        <button style={{ ...S.subPrimary, flex: 2, background: COL.blue, opacity: busy ? 0.6 : 1 }} onClick={saveClient} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>근무지 관리</p>
        {canEdit && !rowForm && !clientForm && (
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              style={{ border: `1px solid ${C.lineAdmin}`, background: "#fff", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, color: COL.blue, cursor: "pointer", whiteSpace: "nowrap" }}>엑셀 업로드</button>
            <AddButton onClick={openRowAdd}>+ 근무지 추가</AddButton>
          </div>
        )}
      </div>
      <Msg msg={msg} />
      {/* 새 근무지 추가 폼만 상단에 */}
      {rowForm && rowForm.kind === "add" && renderRowForm()}

      {loading ? <div style={S.empty}>불러오는 중…</div> : !groups.length && !rowForm ? <div style={S.empty}>등록된 근무지가 없습니다.</div> : groups.map((g) => {
        if (isSingle(g)) {
          const wp = g.branches[0];
          const editingThis = rowForm && rowForm.kind === "single" && rowForm.id === wp.id;
          return (
            <div key={g.clientName}>
              <CardRow>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 15, color: C.ink, margin: "0 0 3px" }}>{g.clientName} <span style={{ fontSize: 12, color: COL.gray, fontWeight: 400 }}>반경 {g.radius_m}m</span></p>
                  <p style={{ fontSize: 13, color: COL.gray, margin: 0 }}>{[wp.address, wp.detail_address].filter(Boolean).join(" ") || `위도 ${wp.lat} · 경도 ${wp.lng}`}</p>
                </div>
                {canEdit && <RowAddButton onClick={() => openBranchAdd(g)} />}
                {canEdit && <EditButton onClick={() => openSingleEdit(wp)} />}
                {canEdit && <DeleteButton onClick={() => delClient(g)} disabled={busy} />}
              </CardRow>
              {editingThis && renderRowForm()}
            </div>
          );
        }
        const open = openClient === g.clientName;
        return (
          <div key={g.clientName} style={{ border: `1px solid ${C.lineAdmin}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}
              onClick={() => { setOpenClient(open ? null : g.clientName); setDelMode(null); setSel({}); }}>
              <span style={{ color: COL.blue, fontSize: 12, transform: open ? "rotate(90deg)" : "none", transition: ".15s" }}>▶</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 15, color: C.ink, margin: "0 0 2px" }}>{g.clientName} <span style={{ fontSize: 11, fontWeight: 800, color: COL.blue, background: COL.blueSoft || "#e3eef4", padding: "2px 9px", borderRadius: 999, marginLeft: 4 }}>반경 {g.radius_m}m</span></p>
                <p style={{ fontSize: 12.5, color: COL.gray, margin: 0 }}>{g.branches.length}개 점</p>
              </div>
              {canEdit && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <RowAddButton onClick={() => openBranchAdd(g)} />
                  <EditButton onClick={() => openClientEdit(g)} />
                  <DeleteButton onClick={() => delClient(g)} disabled={busy} />
                </div>
              )}
            </div>
            {/* 거래처 수정 / 지점 추가 폼 — 헤더 바로 아래 */}
            {clientForm && clientForm.oldClientName === g.clientName && <div style={{ padding: "0 12px 10px" }}>{renderClientForm()}</div>}
            {rowForm && rowForm.kind === "addBranch" && rowForm.clientName === g.clientName && <div style={{ padding: "0 12px 10px" }}>{renderRowForm()}</div>}
            {open && (
              <div style={{ borderTop: `1px solid ${C.lineAdmin}`, background: COL.formBg || "#f3f9fc", padding: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 8px" }}>
                  <span style={{ fontSize: 12, color: COL.gray, fontWeight: 700 }}>지점 {g.branches.length}개</span>
                  {canEdit && <button style={delMode === g.clientName ? { ...miniBtn("#fff"), background: COL.blue, borderColor: COL.blue } : miniBtn(COL.red, "#fff5f5")}
                    onClick={() => toggleDel(g.clientName)} disabled={busy}>{delMode === g.clientName ? "확인" : "삭제"}</button>}
                </div>
                {g.branches.map((wp) => {
                  const editingBranch = rowForm && rowForm.kind === "branch" && rowForm.id === wp.id;
                  return (
                    <div key={wp.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${editingBranch ? COL.blue : C.lineAdmin}`, borderRadius: 9, padding: "9px 12px", margin: "6px 0", cursor: delMode === g.clientName ? "default" : "pointer" }}
                        onClick={() => { if (delMode !== g.clientName && canEdit) openBranchEdit(wp); }}>
                        {delMode === g.clientName && <input type="checkbox" style={{ width: 18, height: 18, accentColor: COL.red }} checked={!!sel[wp.id]} onChange={(e) => setSel((s) => ({ ...s, [wp.id]: e.target.checked }))} onClick={(e) => e.stopPropagation()} />}
                        <span style={{ fontWeight: 700, fontSize: 14, flex: "none", minWidth: 80 }}>{wp.branch_name || "(지점명 없음)"}</span>
                        <span style={{ fontSize: 12.5, color: COL.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[wp.address, wp.detail_address].filter(Boolean).join(" ")}</span>
                      </div>
                      {editingBranch && renderRowForm()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── 근무시간(직무) 관리 ─────────────────────────────────────────────────── */
function JobScheduleSection({ canEdit }) {
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
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>근무시간 및 직무 관리</p>
        {canEdit && !adding && !editing && <AddButton onClick={() => { reset(); setAdding(true); setMsg(null); }}>+ 근무시간 및 직무 추가</AddButton>}
      </div>
      <Msg msg={msg} />
      {(adding || editing) && (
        <div style={formCardStyle}>
          <p style={formTitleStyle}>{editing ? "근무시간 및 직무 수정" : "새 근무시간 및 직무 추가"}</p>
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
          {canEdit && <EditButton onClick={() => { setForm({ name: j.name, workStart: j.workStart, workEnd: j.workEnd, breakStart: j.breakStart, breakEnd: j.breakEnd }); setEditing(j.id); setAdding(false); setMsg(null); }} />}
          {canEdit && <DeleteButton onClick={() => del(j.id)} disabled={busy} />}
        </CardRow>
      ))}
    </div>
  );
}

/* ── 법인 관리 ────────────────────────────────────────────────────────────── */
function CorporationSection({ canEdit }) {
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
  const edit = async (c) => {
    const name = window.prompt("법인명 수정\n(이 법인으로 등록된 근로자·담당자 법인도 함께 변경됩니다)", c.name);
    if (name === null) return; const nm = name.trim();
    if (!nm || nm === c.name) return;
    setBusy(true); setMsg(null);
    try { await api.updateCorporation(c.id, { name: nm, address: c.address ?? null }); setMsg({ text: `'${c.name}' → '${nm}' 변경 완료(해당 근로자 법인도 변경됨).`, ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>법인 관리</p>
        {canEdit && !adding && <AddButton onClick={() => { setForm({ name: "", address: "" }); setAdding(true); setMsg(null); }}>+ 법인 추가</AddButton>}
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
          {canEdit && <EditButton onClick={() => edit(c)} />}
          {canEdit && <DeleteButton onClick={() => del(c.id)} disabled={busy} />}
        </CardRow>
      ))}
    </div>
  );
}

/* ── 본부 및 팀 관리 ──────────────────────────────────────────────────────── */
function DivisionSection({ canEdit }) {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", teams: "" }); // teams: 쉼표 구분
  const [teamInput, setTeamInput] = useState({}); // divisionId -> 입력값
  const [grantSel, setGrantSel] = useState({}); // divisionId -> 권한 부여 관리자명 배열
  const [managers, setManagers] = useState([]); // 선택 가능한 관리자 목록
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const load = () => { setLoading(true); api.getDivisions().then((d) => setList(d.divisions || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); api.getManagers().then((d) => setManagers(d.managers || [])).catch(() => {}); }, []);
  const toggleGrant = (divId, name) => setGrantSel((g) => {
    const cur = g[divId] || [];
    return { ...g, [divId]: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] };
  });
  const saveDivision = async () => {
    if (!form.name.trim()) { setMsg({ text: "본부명을 입력해주세요.", ok: false }); return; }
    const teams = form.teams.split(",").map((t) => t.trim()).filter(Boolean);
    setBusy(true); setMsg(null);
    try { await api.createDivision(form.name.trim(), teams); setForm({ name: "", teams: "" }); setAdding(false); setMsg({ text: "본부가 추가되었습니다.", ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const addTeam = async (divId) => {
    const name = (teamInput[divId] || "").trim(); if (!name) return;
    const grantTo = grantSel[divId] || [];
    setBusy(true);
    try {
      await api.addTeam(divId, name, grantTo);
      setTeamInput((t) => ({ ...t, [divId]: "" }));
      setGrantSel((g) => ({ ...g, [divId]: [] }));
      setMsg({ text: grantTo.length ? `팀이 추가되고 ${grantTo.length}명에게 권한이 부여되었습니다.` : "팀이 추가되었습니다.", ok: true });
      load();
    } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const delDivision = async (id) => { if (!window.confirm("이 본부와 소속 팀을 모두 삭제하시겠습니까?")) return; setBusy(true); try { await api.deleteDivision(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };
  const delTeam = async (id, name) => { if (!window.confirm(`'${name || "이 팀"}' 팀을 삭제하시겠습니까?`)) return; setBusy(true); try { await api.deleteTeam(id); load(); } catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); } };
  const editDivision = async (d) => {
    const name = window.prompt("본부명 수정\n(이 본부로 등록된 근로자도 함께 변경됩니다)", d.name);
    if (name === null) return; const nm = name.trim(); if (!nm || nm === d.name) return;
    setBusy(true); setMsg(null);
    try { await api.updateDivision(d.id, nm); setMsg({ text: `본부명 '${d.name}' → '${nm}' 변경 완료.`, ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };
  const editTeam = async (t) => {
    const name = window.prompt("팀명 수정\n(이 팀으로 등록된 근로자·관리자 권한 팀도 함께 변경됩니다)", t.name);
    if (name === null) return; const nm = name.trim(); if (!nm || nm === t.name) return;
    setBusy(true); setMsg(null);
    try { await api.updateTeam(t.id, nm); setMsg({ text: `팀명 '${t.name}' → '${nm}' 변경 완료.`, ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>본부 및 팀 관리</p>
        {canEdit && !adding && <AddButton onClick={() => { setForm({ name: "", teams: "" }); setAdding(true); setMsg(null); }}>+ 본부 추가</AddButton>}
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
            {canEdit && <EditButton onClick={() => editDivision(d)} />}
            {canEdit && <DeleteButton onClick={() => delDivision(d.id)} disabled={busy} />}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {d.teams.length === 0 && <span style={{ fontSize: 13, color: COL.gray }}>등록된 팀 없음</span>}
            {d.teams.map((t) => (
              <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COL.lgray, borderRadius: 999, padding: "5px 10px 5px 12px", fontSize: 13, color: COL.black }}>
                {canEdit
                  ? <span onClick={() => editTeam(t)} title="클릭하여 팀명 수정" style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}>{t.name}</span>
                  : t.name}
                {canEdit && <button onClick={() => delTeam(t.id, t.name)} disabled={busy} aria-label="팀 삭제"
                  style={{ border: "none", background: "transparent", color: COL.gray, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>}
              </span>
            ))}
          </div>
          {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <FInput placeholder="팀 추가" value={teamInput[d.id] || ""} style={{ flex: 1 }}
              onChange={(e) => setTeamInput((t) => ({ ...t, [d.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") addTeam(d.id); }} />
            <button style={{ ...S.subGhost, padding: "8px 16px" }} onClick={() => addTeam(d.id)} disabled={busy}>추가</button>
          </div>
          )}
          {canEdit && managers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: COL.gray, marginBottom: 6 }}>이 팀 권한을 줄 관리자 선택 (선택 안 하면 권한 변경 없음)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {managers.map((m) => {
                  const on = (grantSel[d.id] || []).includes(m.name);
                  return (
                    <span key={m.name} onClick={() => !busy && toggleGrant(d.id, m.name)}
                      style={{ padding: "4px 11px", borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: `1px solid ${on ? COL.blue : C.lineAdmin}`, background: on ? COL.blue : "#fff", color: on ? "#fff" : COL.gray }}>
                      {m.name}{m.is_authority ? " ★" : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 직책 관리 (여러 개 동시 추가) ────────────────────────────────────────── */
function PositionSection({ canEdit }) {
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
  const edit = async (p) => {
    const name = window.prompt("직책명 수정\n(이 직책으로 등록된 근로자도 함께 변경됩니다)", p.name);
    if (name === null) return; const nm = name.trim(); if (!nm || nm === p.name) return;
    setBusy(true); setMsg(null);
    try { await api.updatePosition(p.id, nm); setMsg({ text: `직책명 '${p.name}' → '${nm}' 변경 완료.`, ok: true }); load(); }
    catch (e) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>직책 관리</p>
        {canEdit && !adding && <AddButton onClick={() => { setText(""); setAdding(true); setMsg(null); }}>+ 직책 추가</AddButton>}
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
              {canEdit
                ? <span onClick={() => edit(p)} title="클릭하여 직책명 수정" style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}>{p.name}</span>
                : p.name}
              {canEdit && <button onClick={() => del(p.id)} disabled={busy} aria-label="직책 삭제" style={{ border: "none", background: "transparent", color: COL.red, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 공휴일 관리 (연도 이동) ──────────────────────────────────────────────── */
function HolidaySection({ canEdit }) {
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
        {canEdit && !adding && (
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              style={{ border: `1px solid ${C.lineAdmin}`, background: "#fff", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, color: COL.blue, cursor: "pointer", whiteSpace: "nowrap" }}>엑셀 업로드</button>
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
      {loading ? <div style={S.empty}>불러오는 중…</div> : (
        <div style={{ overflowX: "auto", border: `1px solid ${C.lineAdmin}`, borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, background: "#fff", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} style={{ border: `1px solid ${C.lineAdmin}`, background: HEADER_BG_H, padding: "6px 4px", fontSize: 13, color: C.ink }}>{i + 1}월</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {Array.from({ length: 12 }, (_, mi) => {
                  const list = yearList.filter((h) => Number(h.date.split("-")[1]) === mi + 1);
                  return (
                    <td key={mi} style={{ border: `1px solid ${C.lineAdmin}`, verticalAlign: "top", padding: "6px 4px", minWidth: 74 }}>
                      {list.map((h) => (
                        <div key={h.id} style={{ display: "flex", alignItems: "flex-start", gap: 3, marginBottom: 6, fontSize: 12, color: C.ink }}>
                          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                            <div style={{ fontWeight: 700 }}>{h.date.slice(5)}</div>
                            <div style={{ color: COL.gray }}>{h.name}</div>
                          </div>
                          {canEdit && <button onClick={() => del(h.id)} disabled={busy} aria-label="삭제" style={{ border: "none", background: "transparent", color: COL.red, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
              <tr>
                {Array.from({ length: 12 }, (_, mi) => {
                  const cnt = yearList.filter((h) => Number(h.date.split("-")[1]) === mi + 1).length;
                  return <td key={mi} style={{ border: `1px solid ${C.lineAdmin}`, textAlign: "center", padding: "5px 4px", fontSize: 13, fontWeight: 700, color: COL.blue }}>{cnt || "-"}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── 발송 메시지 관리 (문자/이메일/푸시 제목·내용) ─────────────────────────── */
function MessageTemplateSection({ canEdit }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const load = () => {
    setLoading(true);
    api.getMessageTemplates().then((d) => {
      const ts = d.templates || [];
      setList(ts);
      const dr = {}; ts.forEach((t) => { dr[t.key] = { subject: t.subject || "", body: t.body || "" }; });
      setDraft(dr);
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  const set = (key, field, v) => setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: v } }));
  const save = async (key) => {
    setBusy(key); setMsg(null);
    try { await api.updateMessageTemplate(key, draft[key]); setMsg({ text: "저장되었습니다.", ok: true }); }
    catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setBusy(""); }
  };
  if (loading) return <div style={S.empty}>불러오는 중…</div>;
  const ta = { ...S.input, minHeight: 130, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, padding: "10px 12px" };
  return (
    <div>
      <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: "0 0 6px" }}>발송 메시지 관리</p>
      <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 0 14px" }}>문자·이메일·푸시 알림의 제목과 내용{canEdit ? "을 수정할 수 있습니다. {} 안의 치환자는 발송 시 실제 값으로 바뀝니다." : "입니다."}</p>
      <Msg msg={msg} />
      {list.map((t) => (
        <div key={t.key} style={{ border: `1px solid ${C.lineAdmin}`, borderRadius: 12, padding: "14px 18px", marginBottom: 12, background: "#fff" }}>
          <p style={{ fontWeight: 800, fontSize: 15, color: COL.blue, margin: "0 0 10px" }}>{t.label}</p>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>제목</label>
          {canEdit
            ? <input style={{ ...S.input, margin: "4px 0 10px" }} value={draft[t.key]?.subject || ""} onChange={(e) => set(t.key, "subject", e.target.value)} />
            : <p style={{ margin: "4px 0 10px", fontSize: 14, color: C.ink }}>{draft[t.key]?.subject || "-"}</p>}
          <label style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>내용</label>
          {canEdit
            ? <textarea style={{ ...ta, margin: "4px 0 8px" }} value={draft[t.key]?.body || ""} onChange={(e) => set(t.key, "body", e.target.value)} />
            : <p style={{ margin: "4px 0 8px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{draft[t.key]?.body || "-"}</p>}
          {canEdit && t.placeholders && <div style={{ fontSize: 11, color: COL.gray, marginBottom: 10 }}>치환자: {t.placeholders}</div>}
          {canEdit && (
            <button style={{ ...S.subPrimary, background: COL.blue, opacity: busy === t.key ? 0.6 : 1 }} onClick={() => save(t.key)} disabled={busy === t.key}>
              {busy === t.key ? "저장 중…" : "저장"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 설정 페이지 (단일 카테고리 드롭다운) ─────────────────────────────────── */
const CATEGORIES = [
  { key: "workplace", label: "근무지 관리" },
  { key: "jobSchedule", label: "근무시간 및 직무 관리" },
  { key: "corporation", label: "법인 관리" },
  { key: "division", label: "본부 및 팀 관리" },
  { key: "position", label: "직책 관리" },
  { key: "holiday", label: "공휴일 관리" },
  { key: "message", label: "발송 메시지 관리" },
];

export default function AdminSettings({ currentUser }) {
  const [cat, setCat] = useState("workplace");
  const [catFocus, setCatFocus] = useState(false);
  const canEdit = !!currentUser?.isAuthorityHolder || (currentUser?.permissions || []).includes("settings");
  return (
    <div>
      {/* 상단 공통 필터와 동일한 높이·테두리·포커스(#0e6ca5) */}
      <select value={cat} onChange={(e) => setCat(e.target.value)}
        onFocus={() => setCatFocus(true)} onBlur={() => setCatFocus(false)}
        style={{ ...S.select, maxWidth: 320, marginBottom: 20, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink,
          borderColor: catFocus ? "#0e6ca5" : C.lineAdmin, outline: "none", boxShadow: catFocus ? "inset 0 0 0 1px #0e6ca5" : "none" }}>
        {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      {cat === "workplace" && <WorkplaceSection canEdit={canEdit} />}
      {cat === "jobSchedule" && <JobScheduleSection canEdit={canEdit} />}
      {cat === "corporation" && <CorporationSection canEdit={canEdit} />}
      {cat === "division" && <DivisionSection canEdit={canEdit} />}
      {cat === "position" && <PositionSection canEdit={canEdit} />}
      {cat === "holiday" && <HolidaySection canEdit={canEdit} />}
      {cat === "message" && <MessageTemplateSection canEdit={canEdit} />}
    </div>
  );
}
