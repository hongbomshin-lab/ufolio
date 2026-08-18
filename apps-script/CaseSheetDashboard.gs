var DASH_SHEET = "대시보드";
var DASH_CHART_SHEET = "차트데이터";
var DASH_HEADER_ROW = 12;
var DASH_NAME_ROW = 13;
var DASH_FIRST_DATA_ROW = 14;
var DASH_FIXED_COLUMNS = 6;
var DASH_CHECK_COLUMN = 6;
var DASH_CHART_MAX_ROWS = 30;
var DASH_PANEL_LABELS = [
  "선택한 항목", "측정값", "평균 ± 표준편차", "중앙값 (상위 50% 경계)",
  "상위 25% 경계 (이상이면 상위 25%)", "하위 25% 경계 (이하면 하위 25%)",
  "인증 보낸 인원", "안 보낸 인원",
];
var DASH_COLORS = {
  navy: "#17365D",
  blue: "#2F75B5",
  paleBlue: "#D9EAF7",
  paleYellow: "#FFF2CC",
  paleGray: "#E7E6E6",
  white: "#FFFFFF",
};

// 조건 검색 패널: 차트(G1 앵커, 폭 620px ≈ G~T열) 오른쪽인 V열부터 11행까지.
// 기준값·조건은 X열(병합 X:Y)에 입력받고, 학생 목록은 V5:AS11 한 칸에 뿌린다.
var DASH_FILTER_COLUMN = 22;
var DASH_FILTER_INPUT_COLUMN = 24;
var DASH_FILTER_LAST_COLUMN = 45;
var DASH_FILTER_VALUE_ROW = 2;
var DASH_FILTER_MODE_ROW = 3;
var DASH_FILTER_COUNT_ROW = 4;
var DASH_FILTER_LIST_ROW = 5;
var DASH_FILTER_MODES = ["이상", "이하"];
var DASH_FILTER_HINT = "항목의 [그래프] 체크박스를 누른 뒤 기준값을 입력하세요. 값이 비어 있는(미인증) 학생은 세지 않습니다.";
var DASH_FILTER_EMPTY = "먼저 항목의 [그래프] 체크박스를 누르세요.";

// "01강민수" 처럼 출석번호를 2자리로 채워 이름 앞에 붙인다. (100번은 그대로 3자리)
function dash_studentLabel_(attendanceNo, name) {
  var text = String(attendanceNo == null ? "" : attendanceNo).trim();
  var number = Number(text);
  var padded = text !== "" && isFinite(number) ? (number < 10 ? "0" + number : String(number)) : text;
  return padded + String(name == null ? "" : name).trim();
}

// 기준값 이상/이하인 학생만 골라 인원수와 목록 문자열을 만든다. 값이 없는 학생은 대상에서 뺀다.
// 기준값이 비었거나 숫자가 아니면 null (= 아직 검색 조건이 없음).
function dash_filterStudents_(values, numbers, names, threshold, mode) {
  if (case_isBlank_(threshold)) return null;
  var limit = Number(threshold);
  if (!isFinite(limit)) return null;
  var atMost = String(mode == null ? "" : mode).trim() === "이하";
  var matched = [];
  (values || []).forEach(function (value, index) {
    if (case_isBlank_(value)) return;
    var number = Number(value);
    if (!isFinite(number)) return;
    if (atMost ? number > limit : number < limit) return;
    matched.push(dash_studentLabel_((numbers || [])[index], (names || [])[index]));
  });
  return { count: matched.length, list: matched.join(", ") };
}

// 외과·보철은 현황시트와 매칭된 항목만 유폴리오에서 받아온다(북마클릿이 나머지를 아예 안 보냄).
// 그래서 미매핑 항목 행은 영원히 빈칸으로 남아 "아무도 안 한 항목"처럼 보인다. 두 과는 매핑된 항목만 그린다.
var DASH_MAPPED_ONLY_DEPARTMENTS = ["구강악안면외과", "보철과"];

function dash_visibleItems_(items, mappingRows) {
  var mapped = {};
  (mappingRows || []).forEach(function (row) {
    if (String(row[1]).toUpperCase() !== "Y" || row[2] !== "승인") return;
    String(row[8] || "").split(/\r?\n/).forEach(function (line) {
      var parts = line.split("|");
      if (parts.length === 4) mapped[case_itemKey_(parts[0], parts[1], parts[2], parts[3])] = true;
    });
  });
  return (items || []).filter(function (entry) {
    if (DASH_MAPPED_ONLY_DEPARTMENTS.indexOf(entry.department) < 0) return true;
    return !!mapped[case_itemKey_(entry.practice, entry.department, entry.menu, entry.item)];
  });
}

