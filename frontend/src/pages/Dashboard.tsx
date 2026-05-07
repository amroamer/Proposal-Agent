import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, History, BookOpen, FileStack, FileText, Plus, SlidersHorizontal } from "lucide-react";
import { listKB } from "../api/kb";
import { listTemplates } from "../api/templates";
import { listProposals } from "../api/proposals";
import { listReviews, type ReviewSummary } from "../api/reviews";

interface Counts {
  kb: number | null;
  templates: number | null;
  proposals: number | null;
  reviews: number | null;
}

const QUICK_ACTIONS = [
  { to: "/proposals/review", label: "Review a proposal", icon: Sparkles, desc: "Upload a draft and get an AI critique against a framework." },
  { to: "/frameworks", label: "Manage frameworks", icon: SlidersHorizontal, desc: "Define the diagnostic logic the reviewer uses." },
  { to: "/proposals/new", label: "New proposal", icon: FileText, desc: "Start from a template or scratch." },
  { to: "/templates/new", label: "New template", icon: FileStack, desc: "Build a reusable proposal skeleton." },
  { to: "/knowledge/new", label: "Add knowledge", icon: BookOpen, desc: "Capture reusable content." },
];

export function DashboardPage() {
  const [counts, setCounts] = useState<Counts>({ kb: null, templates: null, proposals: null, reviews: null });
  const [recent, setRecent] = useState<ReviewSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      listKB({ limit: 1 }),
      listTemplates(),
      listProposals({ limit: 1 }),
      listReviews(5, 0),
    ]).then(results => {
      if (cancelled) return;
      setCounts({
        kb: results[0].status === "fulfilled" ? results[0].value.total : 0,
        templates: results[1].status === "fulfilled" ? results[1].value.total : 0,
        proposals: results[2].status === "fulfilled" ? results[2].value.total : 0,
        reviews: results[3].status === "fulfilled" ? results[3].value.total : 0,
      });
      if (results[3].status === "fulfilled") setRecent(results[3].value.items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8 max-w-7xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-kpmg-gray-800">Dashboard</h1>
        <p className="mt-1 text-sm text-kpmg-gray-500">Welcome to Proposal Agent.</p>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CountCard label="Proposals" value={counts.proposals} icon={FileText} to="/proposals" />
        <CountCard label="Templates" value={counts.templates} icon={FileStack} to="/templates" />
        <CountCard label="Knowledge items" value={counts.kb} icon={BookOpen} to="/knowledge" />
        <CountCard label="Reviews run" value={counts.reviews} icon={History} to="/reviews" />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold text-kpmg-gray-800 mb-3">Quick actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUICK_ACTIONS.map(q => (
            <Link
              key={q.to}
              to={q.to}
              className="card hover:shadow-raise transition-shadow group flex gap-4"
            >
              <div className="h-10 w-10 rounded-md bg-kpmg-blue/10 flex items-center justify-center flex-shrink-0">
                <q.icon className="h-5 w-5 text-kpmg-blue" />
              </div>
              <div>
                <span className="font-semibold text-kpmg-gray-800 group-hover:text-kpmg-blue">
                  {q.label}
                </span>
                <div className="text-sm text-kpmg-gray-500 mt-0.5">{q.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent reviews */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-kpmg-gray-800">Recent reviews</h2>
          <Link to="/reviews" className="text-sm text-kpmg-blue hover:text-kpmg-purple">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-sm text-kpmg-gray-500 mb-3">No reviews yet.</p>
            <Link to="/proposals/review" className="btn-primary">
              <Plus className="h-4 w-4 mr-2" />
              Run your first review
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-card divide-y divide-kpmg-gray-100">
            {recent.map(r => (
              <Link
                key={r.id}
                to={`/reviews/${r.id}`}
                className="block px-4 py-3 hover:bg-kpmg-gray-50"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-kpmg-gray-800 truncate">
                      {r.source_filename}
                    </div>
                    <div className="text-xs text-kpmg-gray-500 mt-0.5 line-clamp-1">
                      {r.prompt_preview}
                    </div>
                  </div>
                  <div className="text-xs text-kpmg-gray-400 text-right whitespace-nowrap">
                    <div>{(r.duration_ms / 1000).toFixed(1)}s</div>
                    <div>{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CountCard({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number | null;
  icon: typeof FileText;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="card hover:shadow-raise transition-shadow flex items-start gap-3"
    >
      <div className="h-9 w-9 rounded-md bg-kpmg-blue/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-kpmg-blue" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wide text-kpmg-gray-400">{label}</div>
        <div className="mt-1 text-2xl font-bold text-kpmg-blue">
          {value === null ? "—" : value.toLocaleString()}
        </div>
      </div>
    </Link>
  );
}
