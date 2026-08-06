import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadSystemSetup() {
  const context = vm.createContext({ console });
  const source = readFileSync("apps-script/SystemSetup.gs", "utf8");
  vm.runInContext(source, context, { filename: "apps-script/SystemSetup.gs" });
  return context;
}

test("system setup builds stable comparison keys", () => {
  const setup = loadSystemSetup();
  assert.equal(
    setup.sys_siteKey_("2024-54321", " 3학년  치의학 임상실습 2 ", "교정과", "Total Case", "항목"),
    "2024-54321|3학년 치의학 임상실습 2|교정과|Total Case|항목",
  );
});

test("system setup compares numeric values without string-format false positives", () => {
  const setup = loadSystemSetup();
  assert.equal(setup.sys_valuesEqual_("3", 3), true);
  assert.equal(setup.sys_valuesEqual_("3.0", 3), true);
  assert.equal(setup.sys_valuesEqual_(3, 4), false);
  assert.equal(setup.sys_valuesEqual_("", 0), false);
});
