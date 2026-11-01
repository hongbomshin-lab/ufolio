import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function load() {
  const context = vm.createContext({ console, Date });
  for (const file of ["CaseSheetCore.gs", "CaseSheetDefaults.gs", "CaseSheetSync.gs", "Code.gs"]) {
    vm.runInContext(readFileSync(`apps-script/${file}`, "utf8"), context);
  }
  return context;
}

const PRACTICE = "3학년 치의학 임상실습 2";
const PROS = `${PRACTICE}|보철과`;

function sheetStub(initial = []) {
  const sheet = {
    rows: initial.map((row) => [...row]), rules: [], hidden: true,
    getLastRow() { return this.rows.length; },
    getMaxRows() { return 1000; },
    setConditionalFormatRules(rules) { this.rules = rules; },
    setColumnWidth() {}, setFrozenRows() {}, setHiddenGridlines() {}, hideColumns() {},
    isSheetHidden() { return this.hidden; }, showSheet() { this.hidden = false; },
  };
  sheet.getRange = (row, column, height = 1, width = 1) => {
    const range = new Proxy({
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => sheet.rows[row - 1 + r]?.[column - 1 + c] ?? "")),
      setValues(values) { values.forEach((cells, r) => cells.forEach((value, c) => { (sheet.rows[row - 1 + r] ??= [])[column - 1 + c] = value; })); return range; },
      setValue(value) { (sheet.rows[row - 1] ??= [])[column - 1] = value; return range; },
      clearContent() { for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) (sheet.rows[row - 1 + r] ??= [])[column - 1 + c] = ""; return range; },
    }, { get: (target, key) => target[key] || (() => range) });
    return range;
  };
  return sheet;
}

function ruleBuilder() {
  let formula;
  const builder = new Proxy({}, { get: (_, key) => (key === "build" ? () => formula : (...args) => { if (key === "whenFormulaSatisfied") formula = args[0]; return builder; }) });
  return builder;
}

function workbook() {
  const lab = (item) => ["Y", PRACTICE, "교정과", "기공", item, "", "", ""];
  const sheets = {
    학생명단: sheetStub([["번호", "학번", "이름"], [2, "id-2", "학생둘"], [1, "id-1", "학생하나"]]),
    마스터항목: sheetStub([Array(8).fill("h"), lab("Active plate"), lab("기타"), ["Y", PRACTICE, "교정과", "Total Case", "Total Case(신환)", "", "", ""]]),
    RAW: sheetStub([
      Array(14).fill("h"),
      ["2026-10-01", "t", 1, "id-1", "학생하나", PRACTICE, "교정과", "기공", "Active plate", 2, 0, 0, "", 1],
      ["2026-10-01", "t", 1, "id-1", "학생하나", PRACTICE, "교정과", "기공", "기타", 3, 0, 0, "", 0],
      ["2026-10-01", "t", 1, "id-1", "학생하나", PRACTICE, "교정과", "Total Case", "Total Case(신환)", 9, 0, 0, "", 0],
    ]),
  };
  return { sheets, getSheetByName: (name) => sheets[name], insertSheet: (name) => (sheets[name] = sheetStub()) };
}

test("submitted count adds pending to approved and stays blank when neither is known", () => {
  const context = load();
  assert.equal(context.case_recordMetric_({ approvedCount: 2, pendingCount: 3 }, "제출건수"), 5);
  assert.equal(context.case_recordMetric_({ approvedCount: 2, pendingCount: "" }, "제출건수"), 2);
  assert.equal(context.case_recordMetric_({ approvedCount: "", pendingCount: "" }, "제출건수"), "");
  assert.equal(context.case_recordMetric_(Array.from({ length: 14 }, (_, i) => (i === 9 ? 2 : i === 13 ? 1 : "")), "제출건수"), 3);
});

test("prosthodontic comparison uses completed values, submitted counts for charting, and keeps cumulative rows for the cross sheet", () => {
  const context = load();
  const mappings = Object.fromEntries(context.case_defaultMappings_().map((row) => [row[0], row]));
  assert.equal(mappings.PROS_REMOVABLE[7], "VALUE(D)");
  assert.equal(mappings.PROS_FIXED[7], "VALUE(H)");
  assert.equal(mappings.PROS_IMPLANT[7], "VALUE(L)");
  assert.equal(mappings.PROS_IMPLANT_ASSIST[7], "VALUE(Q)");
  assert.equal(mappings.PROS_CHARTING[9], "제출건수");
  assert.equal(mappings.PROS_DIAG_TOTAL[9], "제출건수");
  assert.equal(mappings.PROS_CUM_REMOVABLE[7], "VALUE(G)");
  assert.equal(mappings.PROS_CUM_FIXED[7], "VALUE(K)");
  assert.equal(mappings.PROS_CUM_IMPLANT[7], "VALUE(N)");
  assert.equal(mappings.PROS_CUM_REMOVABLE[8], mappings.PROS_REMOVABLE[8]);
});

