import { useState, useEffect } from "react";
import { getDeviceId } from "./utils/device.js";
import * as api from "./api/client.js";
import Login from "./components/Login.jsx";
import FirstLoginFlow from "./components/FirstLoginFlow.jsx";
import Header from "./components/Header.jsx";
import Employee from "./components/Employee.jsx";
import AdminApp from "./components/AdminApp.jsx";
import Terms from "./components/Terms.jsx";
import Splash from "./components/Splash.jsx";
import { S, C } from "./styles.js";

// 현재 URL 경로에서 모드를 결정합니다
// /admin  → 관리자 전용 (admin, hr 만 허용)
// /terms  → 약관 페이지 (로그인 불필요)
// 그 외   → 직원 전용 (worker)
function getMode() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/terms")) return "terms";
  return "worker";
}

export default function App() {
  const mode = getMode();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authErr, setAuthErr] = useState("");
  // 인트로/마지막 화면은 근로자 앱에서만 노출 (관리자·약관 제외)
  const [showSplash, setShowSplash] = useState(mode === "worker");

  useEffect(() => {
    if (mode === "terms") { setLoading(false); return; }
    getDeviceId().then((deviceId) =>
      api.tryAutoLogin({ deviceId })
        .then((u) => {
          if (!u) { setLoading(false); return; }
          // URL과 역할이 맞지 않으면 튕겨냄
          if (mode === "admin" && u.role === "worker") {
            api.logout();
            setAuthErr("관리자 계정으로 로그인해주세요.");
            setLoading(false);
            return;
          }
          if (mode === "worker" && (u.role === "admin" || u.role === "hr")) {
            api.logout();
            setAuthErr("로그인 정보를 확인해주세요.");
            setLoading(false);
            return;
          }
          setUser(u);
          setLoading(false);
        })
    );
  }, []);

  const handleLogin = (u) => {
    // 역할과 URL이 일치하지 않으면 로그인 거부
    if (mode === "admin" && u.role === "worker") {
      api.logout();
      setAuthErr("관리자 계정으로 로그인해주세요.");
      return;
    }
    if (mode === "worker" && (u.role === "admin" || u.role === "hr")) {
      api.logout();
      setAuthErr("로그인 정보를 확인해주세요.");
      return;
    }
    setAuthErr("");
    setUser(u);
  };

  const handleLogout = () => setUser(null);

  // 약관 페이지 — 로그인 불필요
  if (mode === "terms") return <Terms />;

  // 앱 실행 시 인트로 2장 (1번 2초 → 2번 2초, 터치 시 즉시 다음)
  if (showSplash)
    return (
      <Splash
        slides={[
          { src: "/intro1.gif", ms: 4000, title: "TimeCard", sub: "근태관리 어플리케이션" },
        ]}
        onDone={() => setShowSplash(false)}
      />
    );

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
        mode={mode}
        extraError={authErr}
      />
    );
  }

  const isAdmin = user.role === "admin" || user.role === "hr";

  // 관리자는 최초 비밀번호 변경·위치 동의 절차 없이 바로 진입 (근로자만 적용)
  if (!isAdmin && (user.mustChangePassword || !user.locationConsentGiven)) {
    return (
      <FirstLoginFlow
        onDone={() => setUser((u) => ({ ...u, mustChangePassword: false, locationConsentGiven: true }))}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: isAdmin ? undefined : "#f4f6f7" }}>
      <Header user={user} onLogout={handleLogout} />
      <div style={{ padding: isAdmin ? "12px clamp(12px, 2vw, 28px)" : 0 }}>
        {isAdmin ? <AdminApp user={user} /> : <Employee user={user} />}
      </div>
    </div>
  );
}
