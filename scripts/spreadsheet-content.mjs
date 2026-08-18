export function buildSiteGuideLines(rosterCount) {
  return [
    `Google Drive에 업로드한 뒤 파일 → Google 스프레드시트로 저장하여 변환하고 학생명단 ${rosterCount}명을 확인합니다.`,
    "Apps Script에 Code.gs, CaseSheetCore.gs, CaseSheetDefaults.gs, CaseSheetSync.gs, CaseSheetDashboard.gs, SystemSetup.gs를 각각 붙여넣습니다.",
    "메뉴 유폴리오 통합관리 → 화면 구성 새로 적용을 실행하면 대시보드·비교결과·보철비교·현황시트연결·측정값설정만 보이게 구성됩니다.",
    "현황시트연결에 원본 시트 URL을 입력하고 연결 검사 → 지금 전체 동기화를 실행합니다.",
    "Apps Script를 웹 앱으로 배포하고 /exec URL을 웹사이트 config.js에 입력합니다.",
    "정상 동기화 확인 후 매일 새벽 3시 동기화를 켭니다.",
  ];
}
