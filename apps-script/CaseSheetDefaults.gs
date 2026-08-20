var CASE_CONNECTION_HEADERS = [
  "소스키",
  "활성",
  "과",
  "표시명",
  "스프레드시트 URL",
  "시트명",
  "출석번호 열",
  "이름 열",
  "데이터 시작행",
  "데이터 종료행",
  "우선순위",
  "어댑터",
  "마지막 성공",
  "상태",
  "오류",
];

var CASE_MAPPING_HEADERS = [
  "매핑키",
  "활성",
  "검토상태",
  "소스키",
  "현황표시명",
  "완료식",
  "예정식",
  "인증대상식",
  "U-FOLIO 대상",
  "측정값",
  "집계방식",
  "우선순위",
  "비고",
];

var CASE_PRACTICE = "3학년 치의학 임상실습 2";

function case_target_(department, menu, item) {
  return [CASE_PRACTICE, department, menu, item].join("|");
}

function case_defaultConnections_() {
  return [
    ["CONS_SCORE", "Y", "보존과", "[보존] 유폴 인증 점수", "", "점수판", "A", "B", 3, "", 70, "CONFIG", "", "URL입력필요", ""],
    ["CONS_SURGERY", "Y", "보존과", "[보존] 수술 현황", "", "점수표", "A", "B", 3, "", 90, "CONFIG", "", "URL입력필요", ""],
    ["PED_CHART", "Y", "소아치과", "[소치] 차팅 현황", "", "차팅 현황", "A", "B", 3, "", 80, "CONFIG", "", "URL입력필요", ""],
    ["PERIO", "Y", "치주과", "[치주] 원내생 현황", "", "현황", "A", "B", 4, "", 80, "CONFIG", "", "URL입력필요", ""],
    ["OM", "Y", "구강내과", "구강내과 케이스 현황", "", "원내생케이스", "A", "B", 5, "", 80, "CONFIG", "", "URL입력필요", ""],
    ["EXT", "Y", "구강악안면외과", "발치 프랙 현황", "", "발치 프랙 현황", "A", "B", 3, "", 100, "CONFIG", "", "URL입력필요", ""],
    ["IMPLANT", "N", "구강악안면외과", "임플란트 현황", "", "임플 현황", "A", "B", 3, "", 90, "CONFIG", "", "보류", "과거 학년·예시 자료이므로 비활성"],
    ["PATH", "Y", "구강병리과", "구강병리 케이스 현황", "", "병리과 현황", "A", "B", 4, "", 60, "CONFIG", "", "URL입력필요", ""],
    ["PROS", "Y", "보철과", "보철과 원내생 현황", "", "현황 시트", "A", "B", 5, 96, 60, "CONFIG", "", "URL입력필요", ""],
    ["OMS", "Y", "구강악안면외과", "외과 케이스 현황", "", "케이스 현황", "A", "B", 3, 94, 70, "CONFIG", "", "URL입력필요", ""],
    ["OMS_STAGE", "Y", "구강악안면외과", "Biopsy 및 I&D 단계 현황", "", "시트1", "A", "B", 3, "", 60, "CONFIG", "", "URL입력필요", ""],
    ["ORTHO", "Y", "교정과", "[교정] 케이스 현황", "", "현황 시트", "A", "B", 4, "", 60, "CONFIG", "", "URL입력필요", ""],
    ["RADIO", "Y", "영상치의학과", "[영상] 케이스 현황", "", "💀케이스현황", "A", "B", 5, "", 60, "CONFIG", "", "URL입력필요", ""],
    ["PROS_TOTAL", "Y", "보철과", "[보철] 개인별토탈 Total 현황", "", "Total 현황시트", "A", "B", 4, "", 50, "CONFIG", "", "URL입력필요", ""],
    ["PROS_CHART", "Y", "보철과", "[보철] 차팅 케이스 현황", "", "시트1", "A", "B", 4, 95, 50, "CONFIG", "", "URL입력필요", "96행부터는 평균 등 요약행"],
  ];
}