test("prosthodontic comparison rows follow the status sheet order and only completed rows reach it", () => {
  const context = load();
  const student = { attendanceNo: 1, studentId: "id-1", name: "학생하나" };
  const departmentBySource = { PROS: "보철과" };
  const mappings = context.case_defaultMappings_().filter((row) => row[3] === "PROS").map((row) => context.case_mappingObject_(row, departmentBySource));
  const values = Array(26).fill(1);
  values[0] = 1;
  values[1] = "학생하나";
  values[3] = 2; // D 가철 완료
  values[6] = 5; // G 가철 누적
  values[18] = 4; // S 차팅
  const key = (menu, item) => `id-1|${PROS}|${menu}|${item}`;
  const result = context.case_refreshAll_({
    now: () => new Date("2026-10-01T00:00:00Z"),
    getConnections: () => [{ sourceKey: "PROS", active: "Y", url: "x", attendanceColumn: "A", nameColumn: "B", firstDataRow: 5, department: "보철과" }],
    getMappings: () => mappings,
    getRoster: () => [student],
    getPreviousSnapshot: () => [{ sourceKey: "OLD", mappingKey: "OLD", studentId: "removed", reviewStatus: "승인", ufolioTargets: "", measurement: "승인수" }],
    getLatestUfolio: () => ({
      [key("Total Case", "Total case evaluation (가철성)")]: { approvedCount: 2, patientCount: "", score: "", pendingCount: 3 },
      [key("증례별 임상참여", "22. Charting")]: { approvedCount: 1, patientCount: "", score: "", pendingCount: 3 },
    }),
    readSource: () => [values],
  });
  assert.deepEqual(Array.from(result.comparisonRows, (row) => row.label).filter((label) => !label.startsWith("기공")), [
    "가철 완료", "고정 완료", "임플 완료", "임수 누적", "차팅", "진토", "단타", "교픽",
  ]);
  const byLabel = Object.fromEntries(result.comparisonRows.map((row) => [row.label, row]));
  assert.equal(byLabel["가철 완료"].sourceValue, 2);
  assert.equal(byLabel["가철 완료"].status, "일치"); // 완료 2 = 승인 2 (누적 5, 제출 5와 무관)
  assert.equal(byLabel["차팅"].ufolioValue, 4); // 승인 1 + 미승인 3
  assert.equal(byLabel["차팅"].status, "일치");
  assert.equal(result.comparisonRows.some((row) => row.mappingKey.startsWith("PROS_CUM_")), false);
  assert.equal(result.snapshotRows.some((row) => row.studentId === "removed"), false, "명단에서 뺀 학생의 이전 스냅샷은 사라진다");
  assert.equal(result.prosCrossRows.find((row) => row.label === "가철 누적").leftValue, 5);
});

test("ortho lab sheet sums only lab items per student, keeps N, and colors against B2", () => {
  const context = load();
  context.SpreadsheetApp = {
    newDataValidation: () => new Proxy({}, { get: (_, key, self) => () => self }),
    newConditionalFormatRule: ruleBuilder,
  };
  const spreadsheet = workbook();
  context.case_updateOrthoLabSheet_(spreadsheet);
  const sheet = spreadsheet.sheets.교정기공;
  assert.deepEqual(sheet.rows[3], [1, "학생하나", 5]); // Total Case 9는 제외, 미승인 1도 제외
  assert.deepEqual(sheet.rows[4], [2, "학생둘", "미인증"]);
  assert.deepEqual(Array.from(sheet.rules), ['=AND($B$2<>"",$C4=$B$2)', '=AND($B$2<>"",$C4<>$B$2)']);
  sheet.rows[1][1] = 5;
  spreadsheet.sheets.학생명단.rows.pop();
  context.case_updateOrthoLabSheet_(spreadsheet);
  assert.equal(sheet.rows[1][1], 5, "동기화해도 입력한 N은 유지된다");
  assert.deepEqual(sheet.rows[3], [2, "학생둘", "미인증"]);
  assert.deepEqual(sheet.rows[4], ["", "", ""], "빠진 학생 행은 지워진다");
});

