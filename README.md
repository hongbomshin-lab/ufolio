# 유폴리오 점수 수집기

로그인된 u-folio 세션에서 본인의 이름·학번과 임상실습 점수를 가져와 관리자 전용 Google Spreadsheet로 전송하는 공통 북마클릿입니다.

- 자체 회원가입·로그인 없음
- 학생별 북마클릿 없음: 모두 같은 코드 사용
- u-folio 비밀번호·세션 쿠키·인증 토큰 전송 안 함
- Next.js·React·Supabase·외부 npm 의존성 없음
- 정적 Vercel 페이지 + Spreadsheet-bound Apps Script만 사용

## 저장소 구성

```text
index.html              북마클릿 설치·사용 안내
styles.css              정적 페이지 디자인
config.js               Apps Script /exec URL 설정
bookmarklet.js          u-folio 추출 및 전송 코드
site.js                 설치 페이지 동작
apps-script/Code.gs     Spreadsheet 수신기
apps-script/README.md   Apps Script 설치 상세
private/README.md       실제 명단을 공개하지 않는 입력 절차
tests/                  Node 내장 테스트
```

실제 명단은 로컬의 Git 제외 파일인 `private/student-roster.tsv`와 `private/SeedRoster.gs`에 있습니다. 현재 제공된 90행을 그대로 담았고, 두 파일은 공개 저장소에 포함되지 않습니다.

## 1. 로컬 검증

Node.js만 있으면 패키지 설치 없이 테스트할 수 있습니다.

```powershell
npm.cmd test
```

PowerShell 실행 정책이 `npm.ps1`을 허용하는 환경에서는 `npm test`도 동일하게 동작합니다.

검증 범위:

- `이름(학번)` 자동 파싱과 애매한 후보 거부
- 0·소수점·`미설정` 구분
- 모든 점수 필드가 포함된 전송 페이로드
- 개인값이 없는 공통 북마클릿 생성
- Apps Script URL 검증
- 명단 매핑·미등록 학번·이름 불일치 거부
- 최대 5,000항목 제한과 수식 주입 방어
- 명단 파일의 Git 제외 상태
- 설치 페이지의 설정 전·후 동작

## 2. 관리자 전용 Spreadsheet 만들기

1. 관리자 Google 계정에서 새 Spreadsheet를 만듭니다.
2. 학생과 파일을 공유하지 않습니다.
3. `확장 프로그램 → Apps Script`를 엽니다.
4. 기본 코드를 지우고 [apps-script/Code.gs](apps-script/Code.gs)를 붙여넣습니다.
5. 저장한 뒤 함수 선택에서 `setupSheets()`를 실행합니다.
6. Google 권한 요청을 승인합니다.
7. `학생명단`, `RAW`, `전송기록` 시트가 생성됐는지 확인합니다.

### 실제 학생명단 90명 입력

1. 로컬에서 Git에 포함되지 않은 `private/SeedRoster.gs`를 엽니다.
2. Apps Script 편집기에 임시 스크립트 파일을 하나 만들고 내용을 붙여넣습니다.
3. `seedRoster()`를 한 번 실행합니다.
4. `학생명단` 시트에 헤더를 제외한 90행이 생겼는지 확인합니다.
5. 학번 열이 `YYYY-NNNNN` 형식으로 보이는지 확인합니다.
6. Apps Script 프로젝트에서 임시 시딩 파일을 삭제합니다. 이미 시트에 입력된 명단은 유지됩니다.

`seedRoster()`는 기존 데이터가 있으면 덮어쓰지 않고 중단합니다. 98~100번의 학번·이름이 확정되면 `학생명단` 끝에 `출석번호 | 학번 | 이름` 순서로 직접 추가하면 됩니다. `Code.gs` 변경이나 재배포는 필요하지 않습니다.

## 3. Apps Script 웹 앱 배포

Apps Script 편집기에서 다음과 같이 배포합니다.

1. `배포 → 새 배포`
2. 유형: `웹 앱`
3. 설명: `유폴리오 점수 수신기`
4. 실행: `나`
5. 액세스: `모든 사용자`
6. `배포` 후 권한 승인
7. `/exec`로 끝나는 웹 앱 URL 복사

배포 URL 예시 형식:

```text
https://script.google.com/macros/s/배포ID/exec
```

이 URL은 북마클릿에 포함되므로 비밀값이 아닙니다.

## 4. 정적 사이트에 수신 URL 연결

[config.js](config.js)의 빈 문자열을 실제 `/exec` URL로 바꿉니다.

```js
export const WEB_APP_URL = "https://script.google.com/macros/s/배포ID/exec";
```

다시 검증합니다.

