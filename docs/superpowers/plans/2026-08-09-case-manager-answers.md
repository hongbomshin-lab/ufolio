# Case Manager Answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 케이스장 2차 답변으로 확정된 과별 매핑을 기존 관리자 파일과 신규 XLSX 기본값에 동일하게 반영한다.

**Architecture:** `CaseSheetDefaults.gs`를 단일 매핑 정의로 유지하고 기존 `applyReviewedMappingCorrections`가 이 정의를 운영 파일에 적용한다. 테스트는 기본 매핑 배열의 정확한 열·측정값·대상·활성 상태를 검증하며, 산출물은 기존 artifact-tool 빌더로 재생성한다.

**Tech Stack:** Google Apps Script, Node.js test runner, `@oai/artifact-tool`

## Global Constraints

- 원본 케이스장 시트는 수정하지 않는다.
- 사용자 답변으로 확정된 항목만 승인한다.
- 환자 상세 식별정보를 새로 저장하거나 출력하지 않는다.
- 기존 관리자 URL과 사용자 추가 매핑을 보존한다.

---

### Task 1: 확정 매핑 회귀 테스트

**Files:**
- Modify: `tests/mapping-review.test.mjs`

**Interfaces:**
- Consumes: `case_defaultMappings_()`
- Produces: 케이스장 답변의 정확한 매핑 계약

- [ ] Resin/Endo/Physical therapy 점수 매핑 테스트를 추가한다.
- [ ] 외과 단계표·Total Case·요약 비활성 테스트를 추가한다.
- [ ] 보철 기공 X/Y 이중 매핑 테스트를 추가한다.
- [ ] 테스트를 실행해 기존 정의 때문에 실패함을 확인한다.

### Task 2: 기본값 및 운영 파일 교정

**Files:**
- Modify: `apps-script/CaseSheetDefaults.gs`
- Verify: `apps-script/SystemSetup.gs`

**Interfaces:**
- Consumes: `case_mapping_()`, `case_target_()`
- Produces: 최신 63개 기본 매핑과 기존 파일 교정 입력

- [ ] 실패 테스트를 만족하는 최소 매핑 변경을 구현한다.
- [ ] 과거 임플란트 연결과 매핑은 비활성 상태를 유지한다.
- [ ] 전체 테스트를 실행한다.

### Task 3: 운영 문서와 질문 정리

**Files:**
- Modify: `docs/CASE_MANAGER_QUESTIONS_20260808.md`
- Modify: `docs/GOOGLE_SHEETS_SETUP.md`

**Interfaces:**
- Produces: 사용자 실행 안내와 남은 케이스장 질문

- [ ] 답변 완료 질문을 제거한다.
- [ ] 보철 기공 총계의 분리 가능 여부 등 남은 질문만 작성한다.
- [ ] 적용 함수와 비교 보류 규칙을 문서화한다.

### Task 4: XLSX 생성 및 검증

**Files:**
- Output: `outputs/ufolio-case-integration-20260809/01_유폴리오_사이트인증.xlsx`
- Output: `outputs/ufolio-case-integration-20260809/02_유폴리오_통합관리자.xlsx`

**Interfaces:**
- Consumes: 최신 기본 매핑, 비공개 명단
- Produces: Google Sheets 변환용 복구 패키지

- [ ] 전체 테스트를 실행한다.
- [ ] artifact-tool 빌더를 실행한다.
- [ ] 모든 탭 렌더와 수식 오류 검사를 실행한다.
- [ ] 관리자 매핑·대시보드·연결표를 시각 검토한다.

### Task 5: Git 반영

**Files:**
- Commit: 위 변경 파일

**Interfaces:**
- Produces: GitHub `main` 최신 교정 커밋

- [ ] `git diff --check`와 작업 트리를 확인한다.
- [ ] 검증된 변경을 커밋한다.
- [ ] `origin/main`에 푸시하고 원격 SHA를 확인한다.
