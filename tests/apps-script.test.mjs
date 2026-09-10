import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadReceiver() {
  const context = vm.createContext({ console });
  const source = readFileSync("apps-script/Code.gs", "utf8");
  vm.runInContext(source, context, { filename: "apps-script/Code.gs" });
  return context;
}

test("doPost returns a retryable error without touching sheets when the lock is busy", () => {
  const context = vm.createContext({
    console,
    LockService: {
      getScriptLock: () => ({
        tryLock: () => false,
        releaseLock: () => {
          throw new Error("얻지 못한 잠금을 해제하면 안 됩니다");
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput(text) {
        return { text, setMimeType() { return this; } };
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => {
        throw new Error("잠금 없이 시트에 접근하면 안 됩니다");
      },
    },
  });
  vm.runInContext(readFileSync("apps-script/Code.gs", "utf8"), context, { filename: "apps-script/Code.gs" });
  const output = context.doPost({ postData: { contents: JSON.stringify(validPayload()) } });
  const data = JSON.parse(output.text);
  assert.equal(data.ok, false);
  assert.equal(data.retryable, true);
  assert.match(data.error, /동기화 작업 중/);
});

function validPayload(overrides = {}) {
  return {
    schemaVersion: 1,
    submissionId: "11111111-1111-4111-8111-111111111111",
    clientSentAt: "2026-08-06T00:00:00.000Z",
    student: { studentId: "2024-54321", name: "테스트학생" },
    practices: ["3학년 치의학 임상실습 2"],
    items: [
      {
        practiceName: "3학년 치의학 임상실습 2",
        departmentName: "보존과",
        menuName: "증례별 임상참여",
        itemName: "Observation case",
        approvedCount: 3,
        pendingCount: 2,
        patientCount: 0,
        score: 6.5,
        scoreRaw: "6.5",
      },
    ],
    ...overrides,
  };
}

function fakeServices(
  rosterRows = [[7, "2024-54321", "테스트학생"]],
  masterRows = [["Y", "3학년 치의학 임상실습 2", "보존과", "증례별 임상참여", "Observation case", "N", "승인수", ""]],
) {
  const state = { rawRows: [], logRows: [], removed: [] };
  return {
    state,
    services: {
      now: () => "2026-08-06T01:02:03.000Z",
      getRosterRows: () => rosterRows,
      getMasterRows: () => masterRows,
      appendRawRows: (rows) => state.rawRows.push(...rows),
      appendLogRow: (row) => state.logRows.push(row),
      removeRawRows: (studentId, practices) => state.removed.push([studentId, practices]),
    },
  };
}

test("processSubmission_ maps a roster match and preserves every metric", () => {
  const receiver = loadReceiver();
  const { services, state } = fakeServices();

  const result = receiver.processSubmission_(validPayload(), services);

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(state.rawRows[0].slice(2, 14)), [
    7,
    "2024-54321",
    "테스트학생",
    "3학년 치의학 임상실습 2",
    "보존과",
    "증례별 임상참여",
    "Observation case",
    3,
    0,
    6.5,
    "6.5",
    2,
  ]);
  assert.equal(state.logRows[0][6], "성공");
});

test("processSubmission_ rejects items outside the active master list", () => {
  const receiver = loadReceiver();
  const { services, state } = fakeServices();
  const payload = validPayload();
  payload.items[0].itemName = "등록되지 않은 항목";

  const result = receiver.processSubmission_(payload, services);

  assert.equal(result.ok, false);
  assert.match(result.error, /마스터항목에 없는 항목/);
  assert.equal(state.rawRows.length, 0);
});

test("processSubmission_ rejects unknown IDs and mismatched names", () => {
  const receiver = loadReceiver();

  for (const payload of [
    validPayload({ student: { studentId: "2024-99999", name: "테스트학생" } }),
    validPayload({ student: { studentId: "2024-54321", name: "다른학생" } }),
  ]) {
    const { services, state } = fakeServices();
    const result = receiver.processSubmission_(payload, services);
    assert.equal(result.ok, false);
    assert.equal(state.rawRows.length, 0);
    assert.equal(state.logRows[0][6], "거부");
  }
});

test("processSubmission_ preserves unset score separately from zero", () => {
  const receiver = loadReceiver();
  const { services, state } = fakeServices(
    undefined,
    [["Y", "실습 2", "병리과", "증례", "검사", "N", "승인수", ""]],
  );
  const payload = validPayload({
    items: [
      {
        practiceName: "실습 2",
        departmentName: "병리과",
        menuName: "증례",
        itemName: "검사",
        approvedCount: 0,
        patientCount: 0,
        score: null,
        scoreRaw: "미설정",
      },
    ],
  });

  receiver.processSubmission_(payload, services);

  assert.equal(state.rawRows[0][9], 0);
  assert.equal(state.rawRows[0][10], 0);
  assert.equal(state.rawRows[0][11], "");
  assert.equal(state.rawRows[0][12], "미설정");
  assert.equal(state.rawRows[0][13], "");
});

test("processSubmission_ discards protected scores but keeps the other metrics", () => {
  const receiver = loadReceiver();
  const protectedItem = {
    practiceName: "3학년 치의학 임상실습 2",
    departmentName: "치주과",
    menuName: "증례별 임상참여",
    itemName: "Flap Assist",
    approvedCount: 4,
    pendingCount: 2,
    patientCount: 3,
    score: 999,
    scoreRaw: "999",
  };
  const { services, state } = fakeServices(
    undefined,
    [["Y", protectedItem.practiceName, protectedItem.departmentName, protectedItem.menuName, protectedItem.itemName, "N", "승인수", ""]],
  );

  receiver.processSubmission_(validPayload({ items: [protectedItem] }), services);

  assert.deepEqual(Array.from(state.rawRows[0].slice(9, 14)), [4, 3, "안받음", "안받음", 2]);
});

test("receiver score policy covers exactly the requested eight items", () => {
  const receiver = loadReceiver();
  assert.equal(Array.from(receiver.SCORE_NOT_COLLECTED_ITEM_KEYS).length, 8);
  assert.equal(receiver.shouldCollectScore_("치주과", "증례별 임상참여", "Implant Assist"), false);
  assert.equal(receiver.shouldCollectScore_("구강악안면외과", "증례별 임상참여", "수술실-기타"), false);
  assert.equal(receiver.shouldCollectScore_("영상치의학과", "나절별 임상참여", "판독 토론 및 평가"), false);
  assert.equal(receiver.shouldCollectScore_("치주과", "증례별 임상참여", "Scaling"), true);
});

test("redactScoreNotCollectedData removes historical protected scores only", () => {
  const keys = [
    ["치주과", "증례별 임상참여", "Flap Assist"],
    ["보존과", "증례별 임상참여", "Observation case"],
  ];
  const scores = [[12.5, "12.5"], [6.5, "6.5"]];
  const toasts = [];
  let written = null;
  const sheet = {
    getLastRow: () => 3,
    getRange: (_row, column) => {
      if (column === 7) return { getValues: () => keys };
      if (column === 12) return {
        getValues: () => scores.map((row) => [...row]),
        setValues: (rows) => { written = rows; },
      };
      throw new Error(`unexpected column ${column}`);
    },
  };
  const spreadsheet = {
    getSheetByName: () => sheet,
    toast: (message) => toasts.push(message),
  };
  const context = vm.createContext({
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  });
  vm.runInContext(readFileSync("apps-script/Code.gs", "utf8"), context, { filename: "apps-script/Code.gs" });

  context.redactScoreNotCollectedData();

  assert.deepEqual(Array.from(written, (row) => Array.from(row)), [["안받음", "안받음"], [6.5, "6.5"]]);
  assert.match(toasts[0], /기존 RAW 1개 항목/);
});

test("processSubmission_ stores formula-like text as literal text", () => {
  const receiver = loadReceiver();
  const payload = validPayload();
  payload.items[0].itemName = '=IMPORTXML("https://example.com","//x")';
  const { services, state } = fakeServices(
    undefined,
    [["Y", payload.items[0].practiceName, payload.items[0].departmentName, payload.items[0].menuName, payload.items[0].itemName, "N", "승인수", ""]],
  );

  receiver.processSubmission_(payload, services);

  assert.equal(
    state.rawRows[0][8],
    '\'=IMPORTXML("https://example.com","//x")',
  );
});

test("processSubmission_ replaces earlier rows of the same student and practice", () => {
  const receiver = loadReceiver();
  const { services, state } = fakeServices();

  const result = receiver.processSubmission_(validPayload(), services);

  assert.equal(result.ok, true);
  assert.deepEqual(state.removed, [["2024-54321", ["3학년 치의학 임상실습 2"]]]);
});

test("compactRawRows_ keeps only the latest submission per student and practice", () => {
  const receiver = loadReceiver();
  const row = (at, studentId, practice, item) =>
    [at, "id", 1, studentId, "학생", practice, "과", "메뉴", item, 1, "", "", "", ""];
  const kept = receiver.compactRawRows_([
    row("2026-08-05T10:00:00.000Z", "2024-00001", "실습A", "옛항목"),
    row("2026-08-06T10:00:00.000Z", "2024-00001", "실습A", "항목1"),
    row("2026-08-06T10:00:00.000Z", "2024-00001", "실습A", "항목2"),
    row("2026-08-04T10:00:00.000Z", "2024-00001", "실습B", "항목3"),
    row("2026-08-05T10:00:00.000Z", "2024-00002", "실습A", "항목1"),
  ]);
  // 실습A 최신(8/6) 2행 + 실습B(다른 차수) 1행 + 다른 학생 1행. 8/5의 옛 제출만 사라진다.
  assert.equal(kept.length, 4);
  assert.equal(kept.some((r) => r[8] === "옛항목"), false);
});

test("validatePayload_ rejects malformed and oversized submissions", () => {
  const receiver = loadReceiver();
  assert.throws(() => receiver.validatePayload_({}), /schemaVersion/);
  assert.throws(
    () =>
      receiver.validatePayload_(
        validPayload({ items: Array.from({ length: 5001 }, () => validPayload().items[0]) }),
      ),
    /5000/,
  );
});
