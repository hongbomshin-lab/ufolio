import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("scripts/build-spreadsheets.mjs", "utf8");
const verifier = readFileSync("scripts/verify-spreadsheets.mjs", "utf8");

test("spreadsheet builder emits exactly the site and integration-admin workbooks", () => {
  const outputNames = [...builder.matchAll(/"(\d{2}_유폴리오_[^"]+\.xlsx)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(outputNames)].sort(), [
    "01_유폴리오_사이트인증.xlsx",
    "02_유폴리오_통합관리자.xlsx",
  ]);
  assert.equal(builder.includes("수기입력.xlsx"), false);
  assert.equal(builder.includes("buildManualWorkbook"), false);
  assert.equal(builder.includes("MANUAL_SPREADSHEET"), false);
});

test("spreadsheet builder loads the tracked master and Apps Script defaults", () => {
  assert.match(builder, /config\/ufolio-master-items\.json/);
  assert.match(builder, /apps-script\/CaseSheetDefaults\.gs/);
  assert.match(builder, /vm\.runInContext/);
  assert.match(builder, /case_defaultConnections_/);
  assert.match(builder, /case_defaultMappings_/);
});

test("integration-admin workbook contains every designed sheet and no extra settings sheet", () => {
  for (const sheetName of [
    "사용안내",
    "대시보드",
    "현황시트연결",
    "항목매핑",
    "현황최신",
    "유폴리오최신",
    "비교결과",
    "미매핑항목",
    "연결진단",
    "동기화로그",
    "마스터항목",
  ]) {
    assert.equal(builder.includes(`"${sheetName}"`), true, `빌더 관리자 시트 누락: ${sheetName}`);
  }
  assert.equal(builder.includes('workbook.worksheets.add("설정")'), true, "① 사이트 파일 설정 탭 누락");
  assert.equal(builder.includes('admin.worksheets.add("설정")'), false, "② 관리자 파일에 불필요한 설정 탭 존재");
});

test("spreadsheet verifier expects the same two-workbook package", () => {
  assert.equal(verifier.includes("02_유폴리오_수기입력.xlsx"), false);
  assert.equal(verifier.includes("03_유폴리오_관리자.xlsx"), false);
  assert.equal(verifier.includes("02_유폴리오_통합관리자.xlsx"), true);
  assert.equal(verifier.includes("현황시트연결"), true);
  assert.equal(verifier.includes("비교결과"), true);
});

test("cross-sheet dashboard formulas are authored after referenced sheets exist", () => {
  const connectionIndex = builder.indexOf('addTableSheet(admin, "현황시트연결"');
  const comparisonIndex = builder.indexOf('addTableSheet(admin, "비교결과"');
  const formulaIndex = builder.indexOf('dashboard.getRange("B5:B12").formulas');
  assert.ok(connectionIndex >= 0 && comparisonIndex >= 0 && formulaIndex >= 0);
  assert.ok(connectionIndex < formulaIndex, "연결 시트보다 대시보드 수식을 먼저 기록함");
  assert.ok(comparisonIndex < formulaIndex, "비교 시트보다 대시보드 수식을 먼저 기록함");
});

test("long mapping fields wrap and rows autofit for operator review", () => {
  assert.equal(builder.includes('mappingSheet.getRange(`E2:I${defaults.mappings.length + 1}`).format.wrapText = true'), true);
  assert.equal(builder.includes('mappingSheet.getRange(`M2:M${defaults.mappings.length + 1}`).format.wrapText = true'), true);
  assert.equal(builder.includes('mappingSheet.getRange(`2:${defaults.mappings.length + 1}`).format.autofitRows()'), true);
});
