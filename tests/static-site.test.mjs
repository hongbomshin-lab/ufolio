import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const required = [
  "index.html",
  "styles.css",
  "config.js",
  "bookmarklet.js",
  "site.js",
  "vercel.json",
];

test("standalone static files exist", () => {
  for (const file of required) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }
});

test("package has no external dependencies", () => {
  assert.equal(existsSync("package.json"), true, "package.json should exist");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.devDependencies ?? {}, {});
});

test("real roster stays in ignored private files", () => {
  const ignore = readFileSync(".gitignore", "utf8");
  assert.match(ignore, /^private\/student-roster\.tsv$/m);
  assert.match(ignore, /^private\/\*\.gs$/m);

  const publicFiles = ["private/README.md", "apps-script/README.md"];
  for (const file of publicFiles) {
    assert.equal(existsSync(file), true, `${file} should explain private setup`);
  }
  const publicText = publicFiles
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(publicText, /^\d{1,3}\t\d{4}-\d{5}\t[가-힣]{2,4}$/m);
});
