# Apps Script 설치

## 1. Spreadsheet 준비

1. 준비된 `01_유폴리오_사이트인증.xlsx`를 Google Drive에 업로드해 Google Sheets로 변환합니다.
2. 파일은 학생과 공유하지 않습니다.
3. `확장 프로그램 → Apps Script`를 엽니다.
4. 저장소의 `apps-script/Code.gs`와 `apps-script/SystemSetup.gs`를 각각 붙여넣고 저장합니다.
5. 함수 목록에서 `createLinkedWorkbooks()`를 실행하고 권한을 승인합니다.
6. Google Drive에 ② 수기입력, ③ 관리자 파일이 생성됐는지 확인합니다.

## 2. 실제 명단 입력

권장 방법은 실제 명단과 마스터항목이 들어 있는 `01_유폴리오_사이트인증.xlsx`를 가져오는 것입니다.

또는 로컬 `private/student-roster.tsv` 내용을 `학생명단!A2`부터 직접 붙여넣어도 됩니다. 학번 열은 일반 텍스트 형식을 유지하세요. 전체 작업 순서는 `docs/GOOGLE_SHEETS_SETUP.md`를 따르세요.

실제 명단 파일을 Git에 강제로 추가하거나 공개 문서에 복사하지 마세요.

## 3. 웹 앱 배포

1. Apps Script 우측 상단 `배포 → 새 배포`를 선택합니다.
2. 유형은 `웹 앱`입니다.
3. 실행 사용자는 `나`로 설정합니다.
4. 액세스 권한은 `모든 사용자`로 설정합니다.
5. 배포 후 `/exec`로 끝나는 웹 앱 URL을 복사합니다.
6. 정적 사이트의 `config.js`에 해당 URL을 입력합니다.

웹 앱 URL은 공통 북마클릿에 포함되므로 비밀값이 아닙니다. `학생명단` 일치 검사는 오입력을 줄이지만 임의 POST를 암호학적으로 차단하지 못합니다.

## 4. 업데이트

`Code.gs`를 변경한 뒤에는 Apps Script에서 기존 배포를 수정해 새 버전으로 배포합니다. 새 배포 URL을 발급했다면 `config.js`도 함께 변경해야 합니다.
