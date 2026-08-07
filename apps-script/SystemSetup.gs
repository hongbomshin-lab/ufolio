var SYS_SETTINGS_SHEET = "설정";
var SYS_GUIDE_SHEET = "사용안내";
var SYS_COLORS = {
  navy: "#17365D",
  blue: "#2F75B5",
  paleBlue: "#D9EAF7",
  paleYellow: "#FFF2CC",
  paleRed: "#FCE4D6",
  paleGreen: "#E2F0D9",
  white: "#FFFFFF",
  ink: "#1F2937",
};
var SYS_ADMIN_SHEETS = [
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
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("유폴리오 통합관리")
    .addItem("통합 관리자 파일 최초 생성", "createIntegrationAdminWorkbook")
    .addItem("기본 연결·매핑 누락분 추가", "seedIntegrationDefaults")
    .addItem("검토 완료 매핑 교정 적용", "applyReviewedMappingCorrections")
    .addSeparator()
    .addItem("현황시트 연결 검사", "validateCaseConnections")
    .addItem("지금 전체 동기화", "refreshIntegratedData")
    .addSeparator()
    .addItem("매일 새벽 3시 동기화 켜기", "installDailyRefreshTrigger")
    .addItem("자동 동기화 끄기", "removeRefreshTriggers")
    .addToUi();
}

function createIntegrationAdminWorkbook() {
  setupSheets();
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var settings = sys_getSettings_(site);
  if (settings.ADMIN_SPREADSHEET_ID) throw new Error("이미 통합 관리자 파일이 연결되어 있습니다.");
  var roster = sys_readRoster_(site);
  var master = sys_readMaster_(site);
  if (roster.length === 0) throw new Error("학생명단이 비어 있습니다.");
  if (master.length !== 206) throw new Error("활성 마스터항목이 206개가 아닙니다. 현재: " + master.length);

  var admin = SpreadsheetApp.create("② 유폴리오 통합관리자");
  sys_buildIntegrationAdmin_(admin, master);
  sys_setSettings_(site, {
    SITE_SPREADSHEET_ID: site.getId(),
    ADMIN_SPREADSHEET_ID: admin.getId(),
    ADMIN_SPREADSHEET_URL: admin.getUrl(),
    LAST_REFRESHED_AT: "",
  });
  SpreadsheetApp.getUi().alert("통합 관리자 파일을 만들었습니다.\n\n" + admin.getUrl());
  return admin.getUrl();
}

function seedIntegrationDefaults() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var admin = case_getAdmin_(site);
  sys_seedIntegrationDefaults_(admin);
  SpreadsheetApp.getUi().alert("기존 입력값을 유지하면서 누락된 기본 연결과 매핑만 추가했습니다.");
}

function applyReviewedMappingCorrections() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var admin = case_getAdmin_(site);
  var connectionSheet = admin.getSheetByName("현황시트연결");
  var mappingSheet = admin.getSheetByName("항목매핑");
  if (!connectionSheet || !mappingSheet) throw new Error("통합 관리자 파일의 설정 시트를 찾을 수 없습니다.");

  var existingConnections = connectionSheet.getLastRow() < 2 ? [] : connectionSheet.getRange(2, 1, connectionSheet.getLastRow() - 1, CASE_CONNECTION_HEADERS.length).getValues();
  var reviewedConnections = sys_mergeReviewedConnections_(existingConnections, case_defaultConnections_());
  var implant = reviewedConnections.filter(function (row) { return String(row[0]) === "IMPLANT"; })[0];
  if (implant) {
    implant[1] = "N";
    implant[13] = "검토필요";
    implant[14] = "현재 학년·A/O 의미 확인 전 비활성";
  }

  var existingMappings = mappingSheet.getLastRow() < 2 ? [] : mappingSheet.getRange(2, 1, mappingSheet.getLastRow() - 1, CASE_MAPPING_HEADERS.length).getValues();
  var reviewedMappings = sys_mergeReviewedRows_(existingMappings, case_defaultMappings_(), 0, ["PROS_ASSIST"]);

  sys_replaceData_(connectionSheet, CASE_CONNECTION_HEADERS, reviewedConnections);
  sys_replaceData_(mappingSheet, CASE_MAPPING_HEADERS, reviewedMappings);
  sys_applyAdminFormats_(admin);
  refreshIntegratedData();
  SpreadsheetApp.getUi().alert("검토 완료 매핑을 반영하고 전체 동기화를 실행했습니다.\n\n미매핑항목 시트에는 아직 확인이 필요한 항목만 남습니다.");
}

