var SYS_SETTINGS_SHEET = "설정";
var SYS_GUIDE_SHEET = "사용안내";
var SYS_COLORS = {
  navy: "#17365D",
  blue: "#2F75B5",
  paleBlue: "#D9EAF7",
  paleYellow: "#FFF2CC",
  paleRed: "#FCE4D6",
  paleGreen: "#E2F0D9",
  orange: "#F4B183",
  red: "#C00000",
  gray: "#A5A5A5",
  paleGray: "#E7E6E6",
  white: "#FFFFFF",
  ink: "#1F2937",
};

// 관리자가 평소에 보는 시트 4개만 보이고, 나머지는 전부 숨긴다. (숨긴 시트는 시트 목록 ☰ 에서 다시 열 수 있다)
var SYS_VISIBLE_SHEETS = ["대시보드", "비교결과", "현황시트연결", "측정값설정"];
var SYS_HIDDEN_SHEETS = [
  "항목매핑", "미매핑항목", "연결진단", "동기화로그", "현황최신", "유폴리오최신",
  "마스터항목", "학생명단", "RAW", "전송기록", "설정", "차트데이터", "사용안내",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("유폴리오 통합관리")
    .addItem("현황시트 연결 검사", "validateCaseConnections")
    .addItem("지금 전체 동기화", "refreshIntegratedData")
    .addSeparator()
    .addItem("매일 새벽 3시 동기화 켜기", "installDailyRefreshTrigger")
    .addItem("자동 동기화 끄기", "removeRefreshTriggers")
    .addSeparator()
    .addItem("화면 구성 새로 적용", "applyUnifiedWorkbookLayout")
    .addItem("기본 연결·매핑 누락분 추가", "seedIntegrationDefaults")
    .addItem("② 관리자 파일 가져오기 (1회)", "migrateAdminWorkbookIntoSite")
    .addToUi();
}

// 통합 워크북(이 파일 하나)의 시트·서식·대시보드를 만들거나 최신 상태로 다시 그린다.
// 기존 데이터(연결 URL, 매핑, RAW, 측정값 선택)는 지우지 않는다.
function applyUnifiedWorkbookLayout() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  setupSheets();
  sys_ensureIntegrationSheets_(spreadsheet);
  sys_seedRows_(spreadsheet.getSheetByName(CASE_CONNECTION_SHEET), CASE_CONNECTION_HEADERS, case_defaultConnections_(), 0);
  sys_seedRows_(spreadsheet.getSheetByName(CASE_MAPPING_SHEET), CASE_MAPPING_HEADERS, case_defaultMappings_(), 0);
  sys_seedMeasurementSettings_(spreadsheet);
  sys_applyAdminFormats_(spreadsheet);
  var guide = sys_getOrCreateSheet_(spreadsheet, SYS_GUIDE_SHEET);
  sys_resetPresentationSheet_(guide);
  sys_writeGuide_(guide, "유폴리오 통합 시트", sys_adminGuideLines_());
  dash_updateDashboard_(spreadsheet);
  sys_reorderAndHideSheets_(spreadsheet);
  spreadsheet.toast("화면 구성을 적용했습니다. 평소에는 대시보드·비교결과·현황시트연결·측정값설정만 보입니다.");
}

// 예전 ② 통합관리자 파일의 데이터(현황시트 URL, 매핑 검토상태, 이력)를 이 파일로 1회 이관한다.
function migrateAdminWorkbookIntoSite() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var settings = sys_getSettings_(site);
  var adminId = String(settings.ADMIN_SPREADSHEET_ID || "").trim();
  if (!adminId) {
    throw new Error("설정 시트에 ADMIN_SPREADSHEET_ID가 없습니다. 이미 통합된 상태라면 이 메뉴는 실행할 필요가 없습니다.");
  }
  var admin = SpreadsheetApp.openById(adminId);
  sys_ensureIntegrationSheets_(site);
  [
    [CASE_CONNECTION_SHEET, CASE_CONNECTION_HEADERS],
    [CASE_MAPPING_SHEET, CASE_MAPPING_HEADERS],
    [CASE_SNAPSHOT_SHEET, CASE_SNAPSHOT_HEADERS],
    [CASE_SYNC_LOG_SHEET, CASE_SYNC_LOG_HEADERS],
  ].forEach(function (entry) {
    var source = admin.getSheetByName(entry[0]);
    if (!source) return;
    var rows = case_sheetRows_(source, entry[1].length);
    if (rows.length > 0) sys_replaceData_(site.getSheetByName(entry[0]), entry[1], rows);
  });
  sys_setSettings_(site, { ADMIN_SPREADSHEET_ID: "", ADMIN_SPREADSHEET_URL: "" });
  applyUnifiedWorkbookLayout();
  refreshIntegratedData();
  SpreadsheetApp.getUi().alert(
    "② 관리자 파일의 연결·매핑·이력을 이 파일로 가져오고 전체 동기화를 실행했습니다.\n\n이제 ② 파일은 사용하지 않습니다. 보관하거나 휴지통으로 옮겨도 됩니다.",
  );
}

