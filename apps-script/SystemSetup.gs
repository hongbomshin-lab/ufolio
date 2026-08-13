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
var SYS_ADMIN_SHEETS = [
  "대시보드",
  "비교결과",
  "연결진단",
  "동기화로그",
  "미매핑항목",
  "현황시트연결",
  "항목매핑",
  "현황최신",
  "유폴리오최신",
  "마스터항목",
  "사용안내",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("유폴리오 통합관리")
    .addItem("통합 관리자 파일 최초 생성", "createIntegrationAdminWorkbook")
    .addItem("기본 연결·매핑 누락분 추가", "seedIntegrationDefaults")
    .addItem("검토 완료 매핑 교정 적용", "applyReviewedMappingCorrections")
    .addItem("관리자 화면·서식 업데이트", "applyAdminUsabilityUpdate")
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

function applyAdminUsabilityUpdate() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var admin = case_getAdmin_(site);
  sys_applyAdminUsability_(admin);
  SpreadsheetApp.getUi().alert("관리자 파일의 대시보드, 시트 순서, 탭 색상, 필터와 고정 영역을 업데이트했습니다.\n\n평소에는 대시보드와 비교결과만 확인하면 됩니다.");
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
    implant[13] = "보류";
    implant[14] = "과거 학년·예시 자료이므로 비활성";
  }

  var existingMappings = mappingSheet.getLastRow() < 2 ? [] : mappingSheet.getRange(2, 1, mappingSheet.getLastRow() - 1, CASE_MAPPING_HEADERS.length).getValues();
  var reviewedMappings = sys_mergeReviewedRows_(existingMappings, case_defaultMappings_(), 0, ["PROS_ASSIST"]);

  sys_replaceData_(connectionSheet, CASE_CONNECTION_HEADERS, reviewedConnections);
  sys_replaceData_(mappingSheet, CASE_MAPPING_HEADERS, reviewedMappings);
  sys_applyAdminUsability_(admin);
  refreshIntegratedData();
  SpreadsheetApp.getUi().alert("검토 완료 매핑을 반영하고 전체 동기화를 실행했습니다.\n\n미매핑항목 시트에는 아직 확인이 필요한 항목만 남습니다.");
}

