import test from "node:test";
import assert from "node:assert/strict";

import {
  createSubmission,
  normalizeNullableNumber,
  parseIdentityText,
} from "../bookmarklet.js";

test("parseIdentityText extracts one u-folio header identity", () => {
  assert.deepEqual(parseIdentityText("  홍길동 ( 2024-12345 )  "), {
    name: "홍길동",
    studentId: "2024-12345",
  });
});

test("parseIdentityText rejects missing or ambiguous identities", () => {
  assert.equal(parseIdentityText("로그인"), null);
  assert.equal(
    parseIdentityText("홍길동(2024-12345) 김학생(2024-54321)"),
    null,
  );
});

test("normalizeNullableNumber preserves zero and decimals", () => {
  assert.equal(normalizeNullableNumber(0), 0);
  assert.equal(normalizeNullableNumber("6.5"), 6.5);
  assert.equal(normalizeNullableNumber("미설정"), null);
  assert.equal(normalizeNullableNumber(""), null);
  assert.equal(normalizeNullableNumber("not-a-number"), null);
});

test("createSubmission preserves all score metrics", () => {
  const payload = createSubmission({
    identity: { name: "홍길동", studentId: "2024-12345" },
    practices: ["3학년 치의학 임상실습 2"],
    items: [
      {
        practiceName: "3학년 치의학 임상실습 2",
        departmentName: "보존과",
        menuName: "증례별 임상참여",
        itemName: "Observation case",
        approvedCount: "3",
        patientCount: 0,
        score: "6.5",
        scoreRaw: "6.5",
      },
    ],
    now: () => "2026-08-06T00:00:00.000Z",
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });

  assert.deepEqual(payload, {
    schemaVersion: 1,
    submissionId: "11111111-1111-4111-8111-111111111111",
    clientSentAt: "2026-08-06T00:00:00.000Z",
    student: { name: "홍길동", studentId: "2024-12345" },
    practices: ["3학년 치의학 임상실습 2"],
    items: [
      {
        practiceName: "3학년 치의학 임상실습 2",
        departmentName: "보존과",
        menuName: "증례별 임상참여",
        itemName: "Observation case",
        approvedCount: 3,
        patientCount: 0,
        score: 6.5,
        scoreRaw: "6.5",
      },
    ],
  });
});
