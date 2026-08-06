var RAW_SHEET = "RAW";
var ROSTER_SHEET = "학생명단";
var LOG_SHEET = "전송기록";
var MASTER_SHEET = "마스터항목";
var MAX_ITEMS = 5000;

var RAW_HEADERS = [
  "수신시각",
  "전송 ID",
  "출석번호",
  "학번",
  "이름",
  "실습차수",
  "과",
  "메뉴/구분",
  "항목",
  "승인 수",
  "환자 수",
  "점수",
  "점수 원문",
];
var ROSTER_HEADERS = ["출석번호", "학번", "이름"];
var MASTER_HEADERS = [
  "활성",
  "실습차수",
  "과",
  "메뉴/구분",
  "항목",
  "수기대상",
  "비교기준",
  "수기표시명",
];
var LOG_HEADERS = [
  "수신시각",
  "전송 ID",
  "출석번호",
  "학번",
  "이름",
  "항목 수",
  "상태",
  "상세 사유",
];

function setupSheets() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var roster = ensureSheet_(spreadsheet, ROSTER_SHEET, ROSTER_HEADERS);
  ensureSheet_(spreadsheet, MASTER_SHEET, MASTER_HEADERS);
  var raw = ensureSheet_(spreadsheet, RAW_SHEET, RAW_HEADERS);
  ensureSheet_(spreadsheet, LOG_SHEET, LOG_HEADERS);
  roster.getRange("B:B").setNumberFormat("@");
  raw.getRange("D:D").setNumberFormat("@");
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function doPost(e) {
  var services = createSheetServices_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var payload;
    try {
      payload = JSON.parse((e && e.postData && e.postData.contents) || "");
    } catch (error) {
      var malformed = {
        ok: false,
        error: "JSON 요청을 읽지 못했습니다.",
      };
      services.appendLogRow([
        services.now(),
        "",
        "",
        "",
        "",
        0,
        "거부",
        malformed.error,
      ]);
      return jsonOutput_(malformed);
    }

    try {
      return jsonOutput_(processSubmission_(payload, services));
    } catch (error) {
      var student = payload && payload.student ? payload.student : {};
      var rejected = { ok: false, error: String(error.message || error) };
      services.appendLogRow([
        services.now(),
        safeCellText_(payload && payload.submissionId),
        "",
        safeCellText_(student.studentId),
        safeCellText_(student.name),
        Array.isArray(payload && payload.items) ? payload.items.length : 0,
        "거부",
        safeCellText_(rejected.error),
      ]);
      return jsonOutput_(rejected);
    }
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function createSheetServices_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var roster = spreadsheet.getSheetByName(ROSTER_SHEET);
  var master = spreadsheet.getSheetByName(MASTER_SHEET);
  var raw = spreadsheet.getSheetByName(RAW_SHEET);
  var log = spreadsheet.getSheetByName(LOG_SHEET);
  if (!roster || !master || !raw || !log) {
    throw new Error("필수 시트가 없습니다. setupSheets()를 먼저 실행하세요.");
  }

  return {
    now: function () {
      return new Date();
    },
    getRosterRows: function () {
      if (roster.getLastRow() < 2) return [];
      return roster.getRange(2, 1, roster.getLastRow() - 1, 3).getValues();
    },
    getMasterRows: function () {
      if (master.getLastRow() < 2) return [];
      return master.getRange(2, 1, master.getLastRow() - 1, 8).getValues();
    },
    appendRawRows: function (rows) {
      raw.getRange(raw.getLastRow() + 1, 1, rows.length, RAW_HEADERS.length).setValues(rows);
    },
    appendLogRow: function (row) {
      log.getRange(log.getLastRow() + 1, 1, 1, LOG_HEADERS.length).setValues([row]);
    },
  };
}

