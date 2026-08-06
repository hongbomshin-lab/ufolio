var CASE_FORMULA_ERROR_PATTERN = /^#(?:REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)$/i;

function case_normalizeName_(value) {
  return String(value == null ? "" : value).replace(/\s+/g, "").trim();
}

function case_isBlank_(value) {
  return value == null || value === "";
}

function case_columnIndex_(reference) {
  var text = String(reference == null ? "" : reference).trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(text)) throw new Error("올바르지 않은 열 참조입니다: " + text);
  var index = 0;
  for (var i = 0; i < text.length; i += 1) index = index * 26 + text.charCodeAt(i) - 64;
  return index - 1;
}

function case_rangeIndexes_(reference) {
  var parts = String(reference == null ? "" : reference).trim().split(":");
  if (parts.length !== 2) throw new Error("올바르지 않은 열 범위입니다: " + reference);
  var start = case_columnIndex_(parts[0]);
  var end = case_columnIndex_(parts[1]);
  if (start > end) throw new Error("열 범위의 시작이 끝보다 큽니다: " + reference);
  return [start, end];
}

function case_assertSourceValue_(value) {
  if (typeof value === "string" && CASE_FORMULA_ERROR_PATTERN.test(value.trim())) {
    throw new Error("원본 수식 오류: " + value.trim());
  }
  if (typeof value === "number" && !isFinite(value)) throw new Error("원본 값은 유한한 숫자여야 합니다.");
}

function case_numericValue_(value) {
  case_assertSourceValue_(value);
  if (case_isBlank_(value)) return "";
  var number = typeof value === "number" ? value : Number(String(value).trim());
  if (!isFinite(number)) throw new Error("원본 값은 유한한 숫자여야 합니다: " + value);
  return number;
}

function case_valueAt_(rowValues, reference) {
  var index = case_columnIndex_(reference);
  var value = index < rowValues.length ? rowValues[index] : "";
  case_assertSourceValue_(value);
  return value;
}

function case_valuesInRange_(rowValues, reference) {
  var indexes = case_rangeIndexes_(reference);
  var values = [];
  for (var index = indexes[0]; index <= indexes[1]; index += 1) {
    var value = index < rowValues.length ? rowValues[index] : "";
    case_assertSourceValue_(value);
    values.push(value);
  }
  return values;
}

function case_evaluateExpression_(expression, rowValues) {
  var text = String(expression == null ? "" : expression).trim();
  var match = /^([A-Z_]+)\((.*)\)$/.exec(text);
  if (!match) throw new Error("지원하지 않는 집계식입니다: " + text);
  var operation = match[1];
  var argumentText = match[2].trim();
  var values = Array.isArray(rowValues) ? rowValues : [];

  if (operation === "VALUE") return case_numericValue_(case_valueAt_(values, argumentText));
  if (operation === "NUMBER_OR_ZERO") {
    var numberOrBlank = case_numericValue_(case_valueAt_(values, argumentText));
    return numberOrBlank === "" ? 0 : numberOrBlank;
  }
  if (operation === "NONEMPTY_AS_ONE") {
    var oneValue = case_valueAt_(values, argumentText);
    return case_isBlank_(oneValue) ? "" : 1;
  }
  if (operation === "SUM") {
    var sumArguments = argumentText.split(",").map(function (value) { return value.trim(); });
    if (sumArguments.length < 1 || sumArguments.some(function (value) { return !value; })) {
      throw new Error("SUM 집계식의 열 참조가 비어 있습니다.");
    }
    var sawNumber = false;
    var sum = sumArguments.reduce(function (total, reference) {
      var numeric = case_numericValue_(case_valueAt_(values, reference));
      if (numeric === "") return total;
      sawNumber = true;
      return total + numeric;
    }, 0);
    return sawNumber ? sum : "";
  }
  if (operation === "COUNT_NONEMPTY") {
    return case_valuesInRange_(values, argumentText).filter(function (value) { return !case_isBlank_(value); }).length;
  }
  if (operation === "COUNT_STATUS") {
    var separator = argumentText.indexOf(",");
    if (separator < 0) throw new Error("COUNT_STATUS에는 열 범위와 상태가 필요합니다.");
    var rangeReference = argumentText.slice(0, separator).trim();
    var wanted = argumentText.slice(separator + 1).trim();
    if (!wanted) throw new Error("COUNT_STATUS 상태가 비어 있습니다.");
    return case_valuesInRange_(values, rangeReference).filter(function (value) {
      return String(value == null ? "" : value).trim() === wanted;
    }).length;
  }
  throw new Error("지원하지 않는 집계식입니다: " + text);
}

function case_compareValues_(sourceValue, ufolioValue) {
  var sourceBlank = case_isBlank_(sourceValue);
  var ufolioBlank = case_isBlank_(ufolioValue);
  if (sourceBlank && ufolioBlank) return "일치";
  if (ufolioBlank) return "유폴리오미인증";
  if (sourceBlank) return "현황누락의심";
  var sourceNumber;
  var ufolioNumber;
  try {
    sourceNumber = case_numericValue_(sourceValue);
    ufolioNumber = case_numericValue_(ufolioValue);
  } catch (error) {
    return "원본오류";
  }
  if (Math.abs(sourceNumber - ufolioNumber) < 0.000000001) return "일치";
  return sourceNumber > ufolioNumber ? "반영대기" : "현황누락의심";
}

function case_normalizeKeyPart_(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

function case_ufolioKey_(studentId, target) {
  return [studentId].concat(target).map(case_normalizeKeyPart_).join("|");
}

function case_recordMetric_(record, measurement) {
  var normalized = String(measurement == null ? "" : measurement).replace(/\s+/g, "");
  if (Array.isArray(record)) {
    if (normalized === "승인수") return record[9];
    if (normalized === "환자수") return record[10];
    if (normalized === "점수") return record[11];
  } else if (record && typeof record === "object") {
    if (normalized === "승인수") return record.approvedCount;
    if (normalized === "환자수") return record.patientCount;
    if (normalized === "점수") return record.score;
  }
  throw new Error("지원하지 않는 U-FOLIO 측정값입니다: " + measurement);
}

function case_aggregateUfolio_(mapping, latestByKey, studentId) {
  var targetText = String(mapping && mapping.ufolioTargets || "").trim();
  var targetLines = targetText ? targetText.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean) : [];
  if (targetLines.length === 0) return { found: false, value: "" };
  var numbers = [];
  targetLines.forEach(function (line) {
    var target = line.split("|").map(function (part) { return part.trim(); });
    if (target.length !== 4 || target.some(function (part) { return !part; })) {
      throw new Error("U-FOLIO 대상은 실습차수|과|메뉴/구분|항목 형식이어야 합니다: " + line);
    }
    var record = latestByKey[case_ufolioKey_(studentId, target)];
    if (!record) return;
    var value = case_recordMetric_(record, mapping.measurement);
    if (case_isBlank_(value)) return;
    numbers.push(case_numericValue_(value));
  });
  if (numbers.length === 0) return { found: false, value: "" };
  var aggregation = String(mapping && mapping.aggregation || "SUM").trim().toUpperCase();
  if (aggregation === "SUM") return { found: true, value: numbers.reduce(function (sum, value) { return sum + value; }, 0) };
  if (aggregation === "MAX") return { found: true, value: Math.max.apply(null, numbers) };
  if (aggregation === "FIRST") return { found: true, value: numbers[0] };
  throw new Error("지원하지 않는 U-FOLIO 집계 방식입니다: " + aggregation);
}
