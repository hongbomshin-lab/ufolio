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

// 현황시트에서 읽어온 값이 공란이면 0으로 본다. 식이 지정된 이상 "아직 안 적음"도 0건으로 취급하기로 했다.
// 여기서 한 번만 변환하면 집계식 7종에 모두 적용되고, 관리자가 나중에 추가하는 매핑도 자동으로 따른다.
// 되돌리려면 이 래퍼를 없애고 case_evaluateExpressionRaw_ 를 다시 case_evaluateExpression_ 로 부르면 된다.
function case_evaluateExpression_(expression, rowValues) {
  var evaluated = case_evaluateExpressionRaw_(expression, rowValues);
  return evaluated === "" ? 0 : evaluated;
}

function case_evaluateExpressionRaw_(expression, rowValues) {
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
  if (operation === "HAS_STATUS_O") {
    var rawStatusValue = case_valueAt_(values, argumentText);
    var statusValue = String(rawStatusValue == null ? "" : rawStatusValue).trim();
    if (!statusValue) return "";
    return /(^|[^A-Z0-9가-힣])O([^A-Z0-9가-힣]|$)/i.test(statusValue) ? 1 : "";
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

function case_recordPending_(record) {
  if (Array.isArray(record)) return record[13];
  if (record && typeof record === "object") return record.pendingCount;
  return "";
}

function case_aggregateUfolio_(mapping, latestByKey, studentId) {
  var targetText = String(mapping && mapping.ufolioTargets || "").trim();
  var targetLines = targetText ? targetText.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean) : [];
  if (targetLines.length === 0) return { found: false, targetFound: false, value: "", pending: "" };
  var numbers = [];
  var targetFound = false;
  var pendingSum = 0;
  targetLines.forEach(function (line) {
    var target = line.split("|").map(function (part) { return part.trim(); });
    if (target.length !== 4 || target.some(function (part) { return !part; })) {
      throw new Error("U-FOLIO 대상은 실습차수|과|메뉴/구분|항목 형식이어야 합니다: " + line);
    }
    var record = latestByKey[case_ufolioKey_(studentId, target)];
    if (!record) return;
    targetFound = true;
    var pendingValue = case_recordPending_(record);
    if (!case_isBlank_(pendingValue)) pendingSum += case_numericValue_(pendingValue);
    var value = case_recordMetric_(record, mapping.measurement);
    if (case_isBlank_(value)) return;
    numbers.push(case_numericValue_(value));
  });
  var pending = targetFound ? pendingSum : "";
  if (numbers.length === 0) return { found: false, targetFound: targetFound, value: "", pending: pending };
  var aggregation = String(mapping && mapping.aggregation || "SUM").trim().toUpperCase();
  if (aggregation === "SUM") return { found: true, targetFound: true, value: numbers.reduce(function (sum, value) { return sum + value; }, 0), pending: pending };
  if (aggregation === "MAX") return { found: true, targetFound: true, value: Math.max.apply(null, numbers), pending: pending };
  if (aggregation === "FIRST") return { found: true, targetFound: true, value: numbers[0], pending: pending };
  throw new Error("지원하지 않는 U-FOLIO 집계 방식입니다: " + aggregation);
}

function case_itemKey_(practice, department, menu, item) {
  return [practice, department, menu, item].map(case_normalizeKeyPart_).join("|");
}

function case_firstTargetKey_(ufolioTargets) {
  var line = String(ufolioTargets == null ? "" : ufolioTargets).split(/\r?\n/).map(function (value) { return value.trim(); }).filter(Boolean)[0];
  if (!line) return "";
  return line.split("|").map(case_normalizeKeyPart_).join("|");
}

var CASE_MEASUREMENT_CHOICES = ["승인수", "환자수", "점수"];

// 측정값설정 시트가 매핑의 측정값보다 우선한다. 대상이 여러 항목인 매핑은 첫 항목의 설정을 따른다.
function case_effectiveMeasurement_(mapping, settings) {
  var key = case_firstTargetKey_(mapping && mapping.ufolioTargets);
  var chosen = key && settings ? settings[key] : "";
  if (chosen && CASE_MEASUREMENT_CHOICES.indexOf(String(chosen).replace(/\s+/g, "")) >= 0) {
    return String(chosen).replace(/\s+/g, "");
  }
  return String(mapping && mapping.measurement || "승인수").replace(/\s+/g, "") || "승인수";
}
