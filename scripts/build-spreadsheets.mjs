import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSiteGuideLines } from "./spreadsheet-content.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [rosterPath, outputDirArg] = process.argv.slice(2);
const outputDir = outputDirArg ? path.resolve(outputDirArg) : path.join(rootDir, "outputs", "ufolio-unified-workbook");
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

// 보이는 시트 4개가 앞, 시스템 시트는 뒤. Google Sheets에서는 Apps Script 화면 구성 적용이 뒤쪽을 숨긴다.
const UNIFIED_SHEET_ORDER = [
  "대시보드",
  "비교결과",
  "현황시트연결",
  "측정값설정",
  "항목매핑",
  "미매핑항목",
  "연결진단",
  "동기화로그",
  "현황최신",
  "유폴리오최신",
  "마스터항목",
  "학생명단",
  "RAW",
  "전송기록",
  "설정",
  "사용안내",
];

const rawHeaders = ["수신시각", "전송 ID", "출석번호", "학번", "이름", "실습차수", "과", "메뉴/구분", "항목", "승인 수", "환자 수", "점수", "점수 원문", "승인대기 수"];
const logHeaders = ["수신시각", "전송 ID", "출석번호", "학번", "이름", "항목 수", "상태", "상세 사유"];
const masterHeaders = ["활성", "실습차수", "과", "메뉴/구분", "항목", "비교사용", "비교기준", "표시명"];
const snapshotHeaders = ["동기화시각", "소스키", "매핑키", "출석번호", "학번", "이름", "과", "현황표시명", "완료값", "예정값", "인증대상값", "검토상태", "측정값", "U-FOLIO 대상", "집계방식", "우선순위", "상태", "노후"];
const comparisonHeaders = ["출석번호", "학번", "이름", "과", "현황표시명", "측정값", "현황값", "제출건수", "승인수", "미승인", "환자수", "점수", "최신 유폴 인증"];
const measurementHeaders = ["실습차수", "과", "메뉴/구분", "항목", "측정값"];
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

