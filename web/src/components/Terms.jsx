import { C } from "../styles.js";

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontWeight: 800, fontSize: 15, color: "#1a1f2e", marginBottom: 10, borderBottom: "2px solid #e8eaf0", paddingBottom: 6 }}>{title}</p>
      <div style={{ fontSize: 13, color: "#3a3f52", lineHeight: 1.9 }}>{children}</div>
    </div>
  );
}

function Table({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8, marginBottom: 8 }}>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} style={{ borderBottom: "1px solid #e8eaf0" }}>
            <td style={{ padding: "7px 10px 7px 0", fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap", verticalAlign: "top", width: 110 }}>{k}</td>
            <td style={{ padding: "7px 0", color: "#1a1f2e" }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Terms({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, padding: "20px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, maxWidth: 600, width: "100%", padding: "28px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <p style={{ fontWeight: 800, fontSize: 18, color: "#1a1f2e" }}>개인정보처리방침 및 이용약관</p>
          {onClose && (
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#6b7280", cursor: "pointer", padding: "0 4px" }}>✕</button>
          )}
        </div>

        <Section title="제1조 (서비스 목적)">
          <p>본 근태 관리 시스템(이하 "서비스")은 사용자(근로자)의 출퇴근 시간 기록, 위치 기반 근무 확인, 업무 일지 관리 등 근태 관리를 목적으로 운영됩니다.</p>
        </Section>

        <Section title="제2조 (수집하는 개인정보 항목)">
          <Table rows={[
            ["필수 수집", "이름, 이메일 주소, 비밀번호(암호화 저장), 기기 고유 식별값"],
            ["근태 기록", "출근·퇴근·외출 시각, GPS 위치정보(위도·경도·정확도)"],
            ["추가 수집", "업무 일지(오늘 업무·내일 계획), 랜덤 위치확인 결과"],
            ["선택 수집", "법인명, 팀, 부서, 사원번호, 근무 유형"],
          ]} />
        </Section>

        <Section title="제3조 (개인정보 수집 및 이용 목적)">
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>출퇴근 시각 및 근무 시간 산정</li>
            <li>회사 지오펜스(위치 기준) 내 출근 여부 확인</li>
            <li>외출·복귀 기록 및 외부 근무 관리</li>
            <li>랜덤 위치 확인을 통한 재택·현장 근무 모니터링</li>
            <li>지각·조퇴·결근 등 근태 위반 사항 기록 및 월별 리포트 생성</li>
            <li>기기 잠금 등 계정 보안 유지</li>
          </ul>
        </Section>

        <Section title="제4조 (개인정보 보유 및 이용기간)">
          <Table rows={[
            ["근태 기록", "근로계약 종료 후 3년 (근로기준법 제42조)"],
            ["위치 정보", "수집 후 3년 (위치정보의 보호 및 이용 등에 관한 법률 제16조)"],
            ["업무 일지", "근로계약 종료 후 3년"],
            ["계정 정보", "퇴사 처리 후 즉시 비활성화, 3년 후 완전 삭제"],
          ]} />
          <p style={{ marginTop: 8 }}>단, 법령에서 정한 기간이 있는 경우 해당 기간 동안 보존합니다.</p>
        </Section>

        <Section title="제5조 (위치정보 수집·이용 동의 — 위치정보보호법 제18조)">
          <div style={{ background: "#f8f9fc", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <p style={{ fontWeight: 700, marginBottom: 6 }}>위치정보사업자: 회사(사용자)</p>
            <Table rows={[
              ["수집 방법", "스마트폰 GPS/네트워크 위치 API (브라우저 Geolocation API)"],
              ["이용 목적", "출퇴근 지오펜스 확인, 외출 기록, 랜덤 위치 확인"],
              ["제3자 제공", "없음 (법령에 따른 요구 제외)"],
              ["동의 거부 시", "근태 관리 서비스(출퇴근 체크) 이용 불가"],
            ]} />
          </div>
          <p>「위치정보의 보호 및 이용 등에 관한 법률」제18조 및 제19조에 따라 위치정보 수집·이용에 대한 동의를 받습니다. 동의는 언제든지 철회할 수 있으나, 철회 시 서비스 이용이 제한될 수 있습니다.</p>
        </Section>

        <Section title="제6조 (개인정보의 제3자 제공)">
          <p>수집된 개인정보는 원칙적으로 제3자에게 제공하지 않습니다. 다만 다음의 경우는 예외입니다.</p>
          <ul style={{ paddingLeft: 18, margin: "6px 0" }}>
            <li>정보주체(근로자)가 사전에 동의한 경우</li>
            <li>법령에 따라 수사기관 등이 요청하는 경우</li>
          </ul>
        </Section>

        <Section title="제7조 (개인정보 처리의 위탁)">
          <p>현재 개인정보 처리 업무를 외부에 위탁하고 있지 않습니다. 위탁 발생 시 본 방침을 통해 사전 고지합니다.</p>
        </Section>

        <Section title="제8조 (정보주체의 권리)">
          <p>근로자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul style={{ paddingLeft: 18, margin: "6px 0" }}>
            <li>개인정보 열람·복사 요청</li>
            <li>오류 정정 요청</li>
            <li>삭제 요청 (단, 근로기준법상 보존 의무 기간은 예외)</li>
            <li>위치정보 수집·이용 동의 철회</li>
          </ul>
          <p style={{ marginTop: 6 }}>권리 행사는 인사팀 또는 개인정보 처리 담당자에게 서면·이메일로 요청하시기 바랍니다.</p>
        </Section>

        <Section title="제9조 (개인정보 보호책임자)">
          <p>개인정보 처리에 관한 업무는 인사팀에서 담당합니다. 문의사항은 인사팀으로 연락해 주시기 바랍니다.</p>
        </Section>

        <Section title="제10조 (서비스 이용 제한)">
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>허위 GPS 위치 제출(위치 조작)은 취업규칙 위반에 해당할 수 있습니다.</li>
            <li>타인의 계정을 도용하거나 공유하는 행위는 금지됩니다.</li>
            <li>5회 연속 로그인 실패 시 계정이 잠기며 인사팀에 해제를 요청해야 합니다.</li>
          </ul>
        </Section>

        <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 20, paddingTop: 16, borderTop: "1px solid #e8eaf0" }}>
          본 방침은 서비스 정책 변경 시 사전 공지 후 개정될 수 있습니다.
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{ marginTop: 16, width: "100%", padding: "12px", background: "#1a1f2e", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
}
