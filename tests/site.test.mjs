import test from "node:test";
import assert from "node:assert/strict";

import { configureInstaller } from "../site.js";

function fakeElements() {
  return {
    link: {
      attributes: {},
      disabled: false,
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
    },
    code: { value: "" },
    status: { textContent: "", dataset: {} },
  };
}

test("configureInstaller blocks installation while Apps Script URL is empty", () => {
  const elements = fakeElements();

  const result = configureInstaller({ webAppUrl: "", elements });

  assert.equal(result.ok, false);
  assert.equal(elements.link.attributes.href, undefined);
  assert.equal(elements.link.attributes["aria-disabled"], "true");
  assert.equal(elements.code.value, "");
  assert.match(elements.status.textContent, /아직 설정되지 않았습니다/);
});

test("configureInstaller installs the generated universal bookmarklet", () => {
  const elements = fakeElements();

  const result = configureInstaller({
    webAppUrl: "https://script.google.com/macros/s/EXAMPLE_DEPLOYMENT/exec",
    elements,
  });

  assert.equal(result.ok, true);
  assert.match(elements.link.attributes.href, /^javascript:/);
  assert.equal(elements.code.value, elements.link.attributes.href);
  assert.equal(elements.link.attributes["aria-disabled"], undefined);
  assert.match(elements.status.textContent, /설치할 수 있습니다/);
});
