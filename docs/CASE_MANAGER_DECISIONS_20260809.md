# 케이스장 확정 결정 (2026-08-09)

이전에 임시로 적용했던 세 가지 항목에 대해 담당 케이스장의 확답을 받았습니다. 세 답변 모두 기존 임시 적용과 일치했으므로 집계식과 비교 대상은 그대로 두고, 매핑 비고를 "임시"에서 확정 문구로 바꿨습니다.

## 1. 보철과 기공 X열·Y열

현황시트의 X열 `기공(3)`과 Y열 `기공 점수(15)`는 기공 종류를 합친 총계입니다.

- **X열**은 가철성·고정성·임플란트 `Laboratory case evaluation` **승인 건수의 합계**입니다.
- **Y열**은 같은 세 항목 **점수의 합계**입니다.

반영 매핑: `PROS_LAB`(`VALUE(X)` ↔ 세 항목 `승인수` 합계), `PROS_LAB_SCORE`(`VALUE(Y)` ↔ 세 항목 `점수` 합계).

## 2. 외과 Biopsy / I&D report 입력 시점

`3-2 biopsy / I and D` 시트의 Biopsy report(F열)와 I&D report(K열)는 **레포트 사인이 끝난 뒤에만 입력**합니다.

- 따라서 F열이나 K열에 값이 있으면 사인 완료로 간주합니다.
- 값이 있으면 각각 해당 **Total Case 승인 1건**으로 계산합니다.

반영 매핑: `OMS_STAGE_BIOPSY_TOTAL`(`NONEMPTY_AS_ONE(F)` ↔ `Total Case|Biopsy`), `OMS_STAGE_I_D_TOTAL`(`NONEMPTY_AS_ONE(K)` ↔ `Total Case|I & D`).

## 3. 외과 I&D 2nd·3rd follow-up 승인 수

I&D 환자 한 명이 2nd와 3rd visit을 모두 마치면 U-FOLIO `follow-up(I&D) 2nd or 3rd visit` 승인은 **총 2건**입니다.

- 2nd visit과 3rd visit이 **각각 follow-up 승인 1건**입니다.
- 1st visit은 `I & D` 본 항목 1건이므로, H:J 세 열이 모두 채워지면 단계 합계는 3건이고 그중 follow-up이 2건입니다.

반영 매핑: `OMS_STAGE_I_D`(`COUNT_NONEMPTY(H:J)` ↔ `I & D` + `follow-up(I&D) 2nd or 3rd visit` 승인수 합계).

## 결과

- 집계식(`VALUE`, `NONEMPTY_AS_ONE`, `COUNT_NONEMPTY`)과 U-FOLIO 대상 항목은 변경하지 않았습니다.
- `항목매핑` M열 비고에서 "임시 비교" 표현을 없애고 확정 근거로 교체했습니다.
- 기존 ② 관리자 파일에는 `유폴리오 통합관리 → 검토 완료 매핑 교정 적용`으로 반영합니다. 원본 URL과 사용자가 추가한 매핑은 보존됩니다.

이 문서는 `docs/CASE_MANAGER_QUESTIONS_20260809.md`를 대체합니다.
