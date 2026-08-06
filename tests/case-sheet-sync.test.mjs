import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadSync() {
  const context = vm.createContext({ console, Date });
  for (const file of ["apps-script/CaseSheetCore.gs", "apps-script/CaseSheetSync.gs"]) {
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

function mapping(overrides = {}) {
  return {
    mappingKey: "GOOD_COUNT",
    active: "Y",
    reviewStatus: "승인",
    sourceKey: "GOOD",
    label: "테스트 집계",
    completedExpression: "VALUE(C)",
    plannedExpression: "",
    certificationExpression: "VALUE(C)",
    ufolioTargets: "3학년 치의학 임상실습 2|치주과|증례별 임상참여|Flap Assist",
    measurement: "승인수",
    aggregation: "SUM",
    priority: 80,
    note: "",
    ...overrides,
  };
}

function latestRecord(value) {
  return { approvedCount: value, patientCount: "", score: "" };
}

test("refresh isolates source failures and preserves failed source snapshots as stale", () => {
  const sync = loadSync();
  const previousFailed = {
    syncedAt: "2026-08-05T03:00:00.000Z",
    sourceKey: "FAIL",
    mappingKey: "FAIL_COUNT",
    attendanceNo: 1,
    studentId: "2024-00001",
    name: "학생일",
    department: "치주과",
    label: "이전 집계",
    completedValue: 2,
    plannedValue: "",
    sourceValue: 2,
    reviewStatus: "승인",
    measurement: "승인수",
    ufolioTargets: "3학년 치의학 임상실습 2|치주과|증례별 임상참여|Implant Assist",
    aggregation: "SUM",
    priority: 70,
    status: "일치",
    stale: false,
  };
  const services = {
    now: () => new Date("2026-08-06T03:00:00.000Z"),
    getConnections: () => [
      { sourceKey: "GOOD", active: "Y", url: "sheet-good", attendanceColumn: "A", nameColumn: "B", priority: 80 },
      { sourceKey: "FAIL", active: "Y", url: "sheet-fail", attendanceColumn: "A", nameColumn: "B", priority: 70 },
    ],
    getMappings: () => [
      mapping(),
      mapping({ mappingKey: "FAIL_COUNT", sourceKey: "FAIL", label: "이전 집계", ufolioTargets: previousFailed.ufolioTargets, priority: 70 }),
    ],
    getRoster: () => [
      { attendanceNo: 1, studentId: "2024-00001", name: "학생일" },
      { attendanceNo: 2, studentId: "2024-00002", name: "학생이" },
    ],
    getPreviousSnapshot: () => [previousFailed],
    getLatestUfolio: () => ({
      "2024-00001|3학년 치의학 임상실습 2|치주과|증례별 임상참여|Flap Assist": latestRecord(3),
    }),
    readSource: (connection) => {
      if (connection.sourceKey === "FAIL") throw new Error("권한 없음");
      return [
        { rowNumber: 3, values: [1, "학생일", 5] },
        { rowNumber: 4, values: [2, "학생이", 1] },
      ];
    },
  };

  const result = sync.case_refreshAll_(services);
  const goodRows = result.snapshotRows.filter((row) => row.sourceKey === "GOOD");
  const failedRows = result.snapshotRows.filter((row) => row.sourceKey === "FAIL");
  assert.equal(goodRows.length, 2);
  assert.equal(failedRows.length, 1);
  assert.equal(failedRows[0].sourceValue, 2);
  assert.equal(failedRows[0].stale, true);
  assert.equal(failedRows[0].status, "원본노후");
  assert.equal(result.connectionResults.find((row) => row.sourceKey === "GOOD").status, "정상");
  assert.equal(result.connectionResults.find((row) => row.sourceKey === "FAIL").status, "원본노후");
  assert.match(result.diagnostics.find((row) => row.sourceKey === "FAIL").detail, /권한 없음/);
});

test("refresh excludes name mismatches and separates unapproved mappings", () => {
  const sync = loadSync();
  const services = {
    now: () => new Date("2026-08-06T03:00:00.000Z"),
    getConnections: () => [
      { sourceKey: "GOOD", active: "Y", url: "sheet-good", attendanceColumn: "A", nameColumn: "B", priority: 80 },
    ],
    getMappings: () => [
      mapping(),
      mapping({ mappingKey: "REVIEW", reviewStatus: "검토필요", label: "검토 집계", certificationExpression: "VALUE(D)" }),
    ],
    getRoster: () => [
      { attendanceNo: 1, studentId: "2024-00001", name: "학생일" },
      { attendanceNo: 2, studentId: "2024-00002", name: "학생이" },
    ],
    getPreviousSnapshot: () => [],
    getLatestUfolio: () => ({}),
    readSource: () => [
      { rowNumber: 3, values: [1, "학생일", 1, 7] },
      { rowNumber: 4, values: [2, "다른이름", 2, 8] },
    ],
  };

  const result = sync.case_refreshAll_(services);
  assert.equal(result.snapshotRows.filter((row) => row.attendanceNo === 2).length, 0);
  assert.ok(result.diagnostics.some((row) => row.status === "학생불일치" && row.rowNumber === 4));
  assert.equal(result.unmappedRows.length, 1);
  assert.equal(result.unmappedRows[0].mappingKey, "REVIEW");
  assert.ok(result.comparisonRows.some((row) => row.mappingKey === "REVIEW" && row.status === "매핑대기"));
});

test("refresh comparisons cover equal, pending, source-missing, and U-FOLIO-missing states", () => {
  const sync = loadSync();
  const target = "3학년 치의학 임상실습 2|치주과|증례별 임상참여|Flap Assist";
  const roster = [1, 2, 3, 4].map((attendanceNo) => ({
    attendanceNo,
    studentId: `2024-0000${attendanceNo}`,
    name: `학생${attendanceNo}`,
  }));
  const services = {
    now: () => new Date("2026-08-06T03:00:00.000Z"),
    getConnections: () => [
      { sourceKey: "GOOD", active: "Y", url: "sheet-good", attendanceColumn: "A", nameColumn: "B", priority: 80 },
    ],
    getMappings: () => [mapping({ ufolioTargets: target })],
    getRoster: () => roster,
    getPreviousSnapshot: () => [],
    getLatestUfolio: () => ({
      [`2024-00001|${target}`]: latestRecord(3),
      [`2024-00002|${target}`]: latestRecord(3),
      [`2024-00003|${target}`]: latestRecord(5),
    }),
    readSource: () => [
      { rowNumber: 3, values: [1, "학생1", 3] },
      { rowNumber: 4, values: [2, "학생2", 5] },
      { rowNumber: 5, values: [3, "학생3", 2] },
      { rowNumber: 6, values: [4, "학생4", 1] },
    ],
  };

  const result = sync.case_refreshAll_(services);
  const statusByAttendance = Object.fromEntries(result.comparisonRows.map((row) => [row.attendanceNo, row.status]));
  assert.equal(statusByAttendance[1], "일치");
  assert.equal(statusByAttendance[2], "반영대기");
  assert.equal(statusByAttendance[3], "현황누락의심");
  assert.equal(statusByAttendance[4], "유폴리오미인증");
});

test("required source columns exclude identifier-detail columns from stage sheets", () => {
  const sync = loadSync();
  const columns = sync.case_requiredColumns_(
    { attendanceColumn: "A", nameColumn: "B" },
    [
      mapping({ completedExpression: "COUNT_NONEMPTY(D:F)", certificationExpression: "COUNT_NONEMPTY(D:F)" }),
      mapping({ completedExpression: "COUNT_NONEMPTY(H:K)", certificationExpression: "COUNT_NONEMPTY(H:K)" }),
    ],
  );
  assert.equal(columns.join(","), "A,B,D,E,F,H,I,J,K");
  assert.equal(columns.includes("C"), false);
  assert.equal(columns.includes("G"), false);
});
