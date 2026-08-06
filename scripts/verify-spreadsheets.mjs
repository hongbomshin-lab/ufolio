import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [outputDir] = process.argv.slice(2);
const artifactEntry = process.env.ARTIFACT_TOOL_ENTRY;
if (!outputDir || !artifactEntry) {
  throw new Error("사용법: ARTIFACT_TOOL_ENTRY=<artifact_tool.mjs> node scripts/verify-spreadsheets.mjs <출력폴더>");
}

const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(artifactEntry).href);
const summary = JSON.parse(await fs.readFile(path.join(outputDir, "build-summary.json"), "utf8"));
const previewDir = path.join(outputDir, "previews");
await fs.mkdir(previewDir, { recursive: true });

const expectedSheets = {
  "01_유폴리오_사이트인증.xlsx": ["사용안내", "설정", "학생명단", "마스터항목", "RAW", "전송기록"],
  "02_유폴리오_수기입력.xlsx": ["사용안내", "학생명단", ...summary.departments, "통계"],
  "03_유폴리오_관리자.xlsx": ["사용안내", "설정", "마스터항목", "사이트최신", "수기DB", "불일치", "대시보드"],
};

const errorPattern = /#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/i;
const report = [];

for (const filePath of summary.files) {
  const fileName = path.basename(filePath);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const expected = expectedSheets[fileName];
  const actual = expected.map((name) => workbook.worksheets.getItem(name).name);
  const formulaErrors = [];
  const previews = [];

  for (const sheetName of actual) {
    const sheet = workbook.worksheets.getItem(sheetName);
    const used = sheet.getUsedRange();
    if (used) {
      const values = used.values || [];
      values.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
        if (typeof value === "string" && errorPattern.test(value)) {
          formulaErrors.push(`${sheetName}!R${rowIndex + 1}C${colIndex + 1}: ${value}`);
        }
      }));
    }
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 0.35, format: "png" });
    const safeName = `${fileName.replace(/\.xlsx$/i, "")}__${sheetName.replace(/[\\/:*?"<>|]/g, "_")}.png`;
    const previewPath = path.join(previewDir, safeName);
    await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
    previews.push(previewPath);
  }

  const rosterSheet = expected.includes("학생명단") ? workbook.worksheets.getItem("학생명단") : null;
  const rosterCount = rosterSheet ? rosterSheet.getRange("A2:A201").values.filter((row) => row[0] !== "" && row[0] != null).length : null;
  const masterSheet = expected.includes("마스터항목") ? workbook.worksheets.getItem("마스터항목") : null;
  const masterCount = masterSheet ? masterSheet.getRange("A2:A500").values.filter((row) => row[0] !== "" && row[0] != null).length : null;
  report.push({ fileName, sheets: actual, rosterCount, masterCount, formulaErrors, previews });
}

await fs.writeFile(path.join(outputDir, "verification-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report.map((entry) => ({
  fileName: entry.fileName,
  sheetCount: entry.sheets.length,
  rosterCount: entry.rosterCount,
  masterCount: entry.masterCount,
  formulaErrorCount: entry.formulaErrors.length,
  previewCount: entry.previews.length,
})), null, 2));
