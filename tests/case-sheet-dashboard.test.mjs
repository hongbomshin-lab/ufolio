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

test("distribution counts people per distinct value and skips blanks", () => {
  const dash = loadDashboard();
  assert.deepEqual(Array.from(dash.dash_distribution_([2, "", 1, 2, 2, "", 0]), (row) => Array.from(row)), [
    ["0", 1],
    ["1", 1],
    ["2", 3],
  ]);
  assert.deepEqual(Array.from(dash.dash_distribution_(["", "", ""])), []);
});

test("distribution falls back to ten equal-width bins for many distinct values", () => {
  const dash = loadDashboard();
  const values = Array.from({ length: 60 }, (_, index) => index);
  const distribution = dash.dash_distribution_(values);
  assert.equal(distribution.length, 10);
  assert.equal(distribution[0][0], "0~5.9");
  assert.equal(distribution.reduce((sum, [, count]) => sum + count, 0), 60);
});
