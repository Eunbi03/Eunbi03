// 엑셀 업로드 양식 다운로드 (exceljs 지연 로딩)
// 핵심: '현재 DB 최신 데이터'를 그대로 채운 양식을 내려준다.
//  → 다른 관리자가 옛 양식으로 덮어쓰는 사고를 방지.
// 구조는 excelUpload.js 파서와 반드시 일치해야 한다: 1행 제목, 2행 헤더, 3행부터 데이터.

const pad = (n) => String(n).padStart(2, "0");

const thin = { style: "thin", color: { argb: "FF999999" } };
const borderAll = { top: thin, left: thin, right: thin, bottom: thin };

// 공통: 시트 1개짜리 양식을 만들어 다운로드한다.
//  sheetName : 파서가 찾는 시트명 (반드시 일치)
//  title     : 1행 제목
//  columns   : [{ header, width, numFmt? }]
//  dataRows  : [[c1, c2, ...], ...]  (columns 순서와 동일)
async function buildAndDownload({ sheetName, title, columns, dataRows, filename }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  const nCol = columns.length;
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 16; });

  const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  // 1행: 제목 (전체 열 병합)
  ws.mergeCells(`A1:${colLetter(nCol)}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value = title;
  titleCell.font = { name: "맑은 고딕", size: 16, bold: true, color: { argb: "FF2F6D8F" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3F7" } };
  ws.getRow(1).height = 30;

  // 2행: 헤더
  const headerRow = ws.getRow(2);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "맑은 고딕", size: 11, bold: true, color: { argb: "FF333333" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE9F0" } };
    cell.border = borderAll;
  });
  headerRow.height = 30;

  // 3행~: 데이터
  dataRows.forEach((row, r) => {
    const xlRow = ws.getRow(3 + r);
    columns.forEach((c, i) => {
      const cell = xlRow.getCell(i + 1);
      cell.value = row[i] === undefined || row[i] === null ? "" : row[i];
      cell.font = { name: "맑은 고딕", size: 11, color: { argb: "FF333333" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = borderAll;
      if (c.numFmt) cell.numFmt = c.numFmt; // 전화번호·날짜 등은 텍스트(@)로 고정
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };

// ── 직원 관리 양식 (현재 재직 인원 채움) ───────────────────────────────
// 파서 열 순서: name, position, phone, email, workplaceName, remark, corp, division, team, jobTitle, noteExempt, irregularWorker
export async function downloadWorkerTemplate(workers = []) {
  const columns = [
    { header: "이름", width: 10 },
    { header: "직책", width: 10 },
    { header: "전화번호", width: 15, numFmt: "@" },
    { header: "이메일", width: 22 },
    { header: "근무지", width: 18 },
    { header: "비고", width: 14 },
    { header: "법인", width: 12 },
    { header: "본부", width: 12 },
    { header: "팀", width: 12 },
    { header: "직무", width: 12 },
    { header: "근무노트 제외 대상 (해당:1)", width: 16 },
    { header: "비정기적 근로자 (해당:1)", width: 16 },
  ];
  const dataRows = workers.map((w) => [
    w.name || "", w.position || "", w.phone || "", w.email || "",
    w.workplace_name || "", w.remark || "", w.corp || "", w.division || "",
    w.team || "", w.job_title || "",
    w.note_exempt ? "1" : "", w.irregular_worker ? "1" : "",
  ]);
  await buildAndDownload({
    sheetName: "직원 관리",
    title: "직원 관리 업로드 양식",
    columns, dataRows,
    filename: `직원관리_양식_${todayStr()}.xlsx`,
  });
}

// ── 근무지 추가 양식 (현재 등록 근무지 채움) ──────────────────────────
// 파서 열 순서: clientName, branchName, radiusM, address, detailAddress
export async function downloadWorkplaceTemplate(workplaces = []) {
  const columns = [
    { header: "거래처명", width: 18 },
    { header: "지점명", width: 16 },
    { header: "참고 반경(미터)", width: 14 },
    { header: "주소", width: 34 },
    { header: "상세주소", width: 22 },
  ];
  const dataRows = workplaces.map((w) => [
    w.client_name || "", w.branch_name || "", w.radius_m ?? "",
    w.address || "", w.detail_address || "",
  ]);
  await buildAndDownload({
    sheetName: "근무지 추가",
    title: "근무지 추가 업로드 양식",
    columns, dataRows,
    filename: `근무지_양식_${todayStr()}.xlsx`,
  });
}

// ── 공휴일 관리 양식 (현재 등록 공휴일 채움) ──────────────────────────
// 파서 열 순서: date, name
export async function downloadHolidayTemplate(holidays = []) {
  const columns = [
    { header: "날짜 (YYYY-MM-DD)", width: 16, numFmt: "@" },
    { header: "이름", width: 20 },
  ];
  const dataRows = holidays.map((h) => [String(h.date || "").slice(0, 10), h.name || ""]);
  await buildAndDownload({
    sheetName: "공휴일 관리",
    title: "공휴일 관리 업로드 양식",
    columns, dataRows,
    filename: `공휴일_양식_${todayStr()}.xlsx`,
  });
}
