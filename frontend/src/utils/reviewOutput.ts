// Parsers for the LLM-generated review_output markdown. The structure
// emitted by the per-criterion streaming flow is:
//
//   ## 1. {criterion name}
//
//   Score: 7/10
//
//   - **Status** — ✅ Pass / ⚠️ Partial / ❌ Fail / 🟡 N/A
//   - **Findings** — body text (often multi-paragraph or bulleted)
//   - **Recommendations** — body text
//
// The LLM is not 100% strict about this layout, so the parser is forgiving:
// missing scores, missing status, or unexpected ordering all degrade
// gracefully.

export type CriterionStatusTone = "pass" | "partial" | "fail" | "na" | "unknown";

export interface ParsedCriterion {
  index: number;
  name: string;
  score: number | null;
  status: CriterionStatusTone;
  findings: string;
  recommendations: string;
  body: string;
}

/** Split a review's combined markdown into per-criterion sections. */
export function parseReviewOutput(md: string | null | undefined): ParsedCriterion[] {
  if (!md) return [];

  // Split on lines like `## 1. Some Name` (case-sensitive H2 heading with a number).
  const re = /^##\s+(\d+)\.\s+(.+?)\s*$/gm;
  const matches: { index: number; name: string; start: number; headerEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    matches.push({
      index: parseInt(m[1], 10),
      name: m[2].trim(),
      start: m.index,
      headerEnd: m.index + m[0].length,
    });
  }

  const out: ParsedCriterion[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = md.slice(cur.headerEnd, next ? next.start : md.length).trim();

    out.push({
      index: cur.index,
      name: cur.name,
      score: extractScore(body),
      status: extractStatus(body),
      findings: extractSection(body, "Findings"),
      recommendations: extractSection(body, "Recommendations"),
      body,
    });
  }
  return out;
}

/** Extract `Score: X/10` from a markdown blob. Returns null if missing. */
export function extractScore(text: string): number | null {
  const m = text.match(/[Ss]core:\s*([\d.]+)\s*\/\s*10/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (Number.isNaN(v)) return null;
  return Math.max(0, Math.min(10, v));
}

/** Best-effort status read from the LLM output. */
export function extractStatus(text: string): CriterionStatusTone {
  const head = text.slice(0, 600);
  if (/Status[^\n]*(✅|\bPass\b)/i.test(head)) return "pass";
  if (/Status[^\n]*(⚠|\bPartial\b)/i.test(head)) return "partial";
  if (/Status[^\n]*(❌|\bFail\b)/i.test(head)) return "fail";
  if (/Status[^\n]*(🟡|N\/A|\bNA\b)/i.test(head)) return "na";
  return "unknown";
}

/** Extract a labelled section like "Findings" or "Recommendations" from
 *  one criterion's markdown body. Tries the bulleted-bold form first, then
 *  falls back to a heading-only form. Returns "" when not present. */
export function extractSection(body: string, label: string): string {
  // Form 1: `- **Findings** — ...` or `- **Findings**: ...`
  const bullet = new RegExp(
    String.raw`-\s*\*\*${label}\*\*\s*[—:\-]?\s*([\s\S]*?)(?=\n\s*-\s*\*\*[A-Z][a-zA-Z &]+\*\*|\n##\s|\Z)`,
    "i",
  );
  const b = body.match(bullet);
  if (b) return b[1].trim();

  // Form 2: heading-only `**Findings**` or `### Findings` until next heading.
  const heading = new RegExp(
    String.raw`(?:\*\*${label}\*\*|###?\s*${label}\b)\s*[—:\-]?\s*([\s\S]*?)(?=\n\s*\*\*[A-Z][a-zA-Z &]+\*\*|\n###?\s|\n##\s|\Z)`,
    "i",
  );
  const h = body.match(heading);
  if (h) return h[1].trim();

  return "";
}

/** Average of parsed scores, rounded to one decimal. null if none scored. */
export function aggregateScore(criteria: ParsedCriterion[]): number | null {
  const scores = criteria.map(c => c.score).filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

/** Bucket counts for the readiness stat tiles. */
export interface ReadinessBuckets {
  whatIf: number;     // < 5  (must fix)
  moderate: number;   // 5-7  (could be improved)
  goodToPass: number; // >= 7 (acceptable)
}

export function readinessBuckets(criteria: ParsedCriterion[]): ReadinessBuckets {
  let whatIf = 0;
  let moderate = 0;
  let goodToPass = 0;
  for (const c of criteria) {
    if (typeof c.score !== "number") continue;
    if (c.score < 5) whatIf += 1;
    else if (c.score < 7) moderate += 1;
    else goodToPass += 1;
  }
  return { whatIf, moderate, goodToPass };
}

/** Verdict label + color tone derived from the aggregate score. */
export function readinessVerdict(score: number | null): { label: string; tone: "ready" | "go-edits" | "no-go" | "unknown" } {
  if (score == null) return { label: "PENDING", tone: "unknown" };
  if (score >= 8) return { label: "READY TO SUBMIT", tone: "ready" };
  if (score >= 7) return { label: "GO WITH EDITS", tone: "go-edits" };
  return { label: "NO GO DECISION", tone: "no-go" };
}
