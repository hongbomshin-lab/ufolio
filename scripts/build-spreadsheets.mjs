import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [rosterPath, itemsPath, outputDir] = process.argv.slice(2);
const artifactEntry = process.env.ARTIFACT_TOOL_ENTRY;

if (!rosterPath || !itemsPath || !outputDir || !artifactEntry) {
  throw new Error(
    "사용법: ARTIFACT_TOOL_ENTRY=<artifact_tool.mjs> node scripts/build-spreadsheets.mjs <명단.tsv> <항목.txt> <출력폴더>",
  );
}

const { SpreadsheetFile, Workbook } = await import(pathToFileURL(artifactEntry).href);

const palette = {
  navy: "#17365D",
  blue: "#2F75B5",
  paleBlue: "#D9EAF7",
  paleGreen: "#E2F0D9",
  paleYellow: "#FFF2CC",
  paleRed: "#FCE4D6",
  ink: "#1F2937",
  muted: "#667085",
  line: "#D0D5DD",
  white: "#FFFFFF",
};

function parseRoster(text) {
  const rows = text.trim().split(/\r?\n/).slice(1).map((line) => line.split("\t"));
  return rows.map(([attendanceNo, studentId, name]) => [Number(attendanceNo), studentId, name]);
}

function parseItems(text) {
  return text.trimEnd().split(/\r?\n/).filter(Boolean).map((line, index) => {
    const cells = line.split(/\t+| {2,}/).map((value) => value.trim());
    if (cells.length !== 4 && cells.length !== 7) {
      throw new Error(`${index + 1}번째 항목 행의 열 수가 올바르지 않습니다: ${cells.length}`);
    }
    const [practice, department, menu, item] = cells;
    return { practice, department, menu, item };
  });
}

const roster = parseRoster(await fs.readFile(rosterPath, "utf8"));
const items = parseItems(await fs.readFile(itemsPath, "utf8"));
const departments = [...new Set(items.map((row) => row.department))];
const itemsByDepartment = new Map(
  departments.map((department) => [department, items.filter((row) => row.department === department)]),
);

if (new Set(roster.map((row) => row[1])).size !== roster.length) {
  throw new Error("명단에 중복 학번이 있습니다.");
}
if (new Set(items.map((row) => [row.practice, row.department, row.menu, row.item].join("|"))).size !== items.length) {
  throw new Error("마스터 항목에 중복 키가 있습니다.");
}

