import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function load() {
  const context = vm.createContext({ console, Date });
  for (const file of ["CaseSheetCore", "CaseSheetDefaults", "CaseSheetSync", "SystemSetup"]) {
    vm.runInContext(readFileSync(`apps-script/${file}.gs`, "utf8"), context);
  }
  return context;
}

function scoreMappings(context) {
  return context.case_defaultMappings_().filter((row) => row[3] === "PED_SCORE").map(context.case_mappingObject_);
}

test("pediatric source skips the example and reads only the eight requested comparison columns", () => {
  const context = load();
  const connection = context.case_connectionObject_(context.case_defaultConnections_().find((row) => row[0] === "PED_SCORE"));
  assert.equal(connection.sheetName, "시트1");
  assert.equal(connection.firstDataRow, 4);
  const mappings = scoreMappings(context);
  assert.equal(mappings.length, 8);
  assert.deepEqual(Array.from(context.case_requiredColumns_(connection, mappings)), ["A", "B", "C", "E", "G", "J", "K", "M", "N", "O"]);
  assert.equal(mappings.every((mapping) => mapping.reviewStatus === "승인" && mapping.active === "Y"), true);
});

test("practice counts only completed treatment, never assignment completion", () => {
  const context = load();
  const practice = scoreMappings(context).find((mapping) => mapping.mappingKey === "PED_PRACTICE");
  for (const [status, expected] of [["완료", 1], [" 완료 ", 1], ["어싸인 완료", 0], ["미완료", 0], ["X", 0], ["", 0], ["차팅 미승인", 0], ["완료 예정", 0]]) {
    const values = Array(15).fill("");
    values[13] = status;
    assert.equal(context.case_evaluateExpression_(practice.certificationExpression, values), expected, status);
  }
  assert.match(practice.ufolioTargets, /증례별 임상참여\|practice - Composite resin restoration \(Cl\. I\) \(원내생 환자 진료\)$/);
});

test("portfolio includes charting pending but not incomplete or blank statuses", () => {
  const context = load();
  const portfolio = scoreMappings(context).find((mapping) => mapping.mappingKey === "PED_PORTFOLIO");
  for (const [status, expected] of [["완료", 1], ["차팅 미승인", 1], ["미완료", 0], ["", 0], ["완료 예정", 0]]) {
    const values = Array(15).fill("");
    values[12] = status;
    assert.equal(context.case_evaluateExpression_(portfolio.certificationExpression, values), expected, status);
  }
  assert.match(portfolio.ufolioTargets, /\|Total Case\|Total case - 포트폴리오/);
  assert.equal(context.case_evaluateExpression_("COUNT_STATUS(C:E,완료,완료,차팅 미승인)", [1, "학생", "완료", "차팅 미승인", "미완료"]), 2);
  assert.throws(() => context.case_evaluateExpression_("COUNT_STATUS(C:C,완료,)", []), /상태가 비어/);
  assert.throws(() => context.case_evaluateExpression_(portfolio.certificationExpression, [...Array(12).fill(""), "#REF!"]), /원본 수식 오류/);
});

test("pediatric sync prioritizes new charting, sums Total and lab, and keeps pending separate", () => {
  const context = load();
  const mappings = context.case_defaultMappings_().filter((row) => ["PED_SCORE", "PED_CHART"].includes(row[3])).map(context.case_mappingObject_);
  const records = {};
  const metrics = {
    PED_FACULTY_SCORE: [[2, 80, 0]],
    PED_ASSIST_SCORE: [[3, 25, 0]],
    PED_SCORE_CHARTING: [[4, 40, 1]],
    PED_QRAY: [[2, 20, 1]],
    PED_TOTAL: [[2, 20, 0], [1, 10, 0]],
    PED_PORTFOLIO: [[0, 0, 1]],
    PED_PRACTICE: [[0, 0, 0]],
    PED_LAB_SCORE: [[1, 2, 0], [1, 3, 0], [1, 4, 0], [1, 5, 0]],
  };
  for (const mapping of mappings.filter((mapping) => mapping.sourceKey === "PED_SCORE")) {
    mapping.ufolioTargets.split("\n").forEach((target, index) => {
      const [approvedCount, score, pendingCount] = metrics[mapping.mappingKey][index];
      records[`student-test|${target}`] = { approvedCount, score, pendingCount, patientCount: 99 };
    });
  }
  const values = [1, "테스트학생", 80, "제외", 25, "제외", 5, "제외", "제외", 2, 3, "제외", "차팅 미승인", "어싸인 완료", 14, "제외", "제외", "제외", "제외", "제외"];
  const result = context.case_refreshAll_({
    now: () => new Date("2026-09-16T00:00:00Z"),
    getConnections: () => context.case_defaultConnections_().filter((row) => ["PED_SCORE", "PED_CHART"].includes(row[0])).map((row) => ({ ...context.case_connectionObject_(row), url: "test-source" })),
    getMappings: () => mappings,
    getRoster: () => [{ attendanceNo: 1, studentId: "student-test", name: "테스트학생" }],
    getPreviousSnapshot: () => [],
    getLatestUfolio: () => records,
    readSource: (connection) => [connection.sourceKey === "PED_SCORE" ? values : [1, "테스트학생", "", 99]],
  });
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.comparisonRows.length, 8);
  assert.equal(result.comparisonRows.every((row) => row.sourceKey === "PED_SCORE"), true);
  const rows = Object.fromEntries(result.comparisonRows.map((row) => [row.mappingKey, row]));
  for (const [key, value] of [["PED_FACULTY_SCORE", 80], ["PED_ASSIST_SCORE", 25], ["PED_QRAY", 2], ["PED_TOTAL", 3], ["PED_PRACTICE", 0], ["PED_LAB_SCORE", 14]]) {
    assert.equal(rows[key].sourceValue, value, key);
    assert.equal(rows[key].ufolioValue, value, key);
    assert.equal(rows[key].status, "일치", key);
  }
  assert.equal(rows.PED_SCORE_CHARTING.sourceValue, 5);
  assert.equal(rows.PED_SCORE_CHARTING.ufolioValue, 4);
  assert.equal(rows.PED_SCORE_CHARTING.pendingDisplay, 1);
  assert.equal(rows.PED_SCORE_CHARTING.status, "반영대기");
  assert.equal(rows.PED_PORTFOLIO.sourceValue, 1);
  assert.equal(rows.PED_PORTFOLIO.ufolioValue, 0);
  assert.equal(rows.PED_PORTFOLIO.pendingDisplay, 1);
  assert.equal(rows.PED_PORTFOLIO.status, "반영대기");
});

