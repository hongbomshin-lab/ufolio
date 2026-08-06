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
    ["IMPLANT", "Y", "구강악안면외과", "임플란트 현황", "", "임플 현황", "A", "B", 3, "", 90, "CONFIG", "", "URL입력필요", ""],
    ["PATH", "Y", "구강병리과", "구강병리 케이스 현황", "", "병리과 현황", "A", "B", 4, "", 60, "CONFIG", "", "URL입력필요", ""],
    ["PROS", "Y", "보철과", "보철과 원내생 현황", "", "현황 시트", "A", "B", 5, "", 60, "CONFIG", "", "URL입력필요", ""],
    ["OMS", "Y", "구강악안면외과", "외과 케이스 현황", "", "케이스 현황", "A", "B", 3, "", 70, "CONFIG", "", "URL입력필요", ""],
    ["OMS_STAGE", "Y", "구강악안면외과", "Biopsy 및 I&D 단계 현황", "", "시트1", "A", "B", 3, "", 60, "CONFIG", "", "URL입력필요", ""],
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
  return [
    case_mapping_("CONS_OBS_CHART", "승인", "CONS_SCORE", "Observation Charting", "VALUE(C)", "", "VALUE(C)", case_target_(cons, "증례별 임상참여", "Observation (Charting) case"), "점수", "SUM", 70, "점수판 관찰 점수"),
    case_mapping_("CONS_OBS_ENDO", "승인", "CONS_SCORE", "Observation Endodontics", "VALUE(D)", "", "VALUE(D)", case_target_(cons, "증례별 임상참여", "Observation (Endodontics) case"), "점수", "SUM", 70, "점수판 관찰 점수"),
    case_mapping_("CONS_OBS_OPER", "승인", "CONS_SCORE", "Observation Operative", "VALUE(E)", "", "VALUE(E)", case_target_(cons, "증례별 임상참여", "Observation (Operative) case"), "점수", "SUM", 70, "점수판 관찰 점수"),
    case_mapping_("CONS_OBS_SURG_SCORE", "승인", "CONS_SCORE", "Observation Surgery", "VALUE(F)", "", "VALUE(F)", case_target_(cons, "증례별 임상참여", "Observation (Surgery) case"), "점수", "SUM", 70, "점수판 관찰 점수"),
    case_mapping_("CONS_OBS_SURG", "승인", "CONS_SURGERY", "보존 수술 누적", "VALUE(W)", "", "VALUE(W)", case_target_(cons, "증례별 임상참여", "Observation (Surgery) case"), "점수", "SUM", 90, "전용 수술표 우선"),
    case_mapping_("CONS_ASSIST", "승인", "CONS_SCORE", "단타 assist 보존과", "VALUE(G)", "", "VALUE(G)", case_target_(cons, "증례별 임상참여", "단타 assist(보존과)"), "점수", "SUM", 70, ""),
    case_mapping_("CONS_CENTER_ASSIST", "승인", "CONS_SCORE", "단타 assist 원내생센터", "VALUE(H)", "", "VALUE(H)", case_target_(cons, "증례별 임상참여", "단타 assist(원내생진료센터 assist)"), "점수", "SUM", 70, ""),
    case_mapping_("CONS_RESIN_STAGE", "검토필요", "CONS_SCORE", "Resin 완료", "VALUE(I)", "", "VALUE(I)", case_target_(cons, "증례별 임상참여", "Composite restoration(practice)"), "승인수", "SUM", 50, "완료 단계와 인증 시점 확인 필요"),
    case_mapping_("CONS_ENDO_STAGE", "검토필요", "CONS_SCORE", "Endo 완료", "VALUE(J)", "", "VALUE(J)", case_target_(cons, "증례별 임상참여", "Endodontic treatment(practice)"), "승인수", "SUM", 50, "완료 단계와 인증 시점 확인 필요"),

    case_mapping_("PED_CHARTING", "승인", "PED_CHART", "소아 차팅 누적", "VALUE(D)", "", "VALUE(D)", case_target_(ped, "증례별 임상참여", "practice - Charting (교수님/전공의 진료 참여)"), "승인수", "SUM", 80, "비어 있지 않은 차팅 건수"),

    case_mapping_("PERIO_FLAP", "승인", "PERIO", "Flap 누적", "VALUE(E)", "VALUE(D)", "VALUE(E)", case_target_(perio, "증례별 임상참여", "Flap Assist"), "승인수", "SUM", 80, ""),
    case_mapping_("PERIO_IMPLANT", "승인", "PERIO", "Implant 누적", "VALUE(H)", "VALUE(G)", "VALUE(H)", case_target_(perio, "증례별 임상참여", "Implant Assist"), "승인수", "SUM", 80, ""),
    case_mapping_("PERIO_BASIC", "승인", "PERIO", "OE+SC+PCI", "VALUE(I)", "", "VALUE(I)", [case_target_(perio, "증례별 임상참여", "Oral examination"), case_target_(perio, "증례별 임상참여", "Scaling"), case_target_(perio, "증례별 임상참여", "Plaque control instruction")].join("\n"), "승인수", "SUM", 80, "3개 항목 합계"),
    case_mapping_("PERIO_RP", "승인", "PERIO", "Root planing", "VALUE(J)", "", "VALUE(J)", case_target_(perio, "증례별 임상참여", "Root planing"), "승인수", "SUM", 80, ""),

    case_mapping_("OM_CHARTING", "승인", "OM", "Charting 종이 기준", "VALUE(D)", "", "VALUE(D)", case_target_(om, "증례별 임상참여", "Charting"), "승인수", "SUM", 80, "종이 서명 기준 열"),
    case_mapping_("OM_TMD_CHARTING", "승인", "OM", "TMD Charting", "VALUE(E)", "", "VALUE(E)", case_target_(om, "증례별 임상참여", "TMD Charting"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_MED", "승인", "OM", "Medical certificate", "VALUE(F)", "", "VALUE(F)", case_target_(om, "증례별 임상참여", "Medical certificate"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_LAB", "승인", "OM", "Lab reading and Report", "VALUE(G)", "", "VALUE(G)", case_target_(om, "증례별 임상참여", "Lab reading & Report"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_OTHERS", "승인", "OM", "Others", "VALUE(H)", "", "VALUE(H)", case_target_(om, "증례별 임상참여", "Others (REPORTS etc.)"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_PT", "승인", "OM", "Physical therapy 완료+예정", "VALUE(I)", "VALUE(J)", "SUM(I,J)", case_target_(om, "증례별 임상참여", "Physical therapy"), "점수", "SUM", 80, "서명 예정 포함"),
    case_mapping_("OM_TMD", "승인", "OM", "TMD observation", "VALUE(K)", "", "VALUE(K)", case_target_(om, "증례별 임상참여", "Orofacial pain & TMD observation"), "환자수", "SUM", 80, ""),
    case_mapping_("OM_SOFT", "승인", "OM", "Soft tissue lesion", "VALUE(L)", "", "VALUE(L)", case_target_(om, "증례별 임상참여", "Soft tissue lesion observation"), "환자수", "SUM", 80, ""),
    case_mapping_("OM_HALITOSIS", "승인", "OM", "Halitosis", "VALUE(M)", "", "VALUE(M)", case_target_(om, "증례별 임상참여", "Halitosis observation"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_SNORING", "승인", "OM", "Snoring", "VALUE(N)", "", "VALUE(N)", case_target_(om, "증례별 임상참여", "Snoring & sleep apnea observation"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_IMPRESSION", "승인", "OM", "Impression taking", "VALUE(O)", "", "VALUE(O)", case_target_(om, "기공", "Impression taking & Model fabrication"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_SPLINT_DEL", "승인", "OM", "Splint delivery", "VALUE(P)", "", "VALUE(P)", case_target_(om, "증례별 임상참여", "Splint delivery observation"), "승인수", "SUM", 80, ""),
    case_mapping_("OM_SPLINT_FAB", "승인", "OM", "Splint fabrication", "VALUE(Q)", "", "VALUE(Q)", case_target_(om, "기공", "Splint fabrication"), "승인수", "SUM", 80, ""),

    case_mapping_("EXT_SIMPLE", "승인", "EXT", "Simple extraction", "VALUE(C)", "", "VALUE(C)", case_target_(oms, "증례별 임상참여", "Extraction_[P]_simple extraction"), "승인수", "SUM", 100, "전용 발치표"),
    case_mapping_("EXT_SURGICAL", "승인", "EXT", "Surgical extraction", "VALUE(D)", "", "VALUE(D)", case_target_(oms, "증례별 임상참여", "Extraction_[P]_surgical extraction"), "승인수", "SUM", 100, "전용 발치표"),
    case_mapping_("EXT_TOTAL", "승인", "EXT", "Extraction P 합계", "VALUE(E)", "", "VALUE(E)", [case_target_(oms, "증례별 임상참여", "Extraction_[P]_simple extraction"), case_target_(oms, "증례별 임상참여", "Extraction_[P]_surgical extraction")].join("\n"), "승인수", "SUM", 100, "전용 발치표 우선"),
    case_mapping_("IMPLANT_TOTAL", "검토필요", "IMPLANT", "Implant 3-2", "VALUE(C)", "", "VALUE(C)", case_target_(oms, "증례별 임상참여", "Implant 1st op. (2개 이하 식립)_[O]"), "승인수", "SUM", 90, "A/O 및 식립 개수 구분 확인 필요"),

    case_mapping_("OMS_CYST", "승인", "OMS", "Cyst major", "VALUE(E)", "", "VALUE(E)", case_target_(oms, "증례별 임상참여", "Cyst, torus removal, alveolar surgery_[O]"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_SURG_EXT", "승인", "OMS", "수술실 Surgical extraction", "VALUE(F)", "", "VALUE(F)", case_target_(oms, "증례별 임상참여", "수술실-Surgical extraction"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_EXT_A", "승인", "OMS", "Extraction A", "VALUE(H)", "", "VALUE(H)", case_target_(oms, "증례별 임상참여", "Extraction_[A]"), "점수", "SUM", 70, ""),
    case_mapping_("OMS_I_D", "승인", "OMS", "I and D", "VALUE(I)", "", "VALUE(I)", case_target_(oms, "증례별 임상참여", "I & D"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_BIOPSY", "승인", "OMS", "Biopsy", "VALUE(J)", "", "VALUE(J)", case_target_(oms, "증례별 임상참여", "Biopsy"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_LAVAGE", "승인", "OMS", "Lavage", "VALUE(L)", "", "VALUE(L)", case_target_(oms, "증례별 임상참여", "턱관절강 세정술"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_EXT_TOTAL", "승인", "OMS", "Extraction P 합계", "VALUE(P)", "VALUE(O)", "VALUE(P)", [case_target_(oms, "증례별 임상참여", "Extraction_[P]_simple extraction"), case_target_(oms, "증례별 임상참여", "Extraction_[P]_surgical extraction")].join("\n"), "승인수", "SUM", 70, "전용 발치표보다 낮은 우선순위"),
    case_mapping_("OMS_RECALL_MAJOR", "승인", "OMS", "Major recall", "VALUE(Q)", "", "VALUE(Q)", case_target_(oms, "증례별 임상참여", "외래 Recall check major"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_RECALL_MINOR", "승인", "OMS", "Minor recall", "VALUE(R)", "", "VALUE(R)", case_target_(oms, "증례별 임상참여", "외래 Recall check minor"), "점수", "SUM", 70, ""),
    case_mapping_("OMS_NEW_CHART", "승인", "OMS", "신환 차팅", "VALUE(S)", "", "VALUE(S)", case_target_(oms, "증례별 임상참여", "외래 신환 차팅"), "점수", "SUM", 70, ""),
    case_mapping_("OMS_WARD", "승인", "OMS", "병동", "VALUE(U)", "", "VALUE(U)", case_target_(oms, "증례별 임상참여", "병동 및 당직"), "점수", "SUM", 70, ""),
    case_mapping_("OMS_LAB", "승인", "OMS", "기공", "VALUE(V)", "", "VALUE(V)", case_target_(oms, "기공", "모델 제작 (악당)"), "승인수", "SUM", 70, ""),
    case_mapping_("OMS_ORTHO", "검토필요", "OMS", "Orthognathic surgery", "VALUE(D)", "", "VALUE(D)", case_target_(oms, "증례별 임상참여", "수술실-Maxillofacial deformity and orthognathic surgery"), "승인수", "SUM", 50, "major 분류와 U-FOLIO O/A 구분 확인 필요"),
    case_mapping_("OMS_IMPLANT_A", "검토필요", "OMS", "Implant A", "VALUE(K)", "", "VALUE(K)", case_target_(oms, "증례별 임상참여", "Implant 1st op (3개 이상 식립)_[A]"), "점수", "SUM", 50, "식립 개수 구분 확인 필요"),

    case_mapping_("PATH_LEDGER", "검토필요", "PATH", "장부작성", "NONEMPTY_AS_ONE(D)", "", "NONEMPTY_AS_ONE(D)", case_target_(path, "전 임상실습", "구강병리학적 검사 의뢰서 작성"), "승인수", "SUM", 60, "O/X와 인증 시점 확인 필요"),
    case_mapping_("PATH_DIAGNOSIS", "검토필요", "PATH", "진단 참여", "NONEMPTY_AS_ONE(E)", "", "NONEMPTY_AS_ONE(E)", case_target_(path, "증례별 임상참여", "육안 검사 및 진단 준비 참여"), "승인수", "SUM", 60, "날짜와 O 표기 혼합 확인 필요"),

    case_mapping_("PROS_CHARTING", "검토필요", "PROS", "Charting 점수", "VALUE(S)", "", "VALUE(S)", case_target_(pros, "증례별 임상참여", "22. Charting"), "점수", "SUM", 60, "집계 점수와 승인수 관계 확인 필요"),
    case_mapping_("PROS_ASSIST", "검토필요", "PROS", "진료 assist", "VALUE(T)", "", "VALUE(T)", case_target_(pros, "증례별 임상참여", "02. observation (교수님)"), "점수", "SUM", 60, "진토 집계 의미 확인 필요"),
    case_mapping_("PROS_LAB", "검토필요", "PROS", "기공 누적", "SUM(U,V)", "", "SUM(U,V)", [case_target_(pros, "기공", "[가철성]Laboratory case evaluation"), case_target_(pros, "기공", "[고정성]Laboratory case evaluation"), case_target_(pros, "기공", "[임플란트]Laboratory case evaluation")].join("\n"), "점수", "SUM", 60, "단타/교픽 합계 분배 확인 필요"),
    case_mapping_("PROS_IMPLANT", "검토필요", "PROS", "Implant 누적", "VALUE(N)", "VALUE(M)", "VALUE(N)", case_target_(pros, "Total Case", "Total case evaluation (Implant)"), "점수", "SUM", 60, "완료/예정/누적 정의 확인 필요"),

    case_mapping_("OMS_STAGE_BIOPSY", "검토필요", "OMS_STAGE", "Biopsy 단계 완료", "COUNT_NONEMPTY(D:F)", "", "COUNT_NONEMPTY(D:F)", [case_target_(oms, "증례별 임상참여", "Biopsy"), case_target_(oms, "증례별 임상참여", "follow-up(Biopsy)")].join("\n"), "승인수", "SUM", 60, "단계별 인증 시점 확인 필요"),
    case_mapping_("OMS_STAGE_I_D", "검토필요", "OMS_STAGE", "I&D 단계 완료", "COUNT_NONEMPTY(H:K)", "", "COUNT_NONEMPTY(H:K)", [case_target_(oms, "증례별 임상참여", "I & D"), case_target_(oms, "증례별 임상참여", "follow-up(I&D) 2nd or 3rd visit")].join("\n"), "승인수", "SUM", 60, "단계별 인증 시점 확인 필요"),
  ];
}
