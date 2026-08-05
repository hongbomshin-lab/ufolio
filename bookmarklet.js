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
      patientCount: normalizeNullableNumber(item.patientCount),
      score: normalizeNullableNumber(item.score),
      scoreRaw: item.scoreRaw == null ? "" : String(item.scoreRaw),
    })),
  };
}
