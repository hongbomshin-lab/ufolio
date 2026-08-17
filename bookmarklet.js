const IDENTITY_RE = /([가-힣A-Za-z][가-힣A-Za-z\s·]{0,39}?)\s*\(\s*(\d{4}-\d{5})\s*\)/g;

export function parseIdentityText(text) {
  const matches = [...String(text ?? "").matchAll(IDENTITY_RE)];
  if (matches.length !== 1) return null;

  return {
    name: matches[0][1].trim().replace(/\s+/g, " "),
    studentId: matches[0][2],
  };
}

export function normalizeNullableNumber(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === "" || text === "미설정") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function createSubmission({ identity, practices, items, now, uuid }) {
  return {
    schemaVersion: 1,
    submissionId: uuid(),
    clientSentAt: now(),
    student: {
      name: identity.name,
      studentId: identity.studentId,
    },
    practices: [...practices],
    items: items.map((item) => ({
      practiceName: item.practiceName,
      departmentName: item.departmentName,
      menuName: item.menuName,
      itemName: item.itemName,
      approvedCount: normalizeNullableNumber(item.approvedCount),
      pendingCount: normalizeNullableNumber(item.pendingCount),
      patientCount: normalizeNullableNumber(item.patientCount),
      score: normalizeNullableNumber(item.score),
      scoreRaw: item.scoreRaw == null ? "" : String(item.scoreRaw),
    })),
  };
}

