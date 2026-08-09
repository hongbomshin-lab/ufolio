import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadScripts(...paths) {
  const context = vm.createContext({ console });
  for (const path of paths) vm.runInContext(readFileSync(path, "utf8"), context, { filename: path });
  return context;
}

function mappingByKey() {
  const defaults = loadScripts("apps-script/CaseSheetDefaults.gs");
  return Object.fromEntries(defaults.case_defaultMappings_().map((row) => [row[0], row]));
}

test("pathology counts only a standalone O status token", () => {
  const core = loadScripts("apps-script/CaseSheetCore.gs");
  for (const value of ["O", "7/7, O", "2026-08-01 O", "o"]) {
    assert.equal(core.case_evaluateExpression_("HAS_STATUS_O(D)", [1, "학생", "", value]), 1);
  }
  for (const value of ["", "X", "작성 예정", "2026-08-01", "X(biopsy 결과 미정)", "ONGOING"]) {
    assert.equal(core.case_evaluateExpression_("HAS_STATUS_O(D)", [1, "학생", "", value]), "");
  }
});

test("reviewed source row bounds exclude prosthodontic and OMS summary rows", () => {
  const defaults = loadScripts("apps-script/CaseSheetDefaults.gs");
  const rows = Object.fromEntries(defaults.case_defaultConnections_().map((row) => [row[0], row]));
  assert.equal(rows.PROS[9], 96);
  assert.equal(rows.OMS[9], 94);
  assert.equal(rows.IMPLANT[1], "N");
  assert.equal(rows.IMPLANT[13], "보류");
  assert.match(rows.IMPLANT[14], /과거 학년/);
});