// 유폴리오 최신 제출 기준: 마스터 항목(행) × 학생(열) 값 매트릭스.
// 각 항목의 값은 측정값설정 시트에서 고른 측정값(승인수/환자수/점수)을 따른다.
function dash_buildMatrix_(items, students, latestByKey, settings, submittedAt) {
  var sorted = students.slice().sort(function (left, right) {
    var leftNo = Number(left.attendanceNo);
    var rightNo = Number(right.attendanceNo);
    if (isFinite(leftNo) && isFinite(rightNo)) return leftNo - rightNo;
    return String(left.attendanceNo).localeCompare(String(right.attendanceNo), "ko");
  });
  var studentColumns = sorted.map(function (student) {
    return {
      attendanceNo: student.attendanceNo,
      name: student.name,
      submitted: !!(submittedAt && submittedAt[String(student.studentId)]),
    };
  });
  var rows = items.map(function (entry) {
    var key = case_itemKey_(entry.practice, entry.department, entry.menu, entry.item);
    var measurement = (settings && settings[key]) || entry.fallbackMeasurement || "승인수";
    var sum = 0;
    var count = 0;
    var values = sorted.map(function (student) {
      var record = latestByKey[case_ufolioKey_(String(student.studentId), [entry.practice, entry.department, entry.menu, entry.item])];
      if (!record) return "";
      var value = case_recordMetric_(record, measurement);
      if (case_isBlank_(value)) return "";
      var number = case_numericValue_(value);
      sum += number;
      count += 1;
      return number;
    });
    return {
      department: entry.department,
      menu: entry.menu,
      item: entry.item,
      measurement: measurement,
      average: count > 0 ? sum / count : "",
      submittedCount: count,
      values: values,
    };
  });
  return { students: studentColumns, rows: rows };
}

// 평균·표준편차·사분위 요약. 값이 하나도 없으면 null.
function dash_stats_(values) {
  var numbers = [];
  (values || []).forEach(function (value) {
    if (case_isBlank_(value)) return;
    var number = Number(value);
    if (isFinite(number)) numbers.push(number);
  });
  if (numbers.length === 0) return null;
  numbers.sort(function (left, right) { return left - right; });
  var mean = numbers.reduce(function (sum, value) { return sum + value; }, 0) / numbers.length;
  var variance = numbers.reduce(function (sum, value) { return sum + (value - mean) * (value - mean); }, 0) / numbers.length;
  function quantile(p) {
    var position = (numbers.length - 1) * p;
    var low = Math.floor(position);
    var high = Math.ceil(position);
    return numbers[low] + (numbers[high] - numbers[low]) * (position - low);
  }
  return {
    numbers: numbers, count: numbers.length, mean: mean, sd: Math.sqrt(variance),
    median: quantile(0.5), q1: quantile(0.25), q3: quantile(0.75),
    min: numbers[0], max: numbers[numbers.length - 1],
  };
}

function dash_round_(value) {
  return Math.round(value * 100) / 100;
}

// 값별 인원 분포. 승인수처럼 소수의 작은 정수 값이면 정확한 값별로,
// 점수처럼 넓게 퍼진 값이면 보기 좋은 폭(1/2/2.5/5×10^k)의 구간(range)으로 묶어 분포가 한눈에 보이게 한다.
function dash_distribution_(values) {
  var stats = dash_stats_(values);
  if (!stats) return [];
  var numbers = stats.numbers;
  var counts = {};
  numbers.forEach(function (number) { counts[number] = (counts[number] || 0) + 1; });
  var distinct = Object.keys(counts).map(Number).sort(function (left, right) { return left - right; });
  var smallIntegers = distinct.length <= 6 && stats.max - stats.min <= 10 &&
    distinct.every(function (value) { return value === Math.round(value); });
  if (smallIntegers || stats.max === stats.min) {
    return distinct.map(function (value) { return [String(value), counts[value]]; });
  }
  // 목표 구간 수 ≈ √n (5~10개), 구간 폭은 1/2/2.5/5×10^k 중 가장 가까운 값으로 올림.
  var target = Math.max(5, Math.min(10, Math.ceil(Math.sqrt(numbers.length)) + 2));
  var rawWidth = (stats.max - stats.min) / target;
  var magnitude = Math.pow(10, Math.floor(Math.log(rawWidth) / Math.LN10));
  var width = [1, 2, 2.5, 5, 10].map(function (multiplier) { return multiplier * magnitude; })
    .filter(function (candidate) { return candidate >= rawWidth - 1e-9; })[0] || 10 * magnitude;
  var start = Math.floor(stats.min / width) * width;
  var binCount = Math.floor((stats.max - start) / width) + 1;
  var bins = Array.from({ length: binCount }, function () { return 0; });
  numbers.forEach(function (number) {
    bins[Math.min(binCount - 1, Math.floor((number - start) / width))] += 1;
  });
  return bins.map(function (count, index) {
    var from = start + width * index;
    return [dash_round_(from) + "~" + dash_round_(from + width), count];
  });
}