function sys_buildIntegrationAdmin_(spreadsheet, master) {
  var first = spreadsheet.getSheets()[0];
  first.setName(SYS_GUIDE_SHEET);
  sys_resetPresentationSheet_(first);
  sys_writeGuide_(first, "② 유폴리오 통합관리자", sys_adminGuideLines_());
  sys_resetPresentationSheet_(sys_getOrCreateSheet_(spreadsheet, "대시보드"));
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "현황시트연결"), CASE_CONNECTION_HEADERS, 15);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "항목매핑"), CASE_MAPPING_HEADERS, 13);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "현황최신"), CASE_SNAPSHOT_HEADERS, 18);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "유폴리오최신"), RAW_HEADERS, 14);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "비교결과"), CASE_COMPARISON_HEADERS, 13);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "미매핑항목"), CASE_UNMAPPED_HEADERS, 7);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "연결진단"), CASE_DIAGNOSTIC_HEADERS, 5);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "동기화로그"), CASE_SYNC_LOG_HEADERS, 6);
  sys_prepareDataSheet_(sys_getOrCreateSheet_(spreadsheet, "마스터항목"), MASTER_HEADERS, 8);
  sys_replaceData_(spreadsheet.getSheetByName("마스터항목"), MASTER_HEADERS, master);
  sys_seedIntegrationDefaults_(spreadsheet);
  sys_applyAdminUsability_(spreadsheet);
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
  sys_resetPresentationSheet_(sheet);
  sys_writeTitle_(sheet, "현황시트 × U-FOLIO 통합 대시보드", "평소에는 이 화면과 비교결과만 확인하면 됩니다.", 8);

  sheet.getRange("A4:B4").setValues([["오늘의 확인 항목", "건수"]]);
  sheet.getRange("A5:A10").setValues([
    ["확인 필요 합계"], ["반영대기"], ["현황누락의심"], ["유폴리오미인증"], ["U-FOLIO측정값없음"], ["매핑대기"],
  ]);
  sheet.getRange("B5:B10").setFormulas([
    ["=SUM(B6:B10)"],
    ["=COUNTIF('비교결과'!J2:J20000,\"반영대기\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"현황누락의심\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"유폴리오미인증\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"U-FOLIO측정값없음\")"],
    ["=COUNTIF('비교결과'!J2:J20000,\"매핑대기\")"],
  ]);

  sheet.getRange("D4:E4").setValues([["운영 상태", "값"]]);
  sheet.getRange("D5:D10").setValues([
    ["마지막 동기화"], ["정상 연결"], ["오류·노후 연결"], ["전체 비교 건수"], ["일치"], ["일치율"],
  ]);
  sheet.getRange("E5:E10").setFormulas([
    ["=IF(COUNTA('동기화로그'!A2:A1000)=0,\"아직 동기화 전\",MAX('동기화로그'!A2:A1000))"],
    ["=COUNTIF('현황시트연결'!N2:N1000,\"정상\")"],
    ["=COUNTIF('현황시트연결'!N2:N1000,\"원본오류\")+COUNTIF('현황시트연결'!N2:N1000,\"원본노후\")"],
    ["=COUNTA('비교결과'!A2:A20000)"],
    ["=COUNTIF('비교결과'!J2:J20000,\"일치\")"],
    ["=IFERROR(E9/E8,0)"],
  ]);

  sheet.getRange("G4:H4").setValues([["구분", "바로 보는 순서"]]);
  sheet.getRange("G5:H10").setValues([
    ["평소 1", "대시보드 — 전체 상태 확인"],
    ["평소 2", "비교결과 — 상태 필터로 학생 확인"],
    ["오류 1", "연결진단 — 원본 오류 원인 확인"],
    ["오류 2", "동기화로그 — 최근 실행 결과 확인"],
    ["설정", "현황시트연결·항목매핑 — 구조 변경 때만"],
    ["기술", "현황최신·유폴리오최신·마스터항목 — 문제 분석용"],
  ]);

  sys_styleHeader_(sheet.getRange("A4:B4"));
  sys_styleHeader_(sheet.getRange("D4:E4"));
  sys_styleHeader_(sheet.getRange("G4:H4"));
  sheet.getRange("A5:A10").setBackground(SYS_COLORS.paleBlue).setFontWeight("bold");
  sheet.getRange("B5:B10").setBackground(SYS_COLORS.paleYellow).setFontWeight("bold").setNumberFormat("#,##0");
  sheet.getRange("B5").setBackground(SYS_COLORS.orange).setFontSize(14);
  sheet.getRange("D5:D10").setBackground(SYS_COLORS.paleBlue).setFontWeight("bold");
  sheet.getRange("E5:E10").setBackground(SYS_COLORS.paleGreen).setFontWeight("bold");
  sheet.getRange("E5").setNumberFormat("yyyy-mm-dd hh:mm");
  sheet.getRange("E6:E9").setNumberFormat("#,##0");
  sheet.getRange("E10").setNumberFormat("0.0%");
  sheet.getRange("G5:G10").setBackground(SYS_COLORS.paleGray).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("H5:H10").setBackground("#F8FAFC").setWrap(true);

  sheet.getRange("A13:H13").merge().setValue("상태 읽는 법").setBackground(SYS_COLORS.navy).setFontColor(SYS_COLORS.white).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("A14:B14").merge().setValue("일치 · 조치 없음").setBackground(SYS_COLORS.paleGreen).setHorizontalAlignment("center").setWrap(true);
  sheet.getRange("C14:D14").merge().setValue("반영대기 · 사인/반영 확인").setBackground(SYS_COLORS.paleYellow).setHorizontalAlignment("center").setWrap(true);
  sheet.getRange("E14:F14").merge().setValue("누락의심·미인증 · 확인 필요").setBackground(SYS_COLORS.paleRed).setHorizontalAlignment("center").setWrap(true);
  sheet.getRange("G14:H14").merge().setValue("원본노후 · 연결 복구 필요").setBackground("#D9D2E9").setHorizontalAlignment("center").setWrap(true);

  [190, 90, 28, 170, 150, 28, 88, 360].forEach(function (width, index) { sheet.setColumnWidth(index + 1, width); });
  sheet.setFrozenRows(4);
  sheet.setHiddenGridlines(true);
}

