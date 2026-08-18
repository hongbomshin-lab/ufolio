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

function latestRecord(value, pending = "") {
  return { approvedCount: value, patientCount: "", score: "", pendingCount: pending };
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

test("stale snapshot rows follow the current measurement settings", () => {
  const sync = loadSync();
  const target = "3학년 치의학 임상실습 2|치주과|증례별 임상참여|Implant Assist";
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
    ufolioTargets: target,
    aggregation: "SUM",
    priority: 70,
    status: "일치",
    stale: false,
  };
  const services = {
    now: () => new Date("2026-08-06T03:00:00.000Z"),
    getConnections: () => [
      { sourceKey: "FAIL", active: "Y", url: "sheet-fail", attendanceColumn: "A", nameColumn: "B", priority: 70 },
    ],
    getMappings: () => [
      mapping({ mappingKey: "FAIL_COUNT", sourceKey: "FAIL", label: "이전 집계", ufolioTargets: target, priority: 70 }),
    ],
    getMeasurementSettings: () => ({ [target]: "환자수" }),
    getRoster: () => [{ attendanceNo: 1, studentId: "2024-00001", name: "학생일" }],
    getPreviousSnapshot: () => [previousFailed],
    getLatestUfolio: () => ({
      [`2024-00001|${target}`]: { approvedCount: 9, patientCount: 2, score: "", pendingCount: "" },
    }),
    readSource: () => {
      throw new Error("권한 없음");
    },
  };

  const result = sync.case_refreshAll_(services);
  const row = result.comparisonRows.find((entry) => entry.mappingKey === "FAIL_COUNT");
  assert.equal(row.measurement, "환자수");
  assert.equal(row.ufolioValue, 2);
});

test("refresh excludes name mismatches and keeps unapproved mappings out of the comparison", () => {
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
  assert.equal(result.comparisonRows.some((row) => row.mappingKey === "REVIEW"), false);
});

test("refresh comparisons cover equal, pending, source-missing, and unauthenticated states", () => {
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
      [`2024-00001|${target}`]: latestRecord(3, 2),
      [`2024-00002|${target}`]: latestRecord(3),
      [`2024-00003|${target}`]: latestRecord(5),
    }),
    getLatestSubmissionAt: () => ({
      "2024-00001": new Date("2026-08-05T22:10:00.000Z"),
      "2024-00002": new Date("2026-08-05T21:00:00.000Z"),
      "2024-00003": new Date("2026-08-05T20:00:00.000Z"),
    }),
    readSource: () => [
      { rowNumber: 3, values: [1, "학생1", 3] },
      { rowNumber: 4, values: [2, "학생2", 5] },
      { rowNumber: 5, values: [3, "학생3", 2] },
      { rowNumber: 6, values: [4, "학생4", 1] },
    ],
  };

  const result = sync.case_refreshAll_(services);
  const byAttendance = Object.fromEntries(result.comparisonRows.map((row) => [row.attendanceNo, row]));
  assert.equal(byAttendance[1].status, "일치");
  assert.equal(byAttendance[2].status, "반영대기");
  assert.equal(byAttendance[3].status, "현황누락의심");
  assert.equal(byAttendance[4].status, "유폴리오미인증");

  assert.equal(byAttendance[1].ufolioDisplay, 3);
  assert.equal(byAttendance[4].ufolioDisplay, "미인증");
  // 측정값이 모두 표시되고, 미인증 학생은 전부 "미인증"으로 나온다.
  // 제출건수는 유폴리오 화면과 같은 총 제출(승인 3 + 미승인 2), 미승인 = submit_cnt.
  assert.equal(byAttendance[1].submitDisplay, 5);
  // 미승인이 빈칸(구버전 북마클릿)이면 승인수만으로 계산한다.
  assert.equal(byAttendance[2].submitDisplay, 3);
  assert.equal(byAttendance[1].approvedDisplay, 3);
  assert.equal(byAttendance[1].pendingDisplay, 2);
  assert.equal(byAttendance[2].pendingDisplay, "");
  assert.equal(byAttendance[1].patientDisplay, "");
  assert.equal(byAttendance[1].scoreDisplay, "");
  assert.equal(byAttendance[4].submitDisplay, "미인증");
  assert.equal(byAttendance[4].approvedDisplay, "미인증");
  assert.equal(byAttendance[4].pendingDisplay, "미인증");
  assert.equal(byAttendance[4].patientDisplay, "미인증");
  assert.equal(byAttendance[4].scoreDisplay, "미인증");
  assert.equal(byAttendance[1].pendingWait, 2);
  // 승인대기 값이 아예 없는 제출(구버전 북마클릿)은 0이 아니라 빈칸으로 남긴다.
  assert.equal(byAttendance[2].pendingWait, "");
  assert.equal(byAttendance[4].pendingWait, "");
  assert.equal(byAttendance[1].latestAuthAt.toISOString(), "2026-08-05T22:10:00.000Z");
  assert.equal(byAttendance[4].latestAuthAt, "");
});

