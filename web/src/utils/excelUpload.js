// 엑셀 업로드 파싱 (exceljs 지연 로딩)
// 각 시트는 2행이 헤더, 3행부터 데이터.

const pad = (n) => String(n).padStart(2, "0");

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  // ExcelJS는 날짜 전용 셀을 UTC 자정으로 준다 → 로컬시간 getter를 쓰면 비(非)KST 기기에서 하루 밀린다. UTC getter 사용.
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "object") {
    if (v.text) return String(v.text);                 // rich text
    if (v.result !== undefined) return String(v.result); // formula
    if (v.hyperlink) return String(v.text || v.hyperlink);
    return "";
  }
  return String(v).trim();
}

async function loadSheet(file, sheetName) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`'${sheetName}' 시트를 찾을 수 없습니다.`);
  return ws;
}

// fieldsByCol: [1번열 필드명, 2번열 필드명, ...]. 데이터는 startRow부터.
function extract(ws, startRow, fieldsByCol) {
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return;
    const obj = {};
    fieldsByCol.forEach((f, i) => { if (f) obj[f] = cellText(row.getCell(i + 1)); });
    if (Object.values(obj).some((val) => String(val || "").trim())) rows.push(obj);
  });
  return rows;
}

// 공휴일 관리 시트: 날짜 → 이름
export async function readHolidaySheet(file) {
  const ws = await loadSheet(file, "공휴일 관리");
  return extract(ws, 3, ["date", "name"]);
}

// 신규 등록 시트: 이름 → 직급 → 전화번호 → 이메일 → 비고 → 법인 → 본부 → 팀 → 직무 → 근무노트 제외대상 → 비정기적 근로자 → 유동 근무시간
//  (근무지 열 제거 — 기본 근무지 개념 없음. '전체 직원' 시트는 조회용이라 업로드하지 않는다.)
export async function readWorkerSheet(file) {
  const ws = await loadSheet(file, "신규 등록");
  const rows = extract(ws, 3, [
    "name", "position", "phone", "email", "remark",
    "corp", "division", "team", "jobTitle", "noteExempt", "irregularWorker", "flexSchedule",
  ]);
  // 전화번호가 엑셀에서 숫자로 저장되어 앞자리 0이 사라진 경우 복원 (예: 1012345678 → 01012345678)
  for (const r of rows) {
    const raw = String(r.phone ?? "").trim();
    if (/^\d{10}$/.test(raw)) r.phone = "0" + raw;
  }
  return rows;
}
