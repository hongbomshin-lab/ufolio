import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadCore() {
  const context = vm.createContext({ console });
  const source = readFileSync("apps-script/CaseSheetCore.gs", "utf8");
  vm.runInContext(source, context, { filename: "apps-script/CaseSheetCore.gs" });
  return context;
}

test("restricted expressions preserve blanks and evaluate supported operations", () => {
  const core = loadCore();
  assert.equal(core.case_evaluateExpression_("VALUE(C)", [1, "학생", 3.5]), 3.5);
  assert.equal(core.case_evaluateExpression_("VALUE(C)", [1, "학생", ""]), "");
  assert.equal(core.case_evaluateExpression_("NUMBER_OR_ZERO(C)", [1, "학생", ""]), 0);
  assert.equal(core.case_evaluateExpression_("NONEMPTY_AS_ONE(C)", [1, "학생", "완"]), 1);
  assert.equal(core.case_evaluateExpression_("SUM(C,D)", [1, "학생", 2, 3]), 5);
  assert.equal(core.case_evaluateExpression_("SUM(C,D)", [1, "학생", "", ""]), "");
  assert.equal(core.case_evaluateExpression_("COUNT_NONEMPTY(E:H)", [1, "학생", "", "", "환자", "", "환자", ""]), 2);
  assert.equal(core.case_evaluateExpression_("COUNT_STATUS(C:F,완)", [1, "학생", "완", "예", "완", ""]), 2);
});

test("restricted expressions reject unknown syntax and source formula errors", () => {
  const core = loadCore();
  assert.throws(() => core.case_evaluateExpression_("AVERAGE(C:D)", [1, "학생", 2, 3]), /지원하지 않는 집계식/);
  assert.throws(() => core.case_evaluateExpression_("VALUE(A0)", [1]), /열 참조/);
  assert.throws(() => core.case_evaluateExpression_("VALUE(C)", [1, "학생", "#REF!"]), /원본 수식 오류/);
  assert.throws(() => core.case_evaluateExpression_("VALUE(C)", [1, "학생", Infinity]), /유한한 숫자/);
});

test("comparison distinguishes missing records, equal values, and direction", () => {
  const core = loadCore();
  assert.equal(core.case_compareValues_(5, 3), "반영대기");
  assert.equal(core.case_compareValues_(3, 5), "현황누락의심");
  assert.equal(core.case_compareValues_(0, 0), "일치");
  assert.equal(core.case_compareValues_("", 0), "현황누락의심");
  assert.equal(core.case_compareValues_(0, ""), "유폴리오미인증");
  assert.equal(core.case_compareValues_("", ""), "일치");
});

test("U-FOLIO aggregation selects a metric and combines mapped targets", () => {
  const core = loadCore();
  const latest = {
    "2024-00001|3학년 임상실습|치주과|Observation|Oral examination": {
      approvedCount: 1,
      patientCount: 2,
      score: 3.5,
    },
    "2024-00001|3학년 임상실습|치주과|Observation|Scaling": {
      approvedCount: 2,
      patientCount: 3,
      score: 4.5,
    },
  };
  const result = core.case_aggregateUfolio_({
    ufolioTargets: "3학년 임상실습|치주과|Observation|Oral examination\n3학년 임상실습|치주과|Observation|Scaling",
    measurement: "승인수",
    aggregation: "SUM",
  }, latest, "2024-00001");
  assert.equal(result.found, true);
  assert.equal(result.value, 3);

  const missing = core.case_aggregateUfolio_({
    ufolioTargets: "3학년 임상실습|치주과|Observation|Root planing",
    measurement: "점수",
    aggregation: "SUM",
  }, latest, "2024-00001");
  assert.equal(missing.found, false);
  assert.equal(missing.value, "");
});

test("name normalization removes spacing variants", () => {
  const core = loadCore();
  assert.equal(core.case_normalizeName_("  홍  길동 "), "홍길동");
});