function dash_updateDashboard_(spreadsheet) {
  var masterRows = case_sheetRows_(spreadsheet.getSheetByName("마스터항목"), 8)
    .filter(function (row) { return row[1] !== "" && row[2] !== "" && row[4] !== ""; });
  var items = dash_visibleItems_(
    masterRows.map(function (row) {
      return { practice: row[1], department: row[2], menu: row[3], item: row[4], fallbackMeasurement: String(row[6] || "").trim() || "승인수" };
    }),
    case_sheetRows_(spreadsheet.getSheetByName(CASE_MAPPING_SHEET), CASE_MAPPING_HEADERS.length),
  );
  var students = case_sheetRows_(spreadsheet.getSheetByName("학생명단"), 3)
    .filter(function (row) { return row[0] !== ""; })
    .map(function (row) { return { attendanceNo: row[0], studentId: String(row[1]), name: row[2] }; });
  var rawRows = case_sheetRows_(spreadsheet.getSheetByName("RAW"), 14);
  var latestByKey = case_latestUfolioFromRows_(rawRows);
  var submittedAt = case_latestSubmissionFromRows_(rawRows);
  var settings = case_measurementSettingsFromRows_(
    case_sheetRows_(spreadsheet.getSheetByName(CASE_MEASUREMENT_SHEET), CASE_MEASUREMENT_HEADERS.length),
  );
  var matrix = dash_buildMatrix_(items, students, latestByKey, settings, submittedAt);
  dash_writeDashboard_(spreadsheet, matrix);
}

