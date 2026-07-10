import { useState, useEffect } from "react";

// 오프닝/전환 화면 — slides = [{ src, ms, title, sub }]
// 각 슬라이드를 지정 시간(ms)만큼 보여주고, 마지막이 끝나면 onDone().
// 어느 화면이든 터치하면 즉시 다음(또는 종료)으로 넘어간다.
export default function Splash({ slides, onDone }) {
  const [i, setI] = useState(0);

  const step = () => {
    if (i + 1 < slides.length) setI(i + 1);
    else onDone();
  };

  useEffect(() => {
    const t = setTimeout(step, slides[i]?.ms ?? 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const s = slides[i] || {};
  return (
    <div
      onClick={step}
      style={{
        position: "fixed", inset: 0, zIndex: 2000, cursor: "pointer",
        background: "#f4f6f7",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 0,
      }}
    >
      <img
        src={s.src}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
          const n = e.currentTarget.nextSibling;
          if (n) n.style.display = "block";
        }}
      />
      <div style={{ display: "none", textAlign: "center", position: "absolute" }}>
        {s.title && <div style={{ fontSize: 40, fontWeight: 800, color: "#333" }}>{s.title}</div>}
        {s.sub && <div style={{ fontSize: 16, color: "#555", marginTop: 8 }}>{s.sub}</div>}
      </div>
    </div>
  );
}
