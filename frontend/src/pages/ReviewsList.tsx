import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, FileText, Inbox } from "lucide-react";
import { listReviews, type ReviewSummary } from "../api/reviews";
import { extractApiError } from "../api/client";

function formatDate(s: string): string {
  return new Date(s).toLocaleString();
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
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
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-kpmg-gray-800">Review history</h1>
          <p className="mt-1 text-sm text-kpmg-gray-500">
            Past AI reviews of proposals you uploaded.
          </p>
        </div>
        <Link to="/proposals/review" className="btn-primary">
          <Sparkles className="h-4 w-4 mr-2" />
          New review
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error"
        >
          {error}
        </div>
      )}

      {items === null && !error && (
        <div className="card text-sm text-kpmg-gray-500">Loading…</div>
      )}

      {items && items.length === 0 && (
        <div className="card text-center py-12">
          <Inbox className="h-10 w-10 text-kpmg-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-kpmg-gray-700">No reviews yet</h3>
          <p className="text-sm text-kpmg-gray-500 mt-1 mb-4">
            Upload a proposal and give it a brief to get started.
          </p>
          <Link to="/proposals/review" className="btn-primary">
            <Sparkles className="h-4 w-4 mr-2" />
            Run your first review
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-kpmg-gray-50 text-xs uppercase tracking-wide text-kpmg-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">File</th>
                <th className="text-left px-4 py-3 font-medium">Brief</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Model</th>
                <th className="text-right px-4 py-3 font-medium">Time</th>
                <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kpmg-gray-100">
              {items.map(r => (
                <tr key={r.id} className="hover:bg-kpmg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/reviews/${r.id}`}
                      className="flex items-center gap-2 text-kpmg-blue hover:text-kpmg-purple font-medium"
                    >
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate max-w-[18rem]">{r.source_filename}</span>
                    </Link>
                    <div className="text-xs text-kpmg-gray-400 mt-0.5">
                      {r.source_kind.toUpperCase()} · {fmtBytes(r.source_size_bytes)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-kpmg-gray-600 max-w-[20rem]">
                    <div className="line-clamp-2">{r.prompt_preview}</div>
                  </td>
                  <td className="px-4 py-3 text-kpmg-gray-600 hidden md:table-cell">{r.model}</td>
                  <td className="px-4 py-3 text-right text-kpmg-gray-600 tabular-nums">
                    {(r.duration_ms / 1000).toFixed(1)}s
                  </td>
                  <td className="px-4 py-3 text-right text-kpmg-gray-500 hidden sm:table-cell">
                    {formatDate(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
