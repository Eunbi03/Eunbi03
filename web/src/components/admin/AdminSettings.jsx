import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

function WpForm({ initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState(
    initial || { name: "", lat: "", lng: "", radius_m: 200 }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <label style={S.fieldLabel}>근무지 이름 *</label>
      <input style={S.input} placeholder="예: 서울 본사" value={form.name}
        onChange={(e) => set("name", e.target.value)} />
      <label style={S.fieldLabel}>위도 (Latitude) *</label>
      <input style={S.input} placeholder="예: 37.5665" type="number" step="any" value={form.lat}
        onChange={(e) => set("lat", e.target.value)} />
      <label style={S.fieldLabel}>경도 (Longitude) *</label>
      <input style={S.input} placeholder="예: 126.9780" type="number" step="any" value={form.lng}
        onChange={(e) => set("lng", e.target.value)} />
      <label style={S.fieldLabel}>참고 반경 (미터)</label>
      <input style={S.input} type="number" min="50" max="5000" value={form.radius_m}
        onChange={(e) => set("radius_m", e.target.value)} />
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button style={S.subGhost} onClick={onCancel} disabled={busy}>취소</button>
        <button
          style={{ ...S.subPrimary, background: C.ink, opacity: busy ? 0.6 : 1 }}
          onClick={() => onSave(form)} disabled={busy}
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

function HolidaySection() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setHLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });

  const load = () => {
    setHLoading(true);
    api.getHolidays()
      .then((d) => setHolidays(d.holidays || []))
      .catch(() => {})
      .finally(() => setHLoading(false));
  };
  useEffect(() => { load(); }, []);

  const ok = (text) => setMsg({ text, ok: true });
  const fail = (text) => setMsg({ text, ok: false });

  const handleCreate = async () => {
    if (!form.date) { fail("날짜를 입력해주세요."); return; }
    if (!form.name.trim()) { fail("이름을 입력해주세요."); return; }
    setBusy(true); setMsg({ text: "", ok: true });
    try {
      await api.createHoliday(form.date, form.name.trim());
      setAdding(false);
      setForm({ date: "", name: "" });
      ok("공휴일이 추가되었습니다.");
      load();
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 공휴일을 삭제하시겠습니까?")) return;
    setBusy(true); setMsg({ text: "", ok: true });
    try {
      await api.deleteHoliday(id);
      ok("삭제되었습니다.");
      load();
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 15, color: C.ink, margin: 0 }}>공휴일 관리</p>
        {!adding && (
          <button
            style={{ border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, background: C.ink, color: "#fff", cursor: "pointer" }}
            onClick={() => { setAdding(true); setMsg({ text: "", ok: true }); }}
          >+ 공휴일 추가</button>
        )}
      </div>

      {msg.text && (
        <div style={{ fontSize: 13, color: msg.ok ? C.green : C.seal, fontWeight: 600, marginBottom: 12 }}>
          {msg.text}
        </div>
      )}

      {adding && (
        <div style={{ ...S.formCard, marginTop: 0, marginBottom: 16 }}>
          <p style={S.formTitle}>새 공휴일 추가</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <label style={S.fieldLabel}>날짜 *</label>
            <input style={S.input} type="date" value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <label style={S.fieldLabel}>이름 *</label>
            <input style={S.input} placeholder="예: 추석" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button style={S.subGhost} onClick={() => { setAdding(false); setMsg({ text: "", ok: true }); }} disabled={busy}>취소</button>
              <button
                style={{ ...S.subPrimary, background: C.ink, opacity: busy ? 0.6 : 1 }}
                onClick={handleCreate} disabled={busy}
              >{busy ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={S.empty}>불러오는 중…</div>
      ) : !holidays.length && !adding ? (
        <div style={S.empty}>등록된 공휴일이 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {holidays.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 14px", background: "#fff" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{h.date}</span>
                <span style={{ fontSize: 13, color: C.inkSoft, marginLeft: 10 }}>{h.name}</span>
              </div>
              <button
                style={{ border: `1px solid ${C.sealSoft}`, background: C.sealSoft, borderRadius: 7, padding: "5px 10px", fontSize: 12, color: C.seal, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                onClick={() => handleDelete(h.id)} disabled={busy}
              >삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSettings() {
  const [workplaces, setWorkplaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });

  const load = () => {
    setLoading(true);
    api.getWorkplaces()
      .then((d) => setWorkplaces(d.workplaces || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const ok = (text) => setMsg({ text, ok: true });
  const fail = (text) => setMsg({ text, ok: false });

  const handleCreate = async (form) => {
    if (!form.name.trim()) { fail("이름을 입력해주세요."); return; }
    if (!form.lat || !form.lng) { fail("위도와 경도를 입력해주세요."); return; }
    setBusy(true); setMsg({ text: "", ok: true });
    try {
      await api.createWorkplace({
        name: form.name.trim(),
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        radiusM: parseInt(form.radius_m, 10) || 200,
      });
      setAdding(false);
      ok("근무지가 추가되었습니다.");
      load();
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  };

  const handleUpdate = async (form) => {
    if (!form.name.trim()) { fail("이름을 입력해주세요."); return; }
    if (!form.lat || !form.lng) { fail("위도와 경도를 입력해주세요."); return; }
    setBusy(true); setMsg({ text: "", ok: true });
    try {
      await api.updateWorkplace(editing, {
        name: form.name.trim(),
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        radiusM: parseInt(form.radius_m, 10) || 200,
      });
      setEditing(null);
      ok("수정되었습니다.");
      load();
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 근무지를 삭제하시겠습니까?")) return;
    setBusy(true); setMsg({ text: "", ok: true });
    try {
      await api.deleteWorkplace(id);
      ok("삭제되었습니다.");
      load();
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <p style={{ fontWeight: 800, fontSize: 15, color: C.ink, margin: 0 }}>근무지 관리</p>
        {!adding && (
          <button
            style={{ border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, background: C.ink, color: "#fff", cursor: "pointer" }}
            onClick={() => { setAdding(true); setEditing(null); setMsg({ text: "", ok: true }); }}
          >+ 근무지 추가</button>
        )}
      </div>

      {msg.text && (
        <div style={{ fontSize: 13, color: msg.ok ? C.green : C.seal, fontWeight: 600, marginBottom: 12 }}>
          {msg.text}
        </div>
      )}

      {adding && (
        <div style={{ ...S.formCard, marginTop: 0, marginBottom: 16 }}>
          <p style={S.formTitle}>새 근무지 추가</p>
          <WpForm
            onSave={handleCreate}
            onCancel={() => { setAdding(false); setMsg({ text: "", ok: true }); }}
            busy={busy}
          />
        </div>
      )}

      {!workplaces.length && !adding && (
        <div style={S.empty}>등록된 근무지가 없습니다.</div>
      )}

      {workplaces.map((wp) => (
        <div key={wp.id} style={{ border: `1px solid ${C.amber}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, background: "#f5f0e8" }}>
          {editing === wp.id ? (
            <>
              <p style={{ ...S.formTitle, marginBottom: 12 }}>근무지 수정</p>
              <WpForm
                initial={{
                  name: wp.name || "",
                  lat: wp.lat,
                  lng: wp.lng,
                  radius_m: wp.radius_m || 200,
                }}
                onSave={handleUpdate}
                onCancel={() => { setEditing(null); setMsg({ text: "", ok: true }); }}
                busy={busy}
              />
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: C.ink, margin: "0 0 4px" }}>{wp.name || "이름 없음"}</p>
                <p style={{ fontSize: 12, color: C.inkSoft, margin: 0 }}>
                  위도 {wp.lat} · 경도 {wp.lng} · 반경 {wp.radius_m || 200}m
                </p>
              </div>
              <button
                style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: C.inkSoft, cursor: "pointer", flexShrink: 0 }}
                onClick={() => { setEditing(wp.id); setAdding(false); setMsg({ text: "", ok: true }); }}
              >수정</button>
              <button
                style={{ border: `1px solid ${C.sealSoft}`, background: C.sealSoft, borderRadius: 8, padding: "6px 10px", fontSize: 12, color: C.seal, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                onClick={() => handleDelete(wp.id)}
                disabled={busy}
              >삭제</button>
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 20, padding: "12px 16px", background: "#f8f9fc", borderRadius: 12, fontSize: 12, color: C.inkSoft, lineHeight: 1.8 }}>
        <p style={{ fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>안내</p>
        반경은 참고용이며 출퇴근 제한에 사용되지 않습니다. 출퇴근 시 GPS 거리가 기록되어 개별 리포트에서 확인할 수 있습니다.
      </div>

      <HolidaySection />
    </div>
  );
}
