import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [outputDirArg] = process.argv.slice(2);
if (!outputDirArg) throw new Error("사용법: node scripts/verify-spreadsheets.mjs <출력폴더>");
const outputDir = path.resolve(outputDirArg);
const artifactModule = process.env.ARTIFACT_TOOL_ENTRY
  ? await import(pathToFileURL(process.env.ARTIFACT_TOOL_ENTRY).href)
  : await import("@oai/artifact-tool");
const { FileBlob, SpreadsheetFile } = artifactModule;

const summary = JSON.parse(await fs.readFile(path.join(outputDir, "build-summary.json"), "utf8"));
const previewDir = path.join(outputDir, "previews");
await fs.mkdir(previewDir, { recursive: true });

const expectedSheets = {
  "01_유폴리오_통합.xlsx": [
    "대시보드", "비교결과", "보철비교", "현황시트연결", "측정값설정",
    "항목매핑", "미매핑항목", "연결진단", "동기화로그", "현황최신", "유폴리오최신",
    "마스터항목", "학생명단", "RAW", "전송기록", "설정", "사용안내",
  ],
};

if (summary.files.length !== 1) throw new Error(`산출물 파일이 1개가 아닙니다: ${summary.files.length}`);
const summaryNames = summary.files.map((filePath) => path.basename(filePath)).sort();
const expectedNames = Object.keys(expectedSheets).sort();
if (JSON.stringify(summaryNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`산출물 파일명이 다릅니다: ${summaryNames.join(", ")}`);
}

const errorPattern = /#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/i;
const report = [];

for (const filePath of summary.files) {
  const fileName = path.basename(filePath);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const sheets = expectedSheets[fileName];
  const formulaErrors = [];
  const previews = [];

  for (const sheetName of sheets) {
    const sheet = workbook.worksheets.getItem(sheetName);
    if (!sheet) throw new Error(`${fileName}에 ${sheetName} 시트가 없습니다.`);
    const used = sheet.getUsedRange();
    if (used) {
      const values = used.values || [];
      const formulas = used.formulas || [];
      for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
        for (let colIndex = 0; colIndex < values[rowIndex].length; colIndex += 1) {
          for (const candidate of [values[rowIndex][colIndex], formulas[rowIndex]?.[colIndex]]) {
            if (typeof candidate === "string" && errorPattern.test(candidate)) {
              formulaErrors.push(`${sheetName}!R${rowIndex + 1}C${colIndex + 1}: ${candidate}`);
            }
          }
        }
      }
    }
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 0.45, format: "png" });
    const safeName = `${fileName.replace(/\.xlsx$/i, "")}__${sheetName.replace(/[\\/:*?"<>|]/g, "_")}.png`;
    const previewPath = path.join(previewDir, safeName);
    await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
    previews.push(previewPath);
  }

  const master = workbook.worksheets.getItem("마스터항목");
  const masterCount = master.getRange("A2:A500").values.filter((row) => row[0] !== "" && row[0] != null).length;
  if (masterCount !== 206) throw new Error(`${fileName} 마스터 항목이 206개가 아닙니다: ${masterCount}`);

  const measurementCount = workbook.worksheets.getItem("측정값설정").getRange("A2:A500").values.filter((row) => row[0] !== "" && row[0] != null).length;
  if (measurementCount !== 206) throw new Error(`측정값설정 항목이 206개가 아닙니다: ${measurementCount}`);

  const roster = workbook.worksheets.getItem("학생명단");
  const rosterCount = roster.getRange("A2:A500").values.filter((row) => row[0] !== "" && row[0] != null).length;
  if (rosterCount !== summary.rosterCount) throw new Error(`명단 수가 빌드 요약과 다릅니다: ${rosterCount}`);

  const connections = workbook.worksheets.getItem("현황시트연결");
  const sourceCount = connections.getRange("A2:A1000").values.filter((row) => row[0] !== "" && row[0] != null).length;
  const mappingCount = workbook.worksheets.getItem("항목매핑").getRange("A2:A2000").values.filter((row) => row[0] !== "" && row[0] != null).length;
  const nonBlankSourceUrls = connections.getRange("E2:E1000").values.filter((row) => row[0] !== "" && row[0] != null).length;
  if (sourceCount !== 15) throw new Error(`현황시트 연결이 15개가 아닙니다: ${sourceCount}`);
  if (mappingCount !== summary.mappingCount) throw new Error(`매핑 수가 빌드 요약과 다릅니다: ${mappingCount}`);
  if (nonBlankSourceUrls !== 0) throw new Error("기본 현황시트 URL에 실제 값이 들어 있습니다.");

  if (formulaErrors.length > 0) throw new Error(`${fileName}에 수식 오류가 있습니다: ${formulaErrors[0]}`);
  report.push({ fileName, sheets, rosterCount, masterCount, measurementCount, sourceCount, mappingCount, nonBlankSourceUrls, formulaErrors, previews });
}

await fs.writeFile(path.join(outputDir, "verification-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report.map((entry) => ({
  fileName: entry.fileName,
  sheetCount: entry.sheets.length,
  rosterCount: entry.rosterCount,
  masterCount: entry.masterCount,
  measurementCount: entry.measurementCount,
  sourceCount: entry.sourceCount,
  mappingCount: entry.mappingCount,
  formulaErrorCount: entry.formulaErrors.length,
  previewCount: entry.previews.length,
})), null, 2));
