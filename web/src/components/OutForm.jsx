import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import { getLocation } from "../utils/device.js";
import * as api from "../api/client.js";

// 퇴근 및 업무노트.
//  - 출근 장소: 자동완성(등록 근무지)/직접입력. 기본값 = 출근 시 자동 감지된 근무지.
//      등록 근무지 선택 → 출근 GPS 기준 거리 재계산 / 직접입력(미등록) → 거리 측정 안 함.
//  - 퇴근 장소: 진행 중 외근지 있으면(팝업 "예") 그 외근지, 아니면 출근 장소와 동일(연동).
//      등록 근무지면 퇴근 GPS로 거리계산, 미등록이면 거리 없음.
//  - 외근 장소: 오늘 외근지 자동 나열.
//  - 검증: 출근≠퇴근인데 외근 기록도 없고 외근칸도 비면 → 알림 + 퇴근 차단.
// 자동완성 드롭다운 (모듈 최상위 — 렌더마다 재생성 방지)
function DropList({ matches, onPick }) {
  return (
    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
      {matches.map((p) => (
        <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(p)}
          style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "10px 14px", fontSize: 14, color: C.ink, cursor: "pointer", borderBottom: `1px solid ${C.line}` }}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

export default function OutForm({ onClose, onDone, workplaceName, checkInPlace = null, initialNote = "", outings = [], activeOuting = null }) {
  const dests = outings.map((o) => o.destination).filter(Boolean);
  const lastDest = activeOuting?.destination || "";

  // 출근 장소 기본값 = 감지된 출근 근무지 → (배정 근무지)
  const defaultIn = checkInPlace || workplaceName || "";
  const [workNoteIn, setWorkNoteIn] = useState(defaultIn);
  const [workNoteInId, setWorkNoteInId] = useState(null);   // 등록 근무지 선택 시 id (거리계산)
  const [inEdited, setInEdited] = useState(false);          // 근로자가 출근 장소를 손댔는지

  // 퇴근 장소 기본값 = 출근 장소와 동일 (진행 중 외근이면 팝업에서 외근지로 교체)
  const [workNoteOut, setWorkNoteOut] = useState(defaultIn);
  const [workNoteOutId, setWorkNoteOutId] = useState(null);
  const [outTouched, setOutTouched] = useState(false);      // 퇴근 장소를 직접 수정했는지(수정 후 연동 중단)

  const [workNoteField, setWorkNoteField] = useState(dests.join(", "));
  const [workNoteToday, setWorkNoteToday] = useState(initialNote);

  const [places, setPlaces] = useState([]);                 // 등록 근무지 [{id,name}]
  const [showInList, setShowInList] = useState(false);
  const [showOutList, setShowOutList] = useState(false);
  const [askOuting, setAskOuting] = useState(!!activeOuting);
  const [warn, setWarn] = useState(false);                  // 외근 깜빡 경고 모달
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getOutingWorkplaces().then((d) => setPlaces(d.workplaces || [])).catch(() => setPlaces([]));
  }, []);

  // 근무지 목록 로드 후, 아직 손대지 않은 기본값이 등록 근무지명과 일치하면 id 연결(거리계산 가능).
  const findId = (name) => places.find((p) => p.name === (name || "").trim())?.id || null;
  useEffect(() => {
    if (places.length === 0) return;
    if (!inEdited && !workNoteInId) { const id = findId(workNoteIn); if (id) setWorkNoteInId(id); }
    if (!outTouched && !workNoteOutId) { const id = findId(workNoteOut); if (id) setWorkNoteOutId(id); }
  }, [places]); // eslint-disable-line react-hooks/exhaustive-deps

  const inMatches = showInList && workNoteIn.trim() ? places.filter((p) => p.name.includes(workNoteIn.trim())) : [];
  const outMatches = showOutList && workNoteOut.trim() ? places.filter((p) => p.name.includes(workNoteOut.trim())) : [];

  // 출근 장소 변경 → (진행 중 외근이 아니고, 퇴근 장소를 직접 수정하지 않았으면) 퇴근 장소도 연동.
  const syncOut = (name, id) => {
    if (!activeOuting && !outTouched) { setWorkNoteOut(name); setWorkNoteOutId(id); }
  };
  const onTypeIn = (v) => { setWorkNoteIn(v); setWorkNoteInId(null); setInEdited(true); setShowInList(true); syncOut(v, null); };
  const pickIn = (p) => { setWorkNoteIn(p.name); setWorkNoteInId(p.id); setInEdited(true); setShowInList(false); syncOut(p.name, p.id); };
  const onTypeOut = (v) => { setWorkNoteOut(v); setWorkNoteOutId(null); setOutTouched(true); setShowOutList(true); };
  const pickOut = (p) => { setWorkNoteOut(p.name); setWorkNoteOutId(p.id); setOutTouched(true); setShowOutList(false); };

  const submit = async () => {
    // 외근 깜빡 방지: 출근≠퇴근인데 오늘 외근 기록 없음 + 외근칸 비어있음 → 차단
    if (workNoteIn.trim() !== workNoteOut.trim() && outings.length === 0 && !workNoteField.trim()) {
      setWarn(true); return;
    }
    setBusy(true);
    setErr("");
    try {
      const loc = await getLocation();
      if (!loc) { setErr("위치를 가져올 수 없습니다. 위치 권한과 GPS를 확인해주세요."); setBusy(false); return; }
      await api.checkOut(loc, {
        workNoteIn, workNoteInWorkplaceId: workNoteInId, workNoteInEdited: inEdited,
        workNoteOut, workNoteOutWorkplaceId: workNoteOutId,
        workNoteField, workNoteToday,
      });
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.formCard, marginTop: 0 }}>
      <p style={S.formTitle}>퇴근 및 업무 노트</p>

      <label style={S.fieldLabel}>출근 장소</label>
      <div style={{ position: "relative" }}>
        <input
          style={S.input}
          placeholder="등록 근무지명 일부 입력 또는 직접 입력"
          value={workNoteIn}
          onChange={(e) => onTypeIn(e.target.value)}
          onFocus={() => setShowInList(true)}
          onBlur={() => setTimeout(() => setShowInList(false), 150)}
        />
        {inMatches.length > 0 && <DropList matches={inMatches} onPick={pickIn} />}
      </div>
      <div style={{ fontSize: 11, color: workNoteInId ? C.green : C.inkSoft, marginTop: 4 }}>
        {workNoteInId ? "등록 근무지 — 거리 계산됨" : "직접 입력 — 거리 측정 안 함 (목록에서 고르면 거리 계산)"}
      </div>

      <label style={{ ...S.fieldLabel, marginTop: 10, display: "block" }}>퇴근 장소</label>
      <div style={{ position: "relative" }}>
        <input
          style={S.input}
          placeholder="등록 근무지명 일부 입력 또는 직접 입력"
          value={workNoteOut}
          onChange={(e) => onTypeOut(e.target.value)}
          onFocus={() => setShowOutList(true)}
          onBlur={() => setTimeout(() => setShowOutList(false), 150)}
        />
        {outMatches.length > 0 && <DropList matches={outMatches} onPick={pickOut} />}
      </div>
      <div style={{ fontSize: 11, color: workNoteOutId ? C.green : C.inkSoft, marginTop: 4 }}>
        {workNoteOutId ? "등록 근무지 — 거리 계산됨" : "직접 입력(외근지 등) — 거리 측정 안 함"}
      </div>

      <label style={{ ...S.fieldLabel, marginTop: 10, display: "block" }}>외근 장소 (선택)</label>
      <input
        style={S.input}
        placeholder="외근이 있었다면 장소를 입력해주세요"
        value={workNoteField}
        onChange={(e) => setWorkNoteField(e.target.value)}
      />

      <label style={{ ...S.fieldLabel, marginTop: 10, display: "block" }}>오늘 업무 내용</label>
      <textarea
        style={{ ...S.input, minHeight: 80, resize: "vertical" }}
        placeholder="오늘 진행한 업무를 입력해주세요"
        value={workNoteToday}
        onChange={(e) => setWorkNoteToday(e.target.value)}
      />

      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
        <button
          style={{ ...S.subPrimary, background: C.ink, opacity: busy ? 0.6 : 1 }}
          onClick={submit} disabled={busy}
        >
          {busy ? "처리 중…" : "퇴근"}
        </button>
      </div>

      {/* 외근지에서 바로 퇴근하는지 확인 (진행 중 외근이 있을 때만) */}
      {askOuting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.5, margin: "0 0 18px" }}>
              외근지에서 바로 퇴근하시겠습니까?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...S.subGhost, flex: 1 }}
                onClick={() => { setWorkNoteOut(workNoteIn); setWorkNoteOutId(workNoteInId); setAskOuting(false); }}
              >아니요</button>
              <button
                style={{ ...S.subPrimary, flex: 1, background: C.amber }}
                onClick={() => { setWorkNoteOut(lastDest); setWorkNoteOutId(findId(lastDest)); setOutTouched(true); setAskOuting(false); }}
              >예</button>
            </div>
          </div>
        </div>
      )}

      {/* 외근 깜빡 방지 경고 — 확인만 가능, 퇴근은 완료되지 않음 */}
      {warn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 210, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.ink, margin: "0 0 8px" }}>⚠️ 외근 내용을 확인해주세요</p>
            <p style={{ fontSize: 13.5, color: "#444", lineHeight: 1.6, margin: "0 0 18px" }}>
              출근 장소와 퇴근 장소가 다른데 외근 기록이 없습니다.<br />
              출근·퇴근 장소와 외근 내용을 다시 확인해주세요.
            </p>
            <button style={{ ...S.subPrimary, width: "60%", background: C.ink }} onClick={() => setWarn(false)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
