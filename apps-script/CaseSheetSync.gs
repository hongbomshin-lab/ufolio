var CASE_CONNECTION_SHEET = "현황시트연결";
var CASE_MAPPING_SHEET = "항목매핑";
var CASE_MEASUREMENT_SHEET = "측정값설정";
var CASE_SNAPSHOT_SHEET = "현황최신";
var CASE_UFOLIO_LATEST_SHEET = "유폴리오최신";
var CASE_COMPARISON_SHEET = "비교결과";
var CASE_UNMAPPED_SHEET = "미매핑항목";
var CASE_DIAGNOSTIC_SHEET = "연결진단";
var CASE_SYNC_LOG_SHEET = "동기화로그";

var CASE_SNAPSHOT_HEADERS = [
  "동기화시각", "소스키", "매핑키", "출석번호", "학번", "이름", "과", "현황표시명",
  "완료값", "예정값", "인증대상값", "검토상태", "측정값", "U-FOLIO 대상", "집계방식",
  "우선순위", "상태", "노후",
];
var CASE_COMPARISON_HEADERS = [
  "출석번호", "학번", "이름", "과", "현황표시명", "측정값", "현황값", "U-FOLIO 값",
  "사인 대기 횟수", "최신 유폴 인증",
];
var CASE_MEASUREMENT_HEADERS = ["실습차수", "과", "메뉴/구분", "항목", "측정값"];
var CASE_UNMAPPED_HEADERS = ["매핑키", "소스키", "현황표시명", "검토상태", "인증대상식", "U-FOLIO 대상", "비고"];
var CASE_DIAGNOSTIC_HEADERS = ["시각", "소스키", "행", "상태", "상세"];
var CASE_SYNC_LOG_HEADERS = ["시각", "정상 소스", "실패 소스", "현황 집계", "비교 건수", "상태"];

function case_expressionColumnRefs_(expression) {
  var text = String(expression == null ? "" : expression).trim();
  if (!text) return [];
  var match = /^([A-Z_]+)\((.*)\)$/.exec(text);
  if (!match) throw new Error("지원하지 않는 집계식입니다: " + text);
  var operation = match[1];
  var args = match[2].trim();
  if (operation === "VALUE" || operation === "NUMBER_OR_ZERO" || operation === "NONEMPTY_AS_ONE" || operation === "HAS_STATUS_O") {
    case_columnIndex_(args);
    return [args.toUpperCase()];
  }
  if (operation === "SUM") {
    return args.split(",").map(function (value) {
      var reference = value.trim().toUpperCase();
      case_columnIndex_(reference);
      return reference;
    });
  }
  if (operation === "COUNT_NONEMPTY" || operation === "COUNT_STATUS") {
    var rangeText = operation === "COUNT_STATUS" ? args.split(",")[0].trim() : args;
    var indexes = case_rangeIndexes_(rangeText);
    var output = [];
    for (var index = indexes[0]; index <= indexes[1]; index += 1) output.push(case_columnLetter_(index + 1));
    return output;
  }
  throw new Error("지원하지 않는 집계식입니다: " + text);
}

