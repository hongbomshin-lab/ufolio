import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBookmarklet,
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
        pendingCount: "2",
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
        pendingCount: 2,
        patientCount: 0,
        score: 6.5,
        scoreRaw: "6.5",
      },
    ],
  });
});

test("buildBookmarklet creates one universal u-folio collector", () => {
  const result = buildBookmarklet(
    "https://script.google.com/macros/s/EXAMPLE_DEPLOYMENT/exec",
  );

  assert.match(result, /^javascript:/);
  const source = decodeURIComponent(result.slice("javascript:".length));
  assert.match(source, /dent_summary\/list/);
  assert.match(source, /dent_summary\/getSummaryData/);
  assert.match(source, /mode:\s*["']no-cors["']/);
  assert.match(source, /전송 요청 완료/);
  assert.doesNotMatch(source, /login_id|달신 아이디|2024-12345/);
});

test("buildBookmarklet targets 임상실습 2 without a practice picker", () => {
  const source = decodeURIComponent(
    buildBookmarklet("https://script.google.com/macros/s/EXAMPLE_DEPLOYMENT/exec").slice(
      "javascript:".length,
    ),
  );

  assert.match(source, /임상실습\\s\*2/);
  assert.doesNotMatch(source, /ufc-practice/);
  assert.match(source, /pendingCount/);
});

test("buildBookmarklet embeds the OMS/prosthodontics allowlist and filters items", () => {
  const source = decodeURIComponent(
    buildBookmarklet("https://script.google.com/macros/s/EXAMPLE_DEPLOYMENT/exec").slice(
      "javascript:".length,
    ),
  );

  assert.match(source, /RESTRICTED_DEPARTMENT_ITEMS/);
  assert.match(source, /shouldSendItem\(course\.dt_name, item\.menu_name, item\.pc_name\)/);
  // 외과·보철만 제한 대상이어야 하고, 매핑된 항목 키가 목록에 있어야 한다.
  assert.match(source, /구강악안면외과:/);
  assert.match(source, /보철과:/);
  assert.doesNotMatch(source, /보존과:\s*\[/);
  for (const required of [
    "증례별 임상참여|Extraction_[P]_simple extraction",
    "증례별 임상참여|follow-up(I&D) 2nd or 3rd visit",
    "기공|모델 제작 (악당)",
    "Total Case|Biopsy",
    "Total Case|Total case evaluation (가철성)",
    "증례별 임상참여|22. Charting",
    "기공|[임플란트]Laboratory case evaluation",
  ]) {
    assert.ok(source.includes(required), `허용 목록 누락: ${required}`);
  }
});

test("buildBookmarklet rejects missing or non-Apps-Script URLs", () => {
  assert.throws(
    () => buildBookmarklet(""),
    /Apps Script 웹앱 URL이 올바르지 않습니다/,
  );
  assert.throws(
    () => buildBookmarklet("http://example.com/submit"),
    /Apps Script 웹앱 URL이 올바르지 않습니다/,
  );
});
