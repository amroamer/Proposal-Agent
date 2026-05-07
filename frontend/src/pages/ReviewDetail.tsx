import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getReview, type ReviewDetail } from "../api/reviews";
import { extractApiError } from "../api/client";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

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

  if (error) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link to="/reviews" className="text-sm text-kpmg-blue hover:text-kpmg-purple inline-flex items-center">
          <ChevronLeft className="h-4 w-4" />
          Back to reviews
        </Link>
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="card max-w-4xl text-sm text-kpmg-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/reviews" className="text-sm text-kpmg-blue hover:text-kpmg-purple inline-flex items-center">
        <ChevronLeft className="h-4 w-4" />
        Back to reviews
      </Link>

      <div>
        <div className="flex items-center gap-2 text-kpmg-gray-700">
          <FileText className="h-5 w-5 text-kpmg-blue" />
          <h1 className="text-xl md:text-2xl font-bold text-kpmg-gray-800 break-all">
            {data.source_filename}
          </h1>
        </div>
        <div className="text-xs text-kpmg-gray-500 mt-1">
          {data.source_kind.toUpperCase()} · {fmtBytes(data.source_size_bytes)} · {data.model} ·{" "}
          {(data.duration_ms / 1000).toFixed(1)}s · {new Date(data.created_at).toLocaleString()}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm uppercase tracking-wide text-kpmg-gray-400 font-medium mb-2">
          Review brief
        </h2>
        <p className="text-sm text-kpmg-gray-700 whitespace-pre-wrap">{data.prompt}</p>
      </div>

      <div className="card">
        <h2 className="text-sm uppercase tracking-wide text-kpmg-gray-400 font-medium mb-3">
          Review
        </h2>
        <div className="prose prose-sm max-w-none prose-headings:text-kpmg-gray-800 prose-headings:font-semibold prose-p:text-kpmg-gray-700 prose-strong:text-kpmg-gray-800 prose-li:text-kpmg-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.review_output}</ReactMarkdown>
        </div>
      </div>

      <details
        className="card"
        open={showSource}
        onToggle={e => setShowSource((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm uppercase tracking-wide text-kpmg-gray-400 font-medium">
          Extracted source text ({data.extracted_text.length.toLocaleString()} chars)
        </summary>
        <pre className="mt-3 text-xs text-kpmg-gray-600 whitespace-pre-wrap font-mono max-h-[60vh] overflow-auto bg-kpmg-gray-50 p-3 rounded">
          {data.extracted_text}
        </pre>
      </details>
    </div>
  );
}
