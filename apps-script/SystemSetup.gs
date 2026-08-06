var SYS_SETTINGS_SHEET = "설정";
var SYS_GUIDE_SHEET = "사용안내";
var SYS_MAX_STUDENTS = 200;
var SYS_COLORS = {
  navy: "#17365D",
  blue: "#2F75B5",
  paleBlue: "#D9EAF7",
  paleYellow: "#FFF2CC",
  paleRed: "#FCE4D6",
  paleGreen: "#E2F0D9",
  white: "#FFFFFF",
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("유폴리오 관리")
    .addItem("②·③ 연결 파일 최초 생성", "createLinkedWorkbooks")
    .addSeparator()
    .addItem("관리자 DB 지금 새로고침", "refreshAdminData")
    .addItem("명단을 수기입력 파일에 동기화", "syncRosterToManual")
    .addItem("수기대상 열만 표시", "applyManualItemVisibility")
    .addItem("학생별 행 보호 적용", "applyStudentRowProtections")
    .addSeparator()
    .addItem("1시간 자동 새로고침 켜기", "installHourlyRefreshTrigger")
    .addItem("자동 새로고침 끄기", "removeRefreshTriggers")
    .addToUi();
}

function createLinkedWorkbooks() {
  setupSheets();
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var current = sys_getSettings_(site);
  if (current.MANUAL_SPREADSHEET_ID || current.ADMIN_SPREADSHEET_ID) {
    throw new Error("이미 연결 파일 ID가 있습니다. 중복 생성을 막기 위해 중단했습니다.");
  }

  var roster = sys_readRoster_(site);
  var master = sys_readMaster_(site);
  if (roster.length === 0) throw new Error("학생명단이 비어 있습니다.");
  if (master.length === 0) throw new Error("마스터항목이 비어 있습니다.");

  var manual = SpreadsheetApp.create("② 유폴리오 수기입력");
  sys_setSettings_(site, {
    SITE_SPREADSHEET_ID: site.getId(),
    MANUAL_SPREADSHEET_ID: manual.getId(),
    MANUAL_SPREADSHEET_URL: manual.getUrl(),
  });
  sys_buildManualWorkbook_(manual, roster, master);

  var admin = SpreadsheetApp.create("③ 유폴리오 관리자");
  sys_setSettings_(site, {
    ADMIN_SPREADSHEET_ID: admin.getId(),
    ADMIN_SPREADSHEET_URL: admin.getUrl(),
  });
  sys_buildAdminWorkbook_(admin, site.getId(), manual.getId(), master);
  refreshAdminData();

  SpreadsheetApp.getUi().alert(
    "연결 파일을 만들었습니다.\n\n수기입력: " + manual.getUrl() + "\n\n관리자: " + admin.getUrl(),
  );
}

