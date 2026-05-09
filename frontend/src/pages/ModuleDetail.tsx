import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, FileText as FileIcon, LayoutDashboard, Sparkles,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getReview, type ReviewDetail } from "../api/reviews";
import { extractApiError } from "../api/client";
import {
  parseReviewOutput,
  type ParsedCriterion,
} from "../utils/reviewOutput";

type FindingStatus = "must" | "moderate" | "nice" | "unknown";

interface Finding {
  page: number | null;
  status: FindingStatus;
  observationTitle: string;
  observationBody: string;
  rationale: string;
  recommendation: string;
}

const STATUS_LABEL: Record<FindingStatus, string> = {
  must: "MUST FIX",
  moderate: "MODERATE",
  nice: "NICE TO HAVE",
  unknown: "—",
};

const STATUS_TONE: Record<FindingStatus, { bg: string; fg: string }> = {
  must:     { bg: "bg-pa-danger-soft",  fg: "text-pa-danger"  },
  moderate: { bg: "bg-pa-warning-soft", fg: "text-pa-warning" },
  nice:     { bg: "bg-pa-success-soft", fg: "text-pa-success" },
  unknown:  { bg: "bg-pa-cream",        fg: "text-pa-muted"   },
};

/** Map a criterion score to a finding-level status. */
function statusFromScore(score: number | null): FindingStatus {
  if (score == null) return "unknown";
  if (score < 5) return "must";
  if (score < 7) return "moderate";
  return "nice";
}

/** Try to derive multiple findings from a single criterion's bulleted
 *  Findings + Recommendations text. If no bullets are detected, returns
 *  a single row covering the whole criterion. */
function findingsFor(c: ParsedCriterion): Finding[] {
  const findingsItems = splitBullets(c.findings);
  const recItems = splitBullets(c.recommendations);
  const status = statusFromScore(c.score);

  const n = Math.max(findingsItems.length, 1);
  const out: Finding[] = [];
  for (let i = 0; i < n; i++) {
    const obs = findingsItems[i] || c.findings || stripScoreLine(c.body) || c.name;
    const { title, rest } = splitTitle(obs);
    out.push({
      page: null,
      status,
      observationTitle: title || c.name,
      observationBody: rest,
      rationale: "",
      recommendation: recItems[i] || c.recommendations || "",
    });
  }
  return out;
}

/** Split a Findings/Recommendations block into discrete rows.
 *  - If the text contains top-level markdown bullets (`- ` / `* ` at column 0)
 *    we treat each bullet as its own finding. Continuation lines beneath a
 *    bullet are preserved verbatim — including blank lines, indented
 *    sub-bullets, and markdown tables — so structured content keeps rendering.
 *  - If there are no top-level bullets, the whole block is returned as a
 *    single item with newlines intact so tables / multi-paragraph prose
 *    render correctly.
 */
function splitBullets(text: string): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\n/);
  const isTopBullet = (l: string) => /^[-*]\s+/.test(l);

  if (!lines.some(isTopBullet)) {
    return [trimmed];
  }

  const items: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const j = buf.join("\n").trim();
    if (j) items.push(j);
    buf = [];
  };
  for (const line of lines) {
    if (isTopBullet(line)) {
      flush();
      buf.push(line.replace(/^[-*]\s+/, ""));
    } else {
      buf.push(line);
    }
  }
  flush();
  return items;
}

/** Try to peel a heading off the top of an observation block so the row
 *  reads as `Title` (bold blue) + `Body` (markdown). Handles both inline
 *  forms (e.g. `**Title** — body`) and stacked forms (`**Title**\n\nbody`).
 *  When the content starts with structured markdown (table, code fence,
 *  list) it's left intact so nothing gets corrupted. */