function seedIntegrationDefaults() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  sys_ensureIntegrationSheets_(spreadsheet);
  sys_seedRows_(spreadsheet.getSheetByName(CASE_CONNECTION_SHEET), CASE_CONNECTION_HEADERS, case_defaultConnections_(), 0);
  sys_seedRows_(spreadsheet.getSheetByName(CASE_MAPPING_SHEET), CASE_MAPPING_HEADERS, case_defaultMappings_(), 0);
  sys_seedMeasurementSettings_(spreadsheet);
  sys_applyAdminFormats_(spreadsheet);
  SpreadsheetApp.getUi().alert("기존 입력값을 유지하면서 누락된 기본 연결·매핑·측정값 항목만 추가했습니다.");
}

function sys_ensureIntegrationSheets_(spreadsheet) {
  [
    [CASE_CONNECTION_SHEET, CASE_CONNECTION_HEADERS],
    [CASE_MAPPING_SHEET, CASE_MAPPING_HEADERS],
    [CASE_MEASUREMENT_SHEET, CASE_MEASUREMENT_HEADERS],
    [CASE_SNAPSHOT_SHEET, CASE_SNAPSHOT_HEADERS],
    [CASE_UFOLIO_LATEST_SHEET, RAW_HEADERS],
    [CASE_COMPARISON_SHEET, CASE_COMPARISON_HEADERS],
    [CASE_UNMAPPED_SHEET, CASE_UNMAPPED_HEADERS],
    [CASE_DIAGNOSTIC_SHEET, CASE_DIAGNOSTIC_HEADERS],
    [CASE_SYNC_LOG_SHEET, CASE_SYNC_LOG_HEADERS],
    ["차트데이터", ["값", "인원"]],
  ].forEach(function (entry) {
    var sheet = sys_getOrCreateSheet_(spreadsheet, entry[0]);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, entry[1].length).setValues([entry[1]]);
      sys_styleHeader_(sheet.getRange(1, 1, 1, entry[1].length));
      sheet.setFrozenRows(1);
      sheet.setHiddenGridlines(true);
    }
  });
}

// 측정값설정 기본값: 매핑이 쓰는 측정값 → 없으면 마스터항목의 비교기준 → 없으면 승인수.
// mappingRows 는 항목매핑 시트 행 배열(관리자 커스텀 포함). 비어 있으면 저장소 기본 매핑을 쓴다.
function sys_measurementDefaults_(mappingRows) {
  var map = {};
  var mappings = mappingRows && mappingRows.length > 0 ? mappingRows : case_defaultMappings_();
  [
    function (row) { return String(row[1]).toUpperCase() === "Y" && row[2] === "승인"; },
    function () { return true; },
  ].forEach(function (include) {
    mappings.forEach(function (row) {
      if (!include(row)) return;
      String(row[8] || "").split(/\r?\n/).forEach(function (line) {
        var parts = line.split("|");
        if (parts.length !== 4) return;
        var key = case_itemKey_(parts[0], parts[1], parts[2], parts[3]);
        if (key && !map[key]) map[key] = String(row[9]).replace(/\s+/g, "");
      });
    });
  });
  return map;
}

function sys_seedMeasurementSettings_(spreadsheet) {
  var sheet = sys_getOrCreateSheet_(spreadsheet, CASE_MEASUREMENT_SHEET);
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, CASE_MEASUREMENT_HEADERS.length).getValues().forEach(function (row) {
      var choice = String(row[4] == null ? "" : row[4]).replace(/\s+/g, "");
      if (row[0] !== "" && CASE_MEASUREMENT_CHOICES.indexOf(choice) >= 0) {
        existing[case_itemKey_(row[0], row[1], row[2], row[3])] = choice;
      }
    });
  }
  var mappingSheet = spreadsheet.getSheetByName(CASE_MAPPING_SHEET);
  var mappingRows = mappingSheet && mappingSheet.getLastRow() > 1
    ? mappingSheet.getRange(2, 1, mappingSheet.getLastRow() - 1, CASE_MAPPING_HEADERS.length).getValues()
    : [];
  var defaults = sys_measurementDefaults_(mappingRows);
  var rows = sys_readMaster_(spreadsheet).map(function (row) {
    var key = case_itemKey_(row[1], row[2], row[3], row[4]);
    return [row[1], row[2], row[3], row[4], existing[key] || defaults[key] || row[6] || "승인수"];
  });
  sys_replaceData_(sheet, CASE_MEASUREMENT_HEADERS, rows);
  var bodyRows = Math.max(1, rows.length);
  sheet.getRange(2, 5, bodyRows, 1)
    .setBackground(SYS_COLORS.paleYellow)
    .setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CASE_MEASUREMENT_CHOICES, true).setAllowInvalid(false).build(),
    );
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 170);
  sheet.setColumnWidth(4, 330);
  sheet.setColumnWidth(5, 90);
  if (!sheet.isColumnHiddenByUser(1)) sheet.hideColumns(1);
  sys_ensureFilter_(sheet, CASE_MEASUREMENT_HEADERS.length);
}