function refreshAdminData() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var settings = sys_requireLinkedSettings_(site);
  var manual = SpreadsheetApp.openById(settings.MANUAL_SPREADSHEET_ID);
  var admin = SpreadsheetApp.openById(settings.ADMIN_SPREADSHEET_ID);
  var roster = sys_readRoster_(site);
  var master = sys_readMaster_(site);
  var rosterByAttendance = {};
  roster.forEach(function (row) {
    rosterByAttendance[String(row[0])] = row;
  });

  var latestByKey = {};
  var raw = site.getSheetByName(RAW_SHEET);
  if (raw && raw.getLastRow() > 1) {
    raw.getRange(2, 1, raw.getLastRow() - 1, RAW_HEADERS.length).getValues().forEach(function (row) {
      var key = sys_siteKey_(row[3], row[5], row[6], row[7], row[8]);
      var previous = latestByKey[key];
      if (!previous || new Date(row[0]).getTime() > new Date(previous[0]).getTime()) {
        latestByKey[key] = row;
      }
    });
  }
  var latestRows = Object.keys(latestByKey).map(function (key) { return latestByKey[key]; });
  latestRows.sort(function (left, right) {
    var leftNo = Number(left[2]);
    var rightNo = Number(right[2]);
    if (isFinite(leftNo) && isFinite(rightNo) && leftNo !== rightNo) return leftNo - rightNo;
    return String(left.slice(5, 9).join("|")).localeCompare(String(right.slice(5, 9).join("|")), "ko");
  });
  sys_replaceData_(admin.getSheetByName("사이트최신"), RAW_HEADERS, latestRows);

  var targetByDepartment = {};
  master.forEach(function (row) {
    if (String(row[0]).toUpperCase() !== "Y" || String(row[5]).toUpperCase() !== "Y") return;
    if (!targetByDepartment[row[2]]) targetByDepartment[row[2]] = [];
    targetByDepartment[row[2]].push(row);
  });

  var manualRows = [];
  Object.keys(targetByDepartment).forEach(function (department) {
    var sheet = manual.getSheetByName(department);
    if (!sheet) return;
    var departmentItems = targetByDepartment[department];
    var headerMenus = sheet.getRange(1, 3, 1, Math.max(1, sheet.getLastColumn() - 2)).getDisplayValues()[0];
    var headerItems = sheet.getRange(2, 3, 1, Math.max(1, sheet.getLastColumn() - 2)).getDisplayValues()[0];
    var columnByKey = {};
    headerItems.forEach(function (item, index) {
      columnByKey[String(headerMenus[index]).trim() + "|" + String(item).trim()] = index + 3;
    });
    var lastRow = Math.max(2, sheet.getLastRow());
    if (lastRow < 3) return;
    var attendanceAndNames = sheet.getRange(3, 1, lastRow - 2, 2).getValues();
    departmentItems.forEach(function (masterRow) {
      var col = columnByKey[String(masterRow[3]).trim() + "|" + String(masterRow[4]).trim()];
      if (!col) return;
      var values = sheet.getRange(3, col, lastRow - 2, 1).getValues();
      values.forEach(function (valueRow, rowIndex) {
        var attendanceNo = attendanceAndNames[rowIndex][0];
        var value = valueRow[0];
        if (attendanceNo === "" || value === "") return;
        var student = rosterByAttendance[String(attendanceNo)];
        if (!student) return;
        manualRows.push([
          student[0],
          student[1],
          student[2],
          masterRow[2],
          masterRow[3],
          masterRow[4],
          value,
          masterRow[6],
        ]);
      });
    });
  });
  manualRows.sort(sys_sortDataRows_);
  sys_replaceData_(admin.getSheetByName("수기DB"), ["출석번호", "학번", "이름", "과", "메뉴/구분", "항목", "수기값", "비교기준"], manualRows);

  var practiceByMasterKey = {};
  master.forEach(function (row) {
    practiceByMasterKey[[row[2], row[3], row[4]].join("|")] = row[1];
  });
  var mismatchRows = [];
  manualRows.forEach(function (row) {
    var practice = practiceByMasterKey[[row[3], row[4], row[5]].join("|")] || "";
    var siteRow = latestByKey[sys_siteKey_(row[1], practice, row[3], row[4], row[5])];
    var siteValue = "";
    var status;
    if (!siteRow) {
      status = "사이트기록없음";
    } else {
      siteValue = row[7] === "환자수" ? siteRow[10] : row[7] === "점수" ? siteRow[11] : siteRow[9];
      status = sys_valuesEqual_(row[6], siteValue) ? "일치" : "불일치";
    }
    if (status !== "일치") {
      mismatchRows.push([row[0], row[1], row[2], row[3], row[4], row[5], row[7], row[6], siteValue, status]);
    }
  });
  sys_replaceData_(admin.getSheetByName("불일치"), ["출석번호", "학번", "이름", "과", "메뉴/구분", "항목", "비교기준", "수기값", "사이트값", "상태"], mismatchRows);

  var adminMaster = admin.getSheetByName(MASTER_SHEET);
  sys_replaceData_(adminMaster, MASTER_HEADERS, master);
  sys_setSettings_(admin, {
    SITE_SPREADSHEET_ID: site.getId(),
    MANUAL_SPREADSHEET_ID: manual.getId(),
    LAST_REFRESHED_AT: new Date(),
  });
}