function case_mapping_(key, review, sourceKey, label, completed, planned, certification, targets, measurement, aggregation, priority, note) {
  return [key, "Y", review, sourceKey, label, completed, planned, certification, targets, measurement, aggregation, priority, note || ""];
}

function case_defaultMappings_() {
  var om = "구강내과";
  var cons = "보존과";
  var ped = "소아치과";
  var perio = "치주과";
  var oms = "구강악안면외과";
  var path = "구강병리과";
  var pros = "보철과";
  var ortho = "교정과";
  var radio = "영상치의학과";
  return [
    case_mapping_("CONS_OBS_CHART", "승인", "CONS_SCORE", "Observation Charting", "VALUE(C)", "", "VALUE(C)", case_target_(cons, "증례별 임상참여", "Observation (Charting) case"), "점수", "SUM", 70, "점수판 관찰 점수"),
    case_mapping_("CONS_OBS_ENDO", "승인", "CONS_SCORE", "Observation Endodontics", "VALUE(D)", "", "VALUE(D)", case_target_(cons, "증례별 임상참여", "Observation (Endodontics) case"), "점수", "SUM", 70, "점수판 관찰 점수"),
    case_mapping_("CONS_OBS_OPER", "승인", "CONS_SCORE", "Observation Operative", "VALUE(E)", "", "VALUE(E)", case_target_(cons, "증례별 임상참여", "Observation (Operative) case"), "점수", "SUM", 70, "점수판 관찰 점수"),
    (function () {
      var row = case_mapping_("CONS_OBS_SURG_SCORE", "보류", "CONS_SCORE", "Observation Surgery", "VALUE(F)", "", "VALUE(F)", case_target_(cons, "증례별 임상참여", "Observation (Surgery) case"), "점수", "SUM", 70, "전용 수술 현황 W열과 같은 실적이므로 중복 방지를 위해 비활성");
      row[1] = "N";
      return row;
    })(),
    case_mapping_("CONS_OBS_SURG", "승인", "CONS_SURGERY", "보존 수술 누적", "VALUE(W)", "", "VALUE(W)", case_target_(cons, "증례별 임상참여", "Observation (Surgery) case"), "점수", "SUM", 90, "전용 수술표 우선"),
    case_mapping_("CONS_ASSIST", "승인", "CONS_SCORE", "단타 assist 보존과", "VALUE(G)", "", "VALUE(G)", case_target_(cons, "증례별 임상참여", "단타 assist(보존과)"), "점수", "SUM", 70, ""),
    case_mapping_("CONS_CENTER_ASSIST", "승인", "CONS_SCORE", "단타 assist 원내생센터", "VALUE(H)", "", "VALUE(H)", case_target_(cons, "증례별 임상참여", "단타 assist(원내생진료센터 assist)"), "점수", "SUM", 70, ""),
    case_mapping_("CONS_RESIN_STAGE", "승인", "CONS_SCORE", "Resin 완료 점수", "VALUE(I)", "", "VALUE(I)", [case_target_(cons, "증례별 임상참여", "Composite restoration(3급/4급)(practice)"), case_target_(cons, "증례별 임상참여", "Composite restoration(practice)"), case_target_(cons, "증례별 임상참여", "Composite restortion(2급)(Practice)")].join("\n"), "점수", "SUM", 50, "세 레진 practice 항목 점수 합계와 비교"),
    case_mapping_("CONS_ENDO_STAGE", "승인", "CONS_SCORE", "Endo 완료 점수", "VALUE(J)", "", "VALUE(J)", case_target_(cons, "증례별 임상참여", "Endodontic treatment(practice)"), "점수", "SUM", 50, "완료 점수 비교"),

    case_mapping_("PED_CHARTING", "승인", "PED_CHART", "소아 차팅 누적", "VALUE(D)", "", "VALUE(D)", case_target_(ped, "증례별 임상참여", "practice - Charting (교수님/전공의 진료 참여)"), "승인수", "SUM", 80, "비어 있지 않은 차팅 건수"),

    case_mapping_("PERIO_FLAP", "승인", "PERIO", "Flap 완료", "VALUE(C)", "VALUE(D)", "VALUE(C)", case_target_(perio, "증례별 임상참여", "Flap Assist"), "승인수", "SUM", 80, "예정(D) 제외한 3-2 완료(C)만 비교"),
    case_mapping_("PERIO_IMPLANT", "승인", "PERIO", "Implant 완료", "VALUE(F)", "VALUE(G)", "VALUE(F)", case_target_(perio, "증례별 임상참여", "Implant Assist"), "승인수", "SUM", 80, "예정(G) 제외한 3-2 완료(F)만 비교"),
    case_mapping_("PERIO_BASIC", "승인", "PERIO", "OE+SC+PCI", "VALUE(I)", "", "VALUE(I)", [case_target_(perio, "증례별 임상참여", "Oral examination"), case_target_(perio, "증례별 임상참여", "Scaling"), case_target_(perio, "증례별 임상참여", "Plaque control instruction")].join("\n"), "승인수", "SUM", 80, "3개 항목 합계"),
    case_mapping_("PERIO_RP", "승인", "PERIO", "Root planing", "VALUE(J)", "", "VALUE(J)", case_target_(perio, "증례별 임상참여", "Root planing"), "승인수", "SUM", 80, ""),

    case_mapping_("OM_CHARTING", "승인", "OM", "Charting 유폴리오 기준", "VALUE(C)", "", "VALUE(C)", case_target_(om, "증례별 임상참여", "Charting"), "환자수", "SUM", 80, "유폴리오 기준 열; 환자수 비교"),
    case_mapping_("OM_TMD_CHARTING", "승인", "OM", "TMD Charting", "VALUE(E)", "", "VALUE(E)", case_target_(om, "증례별 임상참여", "TMD Charting"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_MED", "승인", "OM", "Medical certificate", "VALUE(F)", "", "VALUE(F)", case_target_(om, "증례별 임상참여", "Medical certificate"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_LAB", "승인", "OM", "Lab reading and Report", "VALUE(G)", "", "VALUE(G)", case_target_(om, "증례별 임상참여", "Lab reading & Report"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_OTHERS", "승인", "OM", "Others", "VALUE(H)", "", "VALUE(H)", case_target_(om, "증례별 임상참여", "Others (REPORTS etc.)"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_PT", "승인", "OM", "Physical therapy 완료+예정 점수", "VALUE(I)", "VALUE(J)", "SUM(I,J)", case_target_(om, "증례별 임상참여", "Physical therapy"), "점수", "SUM", 80, "완료와 앞으로 시행할 예정 점수를 합산"),
    case_mapping_("OM_TMD", "승인", "OM", "TMD observation", "VALUE(K)", "", "VALUE(K)", case_target_(om, "증례별 임상참여", "Orofacial pain & TMD observation"), "환자수", "SUM", 80, ""),
    case_mapping_("OM_SOFT", "승인", "OM", "Soft tissue lesion", "VALUE(L)", "", "VALUE(L)", case_target_(om, "증례별 임상참여", "Soft tissue lesion observation"), "환자수", "SUM", 80, ""),
    case_mapping_("OM_HALITOSIS", "승인", "OM", "Halitosis", "VALUE(M)", "", "VALUE(M)", case_target_(om, "증례별 임상참여", "Halitosis observation"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_SNORING", "승인", "OM", "Snoring", "VALUE(N)", "", "VALUE(N)", case_target_(om, "증례별 임상참여", "Snoring & sleep apnea observation"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_IMPRESSION", "승인", "OM", "Impression taking", "VALUE(O)", "", "VALUE(O)", case_target_(om, "기공", "Impression taking & Model fabrication"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_SPLINT_DEL", "승인", "OM", "Splint delivery", "VALUE(P)", "", "VALUE(P)", case_target_(om, "증례별 임상참여", "Splint delivery observation"), "환자수", "SUM", 80, "환자수 비교"),
    case_mapping_("OM_SPLINT_FAB", "승인", "OM", "Splint fabrication", "VALUE(Q)", "", "VALUE(Q)", case_target_(om, "기공", "Splint fabrication"), "환자수", "SUM", 80, "환자수 비교"),

    case_mapping_("EXT_SIMPLE", "승인", "EXT", "Simple extraction", "VALUE(C)", "", "VALUE(C)", case_target_(oms, "증례별 임상참여", "Extraction_[P]_simple extraction"), "승인수", "SUM", 100, "전용 발치표"),
    case_mapping_("EXT_SURGICAL", "승인", "EXT", "Surgical extraction", "VALUE(D)", "", "VALUE(D)", case_target_(oms, "증례별 임상참여", "Extraction_[P]_surgical extraction"), "승인수", "SUM", 100, "전용 발치표"),
    case_mapping_("EXT_TOTAL", "승인", "EXT", "Extraction P 합계", "VALUE(E)", "", "VALUE(E)", [case_target_(oms, "증례별 임상참여", "Extraction_[P]_simple extraction"), case_target_(oms, "증례별 임상참여", "Extraction_[P]_surgical extraction")].join("\n"), "승인수", "SUM", 100, "전용 발치표 우선"),
    (function () {
      var row = case_mapping_("IMPLANT_TOTAL", "보류", "IMPLANT", "과거 학년 Implant Assist", "VALUE(C)", "", "VALUE(C)", [case_target_(oms, "증례별 임상참여", "Implant 1st op. (2개 이하 식립)_[A]"), case_target_(oms, "증례별 임상참여", "Implant 1st op (3개 이상 식립)_[A]")].join("\n"), "승인수", "SUM", 90, "과거 학년·예시 자료이며 원본은 식립 개수를 구분하지 않아 비활성");
      row[1] = "N";
      return row;
    })(),

    case_mapping_("OMS_MALIGNANT", "승인", "OMS", "Malignant surgery", "VALUE(C)", "", "VALUE(C)", case_target_(oms, "증례별 임상참여", "수술실-Malignant tumor and/or reconstruction surgery(free flap)"), "승인수", "SUM", 70, "말리컨"),
    case_mapping_("OMS_ORTHO", "승인", "OMS", "Orthognathic surgery", "VALUE(D)", "", "VALUE(D)", case_target_(oms, "증례별 임상참여", "수술실-Maxillofacial deformity and orthognathic surgery"), "승인수", "SUM", 70, "양악"),
    case_mapping_("OMS_CYST", "승인", "OMS", "Cyst major", "VALUE(E)", "", "VALUE(E)", case_target_(oms, "증례별 임상참여", "수술실-Cyst and benign tumor surgery"), "승인수", "SUM", 70, "수술실 Cyst"),
    case_mapping_("OMS_SURG_EXT", "승인", "OMS", "수술실 Surgical extraction", "VALUE(F)", "", "VALUE(F)", case_target_(oms, "증례별 임상참여", "수술실-Surgical extraction"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_OTHER_SURGERY", "승인", "OMS", "기타 수술", "VALUE(G)", "", "VALUE(G)", case_target_(oms, "증례별 임상참여", "수술실-기타"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_EXT_A", "승인", "OMS", "Extraction A", "VALUE(H)", "", "VALUE(H)", case_target_(oms, "증례별 임상참여", "Extraction_[A]"), "승인수", "SUM", 70, "승인 건수 비교"),
    (function () {
      var row = case_mapping_("OMS_I_D", "보류", "OMS", "I and D 요약", "VALUE(I)", "", "VALUE(I)", case_target_(oms, "증례별 임상참여", "I & D"), "승인수", "SUM", 70, "단계별 현황표가 더 정확하므로 중복 방지를 위해 비활성");
      row[1] = "N";
      return row;
    })(),
    (function () {
      var row = case_mapping_("OMS_BIOPSY", "보류", "OMS", "Biopsy 요약", "VALUE(J)", "", "VALUE(J)", case_target_(oms, "증례별 임상참여", "Biopsy"), "승인수", "SUM", 70, "단계별 현황표가 더 정확하므로 중복 방지를 위해 비활성");
      row[1] = "N";
      return row;
    })(),
    case_mapping_("OMS_LAVAGE", "승인", "OMS", "Lavage", "VALUE(L)", "", "VALUE(L)", case_target_(oms, "증례별 임상참여", "턱관절강 세정술"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_EXT_TOTAL", "승인", "OMS", "Extraction P 합계", "VALUE(P)", "VALUE(O)", "VALUE(P)", [case_target_(oms, "증례별 임상참여", "Extraction_[P]_simple extraction"), case_target_(oms, "증례별 임상참여", "Extraction_[P]_surgical extraction")].join("\n"), "승인수", "SUM", 70, "전용 발치표보다 낮은 우선순위"),
    case_mapping_("OMS_RECALL_MAJOR", "승인", "OMS", "Major recall", "VALUE(Q)", "", "VALUE(Q)", case_target_(oms, "증례별 임상참여", "외래 Recall check major"), "환자수", "SUM", 70, "외과 확인: 승인수가 아니라 환자수로 비교"),
    case_mapping_("OMS_RECALL_MINOR", "승인", "OMS", "Minor recall", "VALUE(R)", "", "VALUE(R)", case_target_(oms, "증례별 임상참여", "외래 Recall check minor"), "환자수", "SUM", 70, "외과 확인: 승인수가 아니라 환자수로 비교"),
    case_mapping_("OMS_NEW_CHART", "승인", "OMS", "신환 차팅", "VALUE(S)", "", "VALUE(S)", case_target_(oms, "증례별 임상참여", "외래 신환 차팅"), "환자수", "SUM", 70, "외과 확인: 승인수가 아니라 환자수로 비교"),
    case_mapping_("OMS_WARD", "승인", "OMS", "병동", "VALUE(U)", "", "VALUE(U)", case_target_(oms, "증례별 임상참여", "병동 및 당직"), "점수", "SUM", 70, ""),
    case_mapping_("OMS_LAB", "승인", "OMS", "기공", "VALUE(V)", "", "VALUE(V)", case_target_(oms, "기공", "모델 제작 (악당)"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_IMPLANT_A", "승인", "OMS", "Implant A", "VALUE(K)", "", "VALUE(K)", [case_target_(oms, "증례별 임상참여", "Implant 1st op. (2개 이하 식립)_[A]"), case_target_(oms, "증례별 임상참여", "Implant 1st op (3개 이상 식립)_[A]")].join("\n"), "승인수", "SUM", 70, "원본이 식립 개수를 구분하지 않아 두 A 항목 합산"),

    case_mapping_("PATH_LEDGER", "승인", "PATH", "장부작성", "HAS_STATUS_O(D)", "", "HAS_STATUS_O(D)", case_target_(path, "전 임상실습", "구강병리학적 검사 의뢰서 작성"), "승인수", "SUM", 60, "독립된 O 또는 날짜+O만 인정"),
    case_mapping_("PATH_DIAGNOSIS", "승인", "PATH", "진단 참여", "HAS_STATUS_O(E)", "", "HAS_STATUS_O(E)", case_target_(path, "증례별 임상참여", "육안 검사 및 진단 준비 참여"), "승인수", "SUM", 60, "독립된 O 또는 날짜+O만 인정"),

    case_mapping_("PROS_REMOVABLE", "승인", "PROS", "가철 누적", "VALUE(D)", "VALUE(E)", "VALUE(G)", case_target_(pros, "Total Case", "Total case evaluation (가철성)"), "승인수", "SUM", 60, "예정 포함 누적"),
    case_mapping_("PROS_FIXED", "승인", "PROS", "고정 누적", "VALUE(H)", "VALUE(J)", "VALUE(K)", case_target_(pros, "Total Case", "Total case evaluation (고정성)"), "승인수", "SUM", 60, "예정 포함 누적"),
    case_mapping_("PROS_IMPLANT", "승인", "PROS", "Implant 누적", "VALUE(L)", "VALUE(M)", "VALUE(N)", case_target_(pros, "Total Case", "Total case evaluation (Implant)"), "승인수", "SUM", 60, "예정 포함 누적"),
    case_mapping_("PROS_IMPLANT_ASSIST", "승인", "PROS", "임수 누적", "VALUE(O)", "VALUE(P)", "VALUE(Q)", case_target_(pros, "증례별 임상참여", "03. Implant assist"), "승인수", "SUM", 60, "예정 포함 누적"),
    case_mapping_("PROS_CHARTING", "승인", "PROS", "Charting", "VALUE(S)", "", "VALUE(S)", case_target_(pros, "증례별 임상참여", "22. Charting"), "승인수", "SUM", 60, "차팅 건수"),
    case_mapping_("PROS_DIAG_TOTAL", "승인", "PROS", "진토", "VALUE(T)", "", "VALUE(T)", case_target_(pros, "Total Case", "Charting and Treatment planning evaluation"), "승인수", "SUM", 60, "22~25 단계 묶음 Total case"),
    case_mapping_("PROS_STUDENT_EVAL", "승인", "PROS", "단타", "VALUE(U)", "", "VALUE(U)", case_target_(pros, "증례별 임상참여", "01. Student evaluation"), "점수", "SUM", 60, "어시 시간 기반 점수"),
    case_mapping_("PROS_FACULTY_OBS", "승인", "PROS", "교픽", "VALUE(V)", "", "VALUE(V)", case_target_(pros, "증례별 임상참여", "02. observation (교수님)"), "점수", "SUM", 60, "교수 진료 observation 점수"),
    case_mapping_("PROS_LAB", "승인", "PROS", "기공 승인 건수", "VALUE(X)", "", "VALUE(X)", [case_target_(pros, "기공", "[가철성]Laboratory case evaluation"), case_target_(pros, "기공", "[고정성]Laboratory case evaluation"), case_target_(pros, "기공", "[임플란트]Laboratory case evaluation")].join("\n"), "승인수", "SUM", 60, "X열은 세 기공 항목의 승인 건수 합계"),
    case_mapping_("PROS_LAB_SCORE", "승인", "PROS", "기공 점수", "VALUE(Y)", "", "VALUE(Y)", [case_target_(pros, "기공", "[가철성]Laboratory case evaluation"), case_target_(pros, "기공", "[고정성]Laboratory case evaluation"), case_target_(pros, "기공", "[임플란트]Laboratory case evaluation")].join("\n"), "점수", "SUM", 60, "Y열은 세 기공 항목의 점수 합계"),

    case_mapping_("OMS_STAGE_BIOPSY", "승인", "OMS_STAGE", "Biopsy 단계 완료", "COUNT_NONEMPTY(D:E)", "", "COUNT_NONEMPTY(D:E)", [case_target_(oms, "증례별 임상참여", "Biopsy"), case_target_(oms, "증례별 임상참여", "follow-up(Biopsy)")].join("\n"), "승인수", "SUM", 60, "report 열 제외"),
    case_mapping_("OMS_STAGE_I_D", "승인", "OMS_STAGE", "I&D 단계 완료", "COUNT_NONEMPTY(H:J)", "", "COUNT_NONEMPTY(H:J)", [case_target_(oms, "증례별 임상참여", "I & D"), case_target_(oms, "증례별 임상참여", "follow-up(I&D) 2nd or 3rd visit")].join("\n"), "승인수", "SUM", 60, "1st·2nd·3rd 각각 1건; 2nd·3rd는 follow-up 승인 합계 2건"),
    case_mapping_("OMS_STAGE_BIOPSY_TOTAL", "승인", "OMS_STAGE", "Biopsy report 완료", "NONEMPTY_AS_ONE(F)", "", "NONEMPTY_AS_ONE(F)", case_target_(oms, "Total Case", "Biopsy"), "승인수", "SUM", 60, "F열 값은 report 사인 완료를 뜻하며 Total Case 승인 1건과 비교"),
    case_mapping_("OMS_STAGE_I_D_TOTAL", "승인", "OMS_STAGE", "I&D report 완료", "NONEMPTY_AS_ONE(K)", "", "NONEMPTY_AS_ONE(K)", case_target_(oms, "Total Case", "I & D"), "승인수", "SUM", 60, "K열 값은 report 사인 완료를 뜻하며 Total Case 승인 1건과 비교"),

    case_mapping_("ORTHO_DIAG_TOTAL", "승인", "ORTHO", "진토 완료", "VALUE(E)", "", "VALUE(E)", case_target_(ortho, "증례별 임상참여", "Analysis & Diagnosis Case"), "승인수", "SUM", 60, "진단 total 완료 건수와 진단 승인수 비교"),
    case_mapping_("ORTHO_BONDING_TOTAL", "승인", "ORTHO", "본토 완료", "VALUE(H)", "", "VALUE(H)", case_target_(ortho, "Total Case", "Total Case(신환)"), "승인수", "SUM", 60, "본딩 total 완료 건수와 신환 Total Case 승인수 비교"),
    case_mapping_("ORTHO_BONDING_ASSIST", "승인", "ORTHO", "본딩 단타 승인", "VALUE(I)", "", "VALUE(I)", case_target_(ortho, "증례별 임상참여", "Assist case - Bonding"), "승인수", "SUM", 60, "2026-08 시트 개편: 본딩 단타 승인 건수 J열→I열"),

    case_mapping_("RADIO_IO", "승인", "RADIO", "IO 매수", "VALUE(D)", "", "VALUE(D)", case_target_(radio, "증례별 임상참여", "구내 촬영 및 판독"), "환자수", "SUM", 60, "IO 매수(BW 포함)와 촬영 환자수 비교"),

    // 보철비교 시트 전용: PROS 매핑과 같은 U-FOLIO 대상을 쓰되 우선순위를 낮춰 비교결과에는 PROS만 남긴다.
    case_mapping_("PROS_TOTAL_REMOVABLE", "승인", "PROS_TOTAL", "가철 누적(토탈시트)", "VALUE(D)", "", "VALUE(D)", case_target_(pros, "Total Case", "Total case evaluation (가철성)"), "승인수", "SUM", 50, "보철비교용"),
    case_mapping_("PROS_TOTAL_FIXED", "승인", "PROS_TOTAL", "고정 누적(토탈시트)", "VALUE(F)", "", "VALUE(F)", case_target_(pros, "Total Case", "Total case evaluation (고정성)"), "승인수", "SUM", 50, "보철비교용"),
    case_mapping_("PROS_TOTAL_IMPLANT", "승인", "PROS_TOTAL", "임플 누적(토탈시트)", "VALUE(H)", "", "VALUE(H)", case_target_(pros, "Total Case", "Total case evaluation (Implant)"), "승인수", "SUM", 50, "보철비교용"),
    case_mapping_("PROS_TOTAL_IMPLANT_ASSIST", "승인", "PROS_TOTAL", "임수 누적(토탈시트)", "VALUE(I)", "", "VALUE(I)", case_target_(pros, "증례별 임상참여", "03. Implant assist"), "승인수", "SUM", 50, "보철비교용"),
    case_mapping_("PROS_CHART_32", "승인", "PROS_CHART", "3-2 차팅(차팅시트)", "VALUE(C)", "", "VALUE(C)", case_target_(pros, "증례별 임상참여", "22. Charting"), "승인수", "SUM", 50, "보철비교용"),
  ];
}
