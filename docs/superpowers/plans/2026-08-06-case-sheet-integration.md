# Case-Sheet Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate manual-entry workbook with a configuration-driven, read-only integration of 11 existing case-lead sheet sources and compare their aggregate certification values with the latest U-FOLIO submissions.

**Architecture:** The spreadsheet-bound Apps Script keeps the existing U-FOLIO receiver workbook and creates one private integration-admin workbook. Pure functions parse a restricted aggregation DSL, normalize source rows, select source priority, aggregate one or more U-FOLIO targets, and classify differences; Google-service code reads only configured source columns and atomically replaces successful source snapshots while retaining stale snapshots after failures.

**Tech Stack:** Browser JavaScript ES2020, Node.js built-in test runner, Google Apps Script V8, Google Sheets, `@oai/artifact-tool` 2.8.6+, Vercel static hosting.

## Global Constraints

- Do not modify the 10 supplied source workbooks.
- Do not track `현황시트 모음/`, real roster files, generated operations workbooks, source URLs, patient names, patient numbers, provider names, dates, or case notes.
- Match students by attendance number and verify normalized name equality.
- Persist student-level aggregates only.
- Keep receiving all 206 U-FOLIO items; compare only approved mappings.
- Support manual refresh and a daily 3 AM time-based trigger.
- Isolate source failures and retain each failed source's last successful snapshot.
- Treat blank and zero separately; allow decimals.
- Seed ambiguous mappings as `검토필요` and exclude them from mismatch statistics.
- Create exactly two operational workbooks: `01_유폴리오_사이트인증.xlsx` and `02_유폴리오_통합관리자.xlsx`.

---

## File Map

- Modify `.gitignore`: exclude supplied case-source workbooks and local structure reports.
- Create `config/ufolio-master-items.json`: the 206-item non-identifying U-FOLIO master list used by both workbook generation and mapping validation.
- Create `apps-script/CaseSheetCore.gs`: pure aggregation DSL, identity, target aggregation, priority, and comparison functions.
- Create `apps-script/CaseSheetDefaults.gs`: 11 source defaults and initial approved/review mappings.
- Create `apps-script/CaseSheetSync.gs`: Google Sheets access, per-source refresh isolation, snapshots, diagnostics, comparisons, and logs.
- Modify `apps-script/SystemSetup.gs`: admin-only workbook creation, menu, styles, settings, trigger installation; remove manual-entry creation and protections.
- Modify `scripts/build-spreadsheets.mjs`: build two workbooks and seed connection/mapping/admin tabs from `CaseSheetDefaults.gs`.
- Modify `scripts/verify-spreadsheets.mjs`: verify the revised workbook set and every output sheet.
- Create `tests/case-sheet-core.test.mjs`: pure DSL and comparison tests.
- Create `tests/case-sheet-defaults.test.mjs`: source inventory, privacy, and seed-mapping tests.
- Create `tests/case-sheet-sync.test.mjs`: atomic-source replacement and diagnostic tests using fakes.
- Modify `tests/system-setup.test.mjs`: revised menu/settings expectations.
- Modify `README.md`, `apps-script/README.md`, `docs/GOOGLE_SHEETS_SETUP.md`: exact two-workbook installation and source-sharing workflow.

### Task 1: Protect source files and implement the pure integration core

**Files:**
- Modify: `.gitignore`
- Create: `apps-script/CaseSheetCore.gs`
- Create: `tests/case-sheet-core.test.mjs`

**Interfaces:**
- Produces: `case_evaluateExpression_(expression, rowValues): number | ""`.
- Produces: `case_compareValues_(sourceValue, ufolioValue): string`.
- Produces: `case_aggregateUfolio_(mapping, latestByKey, studentId): {found:boolean,value:number|string}`.
- Produces: `case_normalizeName_(value): string`.

- [ ] **Step 1: Ignore the supplied operational sources**

Add exact entries:

```gitignore
현황시트 모음/
private/case-sheet-*.json
```

- [ ] **Step 2: Write failing DSL and comparison tests**

Cover these exact expectations:

