import { useEffect, useRef } from "react";
import * as api from "../api/client.js";
import { getLocation } from "../utils/device.js";

// 랜덤 위치 확인: 출근 중 주기적으로 pending 슬롯을 확인하고,
// 슬롯이 있으면 버튼 없이 자동으로 현재 위치를 수집해 제출한다.
// (출근 중에는 startLocationWatch로 GPS가 상시 감지되어 _lastPos가 유지되므로
//  권한이 허용된 상태라면 팝업 없이 즉시 수집된다.)
// 위치가 꺼져 있거나 거부되면 제출하지 않고, 다음 폴링에서 재시도한다.
// 끝까지 수집 실패하면 슬롯은 미제출(미응답) 상태로 남아 리포트에 반영된다.
export default function useRandomCheckPolling(enabled, onSubmitted) {
  const timerRef = useRef(null);
  const inFlight = useRef(false);

  const poll = async () => {
    if (inFlight.current) return;
    let pending;
    try {
      const data = await api.getPendingRandomCheck();
      pending = data?.pending;
    } catch {
      return; // 미출근 등 — 조용히 무시
    }
    if (!pending) return;

    inFlight.current = true;
    try {
      const loc = await getLocation();
      if (!loc) return; // 위치 꺼짐/거부 — 제출 안 함, 다음 폴링에서 재시도
      await api.submitRandomCheck(pending.id, loc);
      if (onSubmitted) onSubmitted();
    } catch {
      // 제출 실패 — 다음 폴링에서 재시도
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    if (!enabled) return;
    poll();
    timerRef.current = setInterval(poll, 30_000);
    return () => clearInterval(timerRef.current);
  }, [enabled]);
}
