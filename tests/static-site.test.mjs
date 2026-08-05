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