function syncRosterToManual() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var settings = sys_requireLinkedSettings_(site);
  var manual = SpreadsheetApp.openById(settings.MANUAL_SPREADSHEET_ID);
  var roster = sys_readRoster_(site);
  var master = sys_readMaster_(site);
  sys_writeRoster_(manual, roster);

  sys_departments_(master).forEach(function (department) {
    var sheet = manual.getSheetByName(department);
    if (!sheet) return;
    var lastCol = sheet.getLastColumn();
    var existing = sheet.getRange(3, 1, SYS_MAX_STUDENTS, lastCol).getValues();
    var scoresByAttendance = {};
    existing.forEach(function (row) {
      if (row[0] !== "") scoresByAttendance[String(row[0])] = row.slice(2);
    });
    var output = Array.from({ length: SYS_MAX_STUDENTS }, function () {
      return Array(lastCol).fill("");
    });
    roster.forEach(function (student, index) {
      output[index][0] = student[0];
      output[index][1] = student[2];
      var scores = scoresByAttendance[String(student[0])] || [];
      scores.forEach(function (value, scoreIndex) { output[index][scoreIndex + 2] = value; });
    });
    sheet.getRange(3, 1, SYS_MAX_STUDENTS, lastCol).setValues(output);
  });
  SpreadsheetApp.getUi().alert(roster.length + "명의 명단을 수기입력 파일에 동기화했습니다.");
}

function applyManualItemVisibility() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var settings = sys_requireLinkedSettings_(site);
  var manual = SpreadsheetApp.openById(settings.MANUAL_SPREADSHEET_ID);
  var master = sys_readMaster_(site);
  sys_departments_(master).forEach(function (department) {
    var sheet = manual.getSheetByName(department);
    if (!sheet || sheet.getLastColumn() < 3) return;
    sheet.showColumns(3, sheet.getLastColumn() - 2);
    var departmentRows = master.filter(function (row) { return row[2] === department; });
    departmentRows.forEach(function (row, index) {
      if (String(row[5]).toUpperCase() !== "Y") sheet.hideColumns(index + 3);
    });
  });
  SpreadsheetApp.getUi().alert("마스터항목에서 수기대상=Y인 열만 표시했습니다.");
}

function applyStudentRowProtections() {
  var site = SpreadsheetApp.getActiveSpreadsheet();
  var settings = sys_requireLinkedSettings_(site);
  var manual = SpreadsheetApp.openById(settings.MANUAL_SPREADSHEET_ID);
  var roster = sys_readRoster_(site);
  var master = sys_readMaster_(site);
  var missingEmails = roster.filter(function (row) { return !String(row[3] || "").trim(); });
  if (missingEmails.length > 0) {
    throw new Error("학생명단 이메일이 비어 있는 학생이 " + missingEmails.length + "명 있습니다.");
  }

  sys_departments_(master).forEach(function (department) {
    var sheet = manual.getSheetByName(department);
    if (!sheet || sheet.getLastColumn() < 3) return;
    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (protection) {
      if (String(protection.getDescription()).indexOf("UFOLIO_ROW_") === 0) protection.remove();
    });
    roster.forEach(function (student, index) {
      var protection = sheet.getRange(index + 3, 3, 1, sheet.getLastColumn() - 2).protect();
      protection.setDescription("UFOLIO_ROW_" + student[1]);
      protection.removeEditors(protection.getEditors());
      if (protection.canDomainEdit()) protection.setDomainEdit(false);
      protection.addEditor(String(student[3]).trim());
    });
  });
  SpreadsheetApp.getUi().alert("학생별 행 보호를 적용했습니다.");
}

function installHourlyRefreshTrigger() {
  removeRefreshTriggers();
  ScriptApp.newTrigger("refreshAdminData").timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert("1시간마다 관리자 DB를 새로고침하도록 설정했습니다.");
}

function removeRefreshTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "refreshAdminData") ScriptApp.deleteTrigger(trigger);
  });
}

