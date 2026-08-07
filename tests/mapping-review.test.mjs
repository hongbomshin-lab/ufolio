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
});

test("reviewed mappings use the confirmed per-item metrics and targets", () => {
  const mappings = mappingByKey();

  assert.equal(mappings.OM_CHARTING[5], "VALUE(C)");
  assert.equal(mappings.OM_CHARTING[9], "환자수");
  assert.equal(mappings.OM_PT[2], "검토필요");
  assert.equal(mappings.PED_CHARTING[9], "승인수");

  assert.match(mappings.OMS_MALIGNANT[8], /수술실-Malignant tumor/);
  assert.match(mappings.OMS_CYST[8], /수술실-Cyst and benign tumor surgery/);
  assert.match(mappings.OMS_OTHER_SURGERY[8], /수술실-기타/);
  assert.equal(mappings.OMS_EXT_A[9], "승인수");
  assert.equal(mappings.OMS_RECALL_MINOR[9], "승인수");
  assert.equal(mappings.OMS_NEW_CHART[9], "승인수");
  assert.match(mappings.OMS_IMPLANT_A[8], /2개 이하 식립\)_\[A\]/);
  assert.match(mappings.OMS_IMPLANT_A[8], /3개 이상 식립\)_\[A\]/);
  assert.equal(mappings.OMS_STAGE_BIOPSY[7], "COUNT_NONEMPTY(D:E)");
  assert.equal(mappings.OMS_STAGE_I_D[7], "COUNT_NONEMPTY(H:J)");

  assert.match(mappings.IMPLANT_TOTAL[8], /2개 이하 식립\)_\[O\]/);
  assert.match(mappings.IMPLANT_TOTAL[8], /3개 이상 식립\)_\[O\]/);
  assert.equal(mappings.IMPLANT_TOTAL[9], "승인수");
  assert.equal(mappings.IMPLANT_TOTAL[2], "검토필요");

  assert.match(mappings.PROS_REMOVABLE[8], /Total case evaluation \(가철성\)/);
  assert.match(mappings.PROS_FIXED[8], /Total case evaluation \(고정성\)/);
  assert.equal(mappings.PROS_FIXED[6], "VALUE(J)");
  assert.match(mappings.PROS_IMPLANT[8], /Total case evaluation \(Implant\)/);
  assert.match(mappings.PROS_DIAG_TOTAL[8], /Charting and Treatment planning evaluation/);
  assert.match(mappings.PROS_STUDENT_EVAL[8], /01\. Student evaluation/);
  assert.match(mappings.PROS_FACULTY_OBS[8], /02\. observation \(교수님\)/);
  assert.match(mappings.PROS_IMPLANT_ASSIST[8], /03\. Implant assist/);
  assert.equal(mappings.PROS_LAB[1], "N");
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
