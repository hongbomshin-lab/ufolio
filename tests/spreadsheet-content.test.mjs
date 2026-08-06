import test from "node:test";
import assert from "node:assert/strict";
import { buildSiteGuideLines } from "../scripts/spreadsheet-content.mjs";

test("site guide displays the actual roster count", () => {
  assert.equal(
    buildSiteGuideLines(93)[0],
    "Google Drive에 업로드한 뒤 파일 → Google 스프레드시트로 저장하여 변환하고 학생명단 93명을 확인합니다.",
  );
});
