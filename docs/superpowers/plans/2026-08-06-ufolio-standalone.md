# U-folio Standalone Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Dalsin application with a clean, dependency-free static installer for one universal u-folio bookmarklet plus a Google Apps Script receiver that validates a private roster and appends all extracted score metrics to a private Spreadsheet.

**Architecture:** A static Vercel site builds one self-contained `javascript:` bookmarklet from an Apps Script deployment URL. The bookmarklet reads `name(student-id)` from the active u-folio session, calls the existing same-origin u-folio summary endpoints, previews the extracted rows, and sends one opaque cross-origin request. A spreadsheet-bound Apps Script validates student ID and name against a private `학생명단` sheet, then batch-appends rows to `RAW` and audit metadata to `전송기록`.

**Tech Stack:** HTML5, CSS, browser JavaScript ES2020, Node.js built-in test runner, Google Apps Script V8, Google Sheets, Vercel static hosting. No runtime or npm dependencies.

## Global Constraints

- The final public repository must contain no Next.js, React, Supabase, Dalsin feature code, generated build output, credentials, real roster, or real score data.
- Every user receives the same bookmarklet; no site account or per-user value is embedded.
- The bookmarklet may use the current u-folio same-origin session but must never transmit the password, session cookie, or auth token.
- Preserve `approvedCount`, `patientCount`, numeric `score`, and `scoreRaw` separately for every returned item.
- Do not hard-code eight departments; collect every department and item returned by u-folio.
- Keep the real roster only in `private/student-roster.tsv`, ignored by Git, and in the administrator-only Spreadsheet.
- Treat the public Apps Script URL as non-secret and document that the receiver cannot cryptographically prove a POST originated from u-folio.
- Because `mode: "no-cors"` produces an opaque response, user-facing copy must say `전송 요청 완료` rather than `저장 성공`.
- The final GitHub history starts from a new orphan root and does not include the old Dalsin commits.
- Git commit author remains `Woodoru <woodoru@naver.com>` and each commit ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Map

- `index.html`: accessible installation instructions and bookmarklet drag target.
- `styles.css`: all installer styling; no external font or asset dependency.
- `config.js`: exports the deployed Apps Script URL; empty is an intentional safe pre-deployment state.
- `bookmarklet.js`: pure parsers/normalizers, payload construction, and self-contained bookmarklet runtime builder.
- `site.js`: validates configuration, installs the generated URL on the anchor, and implements copy feedback.
- `vercel.json`: static clean-URL and security-header configuration.
- `package.json`: dependency-free `node --test` command.
- `.gitignore`: excludes credentials, old local artifacts, generated output, and the real roster.
- `apps-script/Code.gs`: sheet initialization, roster validation, request validation, audit logging, and batch RAW writes.
- `apps-script/README.md`: exact Spreadsheet preparation and Apps Script deployment procedure.
- `private/README.md`: explains the local-only roster workflow without containing personal data.
- `private/student-roster.tsv`: real roster supplied by the user; created locally and never staged.
- `tests/bookmarklet.test.mjs`: identity, metric, payload, and generated bookmarklet tests.
- `tests/apps-script.test.mjs`: executes `Code.gs` in a Node VM with Google service mocks.
- `tests/static-site.test.mjs`: verifies the static installer references and absence of legacy runtime dependencies.
- `README.md`: end-to-end local test, Apps Script, Vercel, privacy, and operational instructions.

### Task 1: Start the clean standalone root and static test harness

**Files:**
- Preserve: `docs/superpowers/specs/2026-08-06-ufolio-standalone-design.md`
- Preserve: `docs/superpowers/plans/2026-08-06-ufolio-standalone.md`
- Create: `.gitignore`
- Create: `package.json`
- Create: `vercel.json`
- Create: `config.js`
- Create: `tests/static-site.test.mjs`

**Interfaces:**
- Produces: `WEB_APP_URL: string` exported from `config.js`.
- Produces: `npm test` as the single full verification command.
- Consumes: no implementation files from earlier tasks.

- [ ] **Step 1: Create a new orphan branch and remove old tracked application files**

Run from the workspace root:

```powershell
git switch --orphan codex/ufolio-standalone
git rm -r --ignore-unmatch -- .
git checkout codex/ufolio-standalone-design -- docs/superpowers/specs/2026-08-06-ufolio-standalone-design.md docs/superpowers/plans/2026-08-06-ufolio-standalone.md
```