// Minimal sheet storage; presentation calls are no-ops so the real seed/override logic runs.
function memorySheet(rows) {
  const sheet = { rows: structuredClone(rows), getLastRow: () => sheet.rows.length, setColumnWidth() {}, isColumnHiddenByUser: () => true };
  sheet.getRange = (row, column, height, width) => {
    const range = {
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => sheet.rows[row - 1 + r]?.[column - 1 + c] ?? "")),
      setBackground: () => range,
      setDataValidation: () => range,
    };
    return range;
  };
  return sheet;
}

test("existing workbook upgrade is repeatable and only overrides the new pediatric measurements", () => {
  const context = load();
  const mappingSeeds = context.case_defaultMappings_().filter((row) => row[3] === "PED_SCORE");
  const targets = mappingSeeds.flatMap((row) => row[8].split("\n"));
  const otherTarget = "3학년 치의학 임상실습 2|소아치과|증례별 임상참여|practice - 기타 (원내생 환자 진료)";
  const customConnection = ["CUSTOM", "N", "기타", "직접 추가", "custom-url", ...Array(10).fill("")];
  const source = Array.from(context.case_defaultConnections_().find((row) => row[0] === "PED_SCORE"));
  source[4] = "private-source-url";
  source[12] = "previous-sync";
  source[13] = "정상";
  const customMapping = ["CUSTOM", "Y", "승인", "CUSTOM", "사용자 매핑", ...Array(8).fill("")];
  const sheets = {
    현황시트연결: memorySheet([Array.from(context.CASE_CONNECTION_HEADERS), source, customConnection]),
    항목매핑: memorySheet([Array.from(context.CASE_MAPPING_HEADERS), customMapping]),
    측정값설정: memorySheet([Array.from(context.CASE_MEASUREMENT_HEADERS), ...targets.map((target) => [...target.split("|"), "환자수"]), [...otherTarget.split("|"), "점수"]]),
  };
  const spreadsheet = { getSheetByName: (name) => sheets[name], toast() {} };
  context.SpreadsheetApp = {
    getActiveSpreadsheet: () => spreadsheet,
    newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build: () => ({}) }),
  };
  context.sys_ensureIntegrationSheets_ = () => {};
  context.sys_ensureFilter_ = () => {};
  let formatApplications = 0;
  context.sys_applyAdminFormats_ = () => { formatApplications += 1; };
  context.sys_replaceData_ = (sheet, headers, rows) => { sheet.rows = [Array.from(headers), ...Array.from(rows, (row) => Array.from(row))]; };
  context.sys_readMaster_ = () => [...targets, otherTarget].map((target) => ["Y", ...target.split("|"), "Y", "승인수", ""]);
  context.applyPediatricScoreMappings();
  const afterFirst = JSON.stringify(Object.values(sheets).map((sheet) => sheet.rows));
  context.applyPediatricScoreMappings();
  assert.equal(JSON.stringify(Object.values(sheets).map((sheet) => sheet.rows)), afterFirst);
  assert.equal(formatApplications, 2);
  assert.deepEqual(sheets.현황시트연결.rows.find((row) => row[0] === "PED_SCORE"), source);
  assert.deepEqual(sheets.현황시트연결.rows.find((row) => row[0] === "CUSTOM"), customConnection);
  assert.deepEqual(sheets.항목매핑.rows.find((row) => row[0] === "CUSTOM"), customMapping);
  const choices = Object.fromEntries(sheets.측정값설정.rows.slice(1).map((row) => [row.slice(0, 4).join("|"), row[4]]));
  for (const row of mappingSeeds) {
    for (const target of row[8].split("\n")) assert.equal(choices[target], row[9], target);
  }
  assert.equal(choices[otherTarget], "점수");
  // Ordinary layout refresh must preserve later user-selected metrics.
  sheets.측정값설정.rows[1][4] = "환자수";
  context.sys_seedMeasurementSettings_(spreadsheet);
  assert.equal(sheets.측정값설정.rows[1][4], "환자수");
});