function sys_adminGuideLines_() {
  return [
    "평소에는 대시보드와 비교결과만 확인합니다.",
    "대시보드에서 항목 행을 클릭하면 그 항목의 값 분포 그래프가 표시됩니다.",
    "비교결과의 U-FOLIO 값이 '미인증'이면 그 학생이 해당 항목 인증을 아직 보내지 않은 것입니다.",
    "측정값설정에서 항목별로 승인수/환자수/점수 중 무엇으로 비교·집계할지 고를 수 있습니다. 바꾼 뒤 지금 전체 동기화를 실행하면 반영됩니다.",
    "현황시트연결은 원본 시트 URL이 바뀔 때만 수정합니다. 노란 셀이 관리자 입력 영역입니다.",
    "나머지 시트(RAW, 항목매핑, 연결진단 등)는 시스템 운영용이라 숨겨져 있습니다. 좌측 하단 시트 목록(☰)에서 다시 열 수 있습니다.",
    "동기화가 정상인 것을 확인한 뒤 매일 새벽 3시 동기화를 켭니다.",
    "이 파일은 관리자만 소유·열람하며 학생에게 공유하지 않습니다.",
  ];
}

function sys_applyAdminFormats_(spreadsheet) {
  var connections = spreadsheet.getSheetByName(CASE_CONNECTION_SHEET);
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
    connections.setFrozenColumns(4);
    sys_ensureFilter_(connections, CASE_CONNECTION_HEADERS.length);
  }
  var mappings = spreadsheet.getSheetByName(CASE_MAPPING_SHEET);
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
    mappings.setFrozenColumns(4);
    sys_ensureFilter_(mappings, CASE_MAPPING_HEADERS.length);
  }
  var comparison = spreadsheet.getSheetByName(CASE_COMPARISON_SHEET);
  if (comparison) {
    var comparisonRange = comparison.getRange("A2:J20000");
    comparison.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$H2="미인증"').setBackground(SYS_COLORS.paleRed).setRanges([comparisonRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($H2<>"",$H2<>"미인증",$G2<>$H2)').setBackground(SYS_COLORS.paleYellow).setRanges([comparisonRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($H2<>"",$H2<>"미인증",$G2=$H2)').setBackground(SYS_COLORS.paleGreen).setRanges([comparisonRange]).build(),
    ]);
    comparison.setFrozenColumns(3);
    comparison.setColumnWidth(5, 240);
    comparison.setColumnWidth(8, 92);
    comparison.setColumnWidth(9, 92);
    comparison.setColumnWidth(10, 150);
    comparison.getRange("J2:J20000").setNumberFormat("yyyy-mm-dd hh:mm");
    sys_ensureFilter_(comparison, CASE_COMPARISON_HEADERS.length);
  }
  var diagnostic = spreadsheet.getSheetByName(CASE_DIAGNOSTIC_SHEET);
  if (diagnostic) sys_ensureFilter_(diagnostic, CASE_DIAGNOSTIC_HEADERS.length);
  var syncLog = spreadsheet.getSheetByName(CASE_SYNC_LOG_SHEET);
  if (syncLog) {
    syncLog.getRange("A2:A1000").setNumberFormat("yyyy-mm-dd hh:mm");
    sys_ensureFilter_(syncLog, CASE_SYNC_LOG_HEADERS.length);
  }
  var unmapped = spreadsheet.getSheetByName(CASE_UNMAPPED_SHEET);
  if (unmapped) sys_ensureFilter_(unmapped, CASE_UNMAPPED_HEADERS.length);
  SYS_VISIBLE_SHEETS.concat(SYS_HIDDEN_SHEETS).forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet) sheet.setHiddenGridlines(true);
  });
}

function sys_reorderAndHideSheets_(spreadsheet) {
  var order = SYS_VISIBLE_SHEETS.concat(SYS_HIDDEN_SHEETS);
  var colors = {
    "대시보드": SYS_COLORS.navy,
    "비교결과": SYS_COLORS.blue,
    "현황시트연결": "#FFD966",
    "측정값설정": "#FFD966",
  };
  order.forEach(function (name, index) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return;
    if (sheet.isSheetHidden()) sheet.showSheet();
    sheet.setTabColor(colors[name] || null);
    spreadsheet.setActiveSheet(sheet);
    spreadsheet.moveActiveSheet(index + 1);
  });
  SYS_HIDDEN_SHEETS.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet) sheet.hideSheet();
  });
  var dashboard = spreadsheet.getSheetByName("대시보드");
  if (dashboard) spreadsheet.setActiveSheet(dashboard);
}

function sys_ensureFilter_(sheet, width) {
  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, Math.max(2, sheet.getMaxRows()), width).createFilter();
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
    SITE_SPREADSHEET_ID: "이 파일의 ID",
    ADMIN_SPREADSHEET_ID: "(구) 통합 관리자 파일 ID — 이관 후 비움",
    ADMIN_SPREADSHEET_URL: "(구) 관리자 파일 URL — 이관 후 비움",
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

function sys_resetPresentationSheet_(sheet) {
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sys_resetSheet_(sheet);
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
