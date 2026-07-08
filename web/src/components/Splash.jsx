import { useEffect } from "react";

// 오프닝(인트로) — 앱 실행 시 1초 노출, 터치 시 즉시 전환
export default function Splash({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      onClick={onDone}
      style={{
        position: "fixed", inset: 0, zIndex: 2000, cursor: "pointer",
        background: "linear-gradient(180deg,#cfe6f4 0%,#d8ecdf 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <img
        src="/splash.png"
        alt="TimeCard"
        style={{ maxWidth: "80%", maxHeight: "72%", objectFit: "contain" }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
          const n = e.currentTarget.nextSibling;
          if (n) n.style.display = "block";
        }}
      />
      <div style={{ display: "none", textAlign: "center" }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: "#333" }}>TimeCard</div>
        <div style={{ fontSize: 16, color: "#555", marginTop: 8 }}>근태관리 어플리케이션</div>
      </div>
    </div>
  );
}