function sys_buildIntegrationAdmin_(spreadsheet, master) {
  var first = spreadsheet.getSheets()[0];
  first.setName(SYS_GUIDE_SHEET);
  sys_resetSheet_(first);
  sys_writeGuide_(first, "② 유폴리오 통합관리자", [
    "이 파일은 관리자만 소유·열람하고 학생에게 공유하지 않습니다.",
    "현황시트연결의 노란 URL 칸에 각 Google Sheets 링크를 입력하고 원본 파일은 뷰어로 공유합니다.",
    "유폴리오 통합관리 메뉴에서 현황시트 연결 검사를 먼저 실행합니다.",
    "항목매핑에서 검토필요 항목만 확인해 승인으로 바꾸고 지금 전체 동기화를 실행합니다.",
    "동기화가 정상인 것을 확인한 뒤 매일 새벽 3시 동기화를 켭니다.",
    "중앙 파일에는 학생별 집계값만 저장되며 원본의 상세 식별정보는 읽거나 복사하지 않습니다.",
  ]);
  sys_buildDashboard_(sys_getOrCreateSheet_(spreadsheet, "대시보드"));
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "현황시트연결"), CASE_CONNECTION_HEADERS, 15);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "항목매핑"), CASE_MAPPING_HEADERS, 13);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "현황최신"), CASE_SNAPSHOT_HEADERS, 18);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "유폴리오최신"), RAW_HEADERS, 13);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "비교결과"), CASE_COMPARISON_HEADERS, 13);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "미매핑항목"), CASE_UNMAPPED_HEADERS, 7);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "연결진단"), CASE_DIAGNOSTIC_HEADERS, 5);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "동기화로그"), CASE_SYNC_LOG_HEADERS, 6);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "마스터항목"), MASTER_HEADERS, 8);
  sys_replaceData_(spreadsheet.getSheetByName("마스터항목"), MASTER_HEADERS, master);
  sys_seedIntegrationDefaults_(spreadsheet);
  sys_applyAdminFormats_(spreadsheet);
}

function sys_seedIntegrationDefaults_(admin) {
  sys_seedRows_(admin.getSheetByName("현황시트연결"), CASE_CONNECTION_HEADERS, case_defaultConnections_(), 0);
  sys_seedRows_(admin.getSheetByName("항목매핑"), CASE_MAPPING_HEADERS, case_defaultMappings_(), 0);
  sys_applyAdminFormats_(admin);
}

function sys_seedRows_(sheet, headers, seedRows, keyIndex) {
  if (!sheet) throw new Error("설정 시트가 없습니다: " + headers[0]);
  var existing = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var merged = sys_mergeSeedRows_(existing, seedRows, keyIndex);
  sys_replaceData_(sheet, headers, merged);
}

function sys_mergeSeedRows_(existingRows, seedRows, keyIndex) {
  var seen = {};
  var output = existingRows.filter(function (row) { return row[keyIndex] !== ""; }).map(function (row) {
    seen[String(row[keyIndex])] = true;
    return row.slice();
  });
  seedRows.forEach(function (row) {
    var key = String(row[keyIndex]);
    if (seen[key]) return;
    seen[key] = true;
    output.push(row.slice());
  });
  return output;
}

function sys_mergeReviewedRows_(existingRows, reviewedRows, keyIndex, retiredKeys) {
  var reviewedByKey = {};
  var emitted = {};
  var retired = {};
  (retiredKeys || []).forEach(function (key) { retired[String(key)] = true; });
  reviewedRows.forEach(function (row) { reviewedByKey[String(row[keyIndex])] = row; });
  var output = [];
  existingRows.forEach(function (row) {
    var key = String(row[keyIndex]);
    if (!key || retired[key]) return;
    if (reviewedByKey[key]) {
      output.push(reviewedByKey[key].slice());
      emitted[key] = true;
    } else {
      output.push(row.slice());
    }
  });
  reviewedRows.forEach(function (row) {
    var key = String(row[keyIndex]);
    if (!emitted[key]) output.push(row.slice());
  });
  return output;
}

function sys_mergeReviewedConnections_(existingRows, reviewedRows) {
  var existingByKey = {};
  existingRows.forEach(function (row) { if (row[0] !== "") existingByKey[String(row[0])] = row; });
  var merged = sys_mergeReviewedRows_(existingRows, reviewedRows, 0);
  return merged.map(function (row) {
    var existing = existingByKey[String(row[0])];
    if (!existing) return row;
    var output = row.slice();
    [1, 4, 12, 13, 14].forEach(function (index) { output[index] = existing[index]; });
    return output;
  });
}

