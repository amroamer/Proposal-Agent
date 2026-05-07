import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader } from "../components/PageHeader";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  deleteProposal,
  getProposal,
  STATUS_LABEL,
  type Proposal,
  type ProposalStatus,
} from "../api/proposals";
import { extractApiError } from "../api/client";

const STATUS_BADGE: Record<ProposalStatus, string> = {
  draft: "bg-kpmg-gray-100 text-kpmg-gray-700",
  in_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  submitted: "bg-blue-100 text-blue-800",
  archived: "bg-kpmg-gray-100 text-kpmg-gray-500",
};

export function ProposalViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getProposal(Number(id))
      .then(p => !cancelled && setData(p))
      .catch(err => !cancelled && setError(extractApiError(err)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onDelete = async () => {
    if (!data) return;
    setDeleting(true);
    try {
      await deleteProposal(data.id);
      navigate("/proposals");
    } catch (e) {
      setError(extractApiError(e));
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link
          to="/proposals"
          className="text-sm text-kpmg-blue hover:text-kpmg-purple inline-flex items-center"
        >
          ← Back to Proposals
        </Link>
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return <div className="card max-w-4xl text-sm text-kpmg-gray-500">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={data.title}
        subtitle={data.client_name || undefined}
        backTo="/proposals"
        backLabel="Back to Proposals"
        actions={
          <>
            <Link to={`/proposals/${data.id}/edit`} className="btn-secondary">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
            <button onClick={() => setConfirmDelete(true)} className="btn-danger">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </button>
          </>
        }
      />

      <div className="flex items-center gap-3 text-sm">
        <span className={`px-2 py-0.5 rounded font-medium text-xs ${STATUS_BADGE[data.status]}`}>
          {STATUS_LABEL[data.status]}
        </span>
        <span className="text-kpmg-gray-500">
          {data.sections.length} section{data.sections.length === 1 ? "" : "s"}
        </span>
        <span className="text-kpmg-gray-400">·</span>
        <span className="text-kpmg-gray-500">
          Updated {new Date(data.updated_at).toLocaleString()}
        </span>
      </div>

      {data.sections.length === 0 ? (
        <div className="card text-center text-sm text-kpmg-gray-500 py-8">
          This proposal has no sections yet. Click <em>Edit</em> to add some.
        </div>
      ) : (
        <div className="space-y-4">
          {data.sections.map((s, i) => (
            <div key={i} className="card">
              <h2 className="text-xl font-semibold text-kpmg-gray-800 mb-3 pb-2 border-b border-kpmg-gray-100">
                {s.heading}
              </h2>
              {s.content.trim() ? (
                <div className="prose prose-sm max-w-none prose-headings:text-kpmg-gray-800 prose-p:text-kpmg-gray-700 prose-strong:text-kpmg-gray-800 prose-li:text-kpmg-gray-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-kpmg-gray-400 italic">— empty —</p>
              )}
            </div>
          ))}
        </div>
      )}

      {data.notes && (
        <div className="card border-l-4 border-kpmg-warning">
          <h3 className="text-xs uppercase tracking-wide text-kpmg-gray-400 font-medium mb-2">
            Internal notes (not in proposal)
          </h3>
          <p className="text-sm text-kpmg-gray-700 whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete proposal?"
        message="This permanently removes the proposal and all its sections."
        objectName={`${data.title}${data.client_name ? ` — ${data.client_name}` : ""}`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