test("measurement settings sheet overrides the mapping measurement", () => {
  const sync = loadSync();
  const target = "3학년 치의학 임상실습 2|치주과|증례별 임상참여|Flap Assist";
  const services = {
    now: () => new Date("2026-08-06T03:00:00.000Z"),
    getConnections: () => [
      { sourceKey: "GOOD", active: "Y", url: "sheet-good", attendanceColumn: "A", nameColumn: "B", priority: 80 },
    ],
    getMappings: () => [mapping({ ufolioTargets: target, measurement: "승인수" })],
    getMeasurementSettings: () => ({ [target]: "환자수" }),
    getRoster: () => [{ attendanceNo: 1, studentId: "2024-00001", name: "학생일" }],
    getPreviousSnapshot: () => [],
    getLatestUfolio: () => ({
      [`2024-00001|${target}`]: { approvedCount: 3, patientCount: 7, score: "", pendingCount: "" },
    }),
    readSource: () => [{ rowNumber: 3, values: [1, "학생일", 7] }],
  };

  const result = sync.case_refreshAll_(services);
  assert.equal(result.comparisonRows.length, 1);
  assert.equal(result.comparisonRows[0].measurement, "환자수");
  assert.equal(result.comparisonRows[0].ufolioValue, 7);
  assert.equal(result.comparisonRows[0].status, "일치");
});

test("latest u-folio rows keep the pending count and per-student submission time", () => {
  const sync = loadSync();
  const rawRows = [
    ["2026-08-05T10:00:00.000Z", "id-1", 1, "2024-00001", "학생일", "실습", "치주과", "증례별 임상참여", "Flap Assist", 2, "", "", "", 1],
    ["2026-08-06T10:00:00.000Z", "id-2", 1, "2024-00001", "학생일", "실습", "치주과", "증례별 임상참여", "Flap Assist", 3, "", "", "", 4],
  ];
  const latest = sync.case_latestUfolioFromRows_(rawRows);
  const record = latest["2024-00001|실습|치주과|증례별 임상참여|Flap Assist"];
  assert.equal(record.approvedCount, 3);
  assert.equal(record.pendingCount, 4);
  const submissions = sync.case_latestSubmissionFromRows_(rawRows);
  assert.equal(submissions["2024-00001"].toISOString(), "2026-08-06T10:00:00.000Z");
});

test("comparison sheet headers expose all u-folio metrics plus latest auth time", () => {
  const sync = loadSync();
  assert.deepEqual(Array.from(sync.CASE_COMPARISON_HEADERS), [
    "출석번호", "학번", "이름", "과", "현황표시명", "측정값", "현황값", "제출건수", "승인수", "미승인", "환자수", "점수", "최신 유폴 인증",
  ]);
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

test("prosthodontic cross rows pair the status sheets and attach the u-folio value", () => {
  const sync = loadSync();
  const snapshot = (overrides) => ({
    syncedAt: "2026-08-18T03:00:00.000Z",
    sourceKey: "PROS",
    attendanceNo: 1,
    studentId: "2024-00001",
    name: "학생일",
    department: "보철과",
    reviewStatus: "승인",
    measurement: "승인수",
    aggregation: "SUM",
    priority: 60,
    status: "정상",
    stale: false,
    ...overrides,
  });
  const removableTarget = "3학년 치의학 임상실습 2|보철과|Total Case|Total case evaluation (가철성)";
  const chartingTarget = "3학년 치의학 임상실습 2|보철과|증례별 임상참여|22. Charting";
  const rows = [
    snapshot({ mappingKey: "PROS_REMOVABLE", sourceValue: 2, ufolioTargets: removableTarget }),
    snapshot({ mappingKey: "PROS_TOTAL_REMOVABLE", sourceKey: "PROS_TOTAL", sourceValue: 2, ufolioTargets: removableTarget, priority: 50 }),
    snapshot({ mappingKey: "PROS_CHARTING", sourceValue: 4, ufolioTargets: chartingTarget }),
    snapshot({ mappingKey: "PROS_CHART_32", sourceKey: "PROS_CHART", sourceValue: 3, ufolioTargets: chartingTarget, priority: 50 }),
    snapshot({ mappingKey: "PROS_FIXED", sourceValue: 1, ufolioTargets: "3학년 치의학 임상실습 2|보철과|Total Case|Total case evaluation (고정성)" }),
    snapshot({ mappingKey: "PROS_STUDENT_EVAL", sourceValue: 10, ufolioTargets: "3학년 치의학 임상실습 2|보철과|증례별 임상참여|01. Student evaluation" }),
  ];
  const latest = {
    ["2024-00001|" + removableTarget]: { approvedCount: 2, patientCount: "", score: "", pendingCount: "" },
  };
  const result = sync.case_prosCrossRows_(rows, latest);
  assert.equal(result.length, 3); // 단타 등 비교쌍이 아닌 매핑은 제외
  const byLabel = Object.fromEntries(result.map((row) => [row.label, row]));
  assert.equal(byLabel["가철 누적"].status, "일치");
  assert.equal(byLabel["가철 누적"].leftValue, 2);
  assert.equal(byLabel["가철 누적"].rightValue, 2);
  assert.equal(byLabel["가철 누적"].ufolioValue, 2);
  assert.equal(byLabel["차팅(3-2)"].status, "불일치");
  assert.equal(byLabel["차팅(3-2)"].ufolioValue, "미인증");
  assert.equal(byLabel["고정 누적"].status, "원본누락");
  assert.equal(byLabel["고정 누적"].rightValue, "");
});
