import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import { getDeviceId } from "../utils/device.js";
import * as api from "../api/client.js";

// 직원용 / 관리자용 테마를 완전히 다르게 구성합니다
const THEMES = {
  worker: {
    pageBg: "#f4f6f7",
    cardBg: "#ffffff",
    cardBorder: "transparent",     // 테두리 없이 그림자만
    cardShadow: "0 8px 28px rgba(30,36,48,0.12)",
    title: "TimeCard",
    subtitle: null,
    titleColor: C.ink,
    subColor: C.inkSoft,
    icon: null,            // 직원용은 아이콘 없음
    badge: null,
    titleSize: 22,
    labelSize: 12,
    inputSize: 15,
    idLabel: "전화번호",
    idType: "tel",
    idAutoComplete: "username",
    idPlaceholder: "하이픈 없이 숫자만 (예: 01012345678)",
    inputBg: "#fff",
    inputBorder: "#c9e6f4",
    inputColor: C.ink,
    labelColor: C.inkSoft,
    btnBg: "#333333",
    btnColor: "#fff",
    linkColor: C.ink,
    crossText: "관리자이신가요?",
    crossLabel: "관리자 페이지",
    crossHref: "/admin",
  },
  admin: {
    pageBg: "#070a10",            // 더 어둡게 — 카드와 단차 강화
    cardBg: "#1e2536",           // 더 밝게 — 떠 보이게
    cardBorder: "#39435a",
    cardShadow: "0 20px 60px rgba(0,0,0,0.6)",
    title: "관리자 콘솔",
    subtitle: "Admin Console",
    titleColor: "#fff",
    subColor: "#8b94a8",
    icon: "",
    badge: { text: "관리자·인적자원팀 전용", bg: "#2d4a7a", color: "#cfe0f5" },
    titleSize: 28,               // 크게
    labelSize: 14,               // 크게
    inputSize: 16,               // 크게
    idLabel: "이메일",
    idType: "email",
    idAutoComplete: "email",
    idPlaceholder: "",
    inputBg: "#10141d",
    inputBorder: "#39435a",
    inputColor: "#fff",
    labelColor: "#aab3c5",
    btnBg: "#2d6cdf",
    btnColor: "#fff",
    linkColor: "#7fa8e8",
    crossText: "직원 출퇴근 화면은",
    crossLabel: "여기",
    crossHref: "/",
  },
};

