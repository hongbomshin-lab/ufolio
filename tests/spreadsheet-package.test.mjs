import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("scripts/build-spreadsheets.mjs", "utf8");
const verifier = readFileSync("scripts/verify-spreadsheets.mjs", "utf8");

test("spreadsheet builder emits exactly one unified workbook", () => {
  const outputNames = [...builder.matchAll(/"(\d{2}_유폴리오_[^"]+\.xlsx)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(outputNames)], ["01_유폴리오_통합.xlsx"]);
  assert.equal(builder.includes("사이트인증.xlsx"), false);
  assert.equal(builder.includes("통합관리자.xlsx"), false);
  assert.equal(builder.includes("수기입력.xlsx"), false);
  assert.equal(builder.includes("buildManualWorkbook"), false);
  assert.equal(builder.includes("buildAdminWorkbook"), false);
});

test("spreadsheet builder loads the tracked master and Apps Script defaults", () => {
  assert.match(builder, /config\/ufolio-master-items\.json/);
  assert.match(builder, /apps-script\/CaseSheetDefaults\.gs/);
  assert.match(builder, /vm\.runInContext/);
  assert.match(builder, /case_defaultConnections_/);
  assert.match(builder, /case_defaultMappings_/);
});

test("unified workbook contains every designed sheet including the measurement settings", () => {
  for (const sheetName of [
    "대시보드",
    "비교결과",
    "보철비교",
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
  ]) {
    assert.equal(builder.includes(`"${sheetName}"`), true, `빌더 시트 누락: ${sheetName}`);
  }
  assert.match(builder, /const UNIFIED_SHEET_ORDER = \[\s*"대시보드",\s*"비교결과",\s*"보철비교",\s*"현황시트연결",\s*"측정값설정"/);
});

test("comparison sheet uses the admin-facing columns with all four metrics", () => {
  assert.match(builder, /"출석번호", "학번", "이름", "과", "현황표시명", "측정값", "현황값", "제출건수", "승인수", "미승인", "환자수", "점수", "최신 유폴 인증"/);
  assert.equal(builder.includes("comparison.freezePanes.freezeColumns(3)"), true);
  // 행 색은 Apps Script 동기화가 칠하므로 xlsx에는 조건부서식을 넣지 않는다.
  assert.equal(builder.includes("conditionalFormats.addCustom"), false);
});

test("measurement settings default from the reviewed mappings", () => {
  for (const required of ["measurementDefaults", "measurementRows", '["승인수", "환자수", "점수"]']) {
    assert.equal(builder.includes(required), true, `측정값설정 요소 누락: ${required}`);
  }
});

test("spreadsheet verifier expects the same single-workbook package", () => {
  assert.equal(verifier.includes("사이트인증.xlsx"), false);
  assert.equal(verifier.includes("통합관리자.xlsx"), false);
  assert.equal(verifier.includes("01_유폴리오_통합.xlsx"), true);
  assert.equal(verifier.includes("현황시트연결"), true);
  assert.equal(verifier.includes("비교결과"), true);
  assert.equal(verifier.includes("측정값설정"), true);
});

test("long mapping fields wrap and rows autofit for operator review", () => {
  assert.equal(builder.includes('mappingSheet.getRange(`E2:I${defaults.mappings.length + 1}`).format.wrapText = true'), true);
  assert.equal(builder.includes('mappingSheet.getRange(`M2:M${defaults.mappings.length + 1}`).format.wrapText = true'), true);
  assert.equal(builder.includes('mappingSheet.getRange(`2:${defaults.mappings.length + 1}`).format.autofitRows()'), true);
});
