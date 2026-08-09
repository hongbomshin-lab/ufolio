import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const EXPECTED_DEPARTMENT_COUNTS = {
  교정과: 17,
  구강내과: 19,
  구강병리과: 2,
  구강악안면외과: 39,
  보존과: 28,
  보철과: 40,
  소아치과: 19,
  영상치의학과: 4,
  "원내생 진료센터": 14,
  치주과: 24,
};

function loadDefaults() {
  const context = vm.createContext({ console });
  const source = readFileSync("apps-script/CaseSheetDefaults.gs", "utf8");
  vm.runInContext(source, context, { filename: "apps-script/CaseSheetDefaults.gs" });
  return context;
}

function loadMasterItems() {
  const config = JSON.parse(readFileSync("config/ufolio-master-items.json", "utf8"));
  return Object.entries(config.departments).flatMap(([department, rows]) =>
    rows.map(([menu, item]) => ({ practice: config.practice, department, menu, item })),
  );
}

test("master config contains exactly 206 unique non-identifying item keys", () => {
  const items = loadMasterItems();
  assert.equal(items.length, 206);
  const keys = new Set(items.map((row) => [row.practice, row.department, row.menu, row.item].join("|")));
  assert.equal(keys.size, 206);
  const counts = Object.fromEntries(
    Object.keys(EXPECTED_DEPARTMENT_COUNTS).map((department) => [
      department,
      items.filter((row) => row.department === department).length,
    ]),
  );
  assert.deepEqual(counts, EXPECTED_DEPARTMENT_COUNTS);
  assert.equal(items.some((row) => /\b\d{6,8}\b/.test(row.item)), false);
});

test("default connections cover ten active sources and one pending implant source", () => {
  const defaults = loadDefaults();
  const rows = defaults.case_defaultConnections_();
  const objects = rows.map((row) => Object.fromEntries(defaults.CASE_CONNECTION_HEADERS.map((header, index) => [header, row[index]])));
  const keys = objects.map((row) => row["소스키"]);
  assert.deepEqual([...keys].sort(), [
    "CONS_SCORE", "CONS_SURGERY", "EXT", "IMPLANT", "OM", "OMS", "OMS_STAGE", "PATH", "PED_CHART", "PERIO", "PROS",
  ].sort());
  assert.equal(new Set(keys).size, 11);
  assert.equal(objects.filter((row) => row["소스키"] !== "IMPLANT").every((row) => row["활성"] === "Y"), true);
  assert.equal(objects.find((row) => row["소스키"] === "IMPLANT")["활성"], "N");
  assert.equal(objects.every((row) => row["스프레드시트 URL"] === ""), true);
  assert.equal(objects.every((row) => /^[A-Z]{1,3}$/.test(row["출석번호 열"]) && /^[A-Z]{1,3}$/.test(row["이름 열"])), true);
  assert.equal(objects.every((row) => Number.isInteger(row["데이터 시작행"]) && row["데이터 시작행"] >= 2), true);
  assert.equal(objects.filter((row) => !["PROS", "OMS"].includes(row["소스키"])).every((row) => row["데이터 종료행"] === ""), true);
  assert.equal(objects.find((row) => row["소스키"] === "PROS")["데이터 종료행"], 96);
  assert.equal(objects.find((row) => row["소스키"] === "OMS")["데이터 종료행"], 94);
  assert.equal(objects.find((row) => row["소스키"] === "CONS_SCORE")["시트명"], "점수판");
  assert.equal(objects.find((row) => row["소스키"] === "CONS_SURGERY")["시트명"], "점수표");
  assert.equal(objects.find((row) => row["소스키"] === "PED_CHART")["시트명"], "차팅 현황");
  assert.equal(objects.find((row) => row["소스키"] === "PERIO")["시트명"], "현황");
  assert.equal(objects.find((row) => row["소스키"] === "OM")["시트명"], "원내생케이스");
  assert.equal(objects.find((row) => row["소스키"] === "EXT")["시트명"], "발치 프랙 현황");
  assert.equal(objects.find((row) => row["소스키"] === "IMPLANT")["시트명"], "임플 현황");
  assert.equal(objects.find((row) => row["소스키"] === "PATH")["시트명"], "병리과 현황");
  assert.equal(objects.find((row) => row["소스키"] === "PROS")["시트명"], "현황 시트");
  assert.equal(objects.find((row) => row["소스키"] === "OMS")["시트명"], "케이스 현황");
  assert.equal(objects.find((row) => row["소스키"] === "OMS_STAGE")["시트명"], "시트1");
});

test("approved mappings use the restricted DSL and valid master targets", () => {
  const defaults = loadDefaults();
  const masterKeys = new Set(loadMasterItems().map((row) => [row.practice, row.department, row.menu, row.item].join("|")));
  const connections = new Set(defaults.case_defaultConnections_().map((row) => row[0]));
  const mappings = defaults.case_defaultMappings_().map((row) =>
    Object.fromEntries(defaults.CASE_MAPPING_HEADERS.map((header, index) => [header, row[index]])),
  );
  assert.ok(mappings.length >= 35);
  assert.equal(new Set(mappings.map((row) => row["매핑키"])).size, mappings.length);
  assert.equal(mappings.every((row) => connections.has(row["소스키"])), true);
  assert.equal(mappings.every((row) => ["승인", "검토필요", "보류"].includes(row["검토상태"])), true);
  assert.ok(mappings.some((row) => row["검토상태"] === "보류"));
  const approved = mappings.filter((row) => row["활성"] === "Y" && row["검토상태"] === "승인");
  assert.ok(approved.length >= 20);
  for (const mapping of approved) {
    assert.match(mapping["인증대상식"], /^(?:VALUE|NUMBER_OR_ZERO|NONEMPTY_AS_ONE|HAS_STATUS_O|SUM|COUNT_NONEMPTY|COUNT_STATUS)\(.+\)$/);
    assert.ok(["승인수", "환자수", "점수"].includes(mapping["측정값"]));
    assert.ok(["SUM", "MAX", "FIRST"].includes(mapping["집계방식"]));
    const targets = String(mapping["U-FOLIO 대상"]).split(/\r?\n/).filter(Boolean);
    assert.ok(targets.length >= 1);
    for (const target of targets) assert.ok(masterKeys.has(target), `마스터에 없는 승인 대상: ${target}`);
  }
  const extraction = mappings.find((row) => row["매핑키"] === "EXT_TOTAL");
  const duplicateOms = mappings.find((row) => row["매핑키"] === "OMS_EXT_TOTAL");
  assert.ok(extraction["우선순위"] > duplicateOms["우선순위"]);
});

test("default settings contain no live URLs or row-level case identifiers", () => {
  const defaultsSource = readFileSync("apps-script/CaseSheetDefaults.gs", "utf8");
  assert.equal(/https?:\/\//.test(defaultsSource), false);
  assert.equal(/\b\d{6,8}\b/.test(defaultsSource), false);
  assert.equal(/환자 이름\s*&\s*번호/.test(defaultsSource), false);
});