function sys_adminGuideLines_() {
  return [
    "평소에는 대시보드와 비교결과만 확인합니다.",
    "대시보드의 확인 필요 합계를 보고, 비교결과에서 상태 필터를 사용해 해당 학생만 확인합니다.",
    "연결 오류가 있을 때만 연결진단과 동기화로그를 확인합니다.",
    "현황시트연결과 항목매핑은 원본 시트나 규칙이 바뀔 때만 수정합니다. 노란 셀이 관리자 입력 영역입니다.",
    "① 사이트 인증 파일의 유폴리오 통합관리 메뉴에서 지금 전체 동기화를 실행할 수 있습니다.",
    "동기화가 정상인 것을 확인한 뒤 매일 새벽 3시 동기화를 켭니다.",
    "이 파일은 관리자만 소유·열람하며 학생에게 공유하지 않습니다.",
    "중앙 파일에는 학생별 집계값만 저장되며 원본의 환자·담당자·날짜·메모는 복사하지 않습니다.",
  ];
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
    connections.setFrozenColumns(4);
    sys_ensureFilter_(connections, CASE_CONNECTION_HEADERS.length);
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
    mappings.setFrozenColumns(4);
    sys_ensureFilter_(mappings, CASE_MAPPING_HEADERS.length);
  }
  var comparison = spreadsheet.getSheetByName("비교결과");
  if (comparison) {
    var comparisonRange = comparison.getRange("A2:M20000");
    comparison.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$J2="일치"').setBackground(SYS_COLORS.paleGreen).setRanges([comparisonRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$J2="반영대기"').setBackground(SYS_COLORS.paleYellow).setRanges([comparisonRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($J2="현황누락의심",$J2="유폴리오미인증")').setBackground(SYS_COLORS.paleRed).setRanges([comparisonRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$J2="U-FOLIO측정값없음"').setBackground(SYS_COLORS.paleYellow).setRanges([comparisonRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$J2="원본오류"').setBackground("#F4CCCC").setRanges([comparisonRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$J2="원본노후"').setBackground("#D9D2E9").setRanges([comparisonRange]).build(),
    ]);
    comparison.setFrozenColumns(3);
    comparison.setColumnWidth(5, 240);
    comparison.setColumnWidth(10, 140);
    sys_ensureFilter_(comparison, CASE_COMPARISON_HEADERS.length);
  }
  var diagnostic = spreadsheet.getSheetByName("연결진단");
  if (diagnostic) sys_ensureFilter_(diagnostic, CASE_DIAGNOSTIC_HEADERS.length);
  var syncLog = spreadsheet.getSheetByName("동기화로그");
  if (syncLog) {
    syncLog.getRange("A2:A1000").setNumberFormat("yyyy-mm-dd hh:mm");
    sys_ensureFilter_(syncLog, CASE_SYNC_LOG_HEADERS.length);
  }
  var unmapped = spreadsheet.getSheetByName("미매핑항목");
  if (unmapped) sys_ensureFilter_(unmapped, CASE_UNMAPPED_HEADERS.length);
  SYS_ADMIN_SHEETS.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet) sheet.setHiddenGridlines(true);
  });
}

function sys_applyAdminUsability_(spreadsheet) {
  var guide = spreadsheet.getSheetByName(SYS_GUIDE_SHEET);
  if (guide) {
    sys_resetPresentationSheet_(guide);
    sys_writeGuide_(guide, "② 유폴리오 통합관리자", sys_adminGuideLines_());
  }
  sys_buildDashboard_(sys_getOrCreateSheet_(spreadsheet, "대시보드"));
  sys_applyAdminFormats_(spreadsheet);
  sys_reorderAdminSheets_(spreadsheet);
}

function sys_reorderAdminSheets_(spreadsheet) {
  var order = ["대시보드", "비교결과", "연결진단", "동기화로그", "미매핑항목", "현황시트연결", "항목매핑", "현황최신", "유폴리오최신", "마스터항목", "사용안내"];
  var colors = {
    "대시보드": SYS_COLORS.navy,
    "비교결과": SYS_COLORS.blue,
    "연결진단": SYS_COLORS.red,
    "동기화로그": SYS_COLORS.orange,
    "미매핑항목": SYS_COLORS.orange,
    "현황시트연결": "#FFD966",
    "항목매핑": "#FFD966",
    "현황최신": SYS_COLORS.gray,
    "유폴리오최신": SYS_COLORS.gray,
    "마스터항목": SYS_COLORS.gray,
    "사용안내": "#9DC3E6",
  };
  order.forEach(function (name, index) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return;
    sheet.setTabColor(colors[name]);
    spreadsheet.setActiveSheet(sheet);
    spreadsheet.moveActiveSheet(index + 1);
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