function sys_buildDashboard_(sheet) {
  sys_resetSheet_(sheet);
  sys_writeTitle_(sheet, "현황시트 × U-FOLIO 통합 대시보드", "비교결과와 연결 상태를 한눈에 확인합니다.", 8);
  sheet.getRange("A4:B4").setValues([["지표", "값"]]);
  sheet.getRange("A5:A13").setValues([
    ["정상 연결"], ["오류·노후 연결"], ["비교 건수"], ["일치"], ["반영대기"], ["현황누락의심"], ["유폴리오미인증"], ["U-FOLIO측정값없음"], ["매핑대기"],
  ]);
  sheet.getRange("B5:B13").setFormulas([
    ["=COUNTIF('현황시트연결'!N2:N1000,\"정상\")"],
    ["=COUNTIF('현황시트연결'!N2:N1000,\"원본오류\")+COUNTIF('현황시트연결'!N2:N1000,\"원본노후\")"],
    ["=COUNTA('비교결과'!A2:A20000)"],
    ["=COUNTIF('비교결과'!J2:J20000,\"일치\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"반영대기\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"현황누락의심\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"유폴리오미인증\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"U-FOLIO측정값없음\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"매핑대기\")"],
  ]);
  sys_styleHeader_(sheet.getRange("A4:B4"));
  sheet.getRange("A5:A13").setBackground(SYS_COLORS.paleBlue).setFontWeight("bold");
  sheet.getRange("B5:B13").setBackground(SYS_COLORS.paleGreen).setNumberFormat("0");
  sheet.setColumnWidth(1, 190);
  sheet.setColumnWidth(2, 110);
  sheet.setHiddenGridlines(true);
}

function sys_applyAdminFormats_(spreadsheet) {
  var connections = spreadsheet.getSheetByName("현황시트연결");
  if (connections) {
    var rowCount = sys_bodyRowCount_(connections.getMaxRows());
    connections.getRange(2, 1, rowCount, 12).setBackground(SYS_COLORS.paleYellow);
    connections.getRange(2, 13, rowCount, 3).setBackground(SYS_COLORS.paleBlue);
    connections.getRange(2, 2, rowCount, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["Y", "N"], true).setAllowInvalid(false).build(),
    );
    connections.getRange(2, 12, rowCount, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["CONFIG", "_UFOLIO_EXPORT"], true).setAllowInvalid(false).build(),
    );
    connections.setColumnWidth(4, 220);
    connections.setColumnWidth(5, 360);
    connections.setColumnWidth(15, 360);
  }
  var mappings = spreadsheet.getSheetByName("항목매핑");
  if (mappings) {
    var mappingRows = sys_bodyRowCount_(mappings.getMaxRows());
    mappings.getRange(2, 1, mappingRows, 13).setBackground(SYS_COLORS.paleYellow);
    mappings.getRange(2, 2, mappingRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["Y", "N"], true).setAllowInvalid(false).build(),
    );
    mappings.getRange(2, 3, mappingRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["승인", "검토필요", "보류"], true).setAllowInvalid(false).build(),
    );
    mappings.getRange(2, 10, mappingRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["승인수", "환자수", "점수"], true).setAllowInvalid(false).build(),
    );
    mappings.getRange(2, 11, mappingRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["SUM", "MAX", "FIRST"], true).setAllowInvalid(false).build(),
    );
    mappings.setColumnWidth(5, 220);
    mappings.setColumnWidth(9, 480);
    mappings.setColumnWidth(13, 360);
  }
  var comparison = spreadsheet.getSheetByName("비교결과");
  if (comparison) {
    var statusRange = comparison.getRange("J2:J20000");
    comparison.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("일치").setBackground(SYS_COLORS.paleGreen).setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("반영대기").setBackground(SYS_COLORS.paleYellow).setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("현황누락의심").setBackground(SYS_COLORS.paleRed).setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("유폴리오미인증").setBackground(SYS_COLORS.paleRed).setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("U-FOLIO측정값없음").setBackground(SYS_COLORS.paleYellow).setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("원본오류").setBackground("#F4CCCC").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("원본노후").setBackground("#D9D2E9").setRanges([statusRange]).build(),
    ]);
  }
  SYS_ADMIN_SHEETS.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet) sheet.setHiddenGridlines(true);
  });
}

function sys_bodyRowCount_(maxRows) {
  return Math.max(1, Number(maxRows) - 1);
}

function installDailyRefreshTrigger() {
  removeRefreshTriggers();
  ScriptApp.newTrigger("refreshIntegratedData").timeBased().atHour(3).everyDays(1).create();
  SpreadsheetApp.getUi().alert("매일 새벽 3시에 통합 데이터를 동기화하도록 설정했습니다.");
}

function removeRefreshTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "refreshIntegratedData") ScriptApp.deleteTrigger(trigger);
  });
}