function colLetter(index) {
  let n = index;
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function qSheet(name) {
  return `'${name.replaceAll("'", "''")}'`;
}

function styleTitle(sheet, title, subtitle, endCol = "H") {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${endCol}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${endCol}1`).format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white, size: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${endCol}1`).format.rowHeightPx = 34;
  sheet.getRange(`A2:${endCol}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${endCol}2`).format = {
    fill: palette.paleBlue,
    font: { color: palette.ink, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${endCol}2`).format.rowHeightPx = 42;
}

function styleHeader(range, fill = palette.blue) {
  range.format = {
    fill,
    font: { bold: true, color: palette.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: palette.line },
  };
}

function styleTableBody(range) {
  range.format = {
    font: { color: palette.ink },
    verticalAlignment: "center",
    borders: {
      insideHorizontal: { style: "thin", color: "#E5E7EB" },
      bottom: { style: "thin", color: palette.line },
    },
  };
}

function addGuideSheet(workbook, title, rows) {
  const sheet = workbook.worksheets.add("사용안내");
  styleTitle(sheet, title, "파란 셀은 시스템 영역, 노란 셀은 관리자가 직접 확인하거나 입력할 영역입니다.", "F");
  sheet.getRange("A4:B4").values = [["순서", "할 일"]];
  styleHeader(sheet.getRange("A4:B4"));
  sheet.getRange(`A5:B${rows.length + 4}`).values = rows.map((text, index) => [index + 1, text]);
  styleTableBody(sheet.getRange(`A5:B${rows.length + 4}`));
  sheet.getRange(`B5:B${rows.length + 4}`).format.wrapText = true;
  sheet.getRange("A:A").format.columnWidthPx = 64;
  sheet.getRange("B:B").format.columnWidthPx = 680;
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

function addRosterSheet(workbook, includeEmail = true) {
  const sheet = workbook.worksheets.add("학생명단");
  const headers = includeEmail ? ["출석번호", "학번", "이름", "이메일(선택)"] : ["출석번호", "학번", "이름"];
  sheet.getRange(`A1:${colLetter(headers.length)}1`).values = [headers];
  styleHeader(sheet.getRange(`A1:${colLetter(headers.length)}1`));
  const values = roster.map((row) => includeEmail ? [...row, ""] : row);
  sheet.getRange(`A2:${colLetter(headers.length)}${values.length + 1}`).values = values;
  styleTableBody(sheet.getRange(`A2:${colLetter(headers.length)}${values.length + 1}`));
  sheet.getRange(`B2:B${values.length + 1}`).format.numberFormat = "@";
  sheet.getRange("A:A").format.columnWidthPx = 82;
  sheet.getRange("B:B").format.columnWidthPx = 120;
  sheet.getRange("C:C").format.columnWidthPx = 100;
  if (includeEmail) {
    sheet.getRange("D:D").format.columnWidthPx = 230;
    sheet.getRange(`D2:D${values.length + 1}`).format.fill = palette.paleYellow;
  }
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  return sheet;
}

function addMasterSheet(workbook) {
  const sheet = workbook.worksheets.add("마스터항목");
  const headers = ["활성", "실습차수", "과", "메뉴/구분", "항목", "수기대상", "비교기준", "수기표시명"];
  const values = items.map((row) => ["Y", row.practice, row.department, row.menu, row.item, "N", "승인수", `${row.menu} | ${row.item}`]);
  sheet.getRange("A1:H1").values = [headers];
  styleHeader(sheet.getRange("A1:H1"));
  sheet.getRange(`A2:H${values.length + 1}`).values = values;
  styleTableBody(sheet.getRange(`A2:H${values.length + 1}`));
  sheet.getRange(`A2:A${values.length + 1}`).dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  sheet.getRange(`F2:F${values.length + 1}`).dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  sheet.getRange(`G2:G${values.length + 1}`).dataValidation = { rule: { type: "list", values: ["승인수", "환자수", "점수"] } };
  sheet.getRange(`F2:H${values.length + 1}`).format.fill = palette.paleYellow;
  [54, 190, 120, 150, 280, 78, 90, 320].forEach((width, index) => {
    sheet.getRange(`${colLetter(index + 1)}:${colLetter(index + 1)}`).format.columnWidthPx = width;
  });
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(1);
  sheet.showGridLines = false;
  return sheet;
}

function buildSiteWorkbook() {
  const workbook = Workbook.create();
  addGuideSheet(workbook, "① 유폴리오 사이트 인증", [
    "이 파일은 관리자만 소유·열람합니다. 학생에게 공유하지 마세요.",
    "Google Sheets로 가져온 뒤 Code.gs와 SystemSetup.gs를 Apps Script에 붙여넣습니다.",
    "createLinkedWorkbooks()를 한 번 실행하면 수기입력·관리자 파일이 새로 생성됩니다.",
    "Apps Script를 웹 앱으로 배포한 URL을 웹사이트 config.js에 입력합니다.",
    "마스터항목의 수기대상과 비교기준을 검토한 뒤 refreshAdminData()를 실행합니다.",
  ]);

  const settings = workbook.worksheets.add("설정");
  settings.getRange("A1:C1").values = [["설정키", "값", "설명"]];
  styleHeader(settings.getRange("A1:C1"));
  settings.getRange("A2:C6").values = [
    ["SITE_SPREADSHEET_ID", "", "현재 사이트 인증 파일 ID (스크립트가 자동 입력)"],
    ["MANUAL_SPREADSHEET_ID", "", "생성된 수기입력 파일 ID"],
    ["ADMIN_SPREADSHEET_ID", "", "생성된 관리자 파일 ID"],
    ["MANUAL_SPREADSHEET_URL", "", "학생에게 공유할 파일 URL"],
    ["ADMIN_SPREADSHEET_URL", "", "관리자 전용 파일 URL"],
  ];
  styleTableBody(settings.getRange("A2:C6"));
  settings.getRange("B2:B6").format.fill = palette.paleYellow;
  settings.getRange("A:A").format.columnWidthPx = 220;
  settings.getRange("B:B").format.columnWidthPx = 410;
  settings.getRange("C:C").format.columnWidthPx = 350;
  settings.freezePanes.freezeRows(1);
  settings.showGridLines = false;

  addRosterSheet(workbook, true);
  addMasterSheet(workbook);

  const raw = workbook.worksheets.add("RAW");
  const rawHeaders = ["수신시각", "전송 ID", "출석번호", "학번", "이름", "실습차수", "과", "메뉴/구분", "항목", "승인 수", "환자 수", "점수", "점수 원문"];
  raw.getRange("A1:M1").values = [rawHeaders];
  styleHeader(raw.getRange("A1:M1"));
  raw.getRange("A:A").format.columnWidthPx = 160;
  raw.getRange("B:B").format.columnWidthPx = 230;
  raw.getRange("D:D").format.numberFormat = "@";
  raw.getRange("F:I").format.columnWidthPx = 180;
  raw.freezePanes.freezeRows(1);
  raw.showGridLines = false;

  const log = workbook.worksheets.add("전송기록");
  log.getRange("A1:H1").values = [["수신시각", "전송 ID", "출석번호", "학번", "이름", "항목 수", "상태", "상세 사유"]];
  styleHeader(log.getRange("A1:H1"));
  log.getRange("A:A").format.columnWidthPx = 160;
  log.getRange("B:B").format.columnWidthPx = 230;
  log.getRange("H:H").format.columnWidthPx = 380;
  log.freezePanes.freezeRows(1);
  log.showGridLines = false;
  return workbook;
}

function buildManualWorkbook() {
  const workbook = Workbook.create();
  addGuideSheet(workbook, "② 유폴리오 수기입력", [
    "학생에게 편집 권한으로 공유할 파일입니다. 사이트 점수는 이 파일에 들어오지 않습니다.",
    "각 과 시트에서 본인 출석번호 행의 노란 셀만 입력합니다.",
    "현재는 실제 206개 항목을 모두 준비했습니다. 사이트 인증 파일의 마스터항목에서 수기대상=Y인 항목만 사용하세요.",
    "학생 이메일을 입력한 뒤 Apps Script의 applyStudentRowProtections()를 실행하면 본인 행만 편집하도록 보호할 수 있습니다.",
    "통계 시트의 항목 번호를 바꾸면 해당 항목의 분포 차트가 갱신됩니다.",
  ]);
  addRosterSheet(workbook, true);

  const firstDataRow = 3;
  const lastRosterRow = firstDataRow + roster.length - 1;
  const lastDataRow = firstDataRow + 200 - 1;
  for (const department of departments) {
    const departmentItems = itemsByDepartment.get(department);
    const sheet = workbook.worksheets.add(department);
    const lastCol = colLetter(2 + departmentItems.length);
    const menuHeaders = ["출석번호", "이름", ...departmentItems.map((row) => row.menu)];
    const itemHeaders = ["", "", ...departmentItems.map((row) => row.item)];
    sheet.getRange(`A1:${lastCol}2`).values = [menuHeaders, itemHeaders];
    styleHeader(sheet.getRange(`A1:${lastCol}2`));
    sheet.getRange(`A${firstDataRow}:B${lastRosterRow}`).values = roster.map(([attendanceNo, , name]) => [attendanceNo, name]);
    styleTableBody(sheet.getRange(`A${firstDataRow}:${lastCol}${lastDataRow}`));
    if (departmentItems.length > 0) {
      sheet.getRange(`C${firstDataRow}:${lastCol}${lastDataRow}`).format.fill = palette.paleYellow;
      sheet.getRange(`C${firstDataRow}:${lastCol}${lastDataRow}`).format.numberFormat = "0.##";
    }
    sheet.getRange("A:A").format.columnWidthPx = 78;
    sheet.getRange("B:B").format.columnWidthPx = 94;
    for (let col = 3; col <= 2 + departmentItems.length; col += 1) {
      sheet.getRange(`${colLetter(col)}:${colLetter(col)}`).format.columnWidthPx = 150;
    }
    sheet.getRange(`C1:${lastCol}2`).format.wrapText = true;
    sheet.getRange("1:2").format.rowHeightPx = 48;
    sheet.freezePanes.freezeRows(2);
    sheet.freezePanes.freezeColumns(2);
    sheet.showGridLines = false;
  }

  const stats = workbook.worksheets.add("통계");
  styleTitle(stats, "수기입력 통계", "B4의 항목 번호를 바꾸면 오른쪽 분포 차트가 해당 항목으로 바뀝니다.", "K");
  stats.getRange("A4:B4").values = [["선택 항목 번호", 1]];
  stats.getRange("A4").format = { fill: palette.blue, font: { bold: true, color: palette.white } };
  stats.getRange("B4").format = { fill: palette.paleYellow, font: { bold: true, color: palette.ink } };
  stats.getRange("B4").dataValidation = { rule: { type: "whole", operator: "between", formula1: 1, formula2: items.length } };

  const statsHeaderRow = 8;
  const statsStartRow = statsHeaderRow + 1;
  const statsEndRow = statsStartRow + items.length - 1;
  stats.getRange(`A${statsHeaderRow}:K${statsHeaderRow}`).values = [["번호", "과", "메뉴/구분", "항목", "평균", "입력수", "미입력수", "0~<1", "1~<3", "3~<5", "5 이상"]];
  styleHeader(stats.getRange(`A${statsHeaderRow}:K${statsHeaderRow}`));
  const statValues = items.map((row, index) => [index + 1, row.department, row.menu, row.item]);
  stats.getRange(`A${statsStartRow}:D${statsEndRow}`).values = statValues;
  for (let index = 0; index < items.length; index += 1) {
    const row = statsStartRow + index;
    const item = items[index];
    const departmentItems = itemsByDepartment.get(item.department);
    const departmentIndex = departmentItems.findIndex((candidate) => candidate.menu === item.menu && candidate.item === item.item);
    const sourceCol = colLetter(3 + departmentIndex);
    const sourceRange = `${qSheet(item.department)}!$${sourceCol}$${firstDataRow}:$${sourceCol}$${lastDataRow}`;
    stats.getRange(`E${row}:K${row}`).formulas = [[
      `=IFERROR(AVERAGE(${sourceRange}),"")`,
      `=COUNT(${sourceRange})`,
      `=COUNTA('학생명단'!$A$2:$A$201)-F${row}`,
      `=COUNTIFS(${sourceRange},">=0",${sourceRange},"<1")`,
      `=COUNTIFS(${sourceRange},">=1",${sourceRange},"<3")`,
      `=COUNTIFS(${sourceRange},">=3",${sourceRange},"<5")`,
      `=COUNTIF(${sourceRange},">=5")`,
    ]];
  }
  styleTableBody(stats.getRange(`A${statsStartRow}:K${statsEndRow}`));
  stats.getRange(`E${statsStartRow}:E${statsEndRow}`).format.numberFormat = "0.00";
  [62, 105, 145, 300, 80, 72, 80, 72, 72, 72, 72].forEach((width, index) => {
    stats.getRange(`${colLetter(index + 1)}:${colLetter(index + 1)}`).format.columnWidthPx = width;
  });
  stats.getRange("M1:N5").values = [["구간", "인원"], ["0~<1", ""], ["1~<3", ""], ["3~<5", ""], ["5 이상", ""]];
  stats.getRange("N2:N5").formulas = [
    [`=IFERROR(INDEX($H$${statsStartRow}:$H$${statsEndRow},$B$4),0)`],
    [`=IFERROR(INDEX($I$${statsStartRow}:$I$${statsEndRow},$B$4),0)`],
    [`=IFERROR(INDEX($J$${statsStartRow}:$J$${statsEndRow},$B$4),0)`],
    [`=IFERROR(INDEX($K$${statsStartRow}:$K$${statsEndRow},$B$4),0)`],
  ];
  styleHeader(stats.getRange("M1:N1"));
  const chart = stats.charts.add("bar", stats.getRange("M1:N5"));
  chart.title = "선택 항목 점수 분포";
  chart.hasLegend = false;
  chart.xAxis = { axisType: "textAxis" };
  chart.yAxis = { numberFormatCode: "0" };
  chart.setPosition("P1", "W16");
  stats.freezePanes.freezeRows(statsHeaderRow);
  stats.showGridLines = false;
  return workbook;
}

function buildAdminWorkbook() {
  const workbook = Workbook.create();
  addGuideSheet(workbook, "③ 유폴리오 관리자", [
    "이 파일은 관리자만 소유·열람합니다.",
    "사이트 인증 파일의 Apps Script에서 refreshAdminData()를 실행하면 사이트최신·수기DB·불일치가 갱신됩니다.",
    "불일치는 마스터항목에서 수기대상=Y인 항목만 계산됩니다.",
    "비교기준은 승인수·환자수·점수 중 항목별로 선택할 수 있습니다.",
    "사이트기록없음은 아직 북마클릿 전송이 없거나 항목명이 바뀐 경우입니다.",
  ]);

  const settings = workbook.worksheets.add("설정");
  settings.getRange("A1:C1").values = [["설정키", "값", "설명"]];
  styleHeader(settings.getRange("A1:C1"));
  settings.getRange("A2:C4").values = [
    ["SITE_SPREADSHEET_ID", "", "사이트 인증 파일 ID"],
    ["MANUAL_SPREADSHEET_ID", "", "수기입력 파일 ID"],
    ["LAST_REFRESHED_AT", "", "마지막 동기화 시각"],
  ];
  styleTableBody(settings.getRange("A2:C4"));
  settings.getRange("A:A").format.columnWidthPx = 220;
  settings.getRange("B:B").format.columnWidthPx = 400;
  settings.getRange("C:C").format.columnWidthPx = 320;
  settings.showGridLines = false;

  addMasterSheet(workbook);

  const latest = workbook.worksheets.add("사이트최신");
  latest.getRange("A1:M1").values = [["수신시각", "전송 ID", "출석번호", "학번", "이름", "실습차수", "과", "메뉴/구분", "항목", "승인 수", "환자 수", "점수", "점수 원문"]];
  styleHeader(latest.getRange("A1:M1"));
  latest.freezePanes.freezeRows(1);
  latest.showGridLines = false;

  const manualDb = workbook.worksheets.add("수기DB");
  manualDb.getRange("A1:H1").values = [["출석번호", "학번", "이름", "과", "메뉴/구분", "항목", "수기값", "비교기준"]];
  styleHeader(manualDb.getRange("A1:H1"));
  manualDb.freezePanes.freezeRows(1);
  manualDb.showGridLines = false;

  const mismatch = workbook.worksheets.add("불일치");
  mismatch.getRange("A1:J1").values = [["출석번호", "학번", "이름", "과", "메뉴/구분", "항목", "비교기준", "수기값", "사이트값", "상태"]];
  styleHeader(mismatch.getRange("A1:J1"));
  mismatch.freezePanes.freezeRows(1);
  mismatch.showGridLines = false;

  const dashboard = workbook.worksheets.add("대시보드");
  styleTitle(dashboard, "관리자 점검 대시보드", "refreshAdminData() 실행 후 수기입력과 사이트 최신값의 비교 결과가 표시됩니다.", "H");
  dashboard.getRange("A4:B7").values = [["지표", "값"], ["수기 입력 건수", ""], ["불일치", ""], ["사이트 기록 없음", ""]];
  styleHeader(dashboard.getRange("A4:B4"));
  dashboard.getRange("B5:B7").formulas = [["=COUNTA('수기DB'!G2:G20000)"], ["=COUNTIF('불일치'!J2:J20000,\"불일치\")"], ["=COUNTIF('불일치'!J2:J20000,\"사이트기록없음\")"]];
  dashboard.getRange("A5:A7").format.fill = palette.paleBlue;
  dashboard.getRange("B5:B7").format.fill = palette.paleYellow;
  dashboard.getRange("A:A").format.columnWidthPx = 180;
  dashboard.getRange("B:B").format.columnWidthPx = 110;
  dashboard.showGridLines = false;
  return workbook;
}

async function saveWorkbook(workbook, fileName) {
  const target = path.join(outputDir, fileName);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(target);
  return target;
}

await fs.mkdir(outputDir, { recursive: true });
const workbooks = [
  [buildSiteWorkbook(), "01_유폴리오_사이트인증.xlsx"],
  [buildManualWorkbook(), "02_유폴리오_수기입력.xlsx"],
  [buildAdminWorkbook(), "03_유폴리오_관리자.xlsx"],
];

const files = [];
for (const [workbook, fileName] of workbooks) {
  files.push(await saveWorkbook(workbook, fileName));
}

await fs.writeFile(
  path.join(outputDir, "build-summary.json"),
  JSON.stringify({ rosterCount: roster.length, itemCount: items.length, departments, files }, null, 2),
  "utf8",
);

console.log(JSON.stringify({ rosterCount: roster.length, itemCount: items.length, departments, files }, null, 2));
