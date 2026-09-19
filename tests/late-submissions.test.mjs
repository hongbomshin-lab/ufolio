import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function load() {
  const context = vm.createContext({ console, Date });
  vm.runInContext(readFileSync("apps-script/CaseSheetSync.gs", "utf8"), context);
  return context;
}

function roster(count) {
  return Array.from({ length: count }, (_, i) => ({ attendanceNo: i + 1, studentId: `test-${i + 1}`, name: `학생${i + 1}` }));
}

function raw(studentId, at) {
  return [at, "transmission", "", studentId, "", "practice", "department", "menu", "item", 0, 0, 0, "", 0];
}

test("late report changes date at Korean midnight and orders missing, earlier, then late submissions", () => {
  const context = load();
  const report = context.case_buildLateReport_(roster(8), {
    "test-1": new Date("2026-09-16T12:00:00Z"),
    "test-2": new Date("2026-09-16T14:59:59.999Z"),
    "test-3": new Date("2026-09-16T00:00:00Z"),
    "test-4": new Date("2026-09-16T15:00:00Z"),
    "test-5": new Date("2026-09-15T14:00:00Z"),
    "test-7": new Date("2026-09-17T10:00:00Z"),
  });
  assert.equal(report.referenceDate, "2026-09-16");
  assert.equal(report.referenceCount, 3);
  assert.equal(report.totalCount, 8);
  assert.deepEqual(Array.from(report.rows, (row) => [row.attendanceNo, row.status, row.daysFromReference]), [
    [6, "미인증", ""], [8, "미인증", ""], [5, "이전 날짜 인증", -1], [7, "지각", 1], [4, "지각", 1],
  ]);
  assert.equal(report.rows.at(-1).latestAt.toISOString(), "2026-09-16T15:00:00.000Z");
});

test("modal date counts each roster student once regardless of items and excludes unknown students", () => {
  const context = load();
  const rows = [
    ...Array.from({ length: 100 }, () => raw("test-1", "2026-09-14T10:00:00Z")),
    raw("test-1", "2026-09-17T10:00:00Z"),
    raw("test-2", "2026-09-16T10:00:00Z"),
    raw("test-3", "2026-09-16T11:00:00Z"),
    ...Array.from({ length: 10 }, (_, i) => raw(`unknown-${i}`, "2026-09-18T10:00:00Z")),
  ];
  const report = context.case_buildLateReport_(roster(3), context.case_latestSubmissionFromRows_(rows));
  assert.equal(report.referenceDate, "2026-09-16");
  assert.equal(report.referenceCount, 2);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].studentId, "test-1");
  assert.equal(report.rows[0].latestAt.toISOString(), "2026-09-17T10:00:00.000Z");
});

test("ties select the newer Korean date and the day difference survives month and year boundaries", () => {
  const context = load();
  const report = context.case_buildLateReport_(roster(2), {
    "test-1": new Date("2026-12-31T14:59:59Z"),
    "test-2": new Date("2026-12-31T15:00:00Z"),
  });
  assert.equal(report.referenceDate, "2027-01-01");
  assert.equal(report.rows[0].daysFromReference, -1);
  assert.equal(report.rows[0].status, "이전 날짜 인증");
});

test("empty, unauthenticated, and same-date cohorts have unambiguous results", () => {
  const context = load();
  assert.equal(context.case_buildLateReport_([], {}).rows.length, 0);
  const missing = context.case_buildLateReport_(roster(2), {});
  assert.equal(missing.referenceDate, "");
  assert.equal(missing.referenceCount, 0);
  assert.equal(missing.rows.every((row) => row.status === "미인증" && row.latestAt === null), true);
  const sameDate = context.case_buildLateReport_(roster(2), { "test-1": new Date("2026-09-16T01:00:00+09:00"), "test-2": new Date("2026-09-16T23:59:59+09:00") });
  assert.equal(sameDate.rows.length, 0);
  assert.equal(sameDate.referenceCount, 2);
});

test("missing and invalid timestamps never become a 1970 authentication", () => {
  const context = load();
  const latest = context.case_latestSubmissionFromRows_([raw("test-1", null), raw("test-2", ""), raw("test-3", "invalid")]);
  assert.equal(Object.keys(latest).length, 0);
  const report = context.case_buildLateReport_(roster(3), { "test-1": null, "test-2": "", "test-3": new Date("invalid") });
  assert.equal(report.rows.every((row) => row.status === "미인증"), true);
});

