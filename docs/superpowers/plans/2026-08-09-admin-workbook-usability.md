# Admin Workbook Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확정된 기공·Biopsy/I&D 규칙을 고정하고, 통합관리자 워크북을 `대시보드 → 비교결과` 중심으로 빠르게 사용할 수 있게 만든다.

**Architecture:** `CaseSheetDefaults.gs`는 매핑 의미만 담당하고, `SystemSetup.gs`의 `sys_applyAdminUsability_()`가 Google Sheets 화면·탭·필터·고정 영역을 일괄 적용한다. `scripts/build-spreadsheets.mjs`는 같은 정보 구조와 시각 체계를 독립 XLSX에 재현한다.

**Tech Stack:** Google Apps Script, Node.js 내장 테스트, `@oai/artifact-tool` 2.8.6+, Google Sheets/Excel 수식

## Global Constraints

- 기존 케이스장 원본은 수정하지 않는다.
- 관리자 파일의 원본 URL, 사용자 추가 매핑, 집계·비교·로그 데이터는 보존한다.
- 기술 시트는 숨기지 않고 오른쪽으로 이동한다.
- 환자 식별정보를 중앙 파일이나 Git에 추가하지 않는다.
- 기존 11개 소스, 63개 매핑, 학생 93명, 마스터 206개를 유지한다.

---

### Task 1: 확정 매핑 문구 고정

**Files:**
- Modify: `apps-script/CaseSheetDefaults.gs`
- Modify: `tests/mapping-review.test.mjs`

**Interfaces:**
- Consumes: `case_defaultMappings_(): Array<Array<unknown>>`
- Produces: 확정된 `PROS_LAB`, `PROS_LAB_SCORE`, `OMS_STAGE_BIOPSY_TOTAL`, `OMS_STAGE_I_D_TOTAL`, `OMS_STAGE_I_D` 기본 행

- [ ] **Step 1: 실패 테스트 작성**

`tests/mapping-review.test.mjs`에서 기공 비고에 `임시`가 없고, report 비고가 사인 완료를 명시하며, I&D 단계 비고가 2nd·3rd 각각 1건임을 검증한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/mapping-review.test.mjs`

Expected: 기존 `임시 비교`, 불충분한 report/I&D 비고 때문에 FAIL.

- [ ] **Step 3: 최소 구현**

`CaseSheetDefaults.gs`의 대상 매핑 비고만 확정 문구로 교체한다. 집계식과 측정값은 바꾸지 않는다.

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/mapping-review.test.mjs`

Expected: PASS.

### Task 2: Google Sheets 관리자 화면 업데이트

**Files:**
- Modify: `apps-script/SystemSetup.gs`
- Modify: `tests/system-setup.test.mjs`

**Interfaces:**
- Produces: `applyAdminUsabilityUpdate(): void`
- Produces: `sys_applyAdminUsability_(spreadsheet): void`
- Produces: `sys_reorderAdminSheets_(spreadsheet): void`
- Produces: `sys_ensureFilter_(sheet, width): void`

- [ ] **Step 1: 실패 테스트 작성**

소스 계약으로 다음 문자열과 함수가 존재하는지 검증한다.

```js
for (const required of [
  "applyAdminUsabilityUpdate",
  "sys_applyAdminUsability_",
  "관리자 화면·서식 업데이트",
  "setTabColor",
  "moveActiveSheet",
  "setFrozenColumns(3)",
  "whenFormulaSatisfied",
]) assert.equal(source.includes(required), true);
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/system-setup.test.mjs`

Expected: 새 함수와 화면 계약이 없어 FAIL.

- [ ] **Step 3: 대시보드·안내 구현**

`sys_buildDashboard_()`를 오늘의 확인 항목, 운영 상태, 바로 보는 순서, 상태 범례의 네 구역으로 재작성한다. `sys_adminGuideLines_()`를 만들어 신규 생성과 기존 파일 업데이트가 같은 안내를 사용하게 한다.

- [ ] **Step 4: 탭·표 서식 구현**

`sys_applyAdminUsability_()`가 대시보드·안내 재작성, 탭 색상·순서, 필터, 고정 열, 전체 행 상태 조건부 서식, 열 너비를 적용하고 대시보드를 활성화하게 한다.

