import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

export default function AdminSettings() {
  const [settings, setSettings] = useState({ lat: "", lng: "", radiusMeters: 100, description: "" });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.getCompanySettings().then((d) => {
      if (d.settings) setSettings({ lat: d.settings.lat, lng: d.settings.lng, radiusMeters: d.settings.radius_meters, description: d.settings.description || "" });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setMsg("");
    try {
      await api.saveCompanySettings({ lat: parseFloat(settings.lat), lng: parseFloat(settings.lng), radiusMeters: parseInt(settings.radiusMeters, 10), description: settings.description });
      setMsg("저장되었습니다.");
    } catch (e) {
      setMsg(e.message);
    }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  return (
    <div>
      <div style={S.formCard}>
        <p style={S.formTitle}>회사 위치 설정 (지오펜스)</p>
        <label style={S.fieldLabel}>위도 (Latitude)</label>
        <input style={S.input} placeholder="예: 37.5665" value={settings.lat} onChange={(e) => setSettings({ ...settings, lat: e.target.value })} />
        <label style={S.fieldLabel}>경도 (Longitude)</label>
        <input style={S.input} placeholder="예: 126.9780" value={settings.lng} onChange={(e) => setSettings({ ...settings, lng: e.target.value })} />
        <label style={S.fieldLabel}>반경 (미터)</label>
        <input style={S.input} type="number" min="10" max="1000" value={settings.radiusMeters} onChange={(e) => setSettings({ ...settings, radiusMeters: e.target.value })} />
        <label style={S.fieldLabel}>설명</label>
        <input style={S.input} placeholder="예: 서울 본사" value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
        {msg && <div style={{ fontSize: 13, color: C.green }}>{msg}</div>}
        <button style={{ ...S.primary, marginTop: 4 }} onClick={save}>저장</button>
      </div>
    </div>
  );
}
