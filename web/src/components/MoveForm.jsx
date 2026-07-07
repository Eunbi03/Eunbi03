import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import { getLocation } from "../utils/device.js";
import * as api from "../api/client.js";

export default function MoveForm({ onClose, onDone }) {
  const [destination, setDestination] = useState("");
  const [workplaceId, setWorkplaceId] = useState(null); // 등록 근무지 선택 시 id (거리 계산 가능)
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [places, setPlaces] = useState([]);   // 등록된 근무지 [{id,name}]
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    api.getOutingWorkplaces().then((d) => setPlaces(d.workplaces || [])).catch(() => setPlaces([]));
  }, []);

  // 입력한 글자를 포함하는 근무지만 노출 (입력 전에는 표시하지 않음)
  const q = destination.trim();
  const matches = q ? places.filter((p) => p.name.includes(q)) : [];

  const onType = (v) => {
    setDestination(v);
    setWorkplaceId(null); // 직접 입력하면 근무지 연결 해제 (거리 계산 X)
    setShowList(true);
  };
  const pick = (p) => {
    setDestination(p.name);
    setWorkplaceId(p.id);   // 등록 근무지 선택 → 거리 계산 O
    setShowList(false);
  };

  const submit = async () => {
    if (!destination.trim()) { setErr("목적지를 입력해주세요."); return; }
    setBusy(true);
    setErr("");
    try {
      const loc = await getLocation();
      if (!loc) { setErr("위치를 가져올 수 없습니다. 위치 권한과 GPS를 확인해주세요."); setBusy(false); return; }
      await api.startOuting(loc, destination.trim(), reason, workplaceId);
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.formCard, marginTop: 0 }}>
      <p style={S.formTitle}>외근 시작</p>

      <label style={S.fieldLabel}>목적지 *</label>
      <div style={{ position: "relative" }}>
        <input
          style={S.input}
          value={destination}
          placeholder="등록된 근무지명 일부를 입력하거나 직접 입력"
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setShowList(true)}
          onBlur={() => setTimeout(() => setShowList(false), 150)}
        />
        {showList && matches.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
            {matches.map((p) => (
              <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}
                style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "10px 14px", fontSize: 14, color: C.ink, cursor: "pointer", borderBottom: `1px solid ${C.line}` }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: workplaceId ? C.green : C.inkSoft, marginTop: 4 }}>
        {workplaceId ? "등록 근무지 선택됨 — 거리 계산됩니다" : "목록에서 선택하면 거리 계산, 직접 입력 시 거리 계산은 되지 않습니다"}
      </div>

      <label style={{ ...S.fieldLabel, marginTop: 10, display: "block" }}>사유</label>
      <input style={S.input} value={reason} placeholder="선택 입력" onChange={(e) => setReason(e.target.value)} />

      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
        <button style={{ ...S.subPrimary, background: C.amber, opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
          {busy ? "처리 중…" : "외근 시작"}
        </button>
      </div>
    </div>
  );
}