```powershell
npm.cmd test
```

URL이 비어 있거나 잘못되면 설치 페이지가 북마클릿 설치를 차단하고 설정 오류를 표시합니다.

## 5. 새 GitHub 저장소로 올리기

현재 `codex/ufolio-standalone` 브랜치는 기존 달신 이력이 닿지 않는 새 루트 커밋에서 시작합니다. 새 GitHub 저장소를 만든 뒤 기존 달신 원격 저장소에 실수로 푸시하지 않도록 별도 원격 이름을 사용하세요.

```powershell
git remote add ufolio-origin https://github.com/사용자명/새저장소.git
git push -u ufolio-origin codex/ufolio-standalone:main
```

푸시 전 확인:

```powershell
git ls-files
git check-ignore -v private/student-roster.tsv private/SeedRoster.gs
```

두 비공개 파일은 `git ls-files`에 없어야 하고 `git check-ignore`에는 나타나야 합니다.

## 6. 새 Vercel 프로젝트 배포

1. Vercel에서 `Add New → Project`를 선택합니다.
2. 새 GitHub 저장소를 가져옵니다.
3. Framework Preset은 `Other`를 선택합니다.
4. Build Command는 비워 둡니다.
5. Output Directory도 비워 둡니다.
6. 배포합니다.

사이트는 정적 파일만 제공하므로 서버 환경변수나 데이터베이스 연결이 없습니다.

## 7. 실제 통합 확인

전체 공지 전에 계정 한 개로 확인합니다.

1. Vercel 설치 페이지에서 북마클릿 버튼을 즐겨찾기 바로 드래그합니다.
2. [u-folio 임상실습요약표](https://sdent.u-folio.com/st/dentistry-3/dent_summary)에 로그인합니다.
3. 즐겨찾기의 `유폴리오 점수 전송`을 실행합니다.
4. 화면 상단의 이름·학번이 자동 감지됐는지 확인합니다.
5. 실습차수를 선택하고 `추출하고 전송`을 누릅니다.
6. 과·항목 수와 표본 점수를 u-folio 화면과 비교합니다.
7. Spreadsheet `전송기록`에 성공 행이 생겼는지 확인합니다.
8. `RAW`에 같은 전송 ID로 모든 항목이 추가됐는지 확인합니다.
9. 한 번 더 실행해 새 전송 ID로 누적되는지 확인합니다.

브라우저의 `no-cors` 제약 때문에 북마클릿의 “전송 요청 완료”는 Apps Script 저장 성공을 보증하지 않습니다. 최종 성공은 반드시 `전송기록`에서 확인합니다.

## RAW 데이터

| 열 | 내용 |
|---|---|
| A | 수신시각 |
| B | 전송 ID |
| C | 출석번호 |
| D | 학번 |
| E | 이름 |
| F | 실습차수 |
| G | 과 |
| H | 메뉴/구분 |
| I | 항목 |
| J | 승인 수 |
| K | 환자 수 |
| L | 점수 |
| M | 점수 원문 |

재전송은 이전 데이터를 삭제하지 않고 새 행으로 누적됩니다. 후속 비교에서 최신값을 고를 때는 `(출석번호 + 실습차수 + 과 + 메뉴/구분 + 항목)`을 키로 삼아 가장 최근 수신시각의 행을 사용합니다.

## 보안과 개인정보 경계

- Spreadsheet와 실제 명단은 관리자만 접근합니다.
- 공개 GitHub와 Vercel에는 실제 명단이나 점수가 없습니다.
- 북마클릿은 u-folio 비밀번호, 세션 쿠키, 인증 토큰을 외부로 전송하지 않습니다.
- 학번과 이름이 비공개 명단에 모두 일치해야 `RAW`에 저장됩니다.
- Apps Script 공개 URL은 외부 POST를 받을 수 있으므로, 기술적으로 조작된 요청을 완전히 막지는 못합니다.
- u-folio가 외부 검증 가능한 서명 토큰이나 인증 API를 제공하지 않는 한 “실제 u-folio 세션에서 왔다”는 사실을 암호학적으로 증명할 수 없습니다.
- 따라서 `전송 ID`, 수신시각, 항목 수, 거부 사유를 `전송기록`에 남겨 이상 전송을 추적합니다.

## 운영 업데이트

- 학생 추가: `학생명단` 시트 행 추가만 필요
- Apps Script 코드 변경: 기존 웹 앱 배포를 새 버전으로 갱신
- 새 `/exec` URL 발급: `config.js` 변경 후 Vercel 재배포
- 북마클릿 코드 변경: 정적 사이트 재배포 후 학생이 북마클릿을 다시 설치해야 함
