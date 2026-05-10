import { Check, AlertTriangle, ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { StructuredFinding, GapItem, Verdict } from "../../api/reviews";
import { SourceCoverageRow } from "./SourceCoverageRow";


interface StructuredFindingPanelProps {
  finding: StructuredFinding;
  /** Called when the operator clicks a slide-number chip. */
  onSlideClick: (slideNumber: number) => void;
}

/** Verdict chip palette — RAG (Red/Amber/Green) status convention.
 *  Mapped from the backend's `Verdict` literal:
 *    strong   -> GREEN  (KPMG teal — pa-success)
 *    adequate -> AMBER  (KPMG warning)
 *    weak     -> RED    (KPMG error  — pa-danger) */
const VERDICT_TONE: Record<Verdict, { bg: string; fg: string; dot: string; label: string }> = {
  strong:   { bg: "bg-pa-success-soft", fg: "text-pa-success", dot: "bg-pa-success", label: "GREEN" },
  adequate: { bg: "bg-pa-warning-soft", fg: "text-pa-warning", dot: "bg-pa-warning", label: "AMBER" },
  weak:     { bg: "bg-pa-danger-soft",  fg: "text-pa-danger",  dot: "bg-pa-danger",  label: "RED" },
};

const SEVERITY_TONE: Record<GapItem["severity"], { bg: string; fg: string; label: string }> = {
  high:   { bg: "bg-pa-danger-soft",  fg: "text-pa-danger",  label: "HIGH" },
  medium: { bg: "bg-pa-warning-soft", fg: "text-pa-warning", label: "MEDIUM" },
  low:    { bg: "bg-kpmg-gray-100",   fg: "text-pa-muted",   label: "LOW" },
};


/** Renders a clickable chip per cited slide. Empty arrays render nothing. */
function SlideChips({
  slides,
  onSlideClick,
}: {
  slides: number[];
  onSlideClick: (n: number) => void;
}) {
  if (!slides || slides.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2" data-testid="slide-chips">
      {slides.map((n) => (
        <button
          key={n}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSlideClick(n);
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-kpmg-mediumblue/10 text-kpmg-blue text-[10.5px] font-bold hover:bg-kpmg-mediumblue/20 hover:text-kpmg-mediumblue focus:outline-none focus:ring-2 focus:ring-kpmg-mediumblue focus:ring-offset-1 transition-colors"
          data-testid={`slide-chip-${n}`}
          title={`View context from slide ${n}`}
        >
          Slide {n}
          <ChevronRight className="h-2.5 w-2.5" />
        </button>
      ))}
    </div>
  );
}


export function StructuredFindingPanel({
  finding,
  onSlideClick,
}: StructuredFindingPanelProps) {
  const verdict = VERDICT_TONE[finding.verdict];

  return (
    <div className="space-y-3.5" data-testid="structured-finding">
      {/* Verdict + summary card */}
      <section className="rounded-2xl bg-white border border-pa-line p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11.5px] font-bold uppercase tracking-[0.06em]",
              verdict.bg,
              verdict.fg,
            )}
            data-testid="verdict-chip"
          >
            <span className={clsx("h-1.5 w-1.5 rounded-full", verdict.dot)} aria-hidden />
            {verdict.label}
          </span>
          <div className="text-right">
            <div className="text-[42px] font-bold text-kpmg-blue tabular-nums leading-none tracking-[-1.5px]">
              {finding.score.toFixed(1)}
            </div>
            <div className="text-[10px] font-bold text-pa-muted uppercase tracking-[0.1em] mt-1">
              Score · /10
            </div>
          </div>
        </div>
        {finding.summary && (
          <p className="text-[13.5px] text-pa-body leading-relaxed">
            {finding.summary}
          </p>
        )}

        {/* Source coverage — what the AI actually saw vs cited. Sits
            inside the hero card so the operator sees it before
            reading the strengths / gaps below. */}
        <div className="mt-3 pt-3 border-t border-pa-line-soft">
          <SourceCoverageRow finding={finding} />
        </div>
      </section>

      {/* Strengths panel */}
      <section
        className="rounded-2xl bg-white border border-pa-line overflow-hidden"
        data-testid="strengths-panel"
      >
        <header className="flex items-center gap-2 px-5 py-3 border-b border-pa-line bg-pa-success-soft/40">
          <Check className="h-4 w-4 text-pa-success" />
          <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-pa-success">
            Strengths
          </span>
          <span className="text-[11px] text-pa-muted ml-auto tabular-nums">
            {finding.strengths.length}
          </span>
        </header>
        {finding.strengths.length === 0 ? (
          <div className="px-5 py-6 text-[12.5px] text-pa-muted italic">
            No strengths called out for this criterion.
          </div>
        ) : (
          <ul className="divide-y divide-pa-line-soft">
            {finding.strengths.map((s, i) => (
              <li key={i} className="px-5 py-3.5 border-l-4 border-pa-success">
                <div className="text-[13.5px] font-bold text-pa-ink">{s.title}</div>
                {s.detail && (
                  <p className="mt-1 text-[12.5px] text-pa-body leading-relaxed">
                    {s.detail}
                  </p>
                )}
                <SlideChips slides={s.slides_referenced} onSlideClick={onSlideClick} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Gaps panel */}
      <section
        className="rounded-2xl bg-white border border-pa-line overflow-hidden"
        data-testid="gaps-panel"
      >
        <header className="flex items-center gap-2 px-5 py-3 border-b border-pa-line bg-pa-danger-soft/40">
          <AlertTriangle className="h-4 w-4 text-pa-danger" />
          <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-pa-danger">
            Gaps & Recommendations
          </span>
          <span className="text-[11px] text-pa-muted ml-auto tabular-nums">
            {finding.gaps.length}
          </span>
        </header>
        {finding.gaps.length === 0 ? (
          <div className="px-5 py-6 text-[12.5px] text-pa-muted italic">
            No gaps identified for this criterion.
          </div>
        ) : (
          <ul className="divide-y divide-pa-line-soft">
            {finding.gaps.map((g, i) => {
              const sev = SEVERITY_TONE[g.severity];
              return (
                <li key={i} className="px-5 py-3.5 border-l-4 border-pa-danger">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={clsx(
                        "shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.06em]",
                        sev.bg,
                        sev.fg,
                      )}
                    >
                      {sev.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold text-pa-ink">
                        {g.title}
                      </div>
                      {g.detail && (
                        <p className="mt-1 text-[12.5px] text-pa-body leading-relaxed">
                          {g.detail}
                        </p>
                      )}
                      {g.recommendation && (
                        <div className="mt-2 px-3 py-2 rounded-md bg-pa-accent-soft border border-kpmg-mediumblue/20">
                          <div className="text-[10px] font-bold text-kpmg-blue uppercase tracking-[0.08em] mb-1">
                            Recommendation
                          </div>
                          <p className="text-[12.5px] text-pa-body leading-relaxed">
                            {g.recommendation}
                          </p>
                        </div>
                      )}
                      <SlideChips
                        slides={g.slides_referenced}
                        onSlideClick={onSlideClick}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Extra recommendations (don't tie to a specific gap) */}
      {finding.extra_recommendations.length > 0 && (
        <section
          className="rounded-2xl bg-white border border-pa-line overflow-hidden"
          data-testid="extra-rec-panel"
        >
          <header className="flex items-center gap-2 px-5 py-3 border-b border-pa-line">
            <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-kpmg-blue">
              Other recommendations
            </span>
          </header>
          <ul className="divide-y divide-pa-line-soft">
            {finding.extra_recommendations.map((r, i) => (
              <li key={i} className="px-5 py-3 text-[12.5px] text-pa-body leading-relaxed">
                • {r}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
