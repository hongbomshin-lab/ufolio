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
  const state = { rawRows: [], logRows: [] };
  return {
    state,
    services: {
      now: () => "2026-08-06T01:02:03.000Z",
      getRosterRows: () => rosterRows,
      getMasterRows: () => masterRows,
      appendRawRows: (rows) => state.rawRows.push(...rows),
      appendLogRow: (row) => state.logRows.push(row),
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
