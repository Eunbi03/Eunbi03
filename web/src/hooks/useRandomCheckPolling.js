import { useState, useEffect, useRef } from "react";
import * as api from "../api/client.js";

export default function useRandomCheckPolling(enabled) {
  const [pendingCheck, setPendingCheck] = useState(null);
  const timerRef = useRef(null);

  const poll = async () => {
    try {
      const data = await api.getPendingRandomCheck();
      setPendingCheck(data.check || null);
    } catch {
      // silently ignore — user may not be checked in
    }
  };

  useEffect(() => {
    if (!enabled) { setPendingCheck(null); return; }
    poll();
    timerRef.current = setInterval(poll, 30_000);
    return () => clearInterval(timerRef.current);
  }, [enabled]);

  const dismiss = () => setPendingCheck(null);

  return { pendingCheck, dismiss };
}