function processSubmission_(payload, services) {
  var clean = validatePayload_(payload);
  var rosterRows = services.getRosterRows();
  var rosterById = {};

  rosterRows.forEach(function (row) {
    var studentId = String(row[1] == null ? "" : row[1]).trim();
    if (!studentId) return;
    if (rosterById[studentId]) {
      throw new Error("학생명단에 중복 학번이 있습니다: " + studentId);
    }
    rosterById[studentId] = {
      attendanceNo: row[0],
      name: normalizeName_(row[2]),
    };
  });

  var matched = rosterById[clean.student.studentId];
  if (!matched) {
    return rejectSubmission_(clean, services, "학생명단에 없는 학번입니다.");
  }
  if (matched.name !== normalizeName_(clean.student.name)) {
    return rejectSubmission_(clean, services, "학번과 이름이 학생명단과 일치하지 않습니다.");
  }

  var allowedItems = {};
  services.getMasterRows().forEach(function (row) {
    if (String(row[0]).trim().toUpperCase() !== "Y") return;
    allowedItems[masterKey_(row[1], row[2], row[3], row[4])] = true;
  });
  if (Object.keys(allowedItems).length === 0) {
    return rejectSubmission_(clean, services, "활성화된 마스터항목이 없습니다.");
  }
  var unknownItems = clean.items.filter(function (item) {
    return !allowedItems[masterKey_(item.practiceName, item.departmentName, item.menuName, item.itemName)];
  });
  if (unknownItems.length > 0) {
    var preview = unknownItems.slice(0, 3).map(function (item) {
      return item.departmentName + " / " + item.menuName + " / " + item.itemName;
    }).join(", ");
    return rejectSubmission_(clean, services, "마스터항목에 없는 항목이 포함되어 있습니다: " + preview);
  }

  var receivedAt = services.now();
  var rawRows = clean.items.map(function (item) {
    return [
      receivedAt,
      safeCellText_(clean.submissionId),
      matched.attendanceNo,
      safeCellText_(clean.student.studentId),
      safeCellText_(clean.student.name),
      safeCellText_(item.practiceName),
      safeCellText_(item.departmentName),
      safeCellText_(item.menuName),
      safeCellText_(item.itemName),
      item.approvedCount == null ? "" : item.approvedCount,
      item.patientCount == null ? "" : item.patientCount,
      item.score == null ? "" : item.score,
      safeCellText_(item.scoreRaw),
    ];
  });

  services.appendRawRows(rawRows);
  services.appendLogRow([
    receivedAt,
    safeCellText_(clean.submissionId),
    matched.attendanceNo,
    safeCellText_(clean.student.studentId),
    safeCellText_(clean.student.name),
    clean.items.length,
    "성공",
    "",
  ]);

  return {
    ok: true,
    submissionId: clean.submissionId,
    attendanceNo: matched.attendanceNo,
    itemCount: clean.items.length,
  };
}

function rejectSubmission_(clean, services, reason) {
  services.appendLogRow([
    services.now(),
    safeCellText_(clean.submissionId),
    "",
    safeCellText_(clean.student.studentId),
    safeCellText_(clean.student.name),
    clean.items.length,
    "거부",
    safeCellText_(reason),
  ]);
  return { ok: false, error: reason };
}

function validatePayload_(payload) {
  if (!payload || payload.schemaVersion !== 1) {
    throw new Error("schemaVersion은 1이어야 합니다.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(payload.submissionId || ""))) {
    throw new Error("submissionId 형식이 올바르지 않습니다.");
  }
  if (!payload.student || !/^\d{4}-\d{5}$/.test(String(payload.student.studentId || ""))) {
    throw new Error("학번 형식이 올바르지 않습니다.");
  }

  var name = requiredText_(payload.student.name, "이름", 40);
  var practices = Array.isArray(payload.practices)
    ? payload.practices.map(function (value) {
        return requiredText_(value, "실습차수", 150);
      })
    : [];
  if (practices.length === 0 || practices.length > 50) {
    throw new Error("실습차수 목록이 올바르지 않습니다.");
  }
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > MAX_ITEMS) {
    throw new Error("항목 수는 1개 이상 5000개 이하여야 합니다.");
  }

  var items = payload.items.map(function (item) {
    if (!item || typeof item !== "object") {
      throw new Error("항목 형식이 올바르지 않습니다.");
    }
    return {
      practiceName: requiredText_(item.practiceName, "실습차수", 150),
      departmentName: requiredText_(item.departmentName, "과", 150),
      menuName: limitedText_(item.menuName, "메뉴/구분", 200),
      itemName: requiredText_(item.itemName, "항목", 500),
      approvedCount: nullableFiniteNumber_(item.approvedCount, "승인 수"),
      patientCount: nullableFiniteNumber_(item.patientCount, "환자 수"),
      score: nullableFiniteNumber_(item.score, "점수"),
      scoreRaw: limitedText_(item.scoreRaw, "점수 원문", 100),
    };
  });

  return {
    schemaVersion: 1,
    submissionId: String(payload.submissionId),
    clientSentAt: limitedText_(payload.clientSentAt, "클라이언트 전송시각", 50),
    student: {
      studentId: String(payload.student.studentId),
      name: name,
    },
    practices: practices,
    items: items,
  };
}

function normalizeName_(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

function masterKey_(practiceName, departmentName, menuName, itemName) {
  return [practiceName, departmentName, menuName, itemName]
    .map(function (value) {
      return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
    })
    .join("|");
}

function requiredText_(value, label, maxLength) {
  var text = limitedText_(value, label, maxLength);
  if (!text.trim()) throw new Error(label + " 값이 없습니다.");
  return text;
}

function limitedText_(value, label, maxLength) {
  var text = String(value == null ? "" : value);
  if (text.length > maxLength) throw new Error(label + " 값이 너무 깁니다.");
  return text;
}

function nullableFiniteNumber_(value, label) {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !isFinite(value)) {
    throw new Error(label + " 값이 숫자가 아닙니다.");
  }
  return value;
}

function safeCellText_(value) {
  var text = String(value == null ? "" : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
