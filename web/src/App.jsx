import { useState, useEffect } from "react";
import { getDeviceId } from "./utils/device.js";
import * as api from "./api/client.js";
import Login from "./components/Login.jsx";
import FirstLoginFlow from "./components/FirstLoginFlow.jsx";
import Header from "./components/Header.jsx";
import Employee from "./components/Employee.jsx";
import AdminApp from "./components/AdminApp.jsx";
import { S } from "./styles.js";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDeviceId().then((deviceId) =>
      api.tryAutoLogin({ deviceId })
        .then((u) => { if (u) setUser(u); })
        .finally(() => setLoading(false))
    );
  }, []);

  const handleLogin = (u) => setUser(u);
  const handleLogout = () => setUser(null);

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  if (!user) return <Login onLogin={handleLogin} />;

  if (user.mustChangePassword || !user.locationConsentGiven) {
    return <FirstLoginFlow onDone={() => setUser((u) => ({ ...u, mustChangePassword: false, locationConsentGiven: true }))} />;
  }

  const isAdmin = user.role === "admin" || user.role === "hr";

  return (
    <div>
      <Header user={user} onLogout={handleLogout} />
      <div style={{ padding: "12px 0" }}>
        {isAdmin ? <AdminApp user={user} /> : <Employee user={user} />}
      </div>
    </div>
  );
}
