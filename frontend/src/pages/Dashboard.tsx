import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Copy, ArrowRight } from "lucide-react";
import { listReviews, type ReviewSummary } from "../api/reviews";
import { useAuthStore } from "../stores/auth";

type StatusKey = "ready" | "go-edits" | "no-go" | "unknown";

interface Counts {
  total: number | null;
  recentAvgScore: number | null;
  readyCount: number | null;
}

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

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number | null;
  hint: string;
}) {
  const display =
    value === null
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString()
        : value;
  return (
    <div className="rounded-xl bg-white border border-pa-line p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-pa-muted mb-2.5">
        {label}
      </div>
      <div className="flex items-baseline gap-2.5">
        <div className="text-[30px] md:text-[32px] font-bold text-pa-ink tabular-nums leading-none tracking-[-0.6px]">
          {display}
        </div>
        <div className="text-[12px] text-pa-muted">{hint}</div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const me = useAuthStore(s => s.user);
  const [counts, setCounts] = useState<Counts>({ total: null, recentAvgScore: null, readyCount: null });
  const [recent, setRecent] = useState<ReviewSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    listReviews(8, 0)
      .then(r => {
        if (cancelled) return;
        const items = r.items;
        setRecent(items);
        const scored = items
          .map(it => it.aggregate_score)
          .filter((s): s is number => typeof s === "number");
        const avg =
          scored.length > 0
            ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10
            : null;
        const ready = items.filter(
          it => typeof it.aggregate_score === "number" && it.aggregate_score >= 8,
        ).length;
        setCounts({
          total: r.total,
          recentAvgScore: avg,
          readyCount: scored.length > 0 ? ready : null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = (me?.full_name || me?.email || "there").split(/[\s@]/)[0];
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  // Audits this week — count recent items whose created_at is within 7 days.
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = recent.filter(r => new Date(r.created_at).getTime() >= weekCutoff).length;
  const subtitle =
    counts.total === null
      ? "Loading audits…"
      : counts.total === 0
        ? "No audits yet — kick off your first one to populate this view."
        : `${thisWeek} audit${thisWeek === 1 ? "" : "s"} this week · ${recent.length} recent`;

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-2">Workspace</div>
          <h1 className="text-3xl md:text-[32px] font-bold text-pa-ink tracking-[-0.6px] leading-tight">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-2 text-[14px] text-pa-muted">{subtitle}</p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled
            title="Compare audits — coming soon"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-[11px] bg-white border border-pa-line text-[13.5px] font-bold text-pa-body opacity-60 cursor-not-allowed"
          >
            <Copy className="h-4 w-4" />
            Compare audits
          </button>
          <Link
            to="/proposals/review"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[11px] bg-kpmg-blue text-white text-[13.5px] font-bold shadow-accent hover:bg-kpmg-mediumblue transition-colors"
          >
            <Plus className="h-4 w-4" />
            New audit
          </Link>
        </div>
      </div>

      {/* STAT TILES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Total audits"
          value={counts.total}
          hint="all-time"
        />
        <StatTile
          label="Avg readiness"
          value={counts.recentAvgScore == null ? "—" : counts.recentAvgScore.toFixed(1)}
          hint="/10 · recent"
        />
        <StatTile
          label="Ready to ship"
          value={counts.readyCount}
          hint="no fixes required"
        />
        <StatTile
          label="Open findings"
          value="—"
          hint="not yet tracked"
        />
      </div>

      {/* RECENT AUDITS */}
      <div className="rounded-2xl bg-white border border-pa-line overflow-hidden">
        <div className="px-5 md:px-6 py-4 border-b border-pa-line-soft">
          <div className="text-[15px] font-bold text-pa-ink">Recent audits</div>
          <div className="text-[12px] text-pa-muted mt-0.5">
            Click any row to open the readiness index
          </div>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-10 px-6">
            <p className="text-sm text-pa-muted mb-4">No audits yet.</p>
            <Link to="/proposals/review" className="btn-primary inline-flex">
              <Plus className="h-4 w-4" /> Run your first audit
            </Link>
          </div>
        ) : (
          <>
            {/* Header — desktop only */}
            <div
              className="hidden md:grid gap-4 px-6 py-2.5 border-b border-pa-line-soft text-[10.5px] font-bold uppercase tracking-[0.1em] text-pa-muted"
              style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) 90px 120px 80px" }}
            >
              <div>File · Client</div>
              <div>Project</div>
              <div>Score</div>
              <div>Status</div>
              <div />
            </div>

            <ul role="list" className="divide-y divide-pa-line-soft">
              {recent.slice(0, 6).map(r => {
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
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-bold text-pa-ink truncate font-mono tracking-[-0.1px]">
                          {r.source_filename}
                        </div>
                        <div className="text-[11.5px] text-pa-muted mt-1 truncate">
                          {client} · {fmtRelative(r.created_at)}
                        </div>
                      </div>
                      <div className="text-[13px] text-pa-body truncate hidden md:block">
                        {project}
                      </div>
                      <div className="text-[18px] font-bold text-kpmg-blue tabular-nums tracking-[-0.4px] hidden md:block">
                        {score == null ? "—" : score.toFixed(1)}
                      </div>
                      <div className="hidden md:block">
                        <StatusPill status={status} />
                      </div>
                      <div className="text-[13px] font-bold text-kpmg-blue text-right hidden md:block">
                        Open <ArrowRight className="inline h-3 w-3 -mt-0.5" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