```js
assert.equal(core.case_evaluateExpression_("VALUE(C)", [1, "학생", 3.5]), 3.5);
assert.equal(core.case_evaluateExpression_("SUM(C,D)", [1, "학생", 2, 3]), 5);
assert.equal(core.case_evaluateExpression_("COUNT_NONEMPTY(E:H)", [1, "학생", "", "", "환자", "", "환자", ""]), 2);
assert.equal(core.case_compareValues_(5, 3), "반영대기");
assert.equal(core.case_compareValues_(3, 5), "현황누락의심");
assert.equal(core.case_compareValues_(0, 0), "일치");
assert.equal(core.case_compareValues_("", 0), "유폴리오미인증");
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `node --test tests/case-sheet-core.test.mjs`

Expected: FAIL because `CaseSheetCore.gs` does not exist.

- [ ] **Step 4: Implement a strict parser**

Accept only `VALUE`, `NUMBER_OR_ZERO`, `NONEMPTY_AS_ONE`, `SUM`, `COUNT_NONEMPTY`, and `COUNT_STATUS`. Reject invalid columns, unknown operations, non-finite results, and formula-error strings matching `^#(?:REF!|VALUE!|DIV/0!|N/A|NAME\?)$`.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/case-sheet-core.test.mjs && npm.cmd test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore apps-script/CaseSheetCore.gs tests/case-sheet-core.test.mjs
git commit -m "feat: add case-sheet aggregation core"
```

### Task 2: Seed the 11 source connections and safe mapping defaults

**Files:**
- Create: `config/ufolio-master-items.json`
- Create: `apps-script/CaseSheetDefaults.gs`
- Create: `tests/case-sheet-defaults.test.mjs`

**Interfaces:**
- Produces: `case_defaultConnections_(): Array<Array<unknown>>` matching `CASE_CONNECTION_HEADERS`.
- Produces: `case_defaultMappings_(): Array<Array<unknown>>` matching `CASE_MAPPING_HEADERS`.
- Consumes: the exact source keys in the approved design.

- [ ] **Step 1: Write failing inventory tests**

Assert the master list has exactly 206 unique department/item keys with the expected department counts. Assert 11 unique active connection keys, blank URLs, exact sheet names, valid A1 columns, data rows, and no patient names/numbers. Assert every mapping references a source key and every approved mapping has a restricted expression, U-FOLIO target present in the master list, measurement, and aggregation mode.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/case-sheet-defaults.test.mjs`

Expected: FAIL because `CaseSheetDefaults.gs` does not exist.

- [ ] **Step 3: Add the non-identifying master list and connection defaults**

Extract only department/item labels from the existing generated site workbook into `config/ufolio-master-items.json`; include no attendance numbers, names, URLs, or submission values. Seed `CONS_SCORE`, `CONS_SURGERY`, `PED_CHART`, `PERIO`, `OM`, `EXT`, `IMPLANT`, `PATH`, `PROS`, `OMS`, and `OMS_STAGE` with filenames as display names, blank URLs, exact tab names, attendance/name columns, first rows, blank automatic last rows, and source priorities.

- [ ] **Step 4: Add mapping defaults**

Seed high-confidence direct mappings as `승인`; seed pathology stages, prosthodontic aggregate scores, implant ambiguity, and Biopsy/I&D certification-stage ambiguity as `검토필요`. Prefer `EXT` over duplicate extraction totals in `OMS`. Use composite target item lists for periodontal `OE+SC+PCI` and combined extraction totals.

- [ ] **Step 5: Verify defaults**