function case_columnLetter_(column) {
  var result = "";
  var value = column;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function case_requiredColumns_(connection, mappings) {
  var seen = {};
  var columns = [];
  function add(reference) {
    var normalized = String(reference == null ? "" : reference).trim().toUpperCase();
    if (!normalized || seen[normalized]) return;
    case_columnIndex_(normalized);
    seen[normalized] = true;
    columns.push(normalized);
  }
  add(connection.attendanceColumn);
  add(connection.nameColumn);
  mappings.forEach(function (mapping) {
    [mapping.completedExpression, mapping.plannedExpression, mapping.certificationExpression].forEach(function (expression) {
      case_expressionColumnRefs_(expression).forEach(add);
    });
  });
  columns.sort(function (left, right) { return case_columnIndex_(left) - case_columnIndex_(right); });
  return columns;
}

function case_attendanceKey_(value) {
  var text = String(value == null ? "" : value).trim();
  return /^\d+$/.test(text) ? String(Number(text)) : text;
}

function case_clone_(value) {
  var output = {};
  Object.keys(value || {}).forEach(function (key) { output[key] = value[key]; });
  return output;
}

function case_refreshAll_(services) {
  var now = services.now();
  var connections = services.getConnections().filter(function (row) { return String(row.active).toUpperCase() === "Y"; });
  var mappings = services.getMappings().filter(function (row) { return String(row.active).toUpperCase() === "Y"; });
  var measurementSettings = services.getMeasurementSettings ? services.getMeasurementSettings() : {};
  mappings.forEach(function (mapping) {
    mapping.measurement = case_effectiveMeasurement_(mapping, measurementSettings);
  });
  var previous = services.getPreviousSnapshot();
  var latestByKey = services.getLatestUfolio();
  var latestSubmissionAt = services.getLatestSubmissionAt ? services.getLatestSubmissionAt() : {};
  var rosterByAttendance = {};
  services.getRoster().forEach(function (student) {
    rosterByAttendance[case_attendanceKey_(student.attendanceNo)] = student;
  });

  var snapshotRows = previous.map(case_clone_);
  var diagnostics = [];
  var connectionResults = [];

  connections.forEach(function (connection) {
    var sourceMappings = mappings.filter(function (mapping) { return mapping.sourceKey === connection.sourceKey; });
    try {
      if (!String(connection.url || "").trim()) throw new Error("스프레드시트 URL이 비어 있습니다.");
      var requiredColumns = case_requiredColumns_(connection, sourceMappings);
      var readRows = services.readSource(connection, requiredColumns);
      if (!Array.isArray(readRows)) throw new Error("원본 읽기 결과가 배열이 아닙니다.");
      var nextSourceRows = [];
      var seenAttendance = {};
      readRows.forEach(function (readRow, readIndex) {
        var values = Array.isArray(readRow) ? readRow : readRow.values;
        var rowNumber = Array.isArray(readRow) ? readIndex + Number(connection.firstDataRow || 1) : readRow.rowNumber;
        var attendance = values[case_columnIndex_(connection.attendanceColumn)];
        if (case_isBlank_(attendance)) return;
        var attendanceKey = case_attendanceKey_(attendance);
        if (seenAttendance[attendanceKey]) throw new Error("출석번호가 중복되었습니다: " + attendanceKey);
        seenAttendance[attendanceKey] = true;
        var student = rosterByAttendance[attendanceKey];
        var sourceName = values[case_columnIndex_(connection.nameColumn)];
        if (!student || case_normalizeName_(sourceName) !== case_normalizeName_(student.name)) {
          diagnostics.push({
            at: now,
            sourceKey: connection.sourceKey,
            rowNumber: rowNumber,
            status: "학생불일치",
            detail: "출석번호 또는 이름이 학생명단과 일치하지 않습니다.",
          });
          return;
        }
        sourceMappings.forEach(function (mapping) {
          try {
            var completed = mapping.completedExpression ? case_evaluateExpression_(mapping.completedExpression, values) : "";
            var planned = mapping.plannedExpression ? case_evaluateExpression_(mapping.plannedExpression, values) : "";
            var certification = case_evaluateExpression_(mapping.certificationExpression, values);
            nextSourceRows.push({
              syncedAt: now,
              sourceKey: connection.sourceKey,
              mappingKey: mapping.mappingKey,
              attendanceNo: student.attendanceNo,
              studentId: student.studentId,
              name: student.name,
              department: mapping.department || connection.department || "",
              label: mapping.label,
              completedValue: completed,
              plannedValue: planned,
              sourceValue: certification,
              reviewStatus: mapping.reviewStatus,
              measurement: mapping.measurement,
              ufolioTargets: mapping.ufolioTargets,
              aggregation: mapping.aggregation,
              priority: Number(mapping.priority || connection.priority || 0),
              status: mapping.reviewStatus === "승인" ? "정상" : "매핑대기",
              stale: false,
            });
          } catch (error) {
            throw new Error("행 " + rowNumber + " / " + mapping.mappingKey + ": " + String(error.message || error));
          }
        });
      });
      snapshotRows = snapshotRows.filter(function (row) { return row.sourceKey !== connection.sourceKey; }).concat(nextSourceRows);
      connectionResults.push({ sourceKey: connection.sourceKey, lastSuccess: now, status: "정상", error: "" });
    } catch (error) {
      var retained = previous.filter(function (row) { return row.sourceKey === connection.sourceKey; }).map(function (row) {
        var stale = case_clone_(row);
        stale.stale = true;
        stale.status = "원본노후";
        return stale;
      });
      snapshotRows = snapshotRows.filter(function (row) { return row.sourceKey !== connection.sourceKey; }).concat(retained);
      var message = String(error.message || error);
      connectionResults.push({ sourceKey: connection.sourceKey, lastSuccess: "", status: retained.length ? "원본노후" : "원본오류", error: message });
      diagnostics.push({ at: now, sourceKey: connection.sourceKey, rowNumber: "", status: retained.length ? "원본노후" : "원본오류", detail: message });
    }
  });

  var unmappedRows = mappings.filter(function (mapping) { return mapping.reviewStatus !== "승인"; }).map(function (mapping) {
    return {
      mappingKey: mapping.mappingKey,
      sourceKey: mapping.sourceKey,
      label: mapping.label,
      reviewStatus: mapping.reviewStatus,
      certificationExpression: mapping.certificationExpression,
      ufolioTargets: mapping.ufolioTargets,
      note: mapping.note || "",
    };
  });

  var winnerByKey = {};
  snapshotRows.forEach(function (row) {
    if (row.reviewStatus !== "승인") return;
    var signature = [row.studentId, row.measurement, String(row.ufolioTargets || "").split(/\r?\n/).sort().join("\n")].join("|");
    var previousWinner = winnerByKey[signature];
    if (!previousWinner || Number(row.priority || 0) > Number(previousWinner.priority || 0)) winnerByKey[signature] = row;
  });

  // 비교결과에는 승인된 매핑만 올린다. 검토필요·보류는 (숨김) 미매핑항목에서만 관리한다.
  var comparisonRows = [];
  snapshotRows.forEach(function (row) {
    if (row.reviewStatus !== "승인") return;
    var signature = [row.studentId, row.measurement, String(row.ufolioTargets || "").split(/\r?\n/).sort().join("\n")].join("|");
    if (winnerByKey[signature] !== row) return;
    var aggregated = case_aggregateUfolio_({
      ufolioTargets: row.ufolioTargets,
      measurement: row.measurement,
      aggregation: row.aggregation,
    }, latestByKey, row.studentId);
    if (case_isBlank_(row.sourceValue) && !aggregated.found) return;
    var comparisonStatus;
    if (row.stale || row.status === "원본노후") comparisonStatus = "원본노후";
    else if (row.status === "원본오류") comparisonStatus = "원본오류";
    else if (!aggregated.found && aggregated.targetFound) comparisonStatus = "U-FOLIO측정값없음";
    else comparisonStatus = case_compareValues_(row.sourceValue, aggregated.found ? aggregated.value : "");
    comparisonRows.push(case_comparisonRow_(row, aggregated, comparisonStatus, latestSubmissionAt[row.studentId] || ""));
  });

  snapshotRows.sort(case_snapshotSort_);
  comparisonRows.sort(case_comparisonSort_);
  unmappedRows.sort(function (left, right) { return String(left.mappingKey).localeCompare(String(right.mappingKey), "ko"); });
  return {
    snapshotRows: snapshotRows,
    comparisonRows: comparisonRows,
    unmappedRows: unmappedRows,
    diagnostics: diagnostics,
    connectionResults: connectionResults,
  };
}

function case_comparisonRow_(row, aggregated, status, latestAuthAt) {
  var authenticated = !!(aggregated && aggregated.targetFound);
  var ufolioValue = aggregated && aggregated.found ? aggregated.value : "";
  return {
    attendanceNo: row.attendanceNo,
    studentId: row.studentId,
    name: row.name,
    department: row.department,
    label: row.label,
    measurement: row.measurement,
    sourceValue: row.sourceValue,
    ufolioValue: ufolioValue,
    ufolioDisplay: authenticated ? ufolioValue : "미인증",
    pendingWait: aggregated ? aggregated.pending : "",
    latestAuthAt: latestAuthAt || "",
    status: status,
    sourceKey: row.sourceKey,
    mappingKey: row.mappingKey,
    syncedAt: row.syncedAt,
  };
}

function case_snapshotSort_(left, right) {
  var leftNo = Number(left.attendanceNo);
  var rightNo = Number(right.attendanceNo);
  if (isFinite(leftNo) && isFinite(rightNo) && leftNo !== rightNo) return leftNo - rightNo;
  return [left.sourceKey, left.mappingKey].join("|").localeCompare([right.sourceKey, right.mappingKey].join("|"), "ko");
}

function case_comparisonSort_(left, right) {
  var leftNo = Number(left.attendanceNo);
  var rightNo = Number(right.attendanceNo);
  if (isFinite(leftNo) && isFinite(rightNo) && leftNo !== rightNo) return leftNo - rightNo;
  return [left.department, left.label].join("|").localeCompare([right.department, right.label].join("|"), "ko");
}

function case_parseSpreadsheetId_(urlOrId) {
  var text = String(urlOrId == null ? "" : urlOrId).trim();
  var match = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(text);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return text;
  throw new Error("Google Sheets URL 또는 ID 형식이 올바르지 않습니다.");
}

function case_readSource_(connection, columns) {
  var source = SpreadsheetApp.openById(case_parseSpreadsheetId_(connection.url));
  var sheet = source.getSheetByName(connection.sheetName);
  if (!sheet) throw new Error("시트를 찾을 수 없습니다: " + connection.sheetName);
  var firstRow = Number(connection.firstDataRow);
  var lastRow = connection.lastDataRow === "" || connection.lastDataRow == null ? sheet.getLastRow() : Number(connection.lastDataRow);
  if (!isFinite(firstRow) || firstRow < 1 || !isFinite(lastRow) || lastRow < firstRow) return [];
  var rowCount = lastRow - firstRow + 1;
  var maxIndex = columns.reduce(function (max, column) { return Math.max(max, case_columnIndex_(column)); }, 0);
  var rows = Array.from({ length: rowCount }, function (_, index) {
    return { rowNumber: firstRow + index, values: Array(maxIndex + 1).fill("") };
  });
  columns.forEach(function (column) {
    var columnIndex = case_columnIndex_(column);
    var values = sheet.getRange(firstRow, columnIndex + 1, rowCount, 1).getValues();
    values.forEach(function (value, rowIndex) { rows[rowIndex].values[columnIndex] = value[0]; });
  });
  return rows;
}

function case_latestUfolioFromRows_(rows) {
  var latest = {};
  rows.forEach(function (row) {
    var key = case_ufolioKey_(row[3], [row[5], row[6], row[7], row[8]]);
    var timestamp = new Date(row[0]).getTime();
    var previous = latest[key];
    if (!previous || timestamp > previous.timestamp) {
      latest[key] = {
        timestamp: isFinite(timestamp) ? timestamp : 0,
        approvedCount: row[9],
        patientCount: row[10],
        score: row[11],
        pendingCount: row[13],
        raw: row,
      };
    }
  });
  return latest;
}

function case_latestSubmissionFromRows_(rows) {
  var latest = {};
  rows.forEach(function (row) {
    var studentId = String(row[3] == null ? "" : row[3]).trim();
    if (!studentId) return;
    var timestamp = new Date(row[0]).getTime();
    if (!isFinite(timestamp)) return;
    var previous = latest[studentId];
    if (!previous || timestamp > previous.getTime()) latest[studentId] = new Date(timestamp);
  });
  return latest;
}

function case_connectionObject_(row) {
  return {
    sourceKey: row[0], active: row[1], department: row[2], displayName: row[3], url: row[4], sheetName: row[5],
    attendanceColumn: row[6], nameColumn: row[7], firstDataRow: row[8], lastDataRow: row[9], priority: row[10], adapter: row[11],
  };
}

function case_mappingObject_(row, departmentBySource) {
  return {
    mappingKey: row[0], active: row[1], reviewStatus: row[2], sourceKey: row[3], department: departmentBySource[row[3]] || "",
    label: row[4], completedExpression: row[5], plannedExpression: row[6], certificationExpression: row[7],
    ufolioTargets: row[8], measurement: row[9], aggregation: row[10], priority: row[11], note: row[12],
  };
}

function case_measurementSettingsFromRows_(rows) {
  var settings = {};
  rows.forEach(function (row) {
    var key = case_itemKey_(row[0], row[1], row[2], row[3]);
    var choice = String(row[4] == null ? "" : row[4]).replace(/\s+/g, "");
    if (!row[0] || !choice) return;
    if (CASE_MEASUREMENT_CHOICES.indexOf(choice) < 0) return;
    settings[key] = choice;
  });
  return settings;
}

function case_snapshotArray_(row) {
  return [row.syncedAt, row.sourceKey, row.mappingKey, row.attendanceNo, row.studentId, row.name, row.department, row.label,
    row.completedValue, row.plannedValue, row.sourceValue, row.reviewStatus, row.measurement, row.ufolioTargets, row.aggregation,
    row.priority, row.status, row.stale ? "Y" : "N"];
}

function case_snapshotObject_(row) {
  return {
    syncedAt: row[0], sourceKey: row[1], mappingKey: row[2], attendanceNo: row[3], studentId: row[4], name: row[5],
    department: row[6], label: row[7], completedValue: row[8], plannedValue: row[9], sourceValue: row[10], reviewStatus: row[11],
    measurement: row[12], ufolioTargets: row[13], aggregation: row[14], priority: row[15], status: row[16], stale: row[17] === "Y",
  };
}

function case_sheetRows_(sheet, width) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

function case_replaceOutput_(sheet, headers, rows) {
  if (!sheet) throw new Error("관리자 시트가 없습니다: " + headers[0]);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), headers.length)).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
}