function bookmarkletRuntime(webAppUrl) {
  void (async () => {
    if (!location.hostname.includes("u-folio")) {
      alert("u-folio 사이트에 로그인한 상태에서 실행하세요.");
      return;
    }

    const escapeHtml = (value) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    const nullableNumber = (value) => {
      if (value == null) return null;
      const text = String(value).trim();
      if (text === "" || text === "미설정") return null;
      const number = Number(text);
      return Number.isFinite(number) ? number : null;
    };
    const PRACTICE_RE = /임상실습\s*2/;
    const parseIdentity = (text) => {
      const regex = /([가-힣A-Za-z][가-힣A-Za-z\s·]{0,39}?)\s*\(\s*(\d{4}-\d{5})\s*\)/g;
      const matches = [...String(text ?? "").matchAll(regex)];
      if (matches.length !== 1) return null;
      return {
        name: matches[0][1].trim().replace(/\s+/g, " "),
        studentId: matches[0][2],
      };
    };
    const findIdentity = () => {
      const selectors = [
        ".user-info-wrap .name",
        ".user-info-wrap",
        ".user-info",
        ".user-name",
        ".profile .name",
        ".profile",
        "header",
      ];
      const found = new Map();
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          const identity = parseIdentity(element.textContent);
          if (identity) {
            found.set(`${identity.studentId}\u0000${identity.name}`, identity);
          }
        }
        if (found.size === 1) return [...found.values()][0];
        if (found.size > 1) return null;
      }
      return null;
    };
    const createId = () => {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        const value = char === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
      });
    };
    const postUfolio = async (path, params) => {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams(params),
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("u-folio 응답을 읽지 못했습니다. 로그인이 만료되었는지 확인하세요.");
      }
      if (!response.ok || String(data.status ?? "200") !== "200") {
        throw new Error("u-folio가 요청을 거부했습니다. 다시 로그인해 주세요.");
      }
      return data;
    };

    document.getElementById("__ufolio_collector")?.remove();
    const panel = document.createElement("section");
    panel.id = "__ufolio_collector";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "유폴리오 점수 전송");
    panel.style.cssText =
      "position:fixed;top:16px;right:16px;width:min(620px,94vw);max-height:90vh;overflow:auto;z-index:2147483647;background:#fff;border:2px solid #155eef;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.3);font:14px/1.55 Arial,sans-serif;color:#17202a";
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:#155eef;color:#fff"><strong>유폴리오 점수 전송</strong><button id="ufc-close" type="button" aria-label="닫기" style="border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer">×</button></div><div id="ufc-body" style="padding:14px">로그인 정보와 과목을 확인하는 중입니다…</div>';
    document.body.appendChild(panel);
    panel.querySelector("#ufc-close").onclick = () => panel.remove();
    const body = panel.querySelector("#ufc-body");
    const show = (html) => {
      body.innerHTML = html;
    };

    try {
      const identity = findIdentity();
      if (!identity) {
        show("<strong>로그인 정보를 찾지 못했습니다.</strong><br>상단에 이름(학번)이 표시되는지 확인한 뒤 다시 실행하세요.");
        return;
      }

      const administerCode =
        document.querySelector('input[name="administer_code"]')?.value || "15";
      const courseMap = new Map();
      for (let page = 1; page <= 20; page += 1) {
        const data = await postUfolio("/ajax/st/dent_summary/list", {
          page: String(page),
          dt_seq: "",
          administer_code: administerCode,
        });
        const list = Array.isArray(data.list) ? data.list : [];
        if (list.length === 0) break;
        for (const course of list) {
          const key = `${course.curr_seq}|${course.dt_seq}|${course.hospital_seq}`;
          courseMap.set(key, course);
        }
        if (!data.pageNav || !String(data.pageNav).includes("page=")) break;
      }

      const courses = [...courseMap.values()];
      if (courses.length === 0) {
        show("<strong>임상실습 과목을 찾지 못했습니다.</strong><br>임상실습요약표 페이지인지 확인하세요.");
        return;
      }

      const selectedCourses = courses.filter((course) =>
        PRACTICE_RE.test(String(course.curr_name ?? "")),
      );
      const selected = [
        ...new Set(selectedCourses.map((course) => course.curr_name).filter(Boolean)),
      ];
      if (selected.length === 0) {
        show(
          "<strong>임상실습 2 과목을 찾지 못했습니다.</strong><br>임상실습요약표에서 임상실습 2가 보이는 상태인지 확인하세요.",
        );
        return;
      }
      show(
        `<p style="margin:0 0 8px">감지된 사용자: <strong>${escapeHtml(identity.name)} (${escapeHtml(identity.studentId)})</strong></p><p style="margin:8px 0 4px">가져올 실습차수: <strong>${escapeHtml(selected.join(", "))}</strong> (${selectedCourses.length}개 과)</p><button id="ufc-start" type="button" style="margin-top:12px;padding:9px 14px;border:0;border-radius:8px;background:#155eef;color:#fff;font-weight:700;cursor:pointer">추출하고 전송</button>`,
      );

      panel.querySelector("#ufc-start").onclick = async () => {
        const items = [];
        const failures = [];
        for (let index = 0; index < selectedCourses.length; index += 1) {
          const course = selectedCourses[index];
          show(
            `점수 불러오는 중… (${index + 1}/${selectedCourses.length})<br>${escapeHtml(course.dt_name)} · ${escapeHtml(course.curr_name)}`,
          );
          try {
            const detail = await postUfolio(
              "/ajax/st/dent_summary/getSummaryData",
              {
                curr_seq: String(course.curr_seq ?? ""),
                dt_seq: String(course.dt_seq ?? ""),
                hospital_seq: String(course.hospital_seq ?? ""),
                administer_code: administerCode,
              },
            );
            for (const item of Array.isArray(detail.list) ? detail.list : []) {
              const scoreUnset = item.db_score === "N";
              items.push({
                practiceName: String(course.curr_name ?? ""),
                departmentName: String(course.dt_name ?? ""),
                menuName: String(item.menu_name ?? ""),
                itemName: String(item.pc_name ?? ""),
                approvedCount: nullableNumber(item.app_cnt),
                // submit_cnt = 승인 전 대기 건수. 유폴리오 화면의 "제출 건수"는 tot_cnt = app_cnt + submit_cnt (총 제출).
                pendingCount: nullableNumber(item.submit_cnt),
                patientCount: nullableNumber(item.sum_patient_cnt),
                score: scoreUnset ? null : nullableNumber(item.cal_score),
                scoreRaw: scoreUnset ? "미설정" : String(item.cal_score ?? ""),
              });
            }
          } catch (error) {
            failures.push(`${course.dt_name}: ${error.message}`);
          }
        }

        if (failures.length > 0) {
          show(
            `<strong style="color:#b42318">일부 과목을 불러오지 못해 전송하지 않았습니다.</strong><ul>${failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join("")}</ul>`,
          );
          return;
        }
        if (items.length === 0) {
          show("<strong>추출된 항목이 없어 전송하지 않았습니다.</strong>");
          return;
        }

        const payload = {
          schemaVersion: 1,
          submissionId: createId(),
          clientSentAt: new Date().toISOString(),
          student: identity,
          practices: selected,
          items,
        };
        const scored = items.filter((item) => item.score != null && item.score > 0);
        const renderRows = (showAll) => {
          const rows = showAll ? items : scored;
          if (rows.length === 0) {
            return '<p style="color:#667085">점수가 있는 항목이 없습니다. 전체 항목 보기를 선택하세요.</p>';
          }
          return `<div style="overflow:auto;max-height:42vh"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left">과</th><th style="text-align:left">항목</th><th>승인</th><th>승인대기</th><th>환자</th><th>점수</th></tr></thead><tbody>${rows
            .map(
              (item) =>
                `<tr><td style="border-top:1px solid #e4e7ec;padding:4px">${escapeHtml(item.departmentName)}</td><td style="border-top:1px solid #e4e7ec;padding:4px">${escapeHtml(item.itemName)}</td><td style="border-top:1px solid #e4e7ec;padding:4px;text-align:center">${escapeHtml(item.approvedCount)}</td><td style="border-top:1px solid #e4e7ec;padding:4px;text-align:center">${escapeHtml(item.pendingCount)}</td><td style="border-top:1px solid #e4e7ec;padding:4px;text-align:center">${escapeHtml(item.patientCount)}</td><td style="border-top:1px solid #e4e7ec;padding:4px;text-align:center">${escapeHtml(item.scoreRaw)}</td></tr>`,
            )
            .join("")}</tbody></table></div>`;
        };
        const send = async () => {
          const status = panel.querySelector("#ufc-status");
          status.textContent = `전송 중… (${items.length}개 항목)`;
          status.style.background = "#eff4ff";
          try {
            await fetch(webAppUrl, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "text/plain;charset=UTF-8" },
              body: JSON.stringify(payload),
            });
            status.textContent =
              "전송 요청 완료 - 실제 저장 여부는 관리자 전송기록에서 확인하세요.";
            status.style.background = "#ecfdf3";
          } catch (error) {
            status.textContent = `전송 요청 실패: ${error.message}`;
            status.style.background = "#fef3f2";
          }
        };

        const pending = items.reduce((sum, item) => sum + (item.pendingCount || 0), 0);
        const pendingNote = `<p style="margin:6px 0">승인대기(제출 건수) 합계: <strong>${pending}</strong>건</p>`;
        show(
          `<div id="ufc-status" style="padding:9px;border-radius:8px;background:#eff4ff">전송 준비 중…</div><p><strong>${escapeHtml(identity.name)} (${escapeHtml(identity.studentId)})</strong> · 총 ${items.length}개 항목 · 점수 있는 항목 ${scored.length}개</p>${pendingNote}<label><input id="ufc-all" type="checkbox"> 0·미설정 포함 전체 항목 보기</label><div id="ufc-table" style="margin-top:8px">${renderRows(false)}</div><button id="ufc-resend" type="button" style="margin-top:10px;padding:7px 12px;border:1px solid #155eef;border-radius:7px;background:#fff;color:#155eef;cursor:pointer">다시 전송</button>`,
        );
        panel.querySelector("#ufc-all").onchange = (event) => {
          panel.querySelector("#ufc-table").innerHTML = renderRows(event.target.checked);
        };
        panel.querySelector("#ufc-resend").onclick = send;
        await send();
      };
    } catch (error) {
      show(`<strong style="color:#b42318">오류:</strong> ${escapeHtml(error.message)}`);
    }
  })();
}

export function buildBookmarklet(webAppUrl) {
  let parsed;
  try {
    parsed = new URL(webAppUrl);
  } catch {
    throw new Error("Apps Script 웹앱 URL이 올바르지 않습니다.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(parsed.pathname)
  ) {
    throw new Error("Apps Script 웹앱 URL이 올바르지 않습니다.");
  }

  const source = `void (${bookmarkletRuntime.toString()})(${JSON.stringify(parsed.href)});`;
  return `javascript:${encodeURIComponent(source)}`;
}
