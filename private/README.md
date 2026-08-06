# 비공개 학생명단

이 폴더의 `student-roster.tsv`와 `SeedRoster.gs`는 실제 학생 개인정보를 담는 로컬 전용 파일입니다. 두 파일은 `.gitignore`에 등록되어 있으며 GitHub나 Vercel에 올리면 안 됩니다.

## 기본 사용 순서

실제 명단과 마스터항목이 포함된 로컬 `outputs/.../01_유폴리오_사이트인증.xlsx`를 Google Sheets로 변환하고, Apps Script 5개 파일을 붙여넣은 뒤 `createIntegrationAdminWorkbook()`을 실행합니다. 전체 순서는 `docs/GOOGLE_SHEETS_SETUP.md`를 따르세요.

## SeedRoster 대체 절차

준비된 xlsx를 사용할 수 없을 때만 다음 절차를 사용합니다.

1. 관리자 전용 Google Spreadsheet에서 `apps-script/Code.gs`의 `setupSheets()`를 실행합니다.
2. 로컬 `SeedRoster.gs` 내용을 같은 Apps Script 프로젝트에 임시로 붙여넣습니다.
3. `seedRoster()`를 한 번 실행합니다.
4. Spreadsheet의 `학생명단` 시트에서 행 수와 `출석번호 | 학번 | 이름`을 확인합니다.
5. Apps Script 프로젝트에서 임시 `SeedRoster.gs` 파일을 삭제합니다. 시트에 입력된 명단은 유지됩니다.
6. 현재 명단은 헤더를 제외하고 93명인지 확인합니다.

`seedRoster()`는 기존 명단이 있을 때 덮어쓰지 않고 중단합니다. 다시 넣어야 한다면 관리자가 시트의 데이터 행을 직접 확인하고 비운 뒤 실행하세요.
