import { buildBookmarklet } from "./bookmarklet.js";
import { WEB_APP_URL } from "./config.js";

export function configureInstaller({ webAppUrl, elements }) {
  try {
    const bookmarklet = buildBookmarklet(webAppUrl);
    elements.link.setAttribute("href", bookmarklet);
    elements.link.removeAttribute("aria-disabled");
    elements.code.value = bookmarklet;
    elements.status.textContent = "설정 완료 — 아래 공통 북마클릿을 설치할 수 있습니다.";
    elements.status.dataset.state = "ready";
    return { ok: true, bookmarklet };
  } catch (error) {
    elements.link.removeAttribute("href");
    elements.link.setAttribute("aria-disabled", "true");
    elements.code.value = "";
    elements.status.textContent =
      webAppUrl === ""
        ? "Apps Script 웹앱 URL이 아직 설정되지 않았습니다. 배포 관리자가 config.js를 확인해야 합니다."
        : error.message;
    elements.status.dataset.state = "error";
    return { ok: false, error: elements.status.textContent };
  }
}

function initializePage() {
  const elements = {
    link: document.querySelector("#bookmarklet-link"),
    code: document.querySelector("#bookmarklet-code"),
    status: document.querySelector("#config-status"),
  };
  const copyButton = document.querySelector("#copy-code");
  if (!elements.link || !elements.code || !elements.status || !copyButton) return;

  const configured = configureInstaller({ webAppUrl: WEB_APP_URL.trim(), elements });
  elements.link.addEventListener("click", (event) => event.preventDefault());

  copyButton.disabled = !configured.ok;
  copyButton.addEventListener("click", async () => {
    if (!elements.code.value) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(elements.code.value);
      copied = true;
    } catch {
      elements.code.focus();
      elements.code.select();
      copied = document.execCommand?.("copy") ?? false;
    }
    copyButton.textContent = copied ? "복사했습니다" : "코드를 선택했습니다";
    window.setTimeout(() => {
      copyButton.textContent = "코드 복사";
    }, 1600);
  });
}

if (typeof document !== "undefined") {
  initializePage();
}
