export type TestableClaim = {
  text: string;
  layer: "api" | "web";
  hasAssertion: boolean;
};

export type SkippedClaim = {
  text: string;
  reason: "không test";
};

export type AssembledClaims = {
  testable: TestableClaim[];
  skipped: SkippedClaim[];
};

const SKIP_RE = /\b(mobile|mqtt|prod|production|ios|android)\b/i;
const SETUP_RE = /(đi tới màn hình|đi tới trang|mở trang|mở màn hình|navigate to|open the page)/i;
const ASSERT_RE =
  /(phải|should|expect|trả về|status|\b\d{3}\b|hiện|thấy|hiển thị|equals|→|->|không được|fails|error)/i;
const API_RE = /\b(api|endpoint|GET|POST|PUT|PATCH|DELETE|\/[a-z0-9_\-/{}/]+)\b/i;

export function isSetupOnly(text: string): boolean {
  return SETUP_RE.test(text) && !ASSERT_RE.test(text);
}

export function hasAssertion(text: string): boolean {
  return ASSERT_RE.test(text);
}

export function extractClaimLines(text: string): string[] {
  if (!text) return [];
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (m) lines.push(m[1].trim());
  }
  return lines;
}

function layerOf(text: string): "api" | "web" {
  return API_RE.test(text) ? "api" : "web";
}

export function assembleClaims(opts: {
  prTitle: string;
  prBody: string;
  planeQa: string[];
}): AssembledClaims {
  const raw = [
    ...extractClaimLines(opts.prBody),
    ...opts.planeQa.map((s) => s.trim()).filter(Boolean),
  ];
  if (raw.length === 0 && opts.prTitle.trim()) raw.push(opts.prTitle.trim());

  const testable: TestableClaim[] = [];
  const skipped: SkippedClaim[] = [];
  for (const text of raw) {
    if (isSetupOnly(text)) continue;
    if (SKIP_RE.test(text)) {
      skipped.push({ text, reason: "không test" });
      continue;
    }
    testable.push({
      text,
      layer: layerOf(text),
      hasAssertion: hasAssertion(text),
    });
  }
  const seen = new Set<string>();
  return {
    testable: testable.filter((c) => {
      if (seen.has(c.text)) return false;
      seen.add(c.text);
      return true;
    }),
    skipped,
  };
}

export function canPass(claims: AssembledClaims): boolean {
  return (
    claims.testable.length > 0 && claims.testable.every((c) => c.hasAssertion)
  );
}
