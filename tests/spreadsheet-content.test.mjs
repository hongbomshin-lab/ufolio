import test from "node:test";
import assert from "node:assert/strict";
import { buildSiteGuideLines } from "../scripts/spreadsheet-content.mjs";

test("site guide displays the actual roster count", () => {
  assert.equal(
    buildSiteGuideLines(93)[0],
    "이 파일을 Google Sheets로 가져오고 학생명단 93명을 확인합니다.",
  );
});
