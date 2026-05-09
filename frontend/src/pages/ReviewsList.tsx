import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Inbox, ArrowRight, Sparkles } from "lucide-react";
import { listReviews, type ReviewSummary } from "../api/reviews";
import { extractApiError } from "../api/client";

type StatusKey = "ready" | "go-edits" | "no-go" | "unknown";

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Today · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `Yesterday · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit", hour12: false },
  )}`;
}

function statusFromScore(score: number | null): StatusKey {
  if (score == null) return "unknown";
  if (score >= 8) return "ready";
  if (score >= 7) return "go-edits";
  return "no-go";
}

function StatusPill({ status }: { status: StatusKey }) {
  const styles: Record<StatusKey, { bg: string; fg: string; label: string }> = {
    ready:    { bg: "bg-pa-success-soft", fg: "text-pa-success", label: "READY" },
    "go-edits": { bg: "bg-pa-warning-soft", fg: "text-pa-warning", label: "GO · EDITS" },
    "no-go":  { bg: "bg-pa-danger-soft",  fg: "text-pa-danger",  label: "NO GO" },
    unknown:  { bg: "bg-pa-cream",        fg: "text-pa-muted",   label: "—" },
  };
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-bold tracking-[0.04em] ${s.bg} ${s.fg}`}
    >
      <span className="text-[8px] leading-none">●</span>
      {s.label}
    </span>
  );
}

export function ReviewsListPage() {
  const [items, setItems] = useState<ReviewSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listReviews()
      .then(res => {
        if (!cancelled) setItems(res.items);
      })
      .catch(err => {
        if (!cancelled) setError(extractApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-2">Audit log</div>
          <h1 className="text-3xl md:text-[32px] font-bold text-pa-ink tracking-[-0.6px] leading-tight">
            Review history
          </h1>
          <p className="mt-2 text-sm text-pa-muted max-w-[640px]">
            Past AI audits of proposals you uploaded. Click any row to open the readiness index.
          </p>
        </div>
        <Link
          to="/proposals/review"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-[11px] bg-kpmg-blue text-white text-[13.5px] font-bold shadow-accent hover:bg-kpmg-mediumblue transition-colors"
        >
          <Plus className="h-4 w-4" />
          New audit
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-pa-danger-soft border border-pa-danger/20 text-sm text-pa-danger"
        >
          {error}
        </div>
      )}

      {items === null && !error && (
        <div className="rounded-2xl bg-white border border-pa-line p-6 text-sm text-pa-muted">
          Loading…
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-2xl bg-white border border-pa-line text-center py-12 px-6">
          <Inbox className="h-10 w-10 text-pa-muted/60 mx-auto mb-3" />
          <h3 className="font-bold text-pa-ink">No audits yet</h3>
          <p className="text-sm text-pa-muted mt-1 mb-4">
            Upload a proposal to run your first readiness diagnostic.
          </p>
          <Link
            to="/proposals/review"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[11px] bg-kpmg-blue text-white text-sm font-bold shadow-accent hover:bg-kpmg-mediumblue transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Run your first audit
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="rounded-2xl bg-white border border-pa-line overflow-hidden">
          {/* Header — desktop only */}
          <div className="hidden md:grid gap-4 px-6 py-2.5 border-b border-pa-line-soft text-[10.5px] font-bold uppercase tracking-[0.1em] text-pa-muted md:[grid-template-columns:minmax(0,1.6fr)_minmax(0,1fr)_90px_120px_80px]">
            <div>File · Client</div>
            <div>Project</div>
            <div>Score</div>
            <div>Status</div>
            <div />
          </div>

          <ul role="list" className="divide-y divide-pa-line-soft">
            {items.map(r => {
              const score = r.aggregate_score;
              const status = statusFromScore(score);
              const client =
                r.extracted_metadata?.client_name?.trim() ||
                r.prompt_preview?.replace(/^\[Framework\]\s*/, "").trim() ||
                "—";
              const project =
                r.extracted_metadata?.document_title?.trim() ||
                r.extracted_metadata?.purpose_and_scope?.trim() ||
                r.source_filename;
              return (
                <li key={r.id}>
                  <Link
                    to={`/reviews/${r.id}`}
                    className="grid gap-3 md:gap-4 px-5 md:px-6 py-4 hover:bg-pa-cream transition-colors items-center grid-cols-1 md:[grid-template-columns:minmax(0,1.6fr)_minmax(0,1fr)_90px_120px_80px]"
                  >
                    {/* File · Client (always visible) */}
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-bold text-pa-ink truncate font-mono tracking-[-0.1px]">
                        {r.source_filename}
                      </div>
                      <div className="text-[11.5px] text-pa-muted mt-1 truncate">
                        {client} · {fmtRelative(r.created_at)}
                      </div>
                    </div>

                    {/* Project (md+) */}
                    <div className="text-[13px] text-pa-body truncate hidden md:block">
                      {project}
                    </div>

                    {/* Score (md+) */}
                    <div className="text-[18px] font-bold text-kpmg-blue tabular-nums tracking-[-0.4px] hidden md:block">
                      {score == null ? "—" : score.toFixed(1)}
                    </div>

                    {/* Status — pill on mobile (inline below filename), full pill on md+ */}
                    <div className="hidden md:block">
                      <StatusPill status={status} />
                    </div>

                    {/* Action arrow (md+) */}
                    <div className="text-[13px] font-bold text-kpmg-blue text-right hidden md:block">
                      Open <ArrowRight className="inline h-3 w-3 -mt-0.5" />
                    </div>

                    {/* Mobile-only summary row */}
                    <div className="md:hidden flex items-center gap-3 mt-2 -mx-1 px-1">
                      <div className="text-[16px] font-bold text-kpmg-blue tabular-nums shrink-0">
                        {score == null ? "—" : score.toFixed(1)}
                      </div>
                      <StatusPill status={status} />
                      <ArrowRight className="ml-auto h-4 w-4 text-kpmg-blue shrink-0" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