function case_liveServices_(spreadsheet) {
  var connectionRows = case_sheetRows_(spreadsheet.getSheetByName(CASE_CONNECTION_SHEET), CASE_CONNECTION_HEADERS.length);
  var connections = connectionRows.map(case_connectionObject_);
  var departmentBySource = {};
  connections.forEach(function (row) { departmentBySource[row.sourceKey] = row.department; });
  var mappingRows = case_sheetRows_(spreadsheet.getSheetByName(CASE_MAPPING_SHEET), CASE_MAPPING_HEADERS.length);
  var measurementRows = case_sheetRows_(spreadsheet.getSheetByName(CASE_MEASUREMENT_SHEET), CASE_MEASUREMENT_HEADERS.length);
  var rosterRows = case_sheetRows_(spreadsheet.getSheetByName("학생명단"), 3);
  var rawRows = case_sheetRows_(spreadsheet.getSheetByName("RAW"), 14);
  return {
    now: function () { return new Date(); },
    getConnections: function () { return connections; },
    getMappings: function () { return mappingRows.map(function (row) { return case_mappingObject_(row, departmentBySource); }); },
    getMeasurementSettings: function () { return case_measurementSettingsFromRows_(measurementRows); },
    getRoster: function () { return rosterRows.filter(function (row) { return row[0] !== ""; }).map(function (row) { return { attendanceNo: row[0], studentId: String(row[1]), name: row[2] }; }); },
    getPreviousSnapshot: function () { return case_sheetRows_(spreadsheet.getSheetByName(CASE_SNAPSHOT_SHEET), CASE_SNAPSHOT_HEADERS.length).map(case_snapshotObject_); },
    getLatestUfolio: function () { return case_latestUfolioFromRows_(rawRows); },
    getLatestSubmissionAt: function () { return case_latestSubmissionFromRows_(rawRows); },
    readSource: case_readSource_,
  };
}