function memorySheet(initial = [], maxRows = 1000) {
  const sheet = {
    rows: initial.map((row) => [...row]), maxRows, hidden: true, filter: null, formats: [],
    getLastRow() { let length = this.rows.length; while (length && !(this.rows[length - 1] || []).some((value) => value != null && value !== "")) length--; return length; },
    getMaxRows() { return this.maxRows; },
    insertRowsAfter(after, count) { assert.equal(after, this.maxRows); this.maxRows += count; },
    getFilter() { return this.filter; },
    setFrozenRows(value) { this.frozenRows = value; },
    setFrozenColumns(value) { this.frozenColumns = value; },
    setColumnWidth() {}, setRowHeight() {}, setHiddenGridlines() {}, setTabColor() {},
    isSheetHidden() { return this.hidden; }, showSheet() { this.hidden = false; },
  };
  sheet.getRange = (row, column, height = 1, width = 1) => {
    assert.ok(row + height - 1 <= sheet.maxRows, "write stays inside the grid");
    const range = new Proxy({
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => sheet.rows[row - 1 + r]?.[column - 1 + c] ?? "")),
      setValues(values) {
        assert.equal(values.length, height);
        values.forEach((cells, r) => { assert.equal(cells.length, width); cells.forEach((value, c) => { (sheet.rows[row - 1 + r] ??= [])[column - 1 + c] = value; }); });
        return range;
      },
      setValue(value) { (sheet.rows[row - 1] ??= [])[column - 1] = value; return range; },
      clearContent() { for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) (sheet.rows[row - 1 + r] ??= [])[column - 1 + c] = ""; return range; },
      setNumberFormat(value) { sheet.formats.push({ row, column, height, width, value }); return range; },
      createFilter() { sheet.filter = { row, height, remove() { sheet.filter = null; } }; return range; },
    }, { get: (target, key) => target[key] || (() => range) });
    return range;
  };
  return sheet;
}

function workbook(students, rawRows) {
  const sheets = {};
  sheets.학생명단 = memorySheet([["번호", "학번", "이름"], ...students.map((student) => [student.attendanceNo, student.studentId, student.name])]);
  sheets.RAW = memorySheet([Array(14).fill("header"), ...rawRows]);
  return { sheets, getSheetByName: (name) => sheets[name], insertSheet: (name) => (sheets[name] = memorySheet([], 5)), setSpreadsheetTimeZone(value) { this.timeZone = value; } };
}

test("late sheet stores real timestamps, labels missing students and clears previous results on refresh", () => {
  const context = load();
  const spreadsheet = workbook(roster(8), [raw("test-1", "2026-09-16T10:00:00Z")]);
  context.case_updateLateSheet_(spreadsheet);
  const sheet = spreadsheet.sheets.지각자;
  assert.equal(sheet.rows[4][4], "미인증");
  assert.equal(sheet.getLastRow(), 11);
  assert.equal(sheet.hidden, false);
  assert.equal(sheet.frozenRows, 4);
  assert.equal(spreadsheet.timeZone, "Asia/Seoul");
  spreadsheet.sheets.RAW.rows = [Array(14).fill("header"), raw("test-1", "2026-09-16T14:59:59Z"), raw("test-2", "2026-09-16T10:00:00Z"), raw("test-3", "2026-09-16T15:00:00Z"), ...roster(8).slice(3).map((student) => raw(student.studentId, "2026-09-16T10:00:00Z"))];
  context.case_updateLateSheet_(spreadsheet);
  assert.equal(sheet.rows[4][3], "지각");
  assert.equal(sheet.rows[4][4].toISOString(), "2026-09-16T15:00:00.000Z");
  assert.equal(sheet.getLastRow(), 5);
  assert.equal(sheet.filter.row, 4);
  assert.ok(sheet.formats.some((format) => format.column === 5 && format.value === "yyyy-mm-dd hh:mm:ss"));
  spreadsheet.sheets.RAW.rows = [Array(14).fill("header"), ...roster(8).map((student) => raw(student.studentId, "2026-09-16T10:00:00Z"))];
  context.case_updateLateSheet_(spreadsheet);
  assert.equal(sheet.rows[4][0], "해당 학생 없음");
  assert.equal(sheet.rows[4][4], "");
  assert.equal(Object.keys(spreadsheet.sheets).filter((name) => name === "지각자").length, 1);
});

test("sync reads submissions arriving during source reads under the write lock, even if a source failed", () => {
  const context = load();
  const spreadsheet = workbook(roster(3), [raw("test-1", "2026-09-16T10:00:00Z"), raw("test-2", "2026-09-16T10:00:00Z")]);
  spreadsheet.sheets.동기화로그 = memorySheet([Array(6).fill("header")]);
  let locked = false;
  let dashboardUpdated = false;
  context.SpreadsheetApp = { getActiveSpreadsheet: () => spreadsheet };
  context.LockService = { getScriptLock: () => ({ waitLock() { locked = true; }, releaseLock() { locked = false; } }) };
  context.RAW_HEADERS = Array(14).fill("header");
  context.case_liveServices_ = () => ({ getLatestUfolio: () => ({}) });
  context.case_refreshAll_ = () => {
    assert.equal(locked, false);
    spreadsheet.sheets.RAW.rows.push(raw("test-3", "2026-09-16T15:00:00Z"));
    return { snapshotRows: [], comparisonRows: [], prosCrossRows: [], unmappedRows: [], diagnostics: [], connectionResults: [{ status: "원본오류" }] };
  };
  for (const name of ["case_replaceOutput_", "case_paintComparison_", "case_updateConnectionStatuses_"]) context[name] = () => {};
  const realUpdate = context.case_updateLateSheet_;
  context.case_updateLateSheet_ = (book) => { assert.equal(locked, true); return realUpdate(book); };
  context.dash_updateDashboard_ = () => { dashboardUpdated = true; };
  context.refreshIntegratedData();
  assert.equal(spreadsheet.sheets.지각자.rows[4][3], "지각");
  assert.equal(spreadsheet.sheets.지각자.rows[4][4].toISOString(), "2026-09-16T15:00:00.000Z");
  assert.equal(dashboardUpdated, true);
  assert.equal(locked, false);
});