function normalizeKeyPart(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

// Apps Script sys_measurementDefaults_ 와 같은 규칙: 승인 매핑 우선 → 전체 매핑 → 승인수.
function measurementDefaults() {
  const map = {};
  const passes = [
    (row) => String(row[1]).toUpperCase() === "Y" && row[2] === "승인",
    () => true,
  ];
  for (const include of passes) {
    for (const row of defaults.mappings) {
      if (!include(row)) continue;
      for (const line of String(row[8] || "").split(/\r?\n/)) {
        const parts = line.split("|");
        if (parts.length !== 4) continue;
        const key = parts.map(normalizeKeyPart).join("|");
        if (key && !map[key]) map[key] = String(row[9]).replace(/\s+/g, "");
      }
    }
  }
  return map;
}

function measurementRows() {
  const byTarget = measurementDefaults();
  return items.map((row) => {
    const key = [row.practice, row.department, row.menu, row.item].map(normalizeKeyPart).join("|");
    return [row.practice, row.department, row.menu, row.item, byTarget[key] || "승인수"];
  });
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

function buildUnifiedWorkbook() {
  const workbook = Workbook.create();

  // 대시보드 실물(항목×학생 매트릭스와 분포 차트)은 Apps Script가 그린다. xlsx에는 안내만 남긴다.
  const dashboard = workbook.worksheets.add("대시보드");
  styleTitle(dashboard, "유폴리오 대시보드", "Google Sheets로 변환한 뒤 유폴리오 통합관리 → 화면 구성 새로 적용을 실행하면 항목×학생 매트릭스와 분포 그래프가 이 자리에 생성됩니다.", "H");

  // 행 색(미인증/불일치/일치)은 Apps Script 동기화가 칠하므로 조건부서식은 넣지 않는다.
  const comparison = addTableSheet(workbook, "비교결과", comparisonHeaders, [], [84, 120, 100, 120, 240, 82, 88, 74, 74, 74, 74, 74, 150]);
  comparison.freezePanes.freezeColumns(3);

  const connectionSheet = addTableSheet(workbook, "현황시트연결", defaults.connectionHeaders, defaults.connections, [110, 58, 125, 220, 390, 160, 92, 82, 92, 92, 82, 130, 160, 110, 420]);
  connectionSheet.getRange(`A2:L${defaults.connections.length + 1}`).format.fill = palette.paleYellow;
  connectionSheet.getRange(`M2:O${defaults.connections.length + 1}`).format.fill = palette.paleBlue;
  connectionSheet.getRange(`B2:B${defaults.connections.length + 1}`).dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  connectionSheet.getRange(`L2:L${defaults.connections.length + 1}`).dataValidation = { rule: { type: "list", values: ["CONFIG", "_UFOLIO_EXPORT"] } };
  connectionSheet.freezePanes.freezeColumns(4);

  const measurement = addTableSheet(workbook, "측정값설정", measurementHeaders, measurementRows(), [190, 125, 155, 330, 92]);
  measurement.getRange("E2:E207").dataValidation = { rule: { type: "list", values: ["승인수", "환자수", "점수"] } };
  measurement.getRange("E2:E207").format.fill = palette.paleYellow;
  measurement.freezePanes.freezeColumns(4);

  const mappingSheet = addTableSheet(workbook, "항목매핑", defaults.mappingHeaders, defaults.mappings, [130, 58, 90, 105, 220, 135, 135, 150, 520, 82, 90, 82, 390]);
  mappingSheet.getRange(`A2:M${defaults.mappings.length + 1}`).format.fill = palette.paleYellow;
  mappingSheet.getRange(`B2:B${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  mappingSheet.getRange(`C2:C${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["승인", "검토필요", "보류"] } };
  mappingSheet.getRange(`J2:J${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["승인수", "환자수", "점수"] } };
  mappingSheet.getRange(`K2:K${defaults.mappings.length + 1}`).dataValidation = { rule: { type: "list", values: ["SUM", "MAX", "FIRST"] } };
  mappingSheet.getRange(`E2:I${defaults.mappings.length + 1}`).format.wrapText = true;
  mappingSheet.getRange(`M2:M${defaults.mappings.length + 1}`).format.wrapText = true;
  mappingSheet.getRange(`2:${defaults.mappings.length + 1}`).format.autofitRows();
  mappingSheet.freezePanes.freezeColumns(4);

  addTableSheet(workbook, "미매핑항목", unmappedHeaders, [], [130, 105, 220, 90, 160, 520, 420]);
  addTableSheet(workbook, "연결진단", diagnosticHeaders, [], [160, 105, 70, 120, 560]);
  addTableSheet(workbook, "동기화로그", syncLogHeaders, [], [160, 90, 90, 100, 100, 100]);
  addTableSheet(workbook, "현황최신", snapshotHeaders, [], [160, 105, 130, 84, 120, 100, 120, 220, 82, 82, 92, 90, 82, 500, 90, 82, 100, 58]);
  addTableSheet(workbook, "유폴리오최신", rawHeaders, [], [160, 230, 84, 120, 100, 190, 120, 170, 330, 82, 82, 82, 120, 92]);

  const masterSheet = addTableSheet(workbook, "마스터항목", masterHeaders, masterRows(), [58, 190, 125, 155, 330, 82, 88, 340]);
  masterSheet.getRange("A2:A207").dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  masterSheet.getRange("F2:F207").dataValidation = { rule: { type: "list", values: ["Y", "N"] } };
  masterSheet.getRange("G2:G207").dataValidation = { rule: { type: "list", values: ["승인수", "환자수", "점수"] } };
  masterSheet.getRange("F2:H207").format.fill = palette.paleYellow;
  masterSheet.freezePanes.freezeColumns(1);

  const rosterSheet = addTableSheet(workbook, "학생명단", ["출석번호", "학번", "이름", "이메일(선택)"], roster.map((row) => [...row, ""]), [84, 120, 100, 230]);
  rosterSheet.getRange(`B2:B${roster.length + 1}`).format.numberFormat = "@";
  rosterSheet.getRange(`D2:D${roster.length + 1}`).format.fill = palette.paleYellow;

  const raw = addTableSheet(workbook, "RAW", rawHeaders, [], [160, 230, 84, 120, 100, 190, 120, 170, 330, 82, 82, 82, 120, 92]);
  raw.getRange("D:D").format.numberFormat = "@";
  addTableSheet(workbook, "전송기록", logHeaders, [], [160, 230, 84, 120, 100, 82, 82, 420]);

  const workbookSettings = workbook.worksheets.add("설정");
  workbookSettings.getRange("A1:C1").values = [["설정키", "값", "설명"]];
  styleHeader(workbookSettings.getRange("A1:C1"));
  workbookSettings.getRange("A2:C3").values = [
    ["SITE_SPREADSHEET_ID", "", "이 파일의 ID"],
    ["LAST_REFRESHED_AT", "", "마지막 통합 동기화 시각"],
  ];
  styleBody(workbookSettings.getRange("A2:C3"));
  workbookSettings.getRange("B2:B3").format.fill = palette.paleYellow;
  [220, 430, 360].forEach((width, index) => {
    workbookSettings.getRange(`${colLetter(index + 1)}:${colLetter(index + 1)}`).format.columnWidthPx = width;
  });
  workbookSettings.freezePanes.freezeRows(1);
  workbookSettings.showGridLines = false;

  addGuide(
    workbook,
    "유폴리오 통합 시트",
    "학생 제출 수신과 현황시트 비교를 한 파일에서 처리합니다. 관리자만 열람합니다.",
    buildSiteGuideLines(roster.length),
  );

  for (const sheetName of UNIFIED_SHEET_ORDER) workbook.worksheets.getItem(sheetName);
  return workbook;
}

async function saveWorkbook(workbook, fileName) {
  const target = path.join(outputDir, fileName);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(target);
  return target;
}

await fs.mkdir(outputDir, { recursive: true });
const files = [await saveWorkbook(buildUnifiedWorkbook(), "01_유폴리오_통합.xlsx")];

const summary = {
  rosterCount: roster.length,
  itemCount: items.length,
  sourceCount: defaults.connections.length,
  mappingCount: defaults.mappings.length,
  files,
};
await fs.writeFile(path.join(outputDir, "build-summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
