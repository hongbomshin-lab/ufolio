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

function loadFullSetup() {
  const context = vm.createContext({ console, Date });
  for (const file of [
    "apps-script/CaseSheetCore.gs",
    "apps-script/CaseSheetSync.gs",
    "apps-script/CaseSheetDefaults.gs",
    "apps-script/SystemSetup.gs",
  ]) {
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

function loadReceiverSetup() {
  const context = vm.createContext({ console });
  const source = readFileSync("apps-script/Code.gs", "utf8");
  vm.runInContext(source, context, { filename: "apps-script/Code.gs" });
  return context;
}

test("sheet setup explains Office-mode permission failures", () => {
  const setup = loadReceiverSetup();
  const sheet = {
    getLastRow() {
      return 1;
    },
    setFrozenRows() {
      throw new Error("You do not have permission to call setFrozenRows");
    },
  };
  const spreadsheet = {
    getSheetByName() {
      return sheet;
    },
    insertSheet() {
      throw new Error("unexpected insert");
    },
  };

  assert.throws(
    () => setup.ensureSheet_(spreadsheet, "학생명단", ["출석번호", "학번", "이름"]),
    (error) => /Google 스프레드시트로 저장/.test(error.message) && /편집 권한/.test(error.message),
  );
});

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

test("system setup keeps body formatting inside the sheet grid", () => {
  const setup = loadSystemSetup();
  assert.equal(setup.sys_bodyRowCount_(1000), 999);
  assert.equal(setup.sys_bodyRowCount_(2), 1);
});

test("system setup exposes only the unified single-workbook workflow", () => {
  const source = readFileSync("apps-script/SystemSetup.gs", "utf8");
  for (const forbidden of [
    "createLinkedWorkbooks",
    "createIntegrationAdminWorkbook",
    "applyReviewedMappingCorrections",
    "MANUAL_SPREADSHEET_ID",
    "syncRosterToManual",
    "installHourlyRefreshTrigger",
    "② 유폴리오 수기입력",
    "② 유폴리오 통합관리자",
  ]) {
    assert.equal(source.includes(forbidden), false, `레거시 워크플로 잔존: ${forbidden}`);
  }
  for (const required of [
    "applyUnifiedWorkbookLayout",
    "migrateAdminWorkbookIntoSite",
    "applyMeasurementSettings",
    "refreshIntegratedData",
    "installDailyRefreshTrigger",
    "removeRefreshTriggers",
    "sys_seedMeasurementSettings_",
    "dash_updateDashboard_",
    ".atHour(3).everyDays(1)",
  ]) {
    assert.equal(source.includes(required), true, `통합 워크북 기능 누락: ${required}`);
  }
});

test("only the four admin-facing sheets stay visible and the rest are hidden", () => {
  const setup = loadSystemSetup();
  assert.deepEqual(Array.from(setup.SYS_VISIBLE_SHEETS), ["대시보드", "비교결과", "현황시트연결", "측정값설정"]);
  const hidden = Array.from(setup.SYS_HIDDEN_SHEETS);
  for (const name of ["항목매핑", "미매핑항목", "연결진단", "동기화로그", "현황최신", "유폴리오최신", "마스터항목", "학생명단", "RAW", "전송기록", "설정", "차트데이터", "사용안내"]) {
    assert.ok(hidden.includes(name), `숨김 시트 누락: ${name}`);
  }
  const source = readFileSync("apps-script/SystemSetup.gs", "utf8");
  assert.ok(source.includes("hideSheet()"), "시트 숨김 처리가 없습니다");
});

test("measurement defaults follow the reviewed mappings and fall back to approval counts", () => {
  const setup = loadFullSetup();
  const defaults = setup.sys_measurementDefaults_([]);
  assert.equal(defaults["3학년 치의학 임상실습 2|보존과|증례별 임상참여|Endodontic treatment(practice)"], "점수");
  assert.equal(defaults["3학년 치의학 임상실습 2|구강악안면외과|증례별 임상참여|외래 Recall check major"], "환자수");
  assert.equal(defaults["3학년 치의학 임상실습 2|치주과|증례별 임상참여|Flap Assist"], "승인수");
  assert.equal(defaults["3학년 치의학 임상실습 2|교정과|Total Case|없는항목"], undefined);

  const customRows = [
    ["CUSTOM", "Y", "승인", "PERIO", "라벨", "", "", "VALUE(C)", "3학년 치의학 임상실습 2|치주과|증례별 임상참여|Flap Assist", "점수", "SUM", 80, ""],
  ];
  assert.equal(
    setup.sys_measurementDefaults_(customRows)["3학년 치의학 임상실습 2|치주과|증례별 임상참여|Flap Assist"],
    "점수",
    "이관된 항목매핑의 측정값이 기본값보다 우선해야 함",
  );
});

test("receiver stays isolated from case-source access", () => {
  const receiverSource = readFileSync("apps-script/Code.gs", "utf8");
  for (const forbidden of ["CASE_CONNECTION_SHEET", "현황시트연결", "case_readSource_", "refreshIntegratedData"]) {
    assert.equal(receiverSource.includes(forbidden), false, `doPost 수신 코드에 현황 연동이 섞임: ${forbidden}`);
  }
});
