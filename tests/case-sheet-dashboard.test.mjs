import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadDashboard() {
  const context = vm.createContext({ console, Date });
  for (const file of ["apps-script/CaseSheetCore.gs", "apps-script/CaseSheetSync.gs", "apps-script/CaseSheetDashboard.gs"]) {
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

const PRACTICE = "3학년 치의학 임상실습 2";

function item(department, menu, name, fallbackMeasurement = "승인수") {
  return { practice: PRACTICE, department, menu, item: name, fallbackMeasurement };
}

test("dashboard matrix lists every master item and every student, blank when unauthenticated", () => {
  const dash = loadDashboard();
  const items = [
    item("치주과", "증례별 임상참여", "Flap Assist"),
    item("보존과", "증례별 임상참여", "Endodontic treatment(practice)", "점수"),
  ];
  const students = [
    { attendanceNo: 2, studentId: "2024-00002", name: "학생이" },
    { attendanceNo: 1, studentId: "2024-00001", name: "학생일" },
    { attendanceNo: 3, studentId: "2024-00003", name: "학생삼" },
  ];
  const latestByKey = {
    [`2024-00001|${PRACTICE}|치주과|증례별 임상참여|Flap Assist`]: { approvedCount: 4, patientCount: 1, score: "", pendingCount: "" },
    [`2024-00002|${PRACTICE}|치주과|증례별 임상참여|Flap Assist`]: { approvedCount: 2, patientCount: 1, score: "", pendingCount: "" },
    [`2024-00001|${PRACTICE}|보존과|증례별 임상참여|Endodontic treatment(practice)`]: { approvedCount: "", patientCount: "", score: 1.5, pendingCount: "" },
  };
  const submittedAt = {
    "2024-00001": new Date("2026-08-06T10:00:00.000Z"),
    "2024-00002": new Date("2026-08-06T09:00:00.000Z"),
  };

  const matrix = dash.dash_buildMatrix_(items, students, latestByKey, {}, submittedAt);

  assert.deepEqual(matrix.students.map((student) => student.attendanceNo), [1, 2, 3]);
  assert.deepEqual(matrix.students.map((student) => student.submitted), [true, true, false]);

  const flap = matrix.rows[0];
  assert.equal(flap.measurement, "승인수");
  assert.deepEqual(flap.values, [4, 2, ""]);
  assert.equal(flap.average, 3);
  assert.equal(flap.submittedCount, 2);

  const endo = matrix.rows[1];
  assert.equal(endo.measurement, "점수");
  assert.deepEqual(endo.values, [1.5, "", ""]);
  assert.equal(endo.average, 1.5);
});

test("dashboard matrix follows the measurement settings sheet over the fallback", () => {
  const dash = loadDashboard();
  const items = [item("치주과", "증례별 임상참여", "Flap Assist", "승인수")];
  const students = [{ attendanceNo: 1, studentId: "2024-00001", name: "학생일" }];
  const key = `${PRACTICE}|치주과|증례별 임상참여|Flap Assist`;
  const latestByKey = {
    [`2024-00001|${key}`]: { approvedCount: 4, patientCount: 9, score: "", pendingCount: "" },
  };
  const matrix = dash.dash_buildMatrix_(items, students, latestByKey, { [key]: "환자수" }, {});
  assert.equal(matrix.rows[0].measurement, "환자수");
  assert.deepEqual(matrix.rows[0].values, [9]);
});

test("dashboard hides unmapped OMS/prosthodontics items but keeps other departments whole", () => {
  const dash = loadDashboard();
  // 항목매핑 시트 행 형식: [매핑키, 활성, 검토상태, 소스키, 표시명, 완료식, 예정식, 인증대상식, U-FOLIO 대상, ...]
  const mappingRow = (key, active, review, targets) => [key, active, review, "SRC", "", "", "", "VALUE(C)", targets];
  const mappingRows = [
    mappingRow("OMS_EXT_A", "Y", "승인", `${PRACTICE}|구강악안면외과|증례별 임상참여|Extraction_[A]`),
    mappingRow("PROS_CHARTING", "Y", "승인", `${PRACTICE}|보철과|증례별 임상참여|22. Charting`),
    mappingRow("OMS_BIOPSY", "N", "보류", `${PRACTICE}|구강악안면외과|증례별 임상참여|Biopsy`),
    mappingRow("PERIO_FLAP", "Y", "승인", `${PRACTICE}|치주과|증례별 임상참여|Flap Assist`),
  ];
  const items = [
    item("구강악안면외과", "증례별 임상참여", "Extraction_[A]"),
    item("구강악안면외과", "증례별 임상참여", "Sinus lifting, GBR_[A]"),
    item("구강악안면외과", "증례별 임상참여", "Biopsy"),
    item("보철과", "증례별 임상참여", "22. Charting"),
    item("보철과", "증례별 임상참여", "16. Final impression"),
    item("치주과", "증례별 임상참여", "Flap Assist"),
    item("보존과", "증례별 임상참여", "Endodontic treatment(practice)"),
  ];

  const visible = dash.dash_visibleItems_(items, mappingRows);

  assert.deepEqual(visible.map((row) => row.item), [
    "Extraction_[A]",
    "22. Charting",
    "Flap Assist",
    // 매핑이 없는 다른 과 항목은 그대로 남는다 (보존과는 전 항목 전송 대상).
    "Endodontic treatment(practice)",
  ]);
  // 비활성·보류 매핑만 있는 항목은 유폴리오가 보내주지 않으므로 감춘다.
  assert.equal(visible.some((row) => row.item === "Biopsy"), false);
  // 매핑 시트를 못 읽어도 다른 과는 절대 사라지지 않는다.
  assert.deepEqual(
    dash.dash_visibleItems_(items, []).map((row) => row.department),
    ["치주과", "보존과"],
  );
});

test("distribution counts people per distinct value and skips blanks", () => {
  const dash = loadDashboard();
  assert.deepEqual(Array.from(dash.dash_distribution_([2, "", 1, 2, 2, "", 0]), (row) => Array.from(row)), [
    ["0", 1],
    ["1", 1],
    ["2", 3],
  ]);
  assert.deepEqual(Array.from(dash.dash_distribution_(["", "", ""])), []);
});

test("distribution groups spread-out values into nice-width ranges", () => {
  const dash = loadDashboard();
  // 0~59점 60명 → 폭 10짜리 구간 6개
  const values = Array.from({ length: 60 }, (_, index) => index);
  const distribution = dash.dash_distribution_(values);
  assert.deepEqual(Array.from(distribution, (row) => Array.from(row)), [
    ["0~10", 10], ["10~20", 10], ["20~30", 10], ["30~40", 10], ["40~50", 10], ["50~60", 10],
  ]);

  // 점수처럼 몇 명 안 되고 넓게 퍼진 값도 구간으로 묶인다 (정확한 값별 막대 1개씩 X)
  const scores = dash.dash_distribution_([42, 76, 139, 149, 207, 327]);
  assert.deepEqual(Array.from(scores, (row) => Array.from(row)), [
    ["0~100", 2], ["100~200", 2], ["200~300", 1], ["300~400", 1],
  ]);
});

test("stats summarize mean, standard deviation, and quartile boundaries", () => {
  const dash = loadDashboard();
  const stats = dash.dash_stats_([4, "", 1, 3, 2]);
  assert.equal(stats.count, 4);
  assert.equal(stats.mean, 2.5);
  assert.equal(Math.round(stats.sd * 1000) / 1000, 1.118);
  assert.equal(stats.median, 2.5);
  assert.equal(stats.q1, 1.75);
  assert.equal(stats.q3, 3.25);
  assert.equal(dash.dash_stats_(["", ""]), null);
});