function sys_buildManualWorkbook_(spreadsheet, roster, master) {
  var first = spreadsheet.getSheets()[0];
  first.setName(SYS_GUIDE_SHEET);
  sys_resetSheet_(first);
  sys_writeGuide_(first, "② 유폴리오 수기입력", [
    "학생에게 편집 권한으로 공유할 파일입니다. 사이트 점수는 보이지 않습니다.",
    "각 과 시트에서 본인 출석번호 행만 입력합니다.",
    "사이트 인증 파일의 마스터항목에서 수기대상=Y를 지정한 뒤 수기대상 열만 표시 메뉴를 실행하세요.",
    "학생 이메일 입력 후 학생별 행 보호 적용 메뉴를 실행하세요.",
  ]);
  sys_writeRoster_(spreadsheet, roster);
  sys_departments_(master).forEach(function (department) {
    sys_buildDepartmentSheet_(spreadsheet, department, roster, master);
  });
  sys_buildStatsSheet_(spreadsheet, roster, master);
}

function sys_buildAdminWorkbook_(spreadsheet, siteId, manualId, master) {
  var first = spreadsheet.getSheets()[0];
  first.setName(SYS_GUIDE_SHEET);
  sys_resetSheet_(first);
  sys_writeGuide_(first, "③ 유폴리오 관리자", [
    "관리자만 열람하세요.",
    "사이트 인증 파일에서 관리자 DB 지금 새로고침 메뉴를 실행하면 데이터가 갱신됩니다.",
    "불일치는 수기대상=Y인 항목만 비교합니다.",
    "사이트기록없음은 아직 전송되지 않았거나 항목명이 달라진 경우입니다.",
  ]);
  sys_setSettings_(spreadsheet, {
    SITE_SPREADSHEET_ID: siteId,
    MANUAL_SPREADSHEET_ID: manualId,
    LAST_REFRESHED_AT: "",
  });
  sys_replaceData_(sys_getOrCreateSheet_(spreadsheet, MASTER_SHEET), MASTER_HEADERS, master);
  sys_replaceData_(sys_getOrCreateSheet_(spreadsheet, "사이트최신"), RAW_HEADERS, []);
  sys_replaceData_(sys_getOrCreateSheet_(spreadsheet, "수기DB"), ["출석번호", "학번", "이름", "과", "메뉴/구분", "항목", "수기값", "비교기준"], []);
  sys_replaceData_(sys_getOrCreateSheet_(spreadsheet, "불일치"), ["출석번호", "학번", "이름", "과", "메뉴/구분", "항목", "비교기준", "수기값", "사이트값", "상태"], []);
  var dashboard = sys_getOrCreateSheet_(spreadsheet, "대시보드");
  sys_resetSheet_(dashboard);
  sys_writeTitle_(dashboard, "관리자 점검 대시보드", "refreshAdminData() 실행 결과", 8);
  dashboard.getRange("A4:B7").setValues([["지표", "값"], ["수기 입력 건수", ""], ["불일치", ""], ["사이트 기록 없음", ""]]);
  dashboard.getRange("B5:B7").setFormulas([["=COUNTA('수기DB'!G2:G20000)"], ["=COUNTIF('불일치'!J2:J20000,\"불일치\")"], ["=COUNTIF('불일치'!J2:J20000,\"사이트기록없음\")"]]);
  sys_styleHeader_(dashboard.getRange("A4:B4"));
  dashboard.getRange("A5:A7").setBackground(SYS_COLORS.paleBlue);
  dashboard.getRange("B5:B7").setBackground(SYS_COLORS.paleYellow);
  dashboard.setColumnWidth(1, 180);
  dashboard.setColumnWidth(2, 110);
  dashboard.setHiddenGridlines(true);
}

