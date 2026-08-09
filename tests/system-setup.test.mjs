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

test("system setup exposes only the integration-admin workflow", () => {
  const source = readFileSync("apps-script/SystemSetup.gs", "utf8");
  for (const forbidden of [
    "createLinkedWorkbooks",
    "MANUAL_SPREADSHEET_ID",
    "MANUAL_SPREADSHEET_URL",
    "syncRosterToManual",
    "applyManualItemVisibility",
    "applyStudentRowProtections",
    "installHourlyRefreshTrigger",
    "② 유폴리오 수기입력",
  ]) {
    assert.equal(source.includes(forbidden), false, `레거시 수기 워크플로 잔존: ${forbidden}`);
  }
  for (const required of [
    "createIntegrationAdminWorkbook",
    "applyReviewedMappingCorrections",
    "validateCaseConnections",
    "refreshIntegratedData",
    "installDailyRefreshTrigger",
    "removeRefreshTriggers",
    "ADMIN_SPREADSHEET_ID",
    ".atHour(3).everyDays(1)",
  ]) {
    assert.equal(source.includes(required), true, `통합 관리자 기능 누락: ${required}`);
  }
});

test("admin usability update makes dashboard and comparison the daily workflow", () => {
  const source = readFileSync("apps-script/SystemSetup.gs", "utf8");
  for (const required of [
    "관리자 화면·서식 업데이트",
    "function applyAdminUsabilityUpdate()",
    "function sys_applyAdminUsability_(spreadsheet)",
    "function sys_reorderAdminSheets_(spreadsheet)",
    "function sys_ensureFilter_(sheet, width)",
    "function sys_adminGuideLines_()",
    "function sys_resetPresentationSheet_(sheet)",
    "확인 필요 합계",
    "마지막 동기화",
    "평소에는 대시보드와 비교결과만 확인합니다.",
    "setTabColor",
    "moveActiveSheet",
    "setFrozenColumns(3)",
    "whenFormulaSatisfied",
  ]) {
    assert.equal(source.includes(required), true, `관리자 사용성 기능 누락: ${required}`);
  }
  assert.match(source, /\["대시보드", "비교결과", "연결진단", "동기화로그", "미매핑항목"/);
});

test("integration admin workbook declares every designed admin sheet", () => {
  const source = readFileSync("apps-script/SystemSetup.gs", "utf8");
  for (const sheetName of [
    "사용안내",
    "대시보드",
    "현황시트연결",
    "항목매핑",
    "현황최신",
    "유폴리오최신",
    "비교결과",
    "미매핑항목",
    "연결진단",
    "동기화로그",
    "마스터항목",
  ]) {
    assert.equal(source.includes(`"${sheetName}"`), true, `관리자 시트 누락: ${sheetName}`);
  }
  assert.equal(
    source.includes("sys_setSettings_(spreadsheet, {"),
    false,
    "관리자 파일에는 별도 설정 탭을 만들지 않아야 함",
  );
});

test("receiver stays isolated from case-source access", () => {
  const receiverSource = readFileSync("apps-script/Code.gs", "utf8");
  for (const forbidden of ["CASE_CONNECTION_SHEET", "현황시트연결", "case_readSource_", "refreshIntegratedData"]) {
    assert.equal(receiverSource.includes(forbidden), false, `doPost 수신 코드에 현황 연동이 섞임: ${forbidden}`);
  }
});