function refreshIntegratedData() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var services = case_liveServices_(spreadsheet);
    var result = case_refreshAll_(services);
    case_replaceOutput_(spreadsheet.getSheetByName(CASE_SNAPSHOT_SHEET), CASE_SNAPSHOT_HEADERS, result.snapshotRows.map(case_snapshotArray_));
    var latest = services.getLatestUfolio();
    var latestRows = Object.keys(latest).map(function (key) { return latest[key].raw; }).sort(function (left, right) { return new Date(right[0]).getTime() - new Date(left[0]).getTime(); });
    case_replaceOutput_(spreadsheet.getSheetByName(CASE_UFOLIO_LATEST_SHEET), RAW_HEADERS, latestRows);
    case_replaceOutput_(spreadsheet.getSheetByName(CASE_COMPARISON_SHEET), CASE_COMPARISON_HEADERS, result.comparisonRows.map(function (row) {
      return [row.attendanceNo, row.studentId, row.name, row.department, row.label, row.measurement, row.sourceValue,
        row.ufolioDisplay, row.pendingWait, row.latestAuthAt];
    }));
    case_replaceOutput_(spreadsheet.getSheetByName(CASE_UNMAPPED_SHEET), CASE_UNMAPPED_HEADERS, result.unmappedRows.map(function (row) {
      return [row.mappingKey, row.sourceKey, row.label, row.reviewStatus, row.certificationExpression, row.ufolioTargets, row.note];
    }));
    case_replaceOutput_(spreadsheet.getSheetByName(CASE_DIAGNOSTIC_SHEET), CASE_DIAGNOSTIC_HEADERS, result.diagnostics.map(function (row) {
      return [row.at, row.sourceKey, row.rowNumber, row.status, row.detail];
    }));
    case_updateConnectionStatuses_(spreadsheet, result.connectionResults);
    var normalCount = result.connectionResults.filter(function (row) { return row.status === "정상"; }).length;
    var failedCount = result.connectionResults.length - normalCount;
    var log = spreadsheet.getSheetByName(CASE_SYNC_LOG_SHEET);
    log.getRange(log.getLastRow() + 1, 1, 1, CASE_SYNC_LOG_HEADERS.length).setValues([[
      new Date(), normalCount, failedCount, result.snapshotRows.length, result.comparisonRows.length, failedCount ? "일부실패" : "성공",
    ]]);
    dash_updateDashboard_(spreadsheet);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function case_updateConnectionStatuses_(spreadsheet, results) {
  var sheet = spreadsheet.getSheetByName(CASE_CONNECTION_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CASE_CONNECTION_HEADERS.length).getValues();
  var byKey = {};
  results.forEach(function (result) { byKey[result.sourceKey] = result; });
  rows.forEach(function (row) {
    var result = byKey[row[0]];
    if (!result) return;
    if (result.lastSuccess) row[12] = result.lastSuccess;
    row[13] = result.status;
    row[14] = result.error;
  });
  sheet.getRange(2, 1, rows.length, CASE_CONNECTION_HEADERS.length).setValues(rows);
}

function validateCaseConnections() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var rows = case_sheetRows_(spreadsheet.getSheetByName(CASE_CONNECTION_SHEET), CASE_CONNECTION_HEADERS.length).map(case_connectionObject_);
  var results = [];
  var diagnostics = [];
  rows.filter(function (row) { return String(row.active).toUpperCase() === "Y"; }).forEach(function (connection) {
    try {
      var source = SpreadsheetApp.openById(case_parseSpreadsheetId_(connection.url));
      if (!source.getSheetByName(connection.sheetName)) throw new Error("시트를 찾을 수 없습니다: " + connection.sheetName);
      results.push({ sourceKey: connection.sourceKey, lastSuccess: "", status: "연결정상", error: "" });
    } catch (error) {
      var message = String(error.message || error);
      results.push({ sourceKey: connection.sourceKey, lastSuccess: "", status: "원본오류", error: message });
      diagnostics.push([new Date(), connection.sourceKey, "", "원본오류", message]);
    }
  });
  case_updateConnectionStatuses_(spreadsheet, results);
  case_replaceOutput_(spreadsheet.getSheetByName(CASE_DIAGNOSTIC_SHEET), CASE_DIAGNOSTIC_HEADERS, diagnostics);
}