test("submission check lists every student in number order with a live formula and exports no student id in A:C", () => {
  const context = load();
  const spreadsheet = workbook();
  context.case_updateSubmissionCheckSheet_(spreadsheet);
  const sheet = spreadsheet.sheets.전송확인;
  assert.deepEqual(sheet.rows[0], ["번호", "이름", "최신 유폴 인증 전송일시", "학번"]);
  assert.deepEqual(sheet.rows[1].slice(0, 2), [1, "학생하나"]);
  assert.equal(sheet.rows[1][2], '=IF(COUNTIF(RAW!$D:$D,$D2)=0,"미인증",MAXIFS(RAW!$A:$A,RAW!$D:$D,$D2))');
  assert.equal(sheet.rows[1][3], "id-1");
  assert.match(sheet.rows[2][2], /\$D3/);
  assert.equal(sheet.hidden, false);
});

function loadSetup() {
  const context = load();
  vm.runInContext(readFileSync("apps-script/SystemSetup.gs", "utf8"), context);
  return context;
}

test("prosthodontic rules menu reseeds only PROS mappings and overrides only charting and diagnosis measurements", () => {
  const context = loadSetup();
  let seeded;
  let overrides;
  context.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => ({}), toast() {} }) };
  context.sys_ensureIntegrationSheets_ = () => {};
  context.sys_applyAdminFormats_ = () => {};
  context.sys_seedRows_ = (_, __, rows) => { seeded = rows; };
  context.sys_seedMeasurementSettings_ = (_, value) => { overrides = value; };
  context.applyProsComparisonRules();
  assert.ok(seeded.length >= 13);
  assert.equal(seeded.every((row) => row[3] === "PROS"), true);
  assert.deepEqual(Object.values(overrides), ["제출건수", "제출건수"]);
  assert.deepEqual(Object.keys(overrides).map((key) => key.split("|").at(-1)).sort(), ["22. Charting", "Charting and Treatment planning evaluation"]);
});

test("student file imports only A:C once and later runs reuse the saved link", () => {
  const context = loadSetup();
  let formula;
  let created = 0;
  let saved;
  let alert;
  const sheet = new Proxy({ setFormula(value) { formula = value; } }, { get: (target, key) => target[key] || (() => sheet) });
  const file = { setSpreadsheetTimeZone() {}, getSheets: () => [{ setName() {}, setFrozenRows() {}, setColumnWidth() {}, getRange: () => sheet }], getUrl: () => "https://sheet/new" };
  context.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getId: () => "ADMIN_ID" }),
    getUi: () => ({ alert(message) { alert = message; } }),
    create: () => { created += 1; return file; },
  };
  context.case_updateSubmissionCheckSheet_ = () => {};
  context.sys_styleHeader_ = () => {};
  context.sys_getSettings_ = () => ({ SUBMISSION_CHECK_URL: saved || "" });
  context.sys_setSettings_ = (_, updates) => { saved = updates.SUBMISSION_CHECK_URL; };
  context.createStudentSubmissionFile();
  assert.equal(formula, '=IMPORTRANGE("ADMIN_ID","전송확인!A:C")');
  assert.equal(saved, "https://sheet/new");
  context.createStudentSubmissionFile();
  assert.equal(created, 1);
  assert.match(alert, /이미 있습니다[\s\S]*https:\/\/sheet\/new/);
});

test("reseeding replaces an old dropdown rule instead of failing on a newly allowed value", () => {
  const context = loadSetup();
  let oldRule = true;
  const written = [];
  const sheet = {
    getLastRow: () => 2, getMaxRows: () => 100, getMaxColumns: () => 13,
    getCharts: () => [], getFilter: () => null, clear() {}, clearConditionalFormatRules() {},
    setFrozenRows() {}, setHiddenGridlines() {},
    getRange: () => new Proxy({
      getValues: () => [["PROS_CHARTING", "승인수"]],
      clearDataValidations() { oldRule = false; },
      setValues(rows) {
        // 실제 Sheets처럼 sheet.clear() 뒤에도 남은 규칙이 새 값을 거부한다.
        if (oldRule && rows.flat().includes("제출건수")) throw new Error("데이터 확인 규칙 위반");
        written.push(...rows);
      },
    }, { get: (target, key) => target[key] || (() => undefined) }),
  };
  context.sys_styleHeader_ = () => {};
  context.sys_seedRows_(sheet, ["매핑키", "측정값"], [["PROS_CHARTING", "제출건수"]], 0);
  assert.deepEqual(Array.from(written.at(-1)), ["PROS_CHARTING", "제출건수"]);
});

test("removing students from the roster keeps only roster rows in RAW", () => {
  const context = load();
  const kept = context.keepRosterRawRows_(
    [["t", "s", 1, "id-1"], ["t", "s", 94, "id-removed"], ["t", "s", 2, " id-2 "]],
    [[1, "id-1", "학생하나"], [2, "id-2", "학생둘"]],
  );
  assert.deepEqual(Array.from(kept, (row) => row[2]), [1, 2]);
});