function sys_buildDepartmentSheet_(spreadsheet, department, roster, master) {
  var rows = master.filter(function (row) { return row[0] === "Y" && row[2] === department; });
  var sheet = sys_getOrCreateSheet_(spreadsheet, department);
  sys_resetSheet_(sheet);
  var headers1 = ["출석번호", "이름"].concat(rows.map(function (row) { return row[3]; }));
  var headers2 = ["", ""].concat(rows.map(function (row) { return row[4]; }));
  sheet.getRange(1, 1, 2, headers1.length).setValues([headers1, headers2]);
  sys_styleHeader_(sheet.getRange(1, 1, 2, headers1.length));
  var body = Array.from({ length: SYS_MAX_STUDENTS }, function () { return Array(headers1.length).fill(""); });
  roster.forEach(function (student, index) {
    body[index][0] = student[0];
    body[index][1] = student[2];
  });
  sheet.getRange(3, 1, SYS_MAX_STUDENTS, headers1.length).setValues(body);
  if (headers1.length > 2) {
    var inputRange = sheet.getRange(3, 3, SYS_MAX_STUDENTS, headers1.length - 2);
    inputRange.setBackground(SYS_COLORS.paleYellow).setNumberFormat("0.##");
    inputRange.setDataValidation(
      SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build(),
    );
  }
  sheet.setColumnWidth(1, 78);
  sheet.setColumnWidth(2, 94);
  for (var col = 3; col <= headers1.length; col += 1) sheet.setColumnWidth(col, 150);
  sheet.setRowHeights(1, 2, 48);
  sheet.getRange(1, 3, 2, Math.max(1, headers1.length - 2)).setWrap(true);
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(2);
  sheet.setHiddenGridlines(true);
}

function sys_buildStatsSheet_(spreadsheet, roster, master) {
  var sheet = sys_getOrCreateSheet_(spreadsheet, "통계");
  sys_resetSheet_(sheet);
  sys_writeTitle_(sheet, "수기입력 통계", "B4의 항목 번호를 바꾸면 오른쪽 분포 차트가 갱신됩니다.", 11);
  sheet.getRange("A4:B4").setValues([["선택 항목 번호", 1]]);
  sheet.getRange("A4").setBackground(SYS_COLORS.blue).setFontColor(SYS_COLORS.white).setFontWeight("bold");
  sheet.getRange("B4").setBackground(SYS_COLORS.paleYellow).setFontWeight("bold");
  sheet.getRange("B4").setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1, master.length).setAllowInvalid(false).build());
  var headers = ["번호", "과", "메뉴/구분", "항목", "평균", "입력수", "미입력수", "0~<1", "1~<3", "3~<5", "5 이상"];
  sheet.getRange(8, 1, 1, headers.length).setValues([headers]);
  sys_styleHeader_(sheet.getRange(8, 1, 1, headers.length));
  var departments = sys_departments_(master);
  var itemIndexByDepartment = {};
  departments.forEach(function (department) { itemIndexByDepartment[department] = 0; });
  var values = [];
  var formulas = [];
  master.forEach(function (row, index) {
    var sourceCol = sys_colLetter_(3 + itemIndexByDepartment[row[2]]++);
    var source = "'" + String(row[2]).replace(/'/g, "''") + "'!$" + sourceCol + "$3:$" + sourceCol + "$" + (SYS_MAX_STUDENTS + 2);
    var outputRow = index + 9;
    values.push([index + 1, row[2], row[3], row[4]]);
    formulas.push([
      "=IFERROR(AVERAGE(" + source + "),\"\")",
      "=COUNT(" + source + ")",
      "=COUNTA('학생명단'!A2:A" + (SYS_MAX_STUDENTS + 1) + ")-F" + outputRow,
      "=COUNTIFS(" + source + ",\">=0\"," + source + ",\"<1\")",
      "=COUNTIFS(" + source + ",\">=1\"," + source + ",\"<3\")",
      "=COUNTIFS(" + source + ",\">=3\"," + source + ",\"<5\")",
      "=COUNTIF(" + source + ",\">=5\")",
    ]);
  });
  if (values.length > 0) {
    sheet.getRange(9, 1, values.length, 4).setValues(values);
    sheet.getRange(9, 5, formulas.length, 7).setFormulas(formulas);
  }
  sheet.getRange("M1:N5").setValues([["구간", "인원"], ["0~<1", ""], ["1~<3", ""], ["3~<5", ""], ["5 이상", ""]]);
  sheet.getRange("N2:N5").setFormulas([
    ["=IFERROR(INDEX($H$9:$H$" + (master.length + 8) + ",$B$4),0)"],
    ["=IFERROR(INDEX($I$9:$I$" + (master.length + 8) + ",$B$4),0)"],
    ["=IFERROR(INDEX($J$9:$J$" + (master.length + 8) + ",$B$4),0)"],
    ["=IFERROR(INDEX($K$9:$K$" + (master.length + 8) + ",$B$4),0)"],
  ]);
  sys_styleHeader_(sheet.getRange("M1:N1"));
  var chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange("M1:N5"))
    .setOption("title", "선택 항목 점수 분포")
    .setOption("legend", { position: "none" })
    .setPosition(1, 16, 0, 0)
    .build();
  sheet.insertChart(chart);
  sheet.setFrozenRows(8);
  sheet.setHiddenGridlines(true);
}

