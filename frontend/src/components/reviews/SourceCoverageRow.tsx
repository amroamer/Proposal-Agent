import { useMemo } from "react";
import { AlertTriangle, FileText, Layers } from "lucide-react";
import clsx from "clsx";
import type {
  GapItem,
  StrengthItem,
  StructuredFinding,
} from "../../api/reviews";


interface SourceCoverageRowProps {
  finding: StructuredFinding;
}


/** Show the operator: how many slides the model saw vs. how many it
 *  cited, and warn when a citation falls outside the reviewed window.
 *
 *  Why this matters: with the current 60 KB document cap, only the
 *  first ~38 slides of a 177-slide deck reach the model. If the model
 *  cites slide 40, that's either inferred or hallucinated. The chip
 *  on the right surfaces that, in red, so the operator can sanity-check.
 */
export function SourceCoverageRow({ finding }: SourceCoverageRowProps) {
  const coverage = finding.coverage;

  // Collect every slide cited by every strength + gap, deduped + sorted.
  const citedSlides = useMemo(() => {
    const set = new Set<number>();
    finding.strengths.forEach((s: StrengthItem) =>
      (s.slides_referenced ?? []).forEach((n) => set.add(n)),
    );
    finding.gaps.forEach((g: GapItem) =>
      (g.slides_referenced ?? []).forEach((n) => set.add(n)),
    );
    return [...set].sort((a, b) => a - b);
  }, [finding.strengths, finding.gaps]);

  // Coverage is optional on the wire (legacy rows don't carry it).
  // When absent, render a compact "cited slides only" line so the
  // operator at least sees what was cited even if we can't tell what
  // was reviewed.
  if (!coverage) {
    return (
      <div className="text-[11.5px] text-pa-muted" data-testid="coverage-row-fallback">
        Cited:{" "}
        {citedSlides.length === 0
          ? "no slides"
          : `slide${citedSlides.length === 1 ? "" : "s"} ${citedSlides.join(", ")}`}
      </div>
    );
  }

  const sentMax = coverage.slides_sent_max;
  const sentLabel =
    sentMax == null
      ? `${(coverage.chars_sent / 1024).toFixed(0)} KB of ${(coverage.chars_total / 1024).toFixed(0)} KB`
      : coverage.slides_total === 0
        ? `${sentMax} slide${sentMax === 1 ? "" : "s"}`
        : `slides ${coverage.slides_sent_min}–${sentMax} of ${coverage.slides_total}`;

  // A citation is "out of window" when its slide number exceeds the
  // last slide the model received. This is the actionable warning.
  const outOfWindow = useMemo(() => {
    if (sentMax == null) return [];
    return citedSlides.filter((n) => n > sentMax);
  }, [citedSlides, sentMax]);

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-[11.5px]"
      data-testid="coverage-row"
    >
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-pa-cream-soft border border-pa-line text-pa-body"
        title="What the AI received as input for this criterion"
      >
        <Layers className="h-3 w-3 text-pa-muted" />
        <span className="text-pa-muted">Reviewed:</span>
        <span className="font-bold text-pa-ink">{sentLabel}</span>
        {coverage.char_cap_hit && (
          <span
            className="ml-1 inline-flex items-center px-1 py-0 rounded bg-pa-warning-soft text-pa-warning text-[10px] font-bold uppercase tracking-wider"
            title={`Document was longer than the ${(coverage.chars_total / 1024).toFixed(0)} KB cap; only the first ${(coverage.chars_sent / 1024).toFixed(0)} KB was sent to the model.`}
          >
            Truncated
          </span>
        )}
        {coverage.silent_truncation && (
          <span
            className="ml-1 inline-flex items-center px-1 py-0 rounded bg-pa-danger-soft text-pa-danger text-[10px] font-bold uppercase tracking-wider"
            data-testid="coverage-silent-truncation"
            title={
              `The model's context window was too small for what we sent. ` +
              `Estimated ~${Math.round(coverage.chars_sent / 3)} tokens, ` +
              `model only consumed ${coverage.tokens_consumed ?? "?"}. ` +
              `The 'Reviewed' chip overstates what the model actually saw — ` +
              `treat the result as based on a fraction of the input.`
            }
          >
            Cut by model
          </span>
        )}
      </span>

      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-pa-cream-soft border border-pa-line text-pa-body"
        title="Slides the AI cited as evidence in this criterion"
      >
        <FileText className="h-3 w-3 text-pa-muted" />
        <span className="text-pa-muted">Cited:</span>
        <span className="font-bold text-pa-ink">
          {citedSlides.length === 0
            ? "none"
            : `${citedSlides.length} slide${citedSlides.length === 1 ? "" : "s"}`}
        </span>
      </span>

      {outOfWindow.length > 0 && (
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border",
            "bg-pa-danger-soft border-pa-danger/30 text-pa-danger",
          )}
          role="alert"
          data-testid="coverage-out-of-window"
          title={`Slides cited as evidence (${outOfWindow.join(", ")}) fall OUTSIDE the window the AI received. The citation is likely inferred or hallucinated; verify against the source.`}
        >
          <AlertTriangle className="h-3 w-3" />
          <span className="font-bold">
            {outOfWindow.length} citation{outOfWindow.length === 1 ? "" : "s"} outside
            reviewed window
          </span>
        </span>
      )}
    </div>
  );
}