function dash_writeDashboard_(spreadsheet, matrix) {
  var sheet = spreadsheet.getSheetByName(DASH_SHEET) || spreadsheet.insertSheet(DASH_SHEET);
  var chartData = spreadsheet.getSheetByName(DASH_CHART_SHEET) || spreadsheet.insertSheet(DASH_CHART_SHEET);
  var studentCount = matrix.students.length;
  var columnCount = DASH_FIXED_COLUMNS + Math.max(1, studentCount);
  var lastColumn = Math.max(columnCount, DASH_FILTER_LAST_COLUMN); // 조건 검색 패널이 쓰는 AS열까지 확보
  var rowCount = DASH_FIRST_DATA_ROW - 1 + Math.max(1, matrix.rows.length);
  if (sheet.getMaxColumns() < lastColumn) sheet.insertColumnsAfter(sheet.getMaxColumns(), lastColumn - sheet.getMaxColumns());
  if (sheet.getMaxRows() < rowCount + 5) sheet.insertRowsAfter(sheet.getMaxRows(), rowCount + 5 - sheet.getMaxRows());
  // clear() 는 병합을 풀지 않는다. 조건 검색 패널을 다시 병합하려면 먼저 윗단(1~11행)을 해제해야 한다.
  sheet.getRange(1, 1, DASH_HEADER_ROW - 1, sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.getRange(1, DASH_CHECK_COLUMN, sheet.getMaxRows(), 1).clearDataValidations();
  sheet.getRange(1, DASH_FILTER_INPUT_COLUMN, DASH_HEADER_ROW - 1, 1).clearDataValidations();

  sheet.getRange(1, 1).setValue("유폴리오 대시보드").setFontSize(15).setFontWeight("bold").setFontColor(DASH_COLORS.navy);
  sheet.getRange(2, 1).setValue("항목의 [그래프] 체크박스를 눌러야 선택됩니다. 오른쪽 위에 분포 그래프와 조건별 학생 찾기가 함께 표시됩니다.")
    .setFontColor("#666666");

  sheet.getRange(3, 1, DASH_PANEL_LABELS.length, 1).setValues(DASH_PANEL_LABELS.map(function (label) { return [label]; }))
    .setFontWeight("bold").setBackground(DASH_COLORS.paleBlue);
  sheet.getRange(3, 2, DASH_PANEL_LABELS.length, 1).setBackground(DASH_COLORS.paleYellow);
  sheet.getRange(3, 2).setValue("항목의 그래프 체크박스를 누르세요");
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 190);
  sheet.setColumnWidth(3, 280);
  sheet.setColumnWidth(4, 66);
  sheet.setColumnWidth(5, 60);

  var numberHeader = ["과", "메뉴/구분", "항목", "측정값", "평균", "그래프"];
  var nameHeader = ["", "", "", "", "", "이름 →"];
  var numberBackgrounds = [DASH_COLORS.blue, DASH_COLORS.blue, DASH_COLORS.blue, DASH_COLORS.blue, DASH_COLORS.blue, DASH_COLORS.blue];
  matrix.students.forEach(function (student) {
    numberHeader.push(student.attendanceNo);
    nameHeader.push(student.name);
    numberBackgrounds.push(student.submitted ? DASH_COLORS.blue : DASH_COLORS.paleGray);
  });
  while (numberHeader.length < columnCount) { numberHeader.push(""); nameHeader.push(""); numberBackgrounds.push(DASH_COLORS.blue); }
  sheet.getRange(DASH_HEADER_ROW, 1, 1, columnCount).setValues([numberHeader])
    .setBackgrounds([numberBackgrounds]).setFontColor(DASH_COLORS.white).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange(DASH_NAME_ROW, 1, 1, columnCount).setValues([nameHeader])
    .setBackgrounds([numberBackgrounds]).setFontColor(DASH_COLORS.white).setFontSize(8).setHorizontalAlignment("center").setWrap(true);
  matrix.students.forEach(function (student, index) {
    if (!student.submitted) {
      sheet.getRange(DASH_HEADER_ROW, DASH_FIXED_COLUMNS + 1 + index, 2, 1).setFontColor("#444444");
    }
  });

  if (matrix.rows.length > 0) {
    var body = matrix.rows.map(function (row) {
      var line = [row.department, row.menu, row.item, row.measurement, row.average, false].concat(row.values);
      while (line.length < columnCount) line.push("");
      return line;
    });
    sheet.getRange(DASH_FIRST_DATA_ROW, 1, body.length, columnCount).setValues(body);
    sheet.getRange(DASH_FIRST_DATA_ROW, 5, body.length, 1).setNumberFormat("0.##").setBackground(DASH_COLORS.paleYellow).setFontWeight("bold");
    sheet.getRange(DASH_FIRST_DATA_ROW, DASH_CHECK_COLUMN, body.length, 1).insertCheckboxes().setHorizontalAlignment("center");
    if (columnCount > DASH_FIXED_COLUMNS) {
      sheet.getRange(DASH_FIRST_DATA_ROW, DASH_FIXED_COLUMNS + 1, body.length, columnCount - DASH_FIXED_COLUMNS).setNumberFormat("0.##");
    }
  }
  sheet.setColumnWidth(DASH_CHECK_COLUMN, 52);
  for (var column = DASH_FIXED_COLUMNS + 1; column <= lastColumn; column += 1) sheet.setColumnWidth(column, 46);
  // 행은 고정하지 않는다 — Google Sheets는 고정 행 영역 안에 차트를 둘 수 없어서,
  // 13행을 고정하면 차트가 14행 아래로 밀려나고 위로 올릴 수도 없다. (열 6개 고정은 유지)
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(DASH_FIXED_COLUMNS);
  sheet.setHiddenGridlines(true);

  dash_writeFilterPanel_(sheet);
  dash_resetChartData_(spreadsheet);
  dash_setSelectedRow_(spreadsheet, 0); // 항목 행 번호가 바뀌므로 이전 선택은 버린다
  dash_ensureChart_(sheet, chartData);
}

function dash_chartDataSheet_(spreadsheet) {
  return spreadsheet.getSheetByName(DASH_CHART_SHEET) || spreadsheet.insertSheet(DASH_CHART_SHEET);
}

function dash_resetChartData_(spreadsheet) {
  var chartData = dash_chartDataSheet_(spreadsheet);
  chartData.getRange(1, 1, DASH_CHART_MAX_ROWS + 1, 2).clearContent();
  chartData.getRange(1, 1, 1, 2).setValues([["값", "인원"]]);
  return chartData;
}