Expected: `git log` has no reachable Dalsin commit on the unborn branch, the old tracked application files are absent, and the two approved documents are restored. Existing unrelated untracked local files remain untouched.

- [ ] **Step 2: Write the failing static repository test**

Create `tests/static-site.test.mjs` with assertions that the required files exist, `package.json` has no dependencies, `index.html` loads `styles.css` and `site.js`, and tracked source contains none of `@supabase`, `next/`, or `react`.

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const required = ["index.html", "styles.css", "config.js", "bookmarklet.js", "site.js", "vercel.json"];

test("standalone static files exist", () => {
  for (const file of required) assert.equal(existsSync(file), true, file);
});

test("package has no external dependencies", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.devDependencies ?? {}, {});
});
```

- [ ] **Step 3: Run the test and verify the intended failure**

Run: `node --test tests/static-site.test.mjs`

Expected: FAIL because `index.html` and the other static implementation files do not exist.

- [ ] **Step 4: Add the minimal repository configuration**

Create `.gitignore` with exact exclusions:

```gitignore
.env
.env.*
.next/
node_modules/
.vercel/
.claude/
.omc/
8월 달신 결과/
docs/guide.html
private/student-roster.tsv
private/*.gs
coverage/
```

Create `package.json`:

```json
{
  "name": "ufolio-score-collector",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
```

Create `config.js`:

```js
export const WEB_APP_URL = "";
```

Create `vercel.json` with `cleanUrls: true`, `trailingSlash: false`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a CSP limited to self-hosted scripts/styles plus links to `https://sdent.u-folio.com`.

- [ ] **Step 5: Run the focused test**

Run: `node --test tests/static-site.test.mjs`

Expected: still FAIL only for the static page and script files intentionally scheduled for later tasks; package/dependency checks PASS.

- [ ] **Step 6: Commit the clean scaffold**

```powershell
git add .gitignore package.json vercel.json config.js tests/static-site.test.mjs docs/superpowers
git commit -m "chore: start standalone u-folio collector" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 2: Implement tested identity and score normalization

**Files:**
- Create: `bookmarklet.js`
- Create: `tests/bookmarklet.test.mjs`

**Interfaces:**
- Produces: `parseIdentityText(text: string): { name: string, studentId: string } | null`.
- Produces: `normalizeNullableNumber(value: unknown): number | null`.
- Produces: `createSubmission({ identity, practices, items, now, uuid }): SubmissionPayload`.
- Later tasks consume these exact exports and payload property names from the design spec.

- [ ] **Step 1: Write failing identity tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseIdentityText,
  normalizeNullableNumber,
  createSubmission,
} from "../bookmarklet.js";

test("parses a u-folio header identity", () => {
  assert.deepEqual(parseIdentityText(" 홍길동 ( 2024-12345 ) "), {
    name: "홍길동",
    studentId: "2024-12345",
  });
});

test("rejects missing and ambiguous identities", () => {
  assert.equal(parseIdentityText("로그인"), null);
  assert.equal(parseIdentityText("홍길동(2024-12345) 김학생(2024-54321)"), null);
});

test("keeps zero and decimal scores distinct from unset", () => {
  assert.equal(normalizeNullableNumber(0), 0);
  assert.equal(normalizeNullableNumber("6.5"), 6.5);
  assert.equal(normalizeNullableNumber("미설정"), null);
  assert.equal(normalizeNullableNumber(""), null);
});
```

- [ ] **Step 2: Run the test to prove it fails**

Run: `node --test tests/bookmarklet.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `bookmarklet.js`.

- [ ] **Step 3: Implement minimal pure functions**

Use one global identity regex with exact single-match enforcement:

```js
const IDENTITY_RE = /([가-힣A-Za-z][가-힣A-Za-z\s·]{0,39}?)\s*\(\s*(\d{4}-\d{5})\s*\)/g;

export function parseIdentityText(text) {
  const matches = [...String(text ?? "").matchAll(IDENTITY_RE)];
  if (matches.length !== 1) return null;
  return {
    name: matches[0][1].trim().replace(/\s+/g, " "),
    studentId: matches[0][2],
  };
}

export function normalizeNullableNumber(value) {
  if (value == null || String(value).trim() === "" || String(value).trim() === "미설정") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
```

Implement `createSubmission` with `schemaVersion`, `submissionId`, `clientSentAt`, `student`, `practices`, and `items`, preserving zero and decimal values.

- [ ] **Step 4: Run identity and payload tests**

Run: `node --test tests/bookmarklet.test.mjs`

Expected: PASS for identity, ambiguity, metric, and payload shape cases.

- [ ] **Step 5: Commit the pure core**

```powershell
git add bookmarklet.js tests/bookmarklet.test.mjs
git commit -m "feat: parse u-folio identity and score data" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 3: Build the universal self-contained bookmarklet

**Files:**
- Modify: `bookmarklet.js`
- Modify: `tests/bookmarklet.test.mjs`

**Interfaces:**
- Consumes: the `SubmissionPayload` shape from Task 2.
- Produces: `buildBookmarklet(webAppUrl: string): string`.
- Produces inside the generated URL: `bookmarkletRuntime(webAppUrl)` with no site account argument.

- [ ] **Step 1: Add failing generated-source tests**

```js
import { buildBookmarklet } from "../bookmarklet.js";

test("builds one universal bookmarklet without a student value", () => {
  const result = buildBookmarklet("https://script.google.com/macros/s/EXAMPLE/exec");
  assert.match(result, /^javascript:/);
  const source = decodeURIComponent(result.slice("javascript:".length));
  assert.match(source, /dent_summary\/list/);
  assert.match(source, /dent_summary\/getSummaryData/);
  assert.match(source, /mode:\s*["']no-cors["']/);
  assert.doesNotMatch(source, /login_id|달신 아이디|2024-12345/);
});
```

Add a test that an empty or non-HTTPS Apps Script URL throws `Apps Script 웹앱 URL이 올바르지 않습니다.`.

- [ ] **Step 2: Run the focused test to prove it fails**

Run: `node --test --test-name-pattern="universal|URL" tests/bookmarklet.test.mjs`

Expected: FAIL because `buildBookmarklet` is not exported.

- [ ] **Step 3: Implement URL validation and self-contained runtime**

`buildBookmarklet` must validate `https://script.google.com/macros/s/.../exec`, stringify one async runtime function, inject only the receiver URL, and return an encoded `javascript:` URL.

The runtime must:

1. Require a hostname containing `u-folio`.
2. Search targeted selectors `.user-info-wrap`, `.user-info`, `.user-name`, `.profile`, and `header` in order; accept exactly one parsed identity.
3. Read `administer_code` from the page with fallback `15`.
4. Call `/ajax/st/dent_summary/list` page-by-page, deduplicating courses by `(curr_seq, dt_seq, hospital_seq)`.
5. Show available `curr_name` values as checked checkboxes.
6. Call every selected course's `/ajax/st/dent_summary/getSummaryData` and abort the entire send if any course fails.
7. Map each response item to the camelCase payload fields from Task 2.
8. Preview scored rows by default, allow showing zero/unset rows, and display the detected name and student ID.
9. Send `text/plain;charset=UTF-8` JSON with `mode: "no-cors"` and no `credentials` to the Apps Script URL.
10. Display `전송 요청 완료 - 관리자 전송기록에서 확인` after fetch resolution, never `저장 성공`.

Use `crypto.randomUUID()` with a timestamp/random fallback. Escape all u-folio strings before assigning HTML to the overlay.

- [ ] **Step 4: Run all bookmarklet tests**

Run: `node --test tests/bookmarklet.test.mjs`

Expected: PASS, including endpoint presence, no per-user identifier, URL validation, and opaque-response wording.

- [ ] **Step 5: Commit the bookmarklet**

```powershell
git add bookmarklet.js tests/bookmarklet.test.mjs
git commit -m "feat: add universal u-folio bookmarklet" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 4: Implement and mock-test the Apps Script receiver

**Files:**
- Create: `apps-script/Code.gs`
- Create: `tests/apps-script.test.mjs`

**Interfaces:**
- Consumes: Task 2 payload property names exactly.
- Produces: `setupSheets()`, `doPost(e)`, `validatePayload_(value)`, `normalizeName_(value)`, `safeCellText_(value)`, and `processSubmission_(payload, services)`.
- Produces Spreadsheet sheets `학생명단`, `RAW`, and `전송기록` with the exact headers in the design spec.

- [ ] **Step 1: Write a failing Node VM test for Code.gs**

Load `apps-script/Code.gs` with `node:vm`, providing mocks for `SpreadsheetApp`, `LockService`, `ContentService`, and `Utilities`. Construct a fake workbook containing one fictitious roster row `7 / 2024-54321 / 테스트학생` only inside the test fixture.

```js
test("accepts a roster match and appends every item metric", () => {
  const result = invokeDoPost({
    schemaVersion: 1,
    submissionId: "11111111-1111-4111-8111-111111111111",
    clientSentAt: "2026-08-06T00:00:00.000Z",
    student: { studentId: "2024-54321", name: "테스트학생" },
    practices: ["3학년 치의학 임상실습 2"],
    items: [{
      practiceName: "3학년 치의학 임상실습 2",
      departmentName: "보존과",
      menuName: "증례별 임상참여",
      itemName: "Observation case",
      approvedCount: 3,
      patientCount: 3,
      score: 6.5,
      scoreRaw: "6.5"
    }]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(workbook.rawRows[0].slice(2, 13), [
    7, "2024-54321", "테스트학생", "3학년 치의학 임상실습 2",
    "보존과", "증례별 임상참여", "Observation case", 3, 3, 6.5, "6.5"
  ]);
});
```

Add cases for unknown student ID, mismatched name, zero, unset score, more than 5000 items, malformed body, and a formula-like item name `=IMPORTXML(...)` stored as literal text.

- [ ] **Step 2: Run the Apps Script test to prove it fails**

Run: `node --test tests/apps-script.test.mjs`

Expected: FAIL because `apps-script/Code.gs` does not exist.

- [ ] **Step 3: Implement sheet constants and setup**

In `Code.gs`, define exact headers:

```js
var RAW_HEADERS = [
  "수신시각", "전송 ID", "출석번호", "학번", "이름", "실습차수", "과",
  "메뉴/구분", "항목", "승인 수", "환자 수", "점수", "점수 원문"
];
var ROSTER_HEADERS = ["출석번호", "학번", "이름"];
var LOG_HEADERS = [
  "수신시각", "전송 ID", "출석번호", "학번", "이름", "항목 수", "상태", "상세 사유"
];
var MAX_ITEMS = 5000;
```

`setupSheets()` creates missing sheets, writes headers only when row 1 is empty, freezes row 1, and sets the student-ID columns to plain text.

- [ ] **Step 4: Implement validation and literal-cell safety**

- Require `schemaVersion === 1`.
- Require a UUID-shaped `submissionId` and `student.studentId` matching `^\d{4}-\d{5}$`.
- Normalize names by trim plus whitespace collapse, not by removing Korean characters.
- Require `items` as an array of 1 through 5000 entries.
- Cap practice, department, menu, item, scoreRaw, name, and reason lengths.
- Accept finite numbers or null for metrics; preserve zero and decimals.
- Prefix strings beginning with `=`, `+`, `-`, or `@` with an apostrophe before sheet output.

- [ ] **Step 5: Implement roster validation and locked batch append**

Read `학생명단!A2:C`, key by exact student ID, reject duplicate IDs, compare normalized names, and map to the attendance number. Acquire a script lock before obtaining last rows and performing `setValues`.

For success, append all RAW rows in one call, then append one `전송기록` success row. For rejection, append only a `전송기록` row with status `거부`; never write item data to `RAW`. Return JSON through `ContentService` even though the browser cannot inspect it.

- [ ] **Step 6: Run all Apps Script tests**

Run: `node --test tests/apps-script.test.mjs`

Expected: PASS for successful mapping, rejection cases, numeric preservation, maximum items, literal text, audit rows, and lock release.

- [ ] **Step 7: Commit the receiver**

```powershell
git add apps-script/Code.gs tests/apps-script.test.mjs
git commit -m "feat: validate and store u-folio submissions" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 5: Create the real local roster and private import workflow

**Files:**
- Create: `private/README.md`
- Create locally, never stage: `private/student-roster.tsv`
- Create locally, never stage: `private/SeedRoster.gs`
- Modify: `apps-script/README.md`
- Modify: `.gitignore`
- Test: `tests/static-site.test.mjs`

**Interfaces:**
- Consumes: `학생명단` columns from Task 4.
- Produces: a ready-to-paste local TSV using the user-supplied roster rows.
- Produces: a local Apps Script helper `seedRoster()` that writes those rows to `학생명단` and refuses to overwrite a non-empty roster unless explicitly cleared by the administrator.

- [ ] **Step 1: Add the privacy regression test**

Extend `tests/static-site.test.mjs` to assert:

```js
test("real roster is ignored and absent from tracked documentation", () => {
  const ignore = readFileSync(".gitignore", "utf8");
  assert.match(ignore, /^private\/student-roster\.tsv$/m);
  assert.match(ignore, /^private\/\*\.gs$/m);
  const publicDocs = ["README.md", "private/README.md", "apps-script/README.md"]
    .filter(existsSync)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(publicDocs, /student-roster\.tsv[\s\S]*\d{4}-\d{5}[\s\S]*[가-힣]{2,4}/);
});
```

- [ ] **Step 2: Run the privacy test and prove it fails**

Run: `node --test --test-name-pattern="roster" tests/static-site.test.mjs`

Expected: FAIL until the ignore rules and public private-workflow documentation exist.

- [ ] **Step 3: Create the public private-workflow documentation**

`private/README.md` explains that the administrator must keep the TSV local, paste it into the private spreadsheet or use the local untracked seed helper, verify row count, and later add 98–100 without code changes. It contains no real roster row.

`apps-script/README.md` instructs the administrator to create the bound script, paste `Code.gs`, run `setupSheets()`, populate `학생명단`, and verify the three headers before deployment.

- [ ] **Step 4: Create the actual ignored roster artifacts**

Create `private/student-roster.tsv` from the exact user-supplied list with header `출석번호\t학번\t이름`. Preserve non-contiguous attendance numbers; do not invent missing students or the unprovided 98–100 entries.

Create ignored `private/SeedRoster.gs` with a `seedRoster()` function containing the same rows and an explicit guard:

```js
if (sheet.getLastRow() > 1) {
  throw new Error("학생명단에 이미 데이터가 있어 덮어쓰지 않았습니다.");
}
```

The helper writes all supplied rows in one `setValues`, formats the student-ID column as text, and reports the inserted row count.

- [ ] **Step 5: Verify Git cannot stage the roster**

Run:

```powershell
git check-ignore -v private/student-roster.tsv private/SeedRoster.gs
git status --short
```

Expected: both private files match `.gitignore` and neither appears in `git status`.

- [ ] **Step 6: Run the privacy test**

Run: `node --test --test-name-pattern="roster" tests/static-site.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit only public workflow files**

```powershell
git add .gitignore private/README.md apps-script/README.md tests/static-site.test.mjs
git commit -m "docs: add private roster setup workflow" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Before committing, run `git diff --cached --name-only` and verify that neither `student-roster.tsv` nor `SeedRoster.gs` is listed.

### Task 6: Build the static installer page

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `site.js`
- Modify: `tests/static-site.test.mjs`

**Interfaces:**
- Consumes: `WEB_APP_URL` from `config.js`.
- Consumes: `buildBookmarklet(webAppUrl)` from `bookmarklet.js`.
- Produces: anchor `#bookmarklet-link`, textarea `#bookmarklet-code`, button `#copy-code`, and status `#config-status`.

- [ ] **Step 1: Extend the static page test with required accessible controls**

Assert `index.html` contains the four exact IDs, a link to `https://sdent.u-folio.com/st/dentistry-3/dent_summary`, Korean installation instructions, and no login/signup form. Assert `site.js` imports both configuration and builder modules and sets the anchor `href` only after successful URL validation.

- [ ] **Step 2: Run the static page test to prove it fails**

Run: `node --test tests/static-site.test.mjs`

Expected: FAIL because the page files do not exist.

- [ ] **Step 3: Implement semantic installer HTML**

Use `<main>`, ordered steps, keyboard-focusable copy button, a draggable anchor, a read-only textarea, and a visible privacy/security note. Include these exact user truths:

- 자체 회원가입이나 로그인 없음
- 모든 학생이 같은 북마클릿 사용
- u-folio 비밀번호와 로그인 쿠키를 전송하지 않음
- 전송 요청 완료 여부와 Spreadsheet 저장 성공은 다를 수 있음

- [ ] **Step 4: Implement local CSS and page behavior**

Create a responsive single-card layout without external fonts or images. In `site.js`, catch invalid/empty configuration and disable the drag target with `Apps Script 웹앱 URL이 아직 설정되지 않았습니다.`. On success, set the generated URL via `setAttribute`, fill the textarea, prevent accidental execution on the installer page, and copy via `navigator.clipboard` with textarea selection fallback.

- [ ] **Step 5: Run static and bookmarklet tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the installer**

```powershell
git add index.html styles.css site.js tests/static-site.test.mjs
git commit -m "feat: add universal bookmarklet installer" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 7: Complete deployment and operator documentation

**Files:**
- Create: `README.md`
- Complete: `apps-script/README.md`
- Modify: `tests/static-site.test.mjs`

**Interfaces:**
- Documents all interfaces from Tasks 1–6.
- Produces exact operator sequence from private roster import through Vercel production deployment.

- [ ] **Step 1: Add failing documentation assertions**

Assert the README contains the commands `npm test`, `setupSheets()`, `seedRoster()`, the Apps Script deployment settings `실행: 나` and `액세스: 모든 사용자`, the `/exec` URL placement in `config.js`, Vercel static deployment, the `no-cors` confirmation limitation, and instructions for adding students 98–100 to the private sheet.

- [ ] **Step 2: Run the documentation test to prove it fails**

Run: `node --test --test-name-pattern="documentation" tests/static-site.test.mjs`

Expected: FAIL because the complete root README does not exist.

- [ ] **Step 3: Write the end-to-end README**

Document this exact order:

1. Create the private Google Spreadsheet.
2. Open Extensions → Apps Script and paste `apps-script/Code.gs`.
3. Run `setupSheets()` and authorize the script.
4. Paste `private/SeedRoster.gs` locally into the private Apps Script editor, run `seedRoster()`, verify the row count, then delete that helper from the Apps Script project.
5. Deploy as Web app with execute-as owner and access for anyone; copy the final `/exec` URL.
6. Set `WEB_APP_URL` in `config.js`.
7. Run `npm test`.
8. Push the orphan branch to a brand-new GitHub repository as its `main` branch.
9. Import that repository into a brand-new Vercel project with Framework Preset `Other` and no build command/output directory.
10. Install one bookmarklet and perform the single-account integration checklist from the design spec.

Also document RAW headers, latest-row key, re-send behavior, privacy boundary, and the spoofable-public-endpoint limitation.

- [ ] **Step 4: Run all automated tests**

Run: `npm test`

Expected: all bookmarklet, Apps Script mock, privacy, static page, and documentation tests PASS.

- [ ] **Step 5: Commit the documentation**

```powershell
git add README.md apps-script/README.md tests/static-site.test.mjs
git commit -m "docs: add standalone deployment runbook" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 8: Final verification and clean-history audit

**Files:**
- Verify all committed files.
- Do not modify the ignored real roster except to confirm its row count and formatting.

**Interfaces:**
- Consumes every deliverable from Tasks 1–7.
- Produces a verified clean standalone branch ready for a new GitHub remote and Vercel project.

- [ ] **Step 1: Run the full test suite from a clean process**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Check syntax and generated bookmarklet size**

Run:

```powershell
node --check bookmarklet.js
node --check site.js
node -e "import('./bookmarklet.js').then(m=>console.log(m.buildBookmarklet('https://script.google.com/macros/s/EXAMPLE/exec').length))"
```

Expected: syntax checks exit 0 and the generated bookmarklet length is printed for browser-limit review. If it exceeds 60,000 characters, reduce repeated UI markup without removing validation or data fields, then rerun tests.

- [ ] **Step 3: Audit tracked files and secrets**

Run:

```powershell
git ls-files
git grep -n -I -E "SUPABASE|NEXT_PUBLIC|SERVICE_ROLE" -- .
git ls-files private | Select-String -Pattern 'student-roster|SeedRoster'
git status --short
git check-ignore -v private/student-roster.tsv private/SeedRoster.gs
```

Expected: no legacy secret/config markers or real roster entry in tracked files, private artifacts are ignored, and only known unrelated pre-existing untracked files may remain.

- [ ] **Step 4: Audit root history**

Run:

```powershell
git log --oneline --decorate --max-count=20
git rev-list --max-parents=0 HEAD
git branch --show-current
```

Expected: branch `codex/ufolio-standalone` has one root commit lineage containing only the standalone project; no Dalsin commit is reachable from HEAD.

- [ ] **Step 5: Inspect the page locally**

Serve the static directory with a local HTTP server available in the workspace, open the installer, and confirm desktop/mobile layout, drag target, copy behavior, missing-config error or configured link, Korean copy, and u-folio link. Do not claim live u-folio or Spreadsheet success without performing the external integration test.

- [ ] **Step 6: Record final verification state**

If `WEB_APP_URL` is still empty because the external Apps Script deployment has not occurred, report the code as verified and deployment as awaiting the administrator-provided `/exec` URL. Do not substitute an invented URL and do not report end-to-end success.