export default function Login({ onLogin, mode = "worker", extraError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [failCount, setFailCount] = useState(0);
  const [serverNote, setServerNote] = useState(""); // 기기 불일치 등 조치가 필요한 실제 안내

  // 미등록 관리자 기기: 승인요청(관리자명/업무용 전화번호/권한 범위) 2단계 화면
  const [deviceStep, setDeviceStep] = useState(false);
  const [teamsList, setTeamsList] = useState([]);
  const [reqName, setReqName] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqPerms, setReqPerms] = useState([]);   // 선택된 권한 키 배열
  const [reqTeams, setReqTeams] = useState([]);   // 선택된 팀명 배열
  const [reqDone, setReqDone] = useState("");      // 승인요청 완료 안내

  const t = THEMES[mode] || THEMES.worker;

  useEffect(() => {
    if (deviceStep && teamsList.length === 0) {
      api.getPublicTeams().then((d) => setTeamsList(d.teams || [])).catch(() => {});
    }
  }, [deviceStep]);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setErr(`${t.idLabel}와 비밀번호를 입력해주세요.`); return; }
    setBusy(true);
    setErr("");
    setServerNote("");
    try {
      const deviceId = await getDeviceId();
      // 근로자는 전화번호(숫자만), 관리자는 이메일(소문자)로 로그인
      const username = mode === "admin" ? email.trim().toLowerCase() : email.replace(/\D/g, "");
      const user = await api.login({ username, password, deviceId });
      onLogin(user);
    } catch (e) {
      // 미등록 관리자 기기 → 승인요청 폼으로 전환
      if (e.payload?.needDeviceRequest) { setDeviceStep(true); setErr(""); setBusy(false); return; }
      setErr(e.message);
      const rem = e.payload?.remainingAttempts;
      const msg = e.message || "";
      const isLocked = /(잠겼|잠금)/.test(msg);
      if (e.status === 403 && !isLocked) setServerNote(msg);
      if (typeof rem === "number") setFailCount(Math.max(1, 5 - rem));
      else if (isLocked) setFailCount(5);
      else setFailCount((c) => c + 1);
    } finally {
      setBusy(false);
    }
  };

  const toggleTeam = (name) => {
    setReqTeams((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
  };

  const submitDeviceRequest = async (e) => {
    e.preventDefault();
    if (!reqName.trim() || !reqPhone.trim()) { setErr("관리자명과 업무용 전화번호를 입력해주세요."); return; }
    if (reqTeams.length === 0) { setErr("권한 팀을 1개 이상 선택해주세요."); return; }
    setBusy(true); setErr("");
    try {
      const deviceId = await getDeviceId();
      const username = email.trim().toLowerCase();
      await api.login({
        username, password, deviceId,
        managerName: reqName.trim(), phone: reqPhone.trim(),
        permissions: reqPerms, teams: reqTeams,
      });
      // 정상 로그인으로 이어지지 않고 승인 대기 응답(403)이 오므로 아래 catch에서 처리됨
    } catch (e) {
      if (e.payload?.pendingApproval) {
        setReqDone("승인 요청이 전송되었습니다.\n권한자의 승인 후 로그인할 수 있습니다.");
      } else if (e.payload?.duplicateManager) {
        setErr(e.message); // 이미 등록된 관리자입니다...
      } else {
        setErr(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: "12px 14px",
    fontSize: t.inputSize, color: t.inputColor, background: t.inputBg,
    width: "100%", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: t.labelSize, fontWeight: 700, color: t.labelColor };

  // ── 미등록 관리자 기기: 승인요청 화면 ──────────────────────────
  if (mode === "admin" && deviceStep) {
    // 본부별로 팀 묶기
    const byDivision = {};
    for (const row of teamsList) { (byDivision[row.division] ||= []).push(row.team); }
    const chipStyle = (active) => ({
      padding: "7px 12px", borderRadius: 18, fontSize: 13, fontWeight: 700, cursor: "pointer",
      border: `1px solid ${active ? "#2d6cdf" : t.inputBorder}`,
      background: active ? "#2d6cdf" : t.inputBg, color: active ? "#fff" : t.inputColor,
    });
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: t.pageBg, padding: "max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))" }}>
        <form onSubmit={submitDeviceRequest} style={{ width: "100%", maxWidth: 400, background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 18, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 12, boxShadow: t.cardShadow }}>
          <div style={{ textAlign: "center", marginBottom: 4 }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: t.titleColor, margin: 0 }}>기기 승인 요청</p>
            <p style={{ fontSize: 13, color: t.subColor, margin: "6px 0 0" }}>등록되지 않은 기기입니다. 아래 정보를 입력해 승인을 요청하세요.</p>
          </div>

          {reqDone ? (
            <>
              <p style={{ fontSize: 14, color: "#8fd19e", fontWeight: 700, whiteSpace: "pre-line", textAlign: "center", margin: "10px 0" }}>{reqDone}</p>
              <button type="button" onClick={() => { setDeviceStep(false); setReqDone(""); }} style={{ border: "none", borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, color: t.btnColor, background: t.btnBg, cursor: "pointer" }}>로그인 화면으로</button>
            </>
          ) : (
            <>
              <label style={labelStyle}>관리자명</label>
              <input style={inputStyle} value={reqName} onChange={(e) => setReqName(e.target.value)} disabled={busy} placeholder="이름" />
              <label style={labelStyle}>업무용 전화번호</label>
              <input style={inputStyle} type="tel" value={reqPhone} onChange={(e) => setReqPhone(e.target.value)} disabled={busy} placeholder="예: 01012345678" />

              <label style={labelStyle}>권한 (복수 선택, 미선택 시 읽기 전용)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[["staff","근로자관리 쓰기"],["report_leave","개별리포트(연차)"],["report_full","개별리포트(전체)"],["settings","설정 쓰기"]].map(([k,label]) => (
                  <span key={k} onClick={() => !busy && setReqPerms((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])} style={chipStyle(reqPerms.includes(k))}>{label}</span>
                ))}
              </div>

              <label style={labelStyle}>권한 팀 (복수 선택)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 220, overflowY: "auto", padding: "4px 2px" }}>
                {Object.keys(byDivision).length === 0 && (
                  <span style={{ fontSize: 13, color: t.subColor }}>팀 목록을 불러오는 중…</span>
                )}
                {Object.entries(byDivision).map(([division, teams]) => (
                  <div key={division}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.subColor, margin: "2px 0 6px" }}>{division}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {teams.map((tm) => (
                        <span key={tm} onClick={() => !busy && toggleTeam(tm)} style={chipStyle(reqTeams.includes(tm))}>{tm}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {err && <div style={{ fontSize: 13, color: "#ff8e84", fontWeight: 600, whiteSpace: "pre-line" }}>{err}</div>}

              <button type="submit" disabled={busy} style={{ border: "none", borderRadius: 10, padding: 13, fontSize: 16, fontWeight: 700, color: t.btnColor, background: t.btnBg, marginTop: 4, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>
                {busy ? "요청 중…" : "승인 요청"}
              </button>
              <button type="button" onClick={() => { setDeviceStep(false); setErr(""); }} style={{ border: "none", background: "none", color: t.linkColor, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>취소</button>
            </>
          )}
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: t.pageBg, padding: "max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))", transition: "background 0.2s" }}>
      <form
        style={{
          width: "100%", maxWidth: 360, background: t.cardBg,
          border: `1px solid ${t.cardBorder}`, borderRadius: 18,
          padding: "28px 24px", display: "flex", flexDirection: "column", gap: 12,
          boxShadow: t.cardShadow,
        }}
        onSubmit={submit}
      >
        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          {t.icon && (
            <div style={{
              width: 56, height: 56, borderRadius: 16, background: "#2b3242",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, margin: "0 auto 12px",
            }}>{t.icon}</div>
          )}

          {t.badge && (
            <div style={{
              display: "inline-block", background: t.badge.bg, color: t.badge.color,
              fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 20,
              marginBottom: 12, letterSpacing: 0.5,
            }}>{t.badge.text}</div>
          )}

          <p style={{ fontSize: t.titleSize, fontWeight: 800, color: t.titleColor, margin: 0, letterSpacing: "-0.02em" }}>{t.title}</p>
          {t.subtitle && (
            <p style={{ fontSize: 13, color: t.subColor, margin: "6px 0 0", letterSpacing: "0.06em" }}>{t.subtitle}</p>
          )}
        </div>

        <label style={labelStyle}>{t.idLabel}</label>
        <input
          style={inputStyle}
          type={t.idType}
          autoComplete={t.idAutoComplete}
          placeholder={t.idPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <label style={labelStyle}>비밀번호</label>
        <input
          style={inputStyle}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />

        {mode === "admin" && (err || extraError) && (
          <div style={{ fontSize: 13, color: "#ff8e84", fontWeight: 600 }}>
            {err || extraError}
          </div>
        )}

        <button
          style={{ border: "none", borderRadius: 10, padding: 13, fontSize: 16, fontWeight: 700, color: t.btnColor, background: t.btnBg, marginTop: 4, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
          type="submit"
          disabled={busy}
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>

        {mode === "admin" && (
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 13, color: t.subColor }}>
            {t.crossText}{" "}
            <a href={t.crossHref} style={{ color: t.linkColor, fontWeight: 700, textDecoration: "none" }}>{t.crossLabel}</a>
          </div>
        )}
      </form>

      {mode !== "admin" && (
        <p
          style={{
            maxWidth: 360,
            textAlign: "center",
            margin: "18px 0 0",
            fontSize: 13,
            lineHeight: 1.6,
            fontWeight: 600,
            whiteSpace: "pre-line",
            color: failCount >= 1 || extraError || serverNote ? "#cb6156" : "#333333",
          }}
        >
          {extraError
            ? extraError
            : serverNote
            ? serverNote
            : failCount >= 5
            ? "로그인에 실패했습니다.\n인적자원팀에 문의해주세요."
            : failCount >= 1
            ? "로그인에 실패했습니다."
            : "로그인을 해주세요."}
        </p>
      )}
    </div>
  );
}
