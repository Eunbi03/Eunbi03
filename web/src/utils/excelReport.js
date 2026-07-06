// 근태관리대장 엑셀 생성 (exceljs 지연 로딩)
// 양식: 4인 1시트, 맑은 고딕, 제목 36pt 볼드/그 외 12pt, 지정 열너비·행높이·병합·서명란

const colL = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n) => String(n).padStart(2, "0");

const thin = { style: "thin", color: { argb: "FF999999" } };
const borderAll = { top: thin, left: thin, right: thin, bottom: thin };
// A열(월)·C열(요일): 오른쪽 테두리 없음 → 옆 칸과 병합된 것처럼 보임
const borderNoRight = { top: thin, left: thin, bottom: thin };
// B열(/일): 왼쪽 테두리 없음 → A열과 이어져 보임
const borderNoLeft = { top: thin, right: thin, bottom: thin };

export async function downloadAttendanceRegister({ year, month, daysInMonth, dow, workers }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  // 4명씩 시트 분할
  const groups = [];
  for (let i = 0; i < workers.length; i += 4) groups.push(workers.slice(i, i + 4));
  if (groups.length === 0) groups.push([]);

  groups.forEach((group, gi) => {
    const ws = wb.addWorksheet(groups.length > 1 ? `근태관리대장 ${gi + 1}` : "근태관리대장");

    // 열 너비: A=3.16, B=5.83, C=6, D~S(4..19)=10
    ws.getColumn(1).width = 3.16;
    ws.getColumn(2).width = 5.83;
    ws.getColumn(3).width = 6;
    for (let c = 4; c <= 19; c++) ws.getColumn(c).width = 10;

    const dayRowStart = 7;
    const lastDayRow = dayRowStart + daysInMonth - 1;
    const sumRow = lastDayRow + 1; // 합계, +1 총휴가, +2 총출퇴근

    // 기본 글꼴/정렬을 셀에 적용하는 헬퍼
    const GRAY = "FFDADADA";
    const set = (addr, value, opts = {}) => {
      const cell = ws.getCell(addr);
      cell.value = value;
      cell.font = { name: "맑은 고딕", size: opts.size || 12, bold: !!opts.bold, color: opts.color ? { argb: opts.color } : undefined };
      cell.alignment = { vertical: "middle", horizontal: opts.align || "center", wrapText: true };
      if (!opts.noBorder) cell.border = opts.border || borderAll;
      if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
      return cell;
    };
    const merge = (range) => ws.mergeCells(range);

    // 행 높이: 1행=19, 2행(제목)=42×1.4=58.8, 3행=25.25, 4·5행=18(기본), 6행=19, 7행~=42
    ws.getRow(1).height = 19;
    ws.getRow(2).height = 58.8;
    ws.getRow(3).height = 25.25;
    ws.getRow(4).height = 18;
    ws.getRow(5).height = 18;
    ws.getRow(6).height = 19;
    for (let r = 7; r <= sumRow + 2; r++) ws.getRow(r).height = 42;

    // 1행: 담당/팀장/본부장
    set("Q1", "담당", { bold: true });
    set("R1", "팀장", { bold: true });
    set("S1", "본부장", { bold: true });

    // 2행: 제목 + 서명란
    merge("D2:P2");
    set("D2", `${month}월 근태관리대장`, { size: 36, bold: true, noBorder: true });
    set("Q2", "", {}); set("R2", "", {}); set("S2", "", {}); // 서명란

    // 4~5행: 구분 / 이름 / 근무지 (헤더 음영 #DADADA)
    merge("A4:C5");
    set("A4", "구분", { bold: true, fill: GRAY });
    for (let g = 0; g < 4; g++) {
      const start = 4 + g * 4;                 // D,H,L,P
      const c0 = colL(start), c3 = colL(start + 3);
      merge(`${c0}4:${c3}4`);
      merge(`${c0}5:${c3}5`);
      const w = group[g];
      set(`${c0}4`, w ? w.name : "", { bold: true, fill: GRAY });
      set(`${c0}5`, w ? (w.remark || w.workplaceName || "") : "", { fill: GRAY });
    }

    // 6행: 날짜/요일/출근·출근지·퇴근·퇴근지 (4회 반복) — 음영
    merge("A6:B6");
    set("A6", "날짜", { bold: true, fill: GRAY });
    set("C6", "요일", { bold: true, fill: GRAY });
    const heads = ["출근", "출근지", "퇴근", "퇴근지"];
    for (let g = 0; g < 4; g++) {
      const start = 4 + g * 4;
      for (let k = 0; k < 4; k++) set(`${colL(start + k)}6`, heads[k], { bold: true, fill: GRAY });
    }

    // 7행~: 일자별 (A~C 음영)
    for (let d = 1; d <= daysInMonth; d++) {
      const row = dayRowStart + d - 1;
      set(`A${row}`, pad(month), { bold: true, fill: GRAY, border: borderNoRight });
      set(`B${row}`, `/ ${pad(d)}`, { bold: true, fill: GRAY, border: borderNoLeft, align: "left" });
      set(`C${row}`, DOW[dow[d - 1]], { bold: true, fill: GRAY, border: borderNoRight });
      for (let g = 0; g < 4; g++) {
        const start = 4 + g * 4;
        const w = group[g];
        const cell = w ? w.days[d - 1] : null;
        let inV = "", inP = "", outV = "", outP = "";
        if (cell) {
          if (cell.leave) { inV = cell.leave; }
          else if (cell.off) { /* 비근무일 공란 */ }
          else if (cell.bothMissing) { inV = "X"; }
          else {
            inV = cell.checkIn || (cell.missingIn ? "누락" : "");
            inP = cell.checkInPlace || "";
            outV = cell.checkOut || (cell.missingOut ? "누락" : "");
            outP = cell.checkOutPlace || "";
          }
        }
        set(`${colL(start)}${row}`, inV, {});
        set(`${colL(start + 1)}${row}`, inP, {});
        set(`${colL(start + 2)}${row}`, outV, {});
        set(`${colL(start + 3)}${row}`, outP, {});
      }
    }

    // 합계 3행
    const labels = ["합계", "총휴가 횟수", "총출퇴근기록"];
    const vals = (w) => [w?.workedDays ?? "", w?.leaveCount ?? "", w?.clockCount ?? ""];
    for (let i = 0; i < 3; i++) {
      const row = sumRow + i;
      merge(`A${row}:C${row}`);
      set(`A${row}`, labels[i], { bold: true, fill: GRAY });
      for (let g = 0; g < 4; g++) {
        const start = 4 + g * 4;
        const c0 = colL(start), c3 = colL(start + 3);
        merge(`${c0}${row}:${c3}${row}`);
        set(`${c0}${row}`, group[g] ? vals(group[g])[i] : "", { bold: true });
      }
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${year}년_${pad(month)}월_근태관리대장.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
