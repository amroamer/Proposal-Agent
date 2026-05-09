import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight, Sparkles, Download, ExternalLink, FileSpreadsheet, FileText as FileIcon,
  CheckCircle, AlertTriangle, Clock, Users, BookOpen, Zap, Scale, Star, Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  getReview,
  downloadReviewFile,
  openReviewFile,
  exportReviewReport,
  type ReviewDetail,
} from "../api/reviews";
import { extractApiError } from "../api/client";
import {
  parseReviewOutput,
  aggregateScore,
  readinessBuckets,
  readinessVerdict,
  type ParsedCriterion,
} from "../utils/reviewOutput";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Lightweight name → icon mapping for the criterion cards. Falls back to a
// generic file icon so unknown criteria still render.
function iconFor(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("execut") || n.includes("summary") || n.includes("proof")) return Sparkles;
  if (n.includes("value")) return Zap;
  if (n.includes("scope") || n.includes("name") || n.includes("client")) return CheckCircle;
  if (n.includes("approach") || n.includes("logic") || n.includes("workflow")) return Workflow;
  if (n.includes("timeline") || n.includes("efficien") || n.includes("history")) return Clock;
  if (n.includes("team") || n.includes("structure")) return Users;
  if (n.includes("risk") || n.includes("assumption")) return AlertTriangle;
  if (n.includes("legal") || n.includes("compliance")) return Scale;
  if (n.includes("practice") || n.includes("benchmark")) return Star;
  if (n.includes("storyline") || n.includes("narrative")) return BookOpen;
  return FileIcon;
}

function toneColors(tone: ParsedCriterion["status"] | "ready" | "go-edits" | "no-go" | "unknown") {
  // Map status / verdict tones to KPMG-compatible status colors.
  switch (tone) {
    case "pass":
    case "ready":
      return { bg: "bg-pa-success-soft", fg: "text-pa-success", dot: "bg-pa-success" };
    case "partial":
    case "go-edits":
      return { bg: "bg-pa-warning-soft", fg: "text-pa-warning", dot: "bg-pa-warning" };
    case "fail":
    case "no-go":
      return { bg: "bg-pa-danger-soft", fg: "text-pa-danger", dot: "bg-pa-danger" };
    case "na":
    default:
      return { bg: "bg-pa-cream", fg: "text-pa-muted", dot: "bg-pa-muted" };
  }
}

