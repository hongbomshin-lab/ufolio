# 케이스장 2차 답변 반영 설계

## 범위

2026-08-08 매핑 재검토 설계를 유지하면서 케이스장 답변으로 확정된 보존과, 구강내과, 외과, 보철과 규칙만 교정한다. 과별 규칙을 다른 과나 항목에 일반화하지 않는다.

## 확정 매핑

- 보존 Resin I열은 점수이며 `Composite restoration(3급/4급)(practice)`, `Composite restoration(practice)`, `Composite restortion(2급)(Practice)` 점수 합계와 비교한다.
- 보존 Endo J열은 점수이며 `Endodontic treatment(practice)` 점수와 비교한다.
- 보존 Observation Surgery는 전용 수술표 W열만 기준으로 사용하고 점수판 F열 매핑은 비활성화한다.
- 구강내과 Physical therapy는 완료 I열과 예정 J열 점수 합계를 U-FOLIO `Physical therapy` 점수와 비교한다.
- 발치프랙 파일의 별도 `임플 현황` 탭은 과거/예시 자료이므로 연결과 매핑을 비활성 상태로 유지한다. 설명만 Assist(A) 합산 후보로 교정한다.
- 외과 병동 U열은 U-FOLIO `병동 및 당직` 점수와 비교한다.
- 외과 bx/I&D 요약 열은 단계표보다 덜 정확하므로 비활성화한다.
- 단계표 D:E는 Biopsy와 follow-up(Biopsy) 승인수 합계, H:J는 I&D와 follow-up(I&D) 승인수 합계와 비교한다.
- 단계표 Biopsy report F열은 `Total Case|Biopsy`, I&D report K열은 `Total Case|I & D` 승인수와 비교한다.
- 보철 X열은 세 Laboratory case evaluation 항목의 승인수 합계와, Y열은 같은 세 항목의 점수 합계와 비교한다.

## 보수적 처리

- 원본은 수정하지 않는다.
- 과거 임플란트 연결은 마이그레이션에서도 강제로 비활성화한다.
- 케이스장 답변이 원본 총계가 세 기공 종류의 합산인지 명시하지 않은 점은 별도 질문으로 남긴다. 현재는 답변의 `X / Y` 표기를 세 종류 모두에 적용한다.
- U-FOLIO 대상은 기존 206개 마스터에 존재하는 항목만 사용한다.

## 기존 관리자 파일 적용

기존 `applyReviewedMappingCorrections` 함수가 최신 기본값으로 관리 매핑을 교체하므로 함수명과 사용자 실행 절차는 유지한다. URL, 사용자 추가 매핑, 최근 연결 상태는 보존한다.

## 검증

- 새 매핑의 활성·검토 상태, 표현식, 측정값, 대상 목록을 회귀 테스트한다.
- 이전 요약 bx/I&D 및 보존 수술 점수 매핑이 비활성인지 검증한다.
- 모든 활성 승인 매핑 대상이 206개 마스터에 존재하는지 검증한다.
- XLSX 재생성 후 탭 수, 명단 수, 매핑 수, 수식 오류, 렌더링을 검증한다.