- [ ] **Step 5: 안전한 사용자 함수 연결**

메뉴에 `관리자 화면·서식 업데이트`를 추가하고, `applyReviewedMappingCorrections()`와 신규 관리자 생성도 `sys_applyAdminUsability_()`를 호출하게 한다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test tests/system-setup.test.mjs`

Expected: PASS.

### Task 3: 생성 XLSX에 동일 UX 반영

**Files:**
- Modify: `scripts/build-spreadsheets.mjs`
- Modify: `tests/spreadsheet-package.test.mjs`

**Interfaces:**
- Consumes: Task 1의 63개 기본 매핑
- Produces: 대시보드가 첫 시트이고 비교결과·진단·설정·기술 시트 순서가 정리된 `02_유폴리오_통합관리자.xlsx`

- [ ] **Step 1: 실패 테스트 작성**

생성기 소스에서 관리자 시트 순서 상수, 오늘의 확인 항목, 마지막 동기화, 전체 행 조건부 서식, 비교결과 3열 고정을 검증한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/spreadsheet-package.test.mjs`

Expected: 새 UX 계약이 없어 FAIL.

- [ ] **Step 3: 최소 구현**

관리자 시트를 최종 순서대로 생성하고, 새 대시보드 값·수식·서식, 필터, 고정 창, 조건부 서식을 적용한다. 참조 시트를 만든 뒤 대시보드 수식을 기록한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/spreadsheet-package.test.mjs`

Expected: PASS.

### Task 4: 문서와 운영 안내 갱신

**Files:**
- Delete: `docs/CASE_MANAGER_QUESTIONS_20260809.md`
- Create: `docs/CASE_MANAGER_DECISIONS_20260809.md`
- Modify: `docs/GOOGLE_SHEETS_SETUP.md`
- Modify: `README.md`

**Interfaces:**
- Produces: 현재 Google Sheets에 `관리자 화면·서식 업데이트`를 적용하는 사용자 절차

- [ ] **Step 1: 세 답변을 확정 결정문으로 옮기기**

질문 문서는 삭제하고 기공 합계, report 입력 시점, I&D follow-up 2건 규칙을 결정문에 기록한다.

- [ ] **Step 2: 평상시 사용 흐름 문서화**

평소 `대시보드 → 비교결과`, 오류 시 `연결진단 → 동기화로그`, 구조 변경 시 설정 시트를 사용한다고 설명한다.

- [ ] **Step 3: 기존 파일 업데이트 순서 문서화**

최신 `SystemSetup.gs`와 `CaseSheetDefaults.gs`를 붙여넣고 `검토 완료 매핑 교정 적용`, `관리자 화면·서식 업데이트`를 실행하도록 안내한다.

### Task 5: 생성·검증·배포

**Files:**
- Output: `outputs/ufolio-case-integration-20260809-v2/01_유폴리오_사이트인증.xlsx`
- Output: `outputs/ufolio-case-integration-20260809-v2/02_유폴리오_통합관리자.xlsx`

**Interfaces:**
- Produces: 검증된 로컬 워크북 두 개와 `origin/main` 커밋

- [ ] **Step 1: 전체 테스트**

Run: `npm.cmd test`

Expected: 0 failures.

- [ ] **Step 2: 워크북 생성**

Run: `node scripts/build-spreadsheets.mjs private/student-roster.tsv outputs/ufolio-case-integration-20260809-v2`

Expected: 학생 93명, 항목 206개, 소스 11개, 매핑 63개.

- [ ] **Step 3: 구조·수식·렌더 검증**

Run: `node scripts/verify-spreadsheets.mjs outputs/ufolio-case-integration-20260809-v2`

Expected: 17개 시트 미리보기, 수식 오류 0개.

- [ ] **Step 4: 시각 검토**

대시보드, 비교결과, 연결진단, 현황시트연결, 사용안내 미리보기를 확인하고 잘림·색상 충돌·빈 화면 문제를 수정한다.

- [ ] **Step 5: 최종 검증과 커밋**

Run: `npm.cmd test`

Expected: 0 failures. 이후 변경 파일을 커밋한다.

- [ ] **Step 6: main 직접 푸시**

Run: `git push origin HEAD:main`

Expected: 새 커밋이 `origin/main`에 반영됨.