Run: `node --test tests/case-sheet-defaults.test.mjs tests/case-sheet-core.test.mjs`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add config/ufolio-master-items.json apps-script/CaseSheetDefaults.gs tests/case-sheet-defaults.test.mjs
git commit -m "feat: seed case-sheet source mappings"
```

### Task 3: Implement source refresh isolation and comparison output

**Files:**
- Create: `apps-script/CaseSheetSync.gs`
- Create: `tests/case-sheet-sync.test.mjs`

**Interfaces:**
- Consumes: `case_defaultConnections_`, `case_defaultMappings_`, and pure core functions.
- Produces: `case_refreshAll_(services): RefreshResult` for testable orchestration.
- Produces: `refreshIntegratedData(): void` for live Apps Script.
- Produces: `validateCaseConnections(): void`.

- [ ] **Step 1: Write failing orchestration tests**

Test that one source failure does not block another, failed source rows remain in the snapshot with `원본노후`, successful source rows replace only matching `소스키`, name mismatch is excluded, unapproved mappings produce `매핑대기`, and comparisons include `일치`, `반영대기`, `현황누락의심`, and `유폴리오미인증`.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/case-sheet-sync.test.mjs`

Expected: FAIL because refresh orchestration does not exist.

- [ ] **Step 3: Implement narrow source reads**

Parse the URL to a spreadsheet ID, open by ID, validate the named tab, determine the configured student range, and read only attendance, name, and columns referenced by active mapping expressions. Never append raw source rows or patient-level values to an output sheet.

- [ ] **Step 4: Implement atomic snapshot replacement**

Build source rows in memory. Replace the source's previous snapshot only after all selected rows validate. On failure, preserve prior rows, mark them stale, and append one diagnostic/log record.

- [ ] **Step 5: Implement U-FOLIO latest selection and comparison**

Use the latest timestamp per existing site key, select the highest-priority successful source mapping per comparable target, aggregate composite targets, and write deterministic sorted arrays for all admin tabs.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/case-sheet-sync.test.mjs && npm.cmd test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps-script/CaseSheetSync.gs tests/case-sheet-sync.test.mjs
git commit -m "feat: synchronize case-sheet aggregates"
```

### Task 4: Replace the manual workbook workflow with one integration-admin workbook

**Files:**
- Modify: `apps-script/SystemSetup.gs`
- Modify: `tests/system-setup.test.mjs`
- Modify: `apps-script/Code.gs`

**Interfaces:**
- Produces: `createIntegrationAdminWorkbook()`.
- Produces menu handlers `validateCaseConnections`, `refreshIntegratedData`, `installDailyRefreshTrigger`, and `removeRefreshTriggers`.
- Keeps: `doPost(e)` receiver behavior and all 206 active-master validation.

- [ ] **Step 1: Update tests to reject legacy manual workflow**

Assert source contains no creation of `② 유폴리오 수기입력`, no row-protection functions, no `MANUAL_SPREADSHEET_ID`, and includes the new handlers and `ADMIN_SPREADSHEET_ID` requirement.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/system-setup.test.mjs`

Expected: FAIL against the legacy workflow.

- [ ] **Step 3: Build the new admin tabs and menu**

Create all tabs from the design, seed defaults once without overwriting operator-edited URLs or review statuses, style inputs yellow and system outputs blue/green, and include status-specific conditional formatting.

- [ ] **Step 4: Add the daily trigger**

Use `ScriptApp.newTrigger("refreshIntegratedData").timeBased().atHour(3).everyDays(1).create()` after removing prior refresh triggers.

- [ ] **Step 5: Preserve receiver isolation**

Ensure `doPost` only validates and appends to the site workbook. It must not open case-source workbooks or run integration refresh synchronously.

- [ ] **Step 6: Run full tests**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps-script/SystemSetup.gs apps-script/Code.gs tests/system-setup.test.mjs
git commit -m "feat: replace manual input with integration admin"
```

### Task 5: Generate and visually verify the revised two-workbook package

**Files:**
- Modify: `scripts/build-spreadsheets.mjs`
- Modify: `scripts/verify-spreadsheets.mjs`
- Create: `tests/spreadsheet-package.test.mjs`
- Output: `outputs/ufolio-case-integration-20260806/01_유폴리오_사이트인증.xlsx`
- Output: `outputs/ufolio-case-integration-20260806/02_유폴리오_통합관리자.xlsx`

**Interfaces:**
- Consumes defaults from `CaseSheetDefaults.gs` through a Node VM.
- Consumes `config/ufolio-master-items.json` as the 206-item master source.
- Produces exactly two xlsx files with all designed tabs.

- [ ] **Step 1: Write failing package-shape tests**

Assert that the build source names exactly two outputs, contains no manual-entry workbook, and includes all admin sheet names and default-data loaders.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/spreadsheet-package.test.mjs`