test("reviewed mappings use the confirmed per-item metrics and targets", () => {
  const mappings = mappingByKey();

  assert.equal(Object.keys(mappings).length, 63);

  assert.equal(mappings.CONS_RESIN_STAGE[2], "승인");
  assert.equal(mappings.CONS_RESIN_STAGE[9], "점수");
  assert.match(mappings.CONS_RESIN_STAGE[8], /Composite restoration\(3급\/4급\)\(practice\)/);
  assert.match(mappings.CONS_RESIN_STAGE[8], /Composite restoration\(practice\)/);
  assert.match(mappings.CONS_RESIN_STAGE[8], /Composite restortion\(2급\)\(Practice\)/);
  assert.equal(mappings.CONS_ENDO_STAGE[2], "승인");
  assert.equal(mappings.CONS_ENDO_STAGE[9], "점수");
  assert.match(mappings.CONS_ENDO_STAGE[8], /Endodontic treatment\(practice\)/);
  assert.equal(mappings.CONS_OBS_SURG_SCORE[1], "N");
  assert.equal(mappings.CONS_OBS_SURG_SCORE[2], "보류");

  assert.equal(mappings.OM_CHARTING[5], "VALUE(C)");
  assert.equal(mappings.OM_CHARTING[9], "환자수");
  assert.equal(mappings.OM_PT[2], "승인");
  assert.equal(mappings.OM_PT[7], "SUM(I,J)");
  assert.equal(mappings.OM_PT[9], "점수");
  assert.equal(mappings.PED_CHARTING[9], "승인수");

  assert.match(mappings.OMS_MALIGNANT[8], /수술실-Malignant tumor/);
  assert.match(mappings.OMS_CYST[8], /수술실-Cyst and benign tumor surgery/);
  assert.match(mappings.OMS_OTHER_SURGERY[8], /수술실-기타/);
  assert.equal(mappings.OMS_EXT_A[9], "승인수");
  assert.equal(mappings.OMS_RECALL_MINOR[9], "승인수");
  assert.equal(mappings.OMS_NEW_CHART[9], "승인수");
  assert.match(mappings.OMS_IMPLANT_A[8], /2개 이하 식립\)_\[A\]/);
  assert.match(mappings.OMS_IMPLANT_A[8], /3개 이상 식립\)_\[A\]/);
  assert.equal(mappings.OMS_WARD[9], "점수");
  assert.equal(mappings.OMS_BIOPSY[1], "N");
  assert.equal(mappings.OMS_I_D[1], "N");
  assert.equal(mappings.OMS_STAGE_BIOPSY[7], "COUNT_NONEMPTY(D:E)");
  assert.equal(mappings.OMS_STAGE_I_D[7], "COUNT_NONEMPTY(H:J)");
  assert.match(mappings.OMS_STAGE_I_D[12], /2nd·3rd.*각각 1건/);
  assert.match(mappings.OMS_STAGE_I_D[12], /follow-up.*2건/);
  assert.equal(mappings.OMS_STAGE_BIOPSY_TOTAL[7], "NONEMPTY_AS_ONE(F)");
  assert.match(mappings.OMS_STAGE_BIOPSY_TOTAL[8], /Total Case\|Biopsy$/);
  assert.equal(mappings.OMS_STAGE_BIOPSY_TOTAL[9], "승인수");
  assert.match(mappings.OMS_STAGE_BIOPSY_TOTAL[12], /F열.*사인 완료/);
  assert.equal(mappings.OMS_STAGE_I_D_TOTAL[7], "NONEMPTY_AS_ONE(K)");
  assert.match(mappings.OMS_STAGE_I_D_TOTAL[8], /Total Case\|I & D$/);
  assert.equal(mappings.OMS_STAGE_I_D_TOTAL[9], "승인수");
  assert.match(mappings.OMS_STAGE_I_D_TOTAL[12], /K열.*사인 완료/);

  assert.match(mappings.IMPLANT_TOTAL[8], /2개 이하 식립\)_\[A\]/);
  assert.match(mappings.IMPLANT_TOTAL[8], /3개 이상 식립\)_\[A\]/);
  assert.equal(mappings.IMPLANT_TOTAL[9], "승인수");
  assert.equal(mappings.IMPLANT_TOTAL[1], "N");
  assert.equal(mappings.IMPLANT_TOTAL[2], "보류");

  assert.match(mappings.PROS_REMOVABLE[8], /Total case evaluation \(가철성\)/);
  assert.match(mappings.PROS_FIXED[8], /Total case evaluation \(고정성\)/);
  assert.equal(mappings.PROS_FIXED[6], "VALUE(J)");
  assert.match(mappings.PROS_IMPLANT[8], /Total case evaluation \(Implant\)/);
  assert.match(mappings.PROS_DIAG_TOTAL[8], /Charting and Treatment planning evaluation/);
  assert.match(mappings.PROS_STUDENT_EVAL[8], /01\. Student evaluation/);
  assert.match(mappings.PROS_FACULTY_OBS[8], /02\. observation \(교수님\)/);
  assert.match(mappings.PROS_IMPLANT_ASSIST[8], /03\. Implant assist/);
  assert.equal(mappings.PROS_LAB[1], "Y");
  assert.equal(mappings.PROS_LAB[2], "승인");
  assert.equal(mappings.PROS_LAB[7], "VALUE(X)");
  assert.equal(mappings.PROS_LAB[9], "승인수");
  assert.equal(String(mappings.PROS_LAB[8]).split("\n").length, 3);
  assert.match(mappings.PROS_LAB[12], /세 기공 항목.*승인 건수 합계/);
  assert.doesNotMatch(mappings.PROS_LAB[12], /임시/);
  assert.equal(mappings.PROS_LAB_SCORE[7], "VALUE(Y)");
  assert.equal(mappings.PROS_LAB_SCORE[9], "점수");
  assert.equal(mappings.PROS_LAB_SCORE[8], mappings.PROS_LAB[8]);
  assert.match(mappings.PROS_LAB_SCORE[12], /세 기공 항목.*점수 합계/);
  assert.doesNotMatch(mappings.PROS_LAB_SCORE[12], /임시/);
});

test("review migration replaces managed keys and preserves custom rows", () => {
  const setup = loadScripts("apps-script/SystemSetup.gs");
  const existing = [
    ["KNOWN", "old"],
    ["CUSTOM", "keep"],
  ];
  const reviewed = [
    ["KNOWN", "new"],
    ["ADDED", "new"],
  ];
  assert.deepEqual(
    Array.from(setup.sys_mergeReviewedRows_(existing, reviewed, 0), (row) => Array.from(row)),
    [["KNOWN", "new"], ["CUSTOM", "keep"], ["ADDED", "new"]],
  );
});
