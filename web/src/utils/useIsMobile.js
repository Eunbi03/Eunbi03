import { useState, useEffect } from "react";

// 화면 폭이 breakpoint 미만이면 true. 리사이즈에 반응.
export function useIsMobile(breakpoint = 640) {
  const [m, setM] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const h = () => setM(window.innerWidth < breakpoint);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return m;
}