Expected: FAIL against the three-workbook builder.

- [ ] **Step 3: Update the builder**

Keep the site workbook's roster, master, RAW, and log. Build the integration-admin workbook with readable dashboard, connection/mapping inputs, empty normalized outputs, legends, frozen headers, filters where safe, data validation, and conditional formatting.

- [ ] **Step 4: Build using the bundled runtime**

Run the builder with the bundled dependency paths, the existing private roster, and `config/ufolio-master-items.json`.

- [ ] **Step 5: Inspect and render every output sheet**

Verify key ranges, scan `#REF!|#DIV/0!|#VALUE!|#NAME?|#N/A`, render every sheet, and visually inspect titles, inputs, tables, status colors, and clipping. Correct severe defects and rebuild once as needed.

- [ ] **Step 6: Run package and full tests**

Run: `node --test tests/spreadsheet-package.test.mjs && npm.cmd test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add scripts/build-spreadsheets.mjs scripts/verify-spreadsheets.mjs tests/spreadsheet-package.test.mjs
git commit -m "feat: build integration workbook package"
```

### Task 6: Rewrite installation and operations documentation

**Files:**
- Modify: `README.md`
- Modify: `apps-script/README.md`
- Modify: `docs/GOOGLE_SHEETS_SETUP.md`

**Interfaces:**
- Documents the exact files and Apps Script functions implemented above.

- [ ] **Step 1: Replace all three-workbook and manual-input instructions**

Document two workbooks, four Apps Script files, source viewer sharing, URL entry, connection validation, mapping review, first refresh, daily trigger, web-app deployment, and the privacy boundary.

- [ ] **Step 2: Add new-source onboarding**

Document the `CONFIG` path and `_UFOLIO_EXPORT` fallback, including required standard columns and the rule that source files remain unmodified by default.

- [ ] **Step 3: Add diagnostics guidance**

Explain `원본오류`, `원본노후`, `학생불일치`, `매핑대기`, and how to restore a renamed tab or changed column without deleting last-good data.

- [ ] **Step 4: Verify documentation references**

Run searches for `수기입력`, `MANUAL_SPREADSHEET`, `createLinkedWorkbooks`, and `1시간 자동` outside historical spec/plan files. Current operational docs and code must not retain legacy instructions.

- [ ] **Step 5: Commit**

```powershell
git add README.md apps-script/README.md docs/GOOGLE_SHEETS_SETUP.md
git commit -m "docs: add case-sheet integration runbook"
```

### Task 7: Final verification and GitHub delivery

**Files:**
- Verify all tracked source files and commits.

**Interfaces:**
- Produces a clean branch pushed to `https://github.com/hongbomshin-lab/ufolio.git`.

- [ ] **Step 1: Run complete verification**

Run:

```powershell
npm.cmd test
git diff --check
git check-ignore -v "현황시트 모음" private/student-roster.tsv outputs
git grep -n -E "patient|환자 이름|student-roster" -- . ':!docs/superpowers/**' ':!private/README.md'
```

Expected: tests pass, diff check is clean, operational sources are ignored, and no patient data or roster contents are tracked.

- [ ] **Step 2: Verify remote separation**

Confirm `origin` is `hongbomshin-lab/ufolio`, the current history has no common ancestor with the legacy Dalsin main, and only the intended U-FOLIO branch is pushed.

- [ ] **Step 3: Push**

```powershell
git push origin HEAD:main
```

- [ ] **Step 4: Verify remote SHA**

Compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/main`.

- [ ] **Step 5: Hand off the user-only Google actions**

Provide the two final workbook paths, the exact Apps Script paste order, source sharing/URL steps, mapping review, first sync, trigger, web-app deployment, and the explicit boundary that live Google permissions and `/exec` deployment cannot be completed locally.
