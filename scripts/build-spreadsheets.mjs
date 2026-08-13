import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSiteGuideLines } from "./spreadsheet-content.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [rosterPath, outputDirArg] = process.argv.slice(2);
const outputDir = outputDirArg ? path.resolve(outputDirArg) : path.join(rootDir, "outputs", "ufolio-case-integration-20260806");
const masterPath = path.join(rootDir, "config/ufolio-master-items.json");
const defaultsPath = path.join(rootDir, "apps-script/CaseSheetDefaults.gs");

if (!rosterPath) throw new Error("사용법: node scripts/build-spreadsheets.mjs <명단.tsv> [출력폴더]");

const artifactModule = process.env.ARTIFACT_TOOL_ENTRY
  ? await import(pathToFileURL(process.env.ARTIFACT_TOOL_ENTRY).href)
  : await import("@oai/artifact-tool");
const { SpreadsheetFile, Workbook } = artifactModule;

const palette = {
  navy: "#17365D",
  blue: "#2F75B5",
  paleBlue: "#D9EAF7",
  paleGreen: "#E2F0D9",
  paleYellow: "#FFF2CC",
  paleRed: "#FCE4D6",
  lavender: "#D9D2E9",
  ink: "#1F2937",
  line: "#D0D5DD",
  white: "#FFFFFF",
};

const ADMIN_SHEET_ORDER = [
  "대시보드",
  "비교결과",
  "연결진단",
  "동기화로그",
  "미매핑항목",
  "현황시트연결",
  "항목매핑",
  "현황최신",
  "유폴리오최신",
  "마스터항목",
  "사용안내",
];

const rawHeaders = ["수신시각", "전송 ID", "출석번호", "학번", "이름", "실습차수", "과", "메뉴/구분", "항목", "승인 수", "환자 수", "점수", "점수 원문", "승인대기 수"];
const logHeaders = ["수신시각", "전송 ID", "출석번호", "학번", "이름", "항목 수", "상태", "상세 사유"];
const masterHeaders = ["활성", "실습차수", "과", "메뉴/구분", "항목", "비교사용", "비교기준", "표시명"];
const snapshotHeaders = ["동기화시각", "소스키", "매핑키", "출석번호", "학번", "이름", "과", "현황표시명", "완료값", "예정값", "인증대상값", "검토상태", "측정값", "U-FOLIO 대상", "집계방식", "우선순위", "상태", "노후"];
const comparisonHeaders = ["출석번호", "학번", "이름", "과", "현황표시명", "측정값", "현황값", "U-FOLIO 값", "차이", "상태", "소스키", "매핑키", "동기화시각"];
const unmappedHeaders = ["매핑키", "소스키", "현황표시명", "검토상태", "인증대상식", "U-FOLIO 대상", "비고"];
const diagnosticHeaders = ["시각", "소스키", "행", "상태", "상세"];
const syncLogHeaders = ["시각", "정상 소스", "실패 소스", "현황 집계", "비교 건수", "상태"];

function parseRoster(text) {
  return text.trim().split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const [attendanceNo, studentId, name] = line.split("\t");
    return [Number(attendanceNo), String(studentId).trim(), String(name).trim()];
  });
}

function loadDefaults(source) {
  const context = vm.createContext({ console });
  vm.runInContext(source, context, { filename: "apps-script/CaseSheetDefaults.gs" });
  return {
    connectionHeaders: Array.from(context.CASE_CONNECTION_HEADERS),
    mappingHeaders: Array.from(context.CASE_MAPPING_HEADERS),
    connections: context.case_defaultConnections_().map((row) => Array.from(row)),
    mappings: context.case_defaultMappings_().map((row) => Array.from(row)),
  };
}

const roster = parseRoster(await fs.readFile(path.resolve(rosterPath), "utf8"));
const masterConfig = JSON.parse(await fs.readFile(masterPath, "utf8"));
const items = Object.entries(masterConfig.departments).flatMap(([department, rows]) =>
  rows.map(([menu, item]) => ({ practice: masterConfig.practice, department, menu, item })),
);
const defaults = loadDefaults(await fs.readFile(defaultsPath, "utf8"));