// 선택한 항목의 행 번호는 (숨김) 차트데이터 D1 에 적어 둔다.
// 조건 검색은 체크박스를 누른 뒤에도 실행되므로 "지금 어느 항목이 선택돼 있는지"를 따로 기억해야 한다.
function dash_setSelectedRow_(spreadsheet, row) {
  dash_chartDataSheet_(spreadsheet).getRange("D1").setValue(row || "");
}

function dash_getSelectedRow_(spreadsheet) {
  var value = Number(dash_chartDataSheet_(spreadsheet).getRange("D1").getValue());
  return isFinite(value) && value >= DASH_FIRST_DATA_ROW ? value : 0;
}

// 학생 열은 G열부터 빈칸 없이 이어진다. 조건 검색 패널이 V열 위쪽을 쓰므로 getLastColumn 은 못 믿는다.
function dash_studentColumnCount_(sheet) {
  var width = Math.max(0, sheet.getLastColumn() - DASH_FIXED_COLUMNS);
  if (width === 0) return 0;
  var header = sheet.getRange(DASH_HEADER_ROW, DASH_FIXED_COLUMNS + 1, 1, width).getValues()[0];
  var count = 0;
  while (count < header.length && !case_isBlank_(header[count])) count += 1;
  return count;
}

function dash_writeFilterPanel_(sheet) {
  var first = DASH_FILTER_COLUMN;
  var input = DASH_FILTER_INPUT_COLUMN;
  var width = DASH_FILTER_LAST_COLUMN - first + 1;
  sheet.getRange(1, first, 1, width).merge().setValue("조건별 학생 찾기 — 체크한 항목 기준")
    .setBackground(DASH_COLORS.navy).setFontColor(DASH_COLORS.white).setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  [["기준값 입력", DASH_FILTER_VALUE_ROW], ["조건", DASH_FILTER_MODE_ROW], ["해당 인원", DASH_FILTER_COUNT_ROW]]
    .forEach(function (entry) {
      sheet.getRange(entry[1], first, 1, input - first).merge().setValue(entry[0])
        .setFontWeight("bold").setBackground(DASH_COLORS.paleBlue)
        .setHorizontalAlignment("center").setVerticalAlignment("middle");
      sheet.getRange(entry[1], input, 1, 2).merge()
        .setHorizontalAlignment("center").setVerticalAlignment("middle");
    });
  sheet.getRange(DASH_FILTER_VALUE_ROW, input).setBackground(DASH_COLORS.paleYellow).setNumberFormat("0.##");
  sheet.getRange(DASH_FILTER_MODE_ROW, input).setBackground(DASH_COLORS.paleYellow).setValue(DASH_FILTER_MODES[0])
    .setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(DASH_FILTER_MODES, true).setAllowInvalid(false).build(),
    );
  sheet.getRange(DASH_FILTER_COUNT_ROW, input).setBackground(DASH_COLORS.paleBlue).setFontWeight("bold");
  sheet.getRange(DASH_FILTER_VALUE_ROW, input + 2, 3, DASH_FILTER_LAST_COLUMN - input - 1).merge()
    .setValue(DASH_FILTER_HINT).setWrap(true).setVerticalAlignment("middle").setFontColor("#666666");
  sheet.getRange(DASH_FILTER_LIST_ROW, first, DASH_HEADER_ROW - DASH_FILTER_LIST_ROW, width).merge()
    .setValue(DASH_FILTER_EMPTY).setWrap(true)
    .setHorizontalAlignment("left").setVerticalAlignment("top");
}

// 기준값·조건 셀이 바뀌거나 다른 항목을 고를 때마다 인원수와 학생 목록을 다시 쓴다.
function dash_applyFilter_(sheet) {
  var spreadsheet = sheet.getParent();
  var selectedRow = dash_getSelectedRow_(spreadsheet);
  var studentCount = dash_studentColumnCount_(sheet);
  var result = null;
  if (selectedRow && studentCount > 0) {
    result = dash_filterStudents_(
      sheet.getRange(selectedRow, DASH_FIXED_COLUMNS + 1, 1, studentCount).getValues()[0],
      sheet.getRange(DASH_HEADER_ROW, DASH_FIXED_COLUMNS + 1, 1, studentCount).getValues()[0],
      sheet.getRange(DASH_NAME_ROW, DASH_FIXED_COLUMNS + 1, 1, studentCount).getValues()[0],
      sheet.getRange(DASH_FILTER_VALUE_ROW, DASH_FILTER_INPUT_COLUMN).getValue(),
      sheet.getRange(DASH_FILTER_MODE_ROW, DASH_FILTER_INPUT_COLUMN).getValue(),
    );
  }
  var listText = DASH_FILTER_EMPTY;
  if (selectedRow) listText = result ? (result.list || "조건에 해당하는 학생이 없습니다.") : "기준값을 입력하세요.";
  sheet.getRange(DASH_FILTER_COUNT_ROW, DASH_FILTER_INPUT_COLUMN).setValue(result ? result.count + "명" : "");
  sheet.getRange(DASH_FILTER_LIST_ROW, DASH_FILTER_COLUMN).setValue(listText);
}