function sys_readRoster_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(ROSTER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(4, sheet.getLastColumn())).getValues()
    .filter(function (row) { return row[0] !== "" && row[1] !== "" && row[2] !== ""; })
    .map(function (row) { return [row[0], String(row[1]).trim(), String(row[2]).trim(), row[3] || ""]; });
}

function sys_readMaster_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(MASTER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(function (row) { return row[1] && row[2] && row[4]; })
    .map(function (row) {
      return [String(row[0]).trim().toUpperCase(), String(row[1]).trim(), String(row[2]).trim(), String(row[3]).trim(), String(row[4]).trim(), String(row[5]).trim().toUpperCase(), String(row[6]).trim() || "승인수", String(row[7]).trim()];
    });
}

function sys_getSettings_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SYS_SETTINGS_SHEET);
  var result = {};
  if (!sheet || sheet.getLastRow() < 2) return result;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (row) {
    if (row[0]) result[String(row[0])] = row[1];
  });
  return result;
}

function sys_setSettings_(spreadsheet, updates) {
  var sheet = sys_getOrCreateSheet_(spreadsheet, SYS_SETTINGS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange("A1:C1").setValues([["설정키", "값", "설명"]]);
    sys_styleHeader_(sheet.getRange("A1:C1"));
  }
  var existing = sys_getSettings_(spreadsheet);
  Object.keys(updates).forEach(function (key) { existing[key] = updates[key]; });
  var descriptions = {
    SITE_SPREADSHEET_ID: "사이트 인증 파일 ID",
    ADMIN_SPREADSHEET_ID: "통합 관리자 파일 ID",
    ADMIN_SPREADSHEET_URL: "관리자 전용 파일 URL",
    LAST_REFRESHED_AT: "마지막 통합 동기화 시각",
  };
  var preferred = ["SITE_SPREADSHEET_ID", "ADMIN_SPREADSHEET_ID", "ADMIN_SPREADSHEET_URL", "LAST_REFRESHED_AT"];
  var rows = preferred.filter(function (key) { return Object.prototype.hasOwnProperty.call(existing, key); }).map(function (key) {
    return [key, existing[key], descriptions[key] || ""];
  });
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  sheet.getRange(2, 2, Math.max(1, rows.length), 1).setBackground(SYS_COLORS.paleYellow);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
}

function sys_prepareDataSheet_(sheet, headers, width) {
  sys_resetSheet_(sheet);
  sheet.getRange(1, 1, 1, width).setValues([headers]);
  sys_styleHeader_(sheet.getRange(1, 1, 1, width));
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
}

function sys_replaceData_(sheet, headers, rows) {
  sys_resetSheet_(sheet);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sys_styleHeader_(sheet.getRange(1, 1, 1, headers.length));
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
}

function sys_writeGuide_(sheet, title, lines) {
  sys_writeTitle_(sheet, title, "노란 셀은 관리자가 확인하거나 입력할 영역입니다.", 6);
  sheet.getRange("A4:B4").setValues([["순서", "할 일"]]);
  sys_styleHeader_(sheet.getRange("A4:B4"));
  sheet.getRange(5, 1, lines.length, 2).setValues(lines.map(function (line, index) { return [index + 1, line]; }));
  sheet.setColumnWidth(1, 64);
  sheet.setColumnWidth(2, 680);
  sheet.getRange(5, 2, lines.length, 1).setWrap(true);
  sheet.setFrozenRows(4);
  sheet.setHiddenGridlines(true);
}

function sys_writeTitle_(sheet, title, subtitle, lastColumn) {
  sheet.getRange(1, 1, 1, lastColumn).merge().setValue(title).setBackground(SYS_COLORS.navy).setFontColor(SYS_COLORS.white).setFontWeight("bold").setFontSize(16);
  sheet.getRange(2, 1, 1, lastColumn).merge().setValue(subtitle).setBackground(SYS_COLORS.paleBlue).setWrap(true);
  sheet.setRowHeight(1, 34);
  sheet.setRowHeight(2, 42);
}

function sys_styleHeader_(range) {
  range.setBackground(SYS_COLORS.blue).setFontColor(SYS_COLORS.white).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
}

function sys_getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function sys_resetSheet_(sheet) {
  sheet.getCharts().forEach(function (chart) { sheet.removeChart(chart); });
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.clear();
  sheet.clearConditionalFormatRules();
}

function sys_siteKey_(studentId, practice, department, menu, item) {
  return [studentId, practice, department, menu, item].map(function (value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  }).join("|");
}

function sys_valuesEqual_(left, right) {
  if (left === "" || right === "") return left === right;
  var leftNumber = Number(left);
  var rightNumber = Number(right);
  if (isFinite(leftNumber) && isFinite(rightNumber)) return Math.abs(leftNumber - rightNumber) < 0.000000001;
  return String(left).trim() === String(right).trim();
}
