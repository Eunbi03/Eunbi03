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

// ── 직원 관리 양식 (3시트) ──────────────────────────────────────────────
//  시트1 '전체 직원' : 조회·관리용(업로드 안 함). 이름,직급,전화,이메일,비고,법인,본부,팀,직무,출근,퇴근,제외,비정기,유동
//  시트2 '신규 등록' : 업로드 대상. 직급/법인/본부/팀/직무는 '기준 목록' 드롭다운 + 기준에 없으면 빨간색(조건부서식)
//  시트3 '기준 목록' : 직급|법인|본부|팀|직무 유효값(다운로드 시점의 설정값으로 자동 채움)
//  opts = { positions:[name], corporations:[name], divisions:[{name,teams:[{name}]}], jobTitles:[name] }
export async function downloadWorkerTemplate(workers = [], opts = {}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const positions = (opts.positions || []).filter(Boolean);
  const corporations = (opts.corporations || []).filter(Boolean);
  const divisions = opts.divisions || [];
  const divNames = divisions.map((d) => d.name).filter(Boolean);
  const teamNames = [...new Set(divisions.flatMap((d) => (d.teams || []).map((t) => t.name)).filter((t) => t && t !== "전체"))];
  const jobTitles = (opts.jobTitles || []).filter(Boolean);

  const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

  // 공통 셀 스타일
  const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3F7" } };
  const headFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE9F0" } };
  const baseFont = { name: "맑은 고딕", size: 11, color: { argb: "FF333333" } };

  const writeHeader = (ws, cols, title) => {
    const nCol = cols.length;
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 14; });
    ws.mergeCells(`A1:${colLetter(nCol)}1`);
    const t = ws.getCell("A1");
    t.value = title; t.font = { name: "맑은 고딕", size: 15, bold: true, color: { argb: "FF2F6D8F" } };
    t.alignment = { vertical: "middle", horizontal: "center" }; t.fill = titleFill;
    ws.getRow(1).height = 28;
    const hr = ws.getRow(2);
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = c.header;
      cell.font = { name: "맑은 고딕", size: 11, bold: true, color: { argb: "FF333333" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = headFill; cell.border = borderAll;
    });
    hr.height = 30;
  };

  // ── 시트3: 기준 목록 (먼저 만들어 드롭다운이 참조) ──
  const refName = "기준 목록";
  const wsRef = wb.addWorksheet(refName);
  const refCols = [
    { header: "직급", values: positions },
    { header: "법인", values: corporations },
    { header: "본부", values: divNames },
    { header: "팀", values: teamNames },
    { header: "직무", values: jobTitles },
  ];
  writeHeader(wsRef, refCols.map((c) => ({ header: c.header, width: 16 })), "기준 목록 (설정 등록값)");
  refCols.forEach((c, ci) => {
    c.values.forEach((v, ri) => {
      const cell = wsRef.getRow(3 + ri).getCell(ci + 1);
      cell.value = v; cell.font = baseFont; cell.alignment = { vertical: "middle", horizontal: "center" }; cell.border = borderAll;
    });
  });
  // 각 기준 열의 범위 문자열 (드롭다운/조건부서식 참조용). 값이 없으면 최소 1행.
  const refRange = (ci, count) => {
    const L = colLetter(ci + 1);
    const last = 3 + Math.max(count, 1) - 1;
    return `'${refName}'!$${L}$3:$${L}$${last}`;
  };
  const RNG = { position: refRange(0, positions.length), corp: refRange(1, corporations.length), division: refRange(2, divNames.length), team: refRange(3, teamNames.length), jobTitle: refRange(4, jobTitles.length) };

  // ── 시트1: 전체 직원 (조회용) ──
  const ws1 = wb.addWorksheet("전체 직원");
  const cols1 = [
    { header: "이름", width: 10 }, { header: "직급", width: 10 }, { header: "전화번호", width: 15 },
    { header: "이메일", width: 22 }, { header: "비고", width: 14 }, { header: "법인", width: 12 },
    { header: "본부", width: 12 }, { header: "팀", width: 12 }, { header: "직무", width: 12 },
    { header: "출근시간", width: 10 }, { header: "퇴근시간", width: 10 },
    { header: "근무노트 제외대상\n(0/1)", width: 14 }, { header: "비정기적 근로자\n(0/1)", width: 14 }, { header: "유동 근무시간\n(0/1)", width: 14 },
  ];
  writeHeader(ws1, cols1, "전체 직원 (조회·관리용 — 업로드에 사용되지 않음)");
  workers.forEach((w, r) => {
    const flex = !!w.flex_schedule;
    const vals = [
      w.name || "", w.position || "", w.phone || "", w.email || "", w.remark || "",
      w.corp || "", w.division || "", w.team || "", w.job_title || "",
      flex ? "" : hhmm(w.scheduled_start), flex ? "" : hhmm(w.scheduled_end),
      w.note_exempt ? 1 : 0, w.irregular_worker ? 1 : 0, flex ? 1 : 0,
    ];
    const row = ws1.getRow(3 + r);
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v; cell.font = baseFont; cell.alignment = { vertical: "middle", horizontal: "center" }; cell.border = borderAll;
      if (i === 2) cell.numFmt = "@"; // 전화번호 텍스트
    });
  });

  // ── 시트2: 신규 등록 (업로드 대상) ──
  const ws2 = wb.addWorksheet("신규 등록");
  const cols2 = [
    { header: "이름", width: 10 }, { header: "직급", width: 12 }, { header: "전화번호", width: 15 },
    { header: "이메일", width: 22 }, { header: "비고", width: 14 }, { header: "법인", width: 12 },
    { header: "본부", width: 12 }, { header: "팀", width: 12 }, { header: "직무", width: 12 },
    { header: "근무노트 제외대상\n(0/1)", width: 14 }, { header: "비정기적 근로자\n(0/1)", width: 14 }, { header: "유동 근무시간\n(0/1)", width: 14 },
  ];
  writeHeader(ws2, cols2, "신규 등록 (이 시트만 업로드됩니다 · 색칠된 칸=기준에 없는 값, 수정 필요)");
  const EMPTY_ROWS = 100;
  const firstData = 3, lastData = firstData + EMPTY_ROWS - 1;
  // 빈 데이터행 서식(테두리) + 드롭다운
  const ddCols = { 2: RNG.position, 6: RNG.corp, 7: RNG.division, 8: RNG.team, 9: RNG.jobTitle }; // 열번호→기준범위
  const boolCols = [10, 11, 12];
  for (let rn = firstData; rn <= lastData; rn++) {
    const row = ws2.getRow(rn);
    for (let c = 1; c <= cols2.length; c++) {
      const cell = row.getCell(c);
      cell.font = baseFont; cell.alignment = { vertical: "middle", horizontal: "center" }; cell.border = borderAll;
      if (c === 3) cell.numFmt = "@"; // 전화번호 텍스트
      if (ddCols[c]) cell.dataValidation = { type: "list", allowBlank: true, formulae: [ddCols[c]] };
      if (boolCols.includes(c)) cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"0,1"'] };
    }
  }
  // 조건부서식: 기준에 없는 값이면 빨간색 (값이 있을 때만)
  Object.entries(ddCols).forEach(([c, rng]) => {
    const L = colLetter(Number(c));
    ws2.addConditionalFormatting({
      ref: `${L}${firstData}:${L}${lastData}`,
      rules: [{
        type: "expression",
        formulae: [`AND(${L}${firstData}<>"",COUNTIF(${rng},${L}${firstData})=0)`],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } },
        priority: 1,
      }],
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `직원관리_양식_${todayStr()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
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