// 차트 앵커 = G1 (최상단). 행 고정이 없어야 이 위치에 실제로 놓인다 (dash_writeDashboard_ 참조).
// 높이 230px ≈ 11행이라 12~13행 헤더는 가리지 않는다.
var DASH_CHART_ANCHOR_COLUMN = 7;

function dash_ensureChart_(sheet, chartData) {
  var existing = null;
  sheet.getCharts().forEach(function (chart) {
    if (!existing && chart.getRanges().length > 0) { existing = chart; return; }
    sheet.removeChart(chart); // 데이터 범위 없는 빈 차트·중복 차트 정리
  });
  if (existing) {
    sheet.updateChart(existing.modify().setPosition(1, DASH_CHART_ANCHOR_COLUMN, 0, 0).build());
    return;
  }
  var chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(chartData.getRange(1, 1, DASH_CHART_MAX_ROWS + 1, 2))
    .setPosition(1, DASH_CHART_ANCHOR_COLUMN, 0, 0)
    .setOption("title", "항목의 [그래프] 체크박스를 누르세요")
    .setOption("legend", { position: "none" })
    .setOption("width", 620)
    .setOption("height", 230)
    .build();
  sheet.insertChart(chart);
}

// F열 체크박스와 조건 검색 입력에만 반응하는 단순 트리거.
// 행을 클릭했다고 선택되지는 않는다(onSelectionChange 없음) — 스크롤·복사 중에 선택이 바뀌면 곤란하다.
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== DASH_SHEET) return;
    var row = range.getRow();
    var column = range.getColumn();
    if (column === DASH_CHECK_COLUMN && row >= DASH_FIRST_DATA_ROW) {
      if (range.getValue() !== true) return;
      dash_selectItem_(sheet, row);
      range.setValue(false);
      return;
    }
    if (column === DASH_FILTER_INPUT_COLUMN && (row === DASH_FILTER_VALUE_ROW || row === DASH_FILTER_MODE_ROW)) {
      dash_applyFilter_(sheet);
    }
  } catch (error) {
    // 편집 이벤트는 실패해도 조용히 넘어간다.
  }
}

function dash_selectItem_(sheet, row) {
  var spreadsheet = sheet.getParent();
  var studentCount = dash_studentColumnCount_(sheet);
  var rowValues = sheet.getRange(row, 1, 1, DASH_FIXED_COLUMNS + Math.max(1, studentCount)).getValues()[0];
  var studentValues = rowValues.slice(DASH_FIXED_COLUMNS, DASH_FIXED_COLUMNS + studentCount);
  var submitted = studentValues.filter(function (value) { return !case_isBlank_(value); }).length;
  var total = studentCount;
  var stats = dash_stats_(studentValues);
  sheet.getRange(3, 2, DASH_PANEL_LABELS.length, 1).setValues([
    [rowValues[0] + " · " + rowValues[2]],
    [rowValues[3]],
    [stats ? dash_round_(stats.mean) + " ± " + dash_round_(stats.sd) : ""],
    [stats ? dash_round_(stats.median) : ""],
    [stats ? dash_round_(stats.q3) : ""],
    [stats ? dash_round_(stats.q1) : ""],
    [submitted],
    [Math.max(0, total - submitted)],
  ]);
  var chartData = dash_resetChartData_(spreadsheet);
  var distribution = dash_distribution_(studentValues);
  if (distribution.length > 0) chartData.getRange(2, 1, distribution.length, 2).setValues(distribution);
  var chart = sheet.getCharts()[0];
  if (chart) {
    var title = rowValues[0] + "-" + rowValues[2] + " (" + rowValues[3] + ")";
    if (stats) title += " · 평균 " + dash_round_(stats.mean) + " · 표준편차 " + dash_round_(stats.sd);
    sheet.updateChart(chart.modify().setOption("title", title).build());
  }
  dash_setSelectedRow_(spreadsheet, row);
  dash_applyFilter_(sheet);
}