function scoreTone(score: number | null): "pass" | "partial" | "fail" | "unknown" {
  if (score == null) return "unknown";
  if (score >= 7) return "pass";
  if (score >= 5) return "partial";
  return "fail";
}

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState<"" | "download" | "view">("");
  const [fileError, setFileError] = useState<string | null>(null);

  const onDownload = async () => {
    if (!id) return;
    setFileBusy("download");
    setFileError(null);
    try {
      const ok = await downloadReviewFile(Number(id));
      if (!ok) setFileError("Original file isn't stored for this review.");
    } catch (e) {
      setFileError(extractApiError(e));
    } finally {
      setFileBusy("");
    }
  };

  const onView = async () => {
    if (!id) return;
    setFileBusy("view");
    setFileError(null);
    try {
      const ok = await openReviewFile(Number(id));
      if (!ok) setFileError("Original file isn't stored for this review.");
    } catch (e) {
      setFileError(extractApiError(e));
    } finally {
      setFileBusy("");
    }
  };

  const [exportBusy, setExportBusy] = useState<"" | "pdf" | "xlsx">("");
  const [exportError, setExportError] = useState<string | null>(null);

  const onExport = async (format: "pdf" | "xlsx") => {
    if (!id) return;
    setExportBusy(format);
    setExportError(null);
    try {
      await exportReviewReport(Number(id), format);
    } catch (e) {
      setExportError(extractApiError(e));
    } finally {
      setExportBusy("");
    }
  };

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
  const overall = useMemo(() => aggregateScore(criteria), [criteria]);
  const buckets = useMemo(() => readinessBuckets(criteria), [criteria]);
  const verdict = useMemo(() => readinessVerdict(overall), [overall]);

  if (error) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link to="/reviews" className="text-[12.5px] font-bold text-kpmg-blue hover:text-kpmg-mediumblue inline-flex items-center gap-1">
          <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Back to history
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

  const verdictTone = toneColors(verdict.tone);
  const project =
    data.extracted_metadata?.document_title?.trim() ||
    data.extracted_metadata?.purpose_and_scope?.trim() ||
    data.source_filename;
  const client =
    data.extracted_metadata?.client_name?.trim() ||
    "Unknown client";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 lg:gap-6">
      {/* LEFT RAIL */}
      <aside className="min-w-0 space-y-3.5">
        <div className="rounded-2xl bg-white border border-pa-line p-4">
          <div className="eyebrow-muted mb-2.5">Active audit file</div>
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-lg bg-pa-accent-soft text-kpmg-blue flex items-center justify-center shrink-0">
              <FileIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold text-pa-ink font-mono truncate" title={data.source_filename}>
                {data.source_filename}
              </div>
              <div className="text-[10.5px] text-pa-muted mt-0.5">
                {fmtBytes(data.source_size_bytes)} · {data.source_kind.toUpperCase()}
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={onView}
              disabled={fileBusy !== ""}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-pa-line text-[11px] font-bold tracking-[0.04em] uppercase text-pa-body hover:bg-pa-cream disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Open the file in a new tab"
            >
              <ExternalLink className="h-3 w-3" />
              {fileBusy === "view" ? "Opening…" : "View"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={fileBusy !== ""}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-kpmg-blue text-white text-[11px] font-bold tracking-[0.04em] uppercase hover:bg-kpmg-mediumblue disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Download the original file"
            >
              <Download className="h-3 w-3" />
              {fileBusy === "download" ? "Saving…" : "Download"}
            </button>
          </div>
          {fileError && (
            <div className="mt-2 text-[10.5px] text-pa-danger leading-tight">{fileError}</div>
          )}
        </div>

        <div>
          <div className="eyebrow-muted px-1 pb-2">Diagnostic scope</div>
          <div className="rounded-2xl bg-white border border-pa-line p-1.5 max-h-[420px] overflow-y-auto">
            {criteria.length === 0 ? (
              <div className="text-[12px] text-pa-muted px-3 py-2">
                No structured criteria found in this review.
              </div>
            ) : (
              criteria.map((c, i) => {
                const tone = toneColors(scoreTone(c.score));
                return (
                  <Link
                    key={`${c.index}-${i}`}
                    to={`/reviews/${id}/criteria/${c.index}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[12px] text-pa-body hover:bg-pa-cream transition-colors"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] text-pa-muted font-mono tabular-nums">
                      {c.score == null ? "—" : `${c.score}/10`}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <Link
          to="/proposals/review"
          className="w-full flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-pa-line text-[11.5px] font-bold tracking-[0.06em] uppercase text-pa-body hover:bg-pa-cream transition-colors"
        >
          + New assessment
        </Link>
        <button
          type="button"
          disabled
          title="Compare audits — coming soon"
          className="w-full flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-pa-line text-[11.5px] font-bold tracking-[0.06em] uppercase text-pa-muted opacity-60 cursor-not-allowed"
        >
          Compare with another →
        </button>
      </aside>

      {/* RIGHT — RESULTS */}
      <div className="min-w-0 space-y-3.5">
        {/* HERO CARD */}
        <section className="rounded-2xl bg-white border border-pa-line p-5 md:p-7 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-[240px] h-[240px] rounded-full bg-pa-accent-soft pointer-events-none"
          />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-[640px]">
              <div className="flex items-center gap-2.5 mb-1.5">
                <h1 className="text-[28px] md:text-[32px] font-bold text-pa-ink tracking-[-0.7px] leading-tight">
                  Readiness Index
                </h1>
                <Sparkles className="h-5 w-5 text-kpmg-blue" />
              </div>
              <div className="text-[13.5px] text-pa-muted">
                {project} · {client}
              </div>
              <span
                className={`inline-flex items-center gap-1.5 mt-3.5 px-3 py-1 rounded-md text-[11.5px] font-bold uppercase tracking-[0.06em] ${verdictTone.bg} ${verdictTone.fg}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${verdictTone.dot}`} aria-hidden />
                {verdict.label}
              </span>
            </div>
            <div className="text-right">
              <div className="text-[60px] md:text-[64px] font-bold text-kpmg-blue tabular-nums leading-none tracking-[-2px]">
                {overall == null ? "—" : overall.toFixed(1)}
              </div>
              <div className="text-[11px] font-bold text-pa-muted uppercase tracking-[0.1em] mt-2">
                Index · /10
              </div>
            </div>
          </div>

          <div className="relative mt-5 flex flex-wrap items-center gap-3 justify-between">
            <p className="text-[13px] text-pa-body leading-relaxed max-w-[640px]">
              {overall == null
                ? "Audit completed. Review individual modules below."
                : overall < 7
                  ? "Critical \"Must Fix\" issues detected. Remediation is required prior to submission."
                  : overall < 8
                    ? "Submission-ready, with edits. Address warnings before sending."
                    : "Submission-ready. Light polish recommended."}
            </p>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onExport("xlsx")}
                  disabled={exportBusy !== ""}
                  title="Export the review as an Excel workbook"
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-[10px] border border-pa-line bg-white text-pa-ink text-[12.5px] font-bold hover:bg-pa-cream disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {exportBusy === "xlsx" ? "Building…" : "Export Excel"}
                </button>
                <button
                  type="button"
                  onClick={() => onExport("pdf")}
                  disabled={exportBusy !== ""}
                  title="Export the review as a PDF report"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-kpmg-blue text-white text-[12.5px] font-bold shadow-accent-soft hover:bg-kpmg-mediumblue disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportBusy === "pdf" ? "Building…" : "Export PDF"}
                </button>
              </div>
              {exportError && (
                <div className="text-[11px] text-pa-danger leading-tight max-w-[280px] text-right">
                  {exportError}
                </div>
              )}
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <BucketTile label="WHAT IF"      value={buckets.whatIf}      tone="fail" />
            <BucketTile label="MODERATE"     value={buckets.moderate}    tone="partial" />
            <BucketTile label="GOOD TO PASS" value={buckets.goodToPass}  tone="pass" />
          </div>
        </section>

        {/* CRITERION CARDS */}
        {criteria.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {criteria.map((c, i) => {
              const Icon = iconFor(c.name);
              const tone = toneColors(scoreTone(c.score));
              return (
                <Link
                  key={`${c.index}-${i}`}
                  to={`/reviews/${id}/criteria/${c.index}`}
                  className="group rounded-2xl bg-white border border-pa-line p-4 hover:border-kpmg-blue/40 hover:shadow-card transition-all flex flex-col"
                >
                  <div className="flex items-start justify-between gap-2.5 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-7 w-7 rounded-md ${tone.bg} ${tone.fg} flex items-center justify-center shrink-0`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="text-[12.5px] font-bold text-pa-ink leading-snug min-w-0">
                        {c.name}
                      </div>
                    </div>
                    <div className={`text-[14px] font-bold tabular-nums shrink-0 ${tone.fg}`}>
                      {c.score == null ? "—" : c.score}
                    </div>
                  </div>
                  <div className="text-[10.5px] text-pa-body leading-relaxed flex-1">
                    {c.findings
                      ? truncate(stripMarkdown(c.findings), 200)
                      : truncate(stripMarkdown(c.body), 200)}
                  </div>
                  <div className="text-[10.5px] font-bold text-kpmg-blue uppercase tracking-[0.06em] mt-3">
                    Open detail →
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {criteria.length === 0 && (
          <div className="rounded-2xl bg-white border border-pa-line p-6 text-sm text-pa-muted">
            <p className="mb-2 font-bold text-pa-ink">Free-form review</p>
            <p>
              This audit was run as a free-form review without a framework — there are no
              per-criterion scores to display. The full review markdown is below.
            </p>
            <article className="prose prose-sm max-w-none mt-4">
              {/* Render the full text as fallback */}
              <pre className="whitespace-pre-wrap text-[12px] text-pa-body bg-pa-cream-soft border border-pa-line rounded-lg p-3 overflow-auto">
                {data.review_output}
              </pre>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}

function BucketTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pass" | "partial" | "fail";
}) {
  const t = toneColors(tone);
  return (
    <div className={`rounded-xl ${t.bg} px-4 py-3 flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
        <span className={`text-[11px] font-bold tracking-[0.08em] ${t.fg}`}>{label}</span>
      </div>
      <div className={`text-[22px] font-bold tabular-nums tracking-[-0.5px] ${t.fg}`}>
        {value}
      </div>
    </div>
  );
}

/** Naive markdown → plain text for compact card previews. Strips bold,
 *  italics, headers, bullets, and collapses whitespace. */
function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