if (items.length !== 206) throw new Error(`마스터 항목이 206개가 아닙니다: ${items.length}`);
if (new Set(items.map((row) => [row.practice, row.department, row.menu, row.item].join("|"))).size !== 206) {
  throw new Error("마스터 항목 키가 중복되었습니다.");
}
if (new Set(roster.map((row) => row[1])).size !== roster.length) throw new Error("명단에 중복 학번이 있습니다.");
if (defaults.connections.length !== 11) throw new Error("기본 현황시트 연결이 11개가 아닙니다.");

function colLetter(index) {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
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

function styleBody(range) {
  range.format = {
    font: { color: palette.ink },
    verticalAlignment: "center",
    borders: {
      insideHorizontal: { style: "thin", color: "#E5E7EB" },
      bottom: { style: "thin", color: palette.line },
    },
  };
}

function styleTitle(sheet, title, subtitle, lastColumn = "H") {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white, size: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${lastColumn}1`).format.rowHeightPx = 36;
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${lastColumn}2`).format = {
    fill: palette.paleBlue,
    font: { color: palette.ink, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${lastColumn}2`).format.rowHeightPx = 44;
}

function addGuide(workbook, title, subtitle, lines) {
  const sheet = workbook.worksheets.add("사용안내");
  styleTitle(sheet, title, subtitle, "H");
  sheet.getRange("A4:B4").values = [["순서", "할 일"]];
  styleHeader(sheet.getRange("A4:B4"));
  sheet.getRange(`A5:B${lines.length + 4}`).values = lines.map((line, index) => [index + 1, line]);
  styleBody(sheet.getRange(`A5:B${lines.length + 4}`));
  sheet.getRange(`B5:B${lines.length + 4}`).format.wrapText = true;
  sheet.getRange("A:A").format.columnWidthPx = 64;
  sheet.getRange("B:B").format.columnWidthPx = 720;
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

function addTableSheet(workbook, name, headers, rows = [], widths = []) {
  const sheet = workbook.worksheets.add(name);
  const lastCol = colLetter(headers.length);
  sheet.getRange(`A1:${lastCol}1`).values = [headers];
  styleHeader(sheet.getRange(`A1:${lastCol}1`));
  if (rows.length > 0) {
    sheet.getRange(`A2:${lastCol}${rows.length + 1}`).values = rows;
    styleBody(sheet.getRange(`A2:${lastCol}${rows.length + 1}`));
  }
  widths.forEach((width, index) => {
    if (width) sheet.getRange(`${colLetter(index + 1)}:${colLetter(index + 1)}`).format.columnWidthPx = width;
  });
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  return sheet;
}

function masterRows() {
  return items.map((row) => ["Y", row.practice, row.department, row.menu, row.item, "N", "승인수", `${row.menu} | ${row.item}`]);
}

function buildSiteWorkbook() {
  const workbook = Workbook.create();
  addGuide(
    workbook,
    "① 유폴리오 사이트 인증",
    "학생 제출을 받는 관리자 전용 원본입니다. 이 파일의 RAW만 웹 앱 수신기가 기록합니다.",
    buildSiteGuideLines(roster.length),
  );

  const workbookSettings = workbook.worksheets.add("설정");
  workbookSettings.getRange("A1:C1").values = [["설정키", "값", "설명"]];
  styleHeader(workbookSettings.getRange("A1:C1"));
  workbookSettings.getRange("A2:C5").values = [
    ["SITE_SPREADSHEET_ID", "", "현재 사이트 인증 파일 ID"],
    ["ADMIN_SPREADSHEET_ID", "", "통합 관리자 파일 ID"],
    ["ADMIN_SPREADSHEET_URL", "", "관리자 전용 파일 URL"],
    ["LAST_REFRESHED_AT", "", "마지막 통합 동기화 시각"],
  ];
  styleBody(workbookSettings.getRange("A2:C5"));
  workbookSettings.getRange("B2:B5").format.fill = palette.paleYellow;
  [220, 430, 360].forEach((width, index) => {
    workbookSettings.getRange(`${colLetter(index + 1)}:${colLetter(index + 1)}`).format.columnWidthPx = width;
  });
  workbookSettings.freezePanes.freezeRows(1);
  workbookSettings.showGridLines = false;

  const rosterSheet = addTableSheet(workbook, "학생명단", ["출석번호", "학번", "이름", "이메일(선택)"], roster.map((row) => [...row, ""]), [84, 120, 100, 230]);
  rosterSheet.getRange(`B2:B${roster.length + 1}`).format.numberFormat = "@";
  rosterSheet.getRange(`D2:D${roster.length + 1}`).format.fill = palette.paleYellow;

  const masterSheet = addTableSheet(workbook, "마스터항목", masterHeaders, masterRows(), [58, 190, 125, 155, 330, 82, 88, 340]);
  masterSheet.getRange("A2:A207").dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  masterSheet.getRange("F2:F207").dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  masterSheet.getRange("G2:G207").dataValidation = { rule: { type: "list", values: ["승인수", "환자수", "점수"] } };
  masterSheet.getRange("F2:H207").format.fill = palette.paleYellow;
  masterSheet.freezePanes.freezeColumns(1);

  const raw = addTableSheet(workbook, "RAW", rawHeaders, [], [160, 230, 84, 120, 100, 190, 120, 170, 330, 82, 82, 82, 120, 92]);
  raw.getRange("D:D").format.numberFormat = "@";
  addTableSheet(workbook, "전송기록", logHeaders, [], [160, 230, 84, 120, 100, 82, 82, 420]);
  return workbook;
}

function addStatusRules(range) {
  const rules = [
    ["일치", palette.paleGreen, "#166534"],
    ["정상", palette.paleGreen, "#166534"],
    ["반영대기", palette.paleYellow, "#92400E"],
    ["매핑대기", palette.paleYellow, "#92400E"],
    ["U-FOLIO측정값없음", palette.paleYellow, "#92400E"],
    ["현황누락의심", palette.paleRed, "#991B1B"],
    ["유폴리오미인증", palette.paleRed, "#991B1B"],
    ["원본오류", "#F4CCCC", "#991B1B"],
    ["원본노후", palette.lavender, "#5B21B6"],
  ];
  for (const [text, fill, color] of rules) {
    range.conditionalFormats.add("containsText", {
      text,
      format: { fill, font: { color, bold: true } },
    });
  }
}

function addComparisonStatusRules(range) {
  const rules = [
    ['=$J2="일치"', palette.paleGreen, "#166534"],
    ['=$J2="반영대기"', palette.paleYellow, "#92400E"],
    ['=OR($J2="현황누락의심",$J2="유폴리오미인증")', palette.paleRed, "#991B1B"],
    ['=$J2="U-FOLIO측정값없음"', palette.paleYellow, "#92400E"],
    ['=$J2="원본오류"', "#F4CCCC", "#991B1B"],
    ['=$J2="원본노후"', palette.lavender, "#5B21B6"],
  ];
  for (const [formula, fill, color] of rules) {
    range.conditionalFormats.addCustom(formula, { fill, font: { color } });
  }
}

function buildAdminWorkbook() {
  const admin = Workbook.create();
  const dashboard = admin.worksheets.add("대시보드");
  const comparison = addTableSheet(admin, "비교결과", comparisonHeaders, [], [84, 120, 100, 120, 240, 82, 88, 98, 82, 140, 105, 130, 160]);
  comparison.freezePanes.freezeColumns(3);
  addComparisonStatusRules(comparison.getRange("A2:M20000"));
  const diagnosticSheet = addTableSheet(admin, "연결진단", diagnosticHeaders, [], [160, 105, 70, 120, 560]);
  // 시각 열 서식은 Apps Script 쪽에서만 미리 넓게 깐다. Google Sheets 는 이미 1000행이라 비용이 없지만
  // xlsx 는 빈 행 999개를 실제로 만들어 버려서 복구용 파일이 빈 화면처럼 보인다.
  addTableSheet(admin, "동기화로그", syncLogHeaders, [], [160, 90, 90, 100, 100, 100]);
  const unmappedSheet = addTableSheet(admin, "미매핑항목", unmappedHeaders, [], [130, 105, 220, 90, 160, 520, 420]);

  const connectionSheet = addTableSheet(admin, "현황시트연결", defaults.connectionHeaders, defaults.connections, [110, 58, 125, 220, 390, 160, 92, 82, 92, 92, 82, 130, 160, 110, 420]);
  connectionSheet.getRange(`A2:L${defaults.connections.length + 1}`).format.fill = palette.paleYellow;
  connectionSheet.getRange(`M2:O${defaults.connections.length + 1}`).format.fill = palette.paleBlue;
  connectionSheet.getRange(`B2:B${defaults.connections.length + 1}`).dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  connectionSheet.getRange(`L2:L${defaults.connections.length + 1}`).dataValidation = { rule: { type: "list", values: ["CONFIG", "_UFOLIO_EXPORT"] } };
  connectionSheet.freezePanes.freezeColumns(4);
  addStatusRules(connectionSheet.getRange("N2:N1000"));

  const mappingSheet = addTableSheet(admin, "항목매핑", defaults.mappingHeaders, defaults.mappings, [130, 58, 90, 105, 220, 135, 135, 150, 520, 82, 90, 82, 390]);
  mappingSheet.getRange(`A2:M${defaults.mappings.length + 1}`).format.fill = palette.paleYellow;
  mappingSheet.getRange(`B2:B${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  mappingSheet.getRange(`C2:C${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["승인", "검토필요", "보류"] } };
  mappingSheet.getRange(`J2:J${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["승인수", "환자수", "점수"] } };
  mappingSheet.getRange(`K2:K${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["SUM", "MAX", "FIRST"] } };
  mappingSheet.getRange(`E2:I${defaults.mappings.length + 1}`).format.wrapText = true;
  mappingSheet.getRange(`M2:M${defaults.mappings.length + 1}`).format.wrapText = true;
  mappingSheet.getRange(`2:${defaults.mappings.length + 1}`).format.autofitRows();
  mappingSheet.freezePanes.freezeColumns(4);
  addStatusRules(mappingSheet.getRange("C2:C2000"));

  addTableSheet(admin, "현황최신", snapshotHeaders, [], [160, 105, 130, 84, 120, 100, 120, 220, 82, 82, 92, 90, 82, 500, 90, 82, 100, 58]);
  addTableSheet(admin, "유폴리오최신", rawHeaders, [], [160, 230, 84, 120, 100, 190, 120, 170, 330, 82, 82, 82, 120, 92]);
  const adminMaster = addTableSheet(admin, "마스터항목", masterHeaders, masterRows(), [58, 190, 125, 155, 330, 82, 88, 340]);
  adminMaster.freezePanes.freezeColumns(1);
  addGuide(
    admin,
    "② 유폴리오 통합관리자",
    "기존 케이스장 시트는 그대로 두고, 이 파일은 집계값만 읽어 U-FOLIO 최신 제출과 비교합니다.",
    [
      "평소에는 대시보드와 비교결과만 확인합니다.",
      "대시보드의 확인 필요 합계를 보고, 비교결과에서 상태 필터를 사용해 해당 학생만 확인합니다.",
      "연결 오류가 있을 때만 연결진단과 동기화로그를 확인합니다.",
      "현황시트연결과 항목매핑은 원본 시트나 규칙이 바뀔 때만 수정합니다. 노란 셀이 관리자 입력 영역입니다.",
      "① 사이트 인증 파일의 유폴리오 통합관리 메뉴에서 지금 전체 동기화를 실행할 수 있습니다.",
      "동기화가 정상인 것을 확인한 뒤 매일 새벽 3시 동기화를 켭니다.",
      "이 파일은 관리자만 소유·열람하며 학생에게 공유하지 않습니다.",
      "중앙 파일에는 학생별 집계값만 저장되며 원본의 환자·담당자·날짜·메모는 복사하지 않습니다.",
    ],
  );

  styleTitle(dashboard, "현황시트 × U-FOLIO 통합 대시보드", "평소에는 이 화면과 비교결과만 확인하면 됩니다.", "H");
  dashboard.getRange("A4:B4").values = [["오늘의 확인 항목", "건수"]];
  dashboard.getRange("A5:A10").values = [["확인 필요 합계"], ["반영대기"], ["현황누락의심"], ["유폴리오미인증"], ["U-FOLIO측정값없음"], ["매핑대기"]];
  dashboard.getRange("B5:B10").formulas = [
    ["=SUM(B6:B10)"],
    ["=COUNTIF('비교결과'!J2:J20000,\"반영대기\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"현황누락의심\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"유폴리오미인증\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"U-FOLIO측정값없음\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"매핑대기\")"],
  ];
  dashboard.getRange("D4:E4").values = [["운영 상태", "값"]];
  dashboard.getRange("D5:D10").values = [["마지막 동기화"], ["정상 연결"], ["오류·노후 연결"], ["전체 비교 건수"], ["일치"], ["일치율"]];
  dashboard.getRange("E5:E10").formulas = [
    ["=IF(COUNTA('동기화로그'!A2:A1000)=0,\"아직 동기화 전\",MAX('동기화로그'!A2:A1000))"],
    ["=COUNTIF('현황시트연결'!N2:N1000,\"정상\")"],
    ["=COUNTIF('현황시트연결'!N2:N1000,\"원본오류\")+COUNTIF('현황시트연결'!N2:N1000,\"원본노후\")"],
    ["=COUNTA('비교결과'!A2:A20000)"],
    ["=COUNTIF('비교결과'!J2:J20000,\"일치\")"],
    ["=IFERROR(E9/E8,0)"],
  ];
  dashboard.getRange("G4:H4").values = [["구분", "바로 보는 순서"]];
  dashboard.getRange("G5:H10").values = [
    ["평소 1", "대시보드 — 전체 상태 확인"],
    ["평소 2", "비교결과 — 상태 필터로 학생 확인"],
    ["오류 1", "연결진단 — 원본 오류 원인 확인"],
    ["오류 2", "동기화로그 — 최근 실행 결과 확인"],
    ["설정", "현황시트연결·항목매핑 — 구조 변경 때만"],
    ["기술", "현황최신·유폴리오최신·마스터항목 — 문제 분석용"],
  ];
  for (const range of ["A4:B4", "D4:E4", "G4:H4"]) styleHeader(dashboard.getRange(range));
  dashboard.getRange("A5:A10").format = { fill: palette.paleBlue, font: { bold: true, color: palette.ink } };
  dashboard.getRange("B5:B10").format = { fill: palette.paleYellow, font: { bold: true, color: palette.ink }, numberFormat: "#,##0" };
  dashboard.getRange("B5").format = { fill: "#F4B183", font: { bold: true, color: palette.ink, size: 14 }, numberFormat: "#,##0" };
  dashboard.getRange("D5:D10").format = { fill: palette.paleBlue, font: { bold: true, color: palette.ink } };
  dashboard.getRange("E5:E10").format = { fill: palette.paleGreen, font: { bold: true, color: palette.ink } };
  dashboard.getRange("E5").format.numberFormat = "yyyy-mm-dd hh:mm";
  dashboard.getRange("E6:E9").format.numberFormat = "#,##0";
  dashboard.getRange("E10").format.numberFormat = "0.0%";
  dashboard.getRange("G5:G10").format = { fill: "#E7E6E6", font: { bold: true, color: palette.ink }, horizontalAlignment: "center" };
  dashboard.getRange("H5:H10").format = { fill: "#F8FAFC", font: { color: palette.ink }, wrapText: true };
  dashboard.getRange("A13:H13").merge();
  dashboard.getRange("A13").values = [["상태 읽는 법"]];
  dashboard.getRange("A13:H13").format = { fill: palette.navy, font: { bold: true, color: palette.white }, horizontalAlignment: "center" };
  for (const [range, value, fill] of [
    ["A14:B14", "일치 · 조치 없음", palette.paleGreen],
    ["C14:D14", "반영대기 · 사인/반영 확인", palette.paleYellow],
    ["E14:F14", "누락의심·미인증 · 확인 필요", palette.paleRed],
    ["G14:H14", "원본노후 · 연결 복구 필요", palette.lavender],
  ]) {
    dashboard.getRange(range).merge();
    dashboard.getRange(range.split(":")[0]).values = [[value]];
    dashboard.getRange(range).format = { fill, font: { color: palette.ink }, horizontalAlignment: "center", wrapText: true };
  }
  dashboard.getRange("A14:H14").format.rowHeightPx = 34;
  [190, 90, 28, 170, 150, 28, 88, 360].forEach((width, index) => {
    dashboard.getRange(`${colLetter(index + 1)}:${colLetter(index + 1)}`).format.columnWidthPx = width;
  });
  dashboard.getRange("A4:H14").format.verticalAlignment = "center";
  dashboard.freezePanes.freezeRows(4);
  dashboard.showGridLines = false;

  for (const sheetName of ADMIN_SHEET_ORDER) admin.worksheets.getItem(sheetName);
  return admin;
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
  [buildAdminWorkbook(), "02_유폴리오_통합관리자.xlsx"],
];
const files = [];
for (const [workbook, fileName] of workbooks) files.push(await saveWorkbook(workbook, fileName));

const summary = {
  rosterCount: roster.length,
  itemCount: items.length,
  sourceCount: defaults.connections.length,
  mappingCount: defaults.mappings.length,
  files,
};
await fs.writeFile(path.join(outputDir, "build-summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