function splitTitle(s: string): { title: string; rest: string } {
  const t = s.trim();
  if (!t) return { title: "", rest: "" };

  // Don't peel if the very first non-empty line is a structural element.
  const firstNonEmpty = t.split(/\n/).find(l => l.trim().length > 0) ?? "";
  if (/^\s*\|/.test(firstNonEmpty) || /^\s*```/.test(firstNonEmpty) || /^\s*[-*]\s+/.test(firstNonEmpty)) {
    return { title: "", rest: t };
  }

  // Inline `**Title** — rest of the same line\n...rest of body`.
  const inline = t.match(/^\*\*([^*\n]+)\*\*\s*[:\s—\-]*\s*(.*?)(?:\n([\s\S]*))?$/);
  if (inline) {
    const head = (inline[2] || "").trim();
    const tail = (inline[3] || "").trim();
    const rest = [head, tail].filter(Boolean).join("\n\n").trim();
    return { title: inline[1].trim(), rest };
  }

  // Markdown heading on the first line: `## Title` / `### Title`.
  const heading = t.match(/^#{2,6}\s+(.+?)\s*\n([\s\S]*)$/);
  if (heading) {
    return { title: heading[1].trim(), rest: heading[2].trim() };
  }

  // First-sentence fallback only when the body is a single short paragraph.
  if (!/\n/.test(t) && t.length < 240) {
    const period = t.indexOf(". ");
    if (period > 0 && period < 80) {
      return { title: t.slice(0, period).trim(), rest: t.slice(period + 1).trim() };
    }
  }

  return { title: "", rest: t };
}

function stripScoreLine(s: string): string {
  return s.replace(/^\s*[Ss]core:\s*[\d.]+\s*\/\s*10\s*$/m, "").trim();
}

// Custom renderers for ReactMarkdown so any tables, lists, and code the LLM
// produces stay readable inside the observation/recommendation cells.
// Tables get a horizontal-scroll wrapper so they never blow out the column.
const md: Components = {
  table: ({ children }) => (
    <div className="overflow-x-auto -mx-1 my-2 max-w-full">
      <table className="min-w-full border-collapse text-[11.5px] border border-pa-line bg-white">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-pa-cream-soft">{children}</thead>,
  th: ({ children }) => (
    <th className="font-bold text-left text-pa-ink px-2.5 py-1.5 border border-pa-line whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="text-pa-body px-2.5 py-1.5 border border-pa-line align-top">
      {children}
    </td>
  ),
  ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5 my-1.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 my-1.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-pa-ink">{children}</strong>,
  code: ({ children }) => (
    <code className="font-mono text-[11px] bg-pa-cream-soft border border-pa-line rounded px-1 py-0.5">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="font-mono text-[11px] bg-pa-cream-soft border border-pa-line rounded-lg p-2.5 overflow-x-auto my-2">
      {children}
    </pre>
  ),
  h1: ({ children }) => <div className="text-[14px] font-bold text-pa-ink my-2">{children}</div>,
  h2: ({ children }) => <div className="text-[13.5px] font-bold text-pa-ink my-2">{children}</div>,
  h3: ({ children }) => <div className="text-[13px] font-bold text-pa-ink my-1.5">{children}</div>,
  h4: ({ children }) => <div className="text-[12.5px] font-bold text-pa-ink my-1.5">{children}</div>,
};

export function ModuleDetailPage() {
  const navigate = useNavigate();
  const { id, criterionIdx } = useParams<{ id: string; criterionIdx: string }>();
  const [data, setData] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getReview(Number(id))
      .then(d => {
        if (!cancelled) setData(d);
      })
      .catch(err => {
        if (!cancelled) setError(extractApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const criteria = useMemo(
    () => parseReviewOutput(data?.review_output),
    [data?.review_output],
  );
  const targetIdx = parseInt(criterionIdx ?? "1", 10);
  const active = criteria.find(c => c.index === targetIdx);
  const findings = useMemo(() => (active ? findingsFor(active) : []), [active]);

  if (error) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link to={`/reviews/${id}`} className="text-[12.5px] font-bold text-kpmg-blue hover:text-kpmg-mediumblue inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
        </Link>
        <div className="p-3 rounded-lg bg-pa-danger-soft border border-pa-danger/20 text-sm text-pa-danger">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-pa-muted">Loading…</div>;
  }

  if (!active) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Link to={`/reviews/${id}`} className="text-[12.5px] font-bold text-kpmg-blue hover:text-kpmg-mediumblue inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
        </Link>
        <div className="p-4 rounded-lg bg-pa-cream-soft border border-pa-line text-sm text-pa-body">
          Could not find criterion {criterionIdx} in this review.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 lg:gap-6">
      {/* LEFT RAIL */}
      <aside className="min-w-0 space-y-3.5">
        {/* Active proposal file — KPMG-blue filled card */}
        <div
          className="rounded-2xl p-4 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #00338D 0%, #005EB8 100%)" }}
        >
          <div
            aria-hidden
            className="absolute right-[-30px] top-[-30px] w-[120px] h-[120px] rounded-full bg-white/10 pointer-events-none"
          />
          <div className="relative flex items-center gap-2 text-[10.5px] font-bold tracking-[0.1em] opacity-90 mb-1">
            <FileIcon className="h-3.5 w-3.5" />
            <span>ACTIVE PROPOSAL FILE</span>
          </div>
          <div className="relative text-[13px] font-bold font-mono tracking-[-0.2px] truncate">
            {data.source_filename}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-pa-line p-1.5 max-h-[520px] overflow-y-auto">
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold tracking-[0.08em] uppercase text-pa-muted">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Composite overview
          </div>

          {criteria.map((c, i) => {
            const isActive = c.index === active.index;
            const status = statusFromScore(c.score);
            const tone = STATUS_TONE[status];
            return (
              <Link
                key={`${c.index}-${i}`}
                to={`/reviews/${id}/criteria/${c.index}`}
                className={[
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-[11px] font-bold uppercase tracking-[0.04em]",
                  isActive
                    ? "bg-pa-accent-soft text-kpmg-blue"
                    : "text-pa-body hover:bg-pa-cream",
                ].join(" ")}
              >
                <FileIcon className="h-3.5 w-3.5 opacity-70 shrink-0" />
                <span className="flex-1 truncate normal-case">{c.name}</span>
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.fg.replace("text-", "bg-")}`} aria-hidden />
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => navigate("/proposals/review")}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-pa-line text-[11.5px] font-bold tracking-[0.06em] uppercase text-pa-body hover:bg-pa-cream transition-colors"
        >
          New assessment
        </button>
      </aside>

      {/* RIGHT — MODULE DETAIL */}
      <div className="min-w-0 space-y-3.5">
        {/* HERO */}
        <section className="rounded-2xl bg-white border border-pa-line p-5 md:p-7 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-[200px] h-[200px] rounded-full bg-pa-accent-soft pointer-events-none"
          />
          <Link
            to={`/reviews/${id}`}
            className="relative inline-flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-kpmg-blue hover:text-kpmg-mediumblue mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to overview
          </Link>
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-[28px] md:text-[36px] font-bold text-pa-ink tracking-[-0.7px] leading-tight max-w-[640px]">
              {active.name}
            </h1>
            <div className="text-[60px] md:text-[64px] font-bold text-kpmg-blue tabular-nums leading-none tracking-[-2px]">
              {active.score == null ? "—" : active.score}
            </div>
          </div>
        </section>

        {/* FINDINGS TABLE */}
        <section className="rounded-2xl bg-white border border-pa-line overflow-hidden">
          <div
            className="hidden md:grid gap-4 px-6 py-3 border-b border-pa-line-soft text-[10.5px] font-bold uppercase tracking-[0.1em] text-pa-muted"
            style={{ gridTemplateColumns: "70px 110px minmax(0,1fr) minmax(0,1.05fr)" }}
          >
            <div>Page</div>
            <div>Status</div>
            <div>Observation</div>
            <div>Recommendation</div>
          </div>

          {findings.length === 0 ? (
            <div className="px-6 py-8 text-sm text-pa-muted">
              No structured findings parsed for this criterion.
            </div>
          ) : (
            <ul role="list" className="divide-y divide-pa-line-soft">
              {findings.map((f, i) => (
                <li key={i}>
                  <div
                    className="grid gap-4 md:gap-5 px-5 md:px-6 py-5 md:py-6 grid-cols-1"
                    style={{ gridTemplateColumns: undefined }}
                  >
                    {/* On md+: switch to the 4-col grid layout */}
                    <div
                      className="contents md:grid md:gap-5"
                      style={{ gridTemplateColumns: "70px 110px minmax(0,1fr) minmax(0,1.05fr)" }}
                    >
                      <div className="flex md:block items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-kpmg-blue text-white flex items-center justify-center text-[13px] font-bold tabular-nums shrink-0">
                          {f.page ?? i + 1}
                        </div>
                        <span className="md:hidden eyebrow-muted">Page</span>
                      </div>

                      <div>
                        <span
                          className={[
                            "inline-block px-2.5 py-1 rounded-md text-[10.5px] font-bold tracking-[0.06em]",
                            STATUS_TONE[f.status].bg,
                            STATUS_TONE[f.status].fg,
                          ].join(" ")}
                        >
                          {STATUS_LABEL[f.status]}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[14px] font-bold text-kpmg-blue mb-1.5 leading-snug tracking-[-0.2px]">
                          {f.observationTitle}
                        </div>
                        {f.observationBody && (
                          <div className="text-[12.5px] text-pa-body leading-relaxed mb-3 min-w-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
                              {f.observationBody}
                            </ReactMarkdown>
                          </div>
                        )}
                        {f.rationale && (
                          <div className="rounded-lg border border-pa-warning/25 bg-pa-warning-soft/40 border-l-[3px] border-l-pa-warning px-3.5 py-2.5">
                            <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-pa-warning mb-1">
                              Rationale &amp; implication
                            </div>
                            <div className="text-[12px] text-pa-body leading-relaxed">
                              {f.rationale}
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="rounded-xl border border-pa-accent-soft bg-pa-accent-soft/60 p-3.5 md:p-4">
                          <div className="text-[13px] text-kpmg-blue leading-relaxed mb-3 min-w-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
                              {f.recommendation || "_No recommendation parsed._"}
                            </ReactMarkdown>
                          </div>
                          <button
                            type="button"
                            disabled
                            title="Refine with agent — coming soon"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-pa-accent-soft text-[10.5px] font-bold uppercase tracking-[0.08em] text-kpmg-blue opacity-80 cursor-not-allowed"
                          >
                            <Sparkles className="h-3 w-3" />
                            Refine with agent
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