function sys_writeRoster_(spreadsheet, roster) {
  var sheet = sys_getOrCreateSheet_(spreadsheet, ROSTER_SHEET);
  sys_resetSheet_(sheet);
  sheet.getRange("A1:D1").setValues([["출석번호", "학번", "이름", "이메일(선택)"]]);
  sys_styleHeader_(sheet.getRange("A1:D1"));
  if (roster.length > 0) sheet.getRange(2, 1, roster.length, 4).setValues(roster.map(function (row) { return [row[0], row[1], row[2], row[3] || ""]; }));
  sheet.getRange(2, 2, SYS_MAX_STUDENTS, 1).setNumberFormat("@");
  sheet.getRange(2, 4, SYS_MAX_STUDENTS, 1).setBackground(SYS_COLORS.paleYellow);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
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

function sys_requireLinkedSettings_(spreadsheet) {
  var settings = sys_getSettings_(spreadsheet);
  if (!settings.MANUAL_SPREADSHEET_ID || !settings.ADMIN_SPREADSHEET_ID) {
    throw new Error("연결 파일이 없습니다. createLinkedWorkbooks()를 먼저 실행하세요.");
  }
  return settings;
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
    MANUAL_SPREADSHEET_ID: "수기입력 파일 ID",
    ADMIN_SPREADSHEET_ID: "관리자 파일 ID",
    MANUAL_SPREADSHEET_URL: "학생에게 공유할 파일 URL",
    ADMIN_SPREADSHEET_URL: "관리자 전용 파일 URL",
    LAST_REFRESHED_AT: "마지막 동기화 시각",
  };
  var preferred = ["SITE_SPREADSHEET_ID", "MANUAL_SPREADSHEET_ID", "ADMIN_SPREADSHEET_ID", "MANUAL_SPREADSHEET_URL", "ADMIN_SPREADSHEET_URL", "LAST_REFRESHED_AT"];
  var rows = preferred.filter(function (key) { return Object.prototype.hasOwnProperty.call(existing, key); }).map(function (key) { return [key, existing[key], descriptions[key] || ""]; });
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
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
  sheet.clear();
  sheet.clearConditionalFormatRules();
}

function sys_departments_(master) {
  var seen = {};
  var result = [];
  master.forEach(function (row) {
    if (row[0] !== "Y" || seen[row[2]]) return;
    seen[row[2]] = true;
    result.push(row[2]);
  });
  return result;
}

function sys_siteKey_(studentId, practice, department, menu, item) {
  return [studentId, practice, department, menu, item].map(function (value) { return String(value == null ? "" : value).trim().replace(/\s+/g, " "); }).join("|");
}

function sys_valuesEqual_(left, right) {
  if (left === "" || right === "") return left === right;
  var leftNumber = Number(left);
  var rightNumber = Number(right);
  if (isFinite(leftNumber) && isFinite(rightNumber)) return Math.abs(leftNumber - rightNumber) < 0.000000001;
  return String(left).trim() === String(right).trim();
}

function sys_sortDataRows_(left, right) {
  var leftNo = Number(left[0]);
  var rightNo = Number(right[0]);
  if (isFinite(leftNo) && isFinite(rightNo) && leftNo !== rightNo) return leftNo - rightNo;
  return String(left.join("|")).localeCompare(String(right.join("|")), "ko");
}

function sys_colLetter_(column) {
  var result = "";
  while (column > 0) {
    column -= 1;
    result = String.fromCharCode(65 + (column % 26)) + result;
    column = Math.floor(column / 26);
  }
  return result;
}
