import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, FileText, Eye } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { DataTable, type Column } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  listProposals,
  deleteProposal,
  PROPOSAL_STATUSES,
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

export function ProposalsListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "">("");
  const [target, setTarget] = useState<Proposal | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    try {
      const r = await listProposals({
        status_filter: statusFilter || undefined,
      });
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const columns = useMemo<Column<Proposal>[]>(
    () => [
      {
        key: "title",
        header: "Title",
        cell: r => (
          <Link
            to={`/proposals/${r.id}`}
            className="text-kpmg-blue hover:text-kpmg-purple font-medium"
          >
            {r.title}
          </Link>
        ),
      },
      {
        key: "client",
        header: "Client",
        cell: r => (
          <span className="text-kpmg-gray-700">
            {r.client_name || <em className="text-kpmg-gray-400">—</em>}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: r => (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[r.status]}`}>
            {STATUS_LABEL[r.status]}
          </span>
        ),
      },
      {
        key: "sections",
        header: "Sections",
        cell: r => <span className="text-kpmg-gray-600">{r.sections.length}</span>,
      },
      {
        key: "updated",
        header: "Updated",
        cell: r => (
          <span className="text-kpmg-gray-500">{new Date(r.updated_at).toLocaleDateString()}</span>
        ),
      },
      {
        key: "actions",
        header: "",
        thClassName: "w-32",
        cell: r => (
          <div className="flex justify-end gap-1">
            <button
              onClick={() => navigate(`/proposals/${r.id}`)}
              className="p-1.5 rounded hover:bg-kpmg-gray-100 text-kpmg-gray-500 hover:text-kpmg-blue"
              aria-label="View"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate(`/proposals/${r.id}/edit`)}
              className="p-1.5 rounded hover:bg-kpmg-gray-100 text-kpmg-gray-500 hover:text-kpmg-blue"
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTarget(r)}
              className="p-1.5 rounded hover:bg-kpmg-gray-100 text-kpmg-gray-500 hover:text-kpmg-error"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [navigate],
  );

  const onDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await deleteProposal(target.id);
      setTarget(null);
      await refresh();
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Proposals"
        subtitle="Concrete proposal documents — start from a template or build from scratch."
        actions={
          <Link to="/proposals/new" className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            New proposal
          </Link>
        }
      />

      <div className="flex items-center gap-2">
        <span className="text-sm text-kpmg-gray-500">Status:</span>
        <select
          className="input-field w-48"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as ProposalStatus | "")}
        >
          <option value="">All</option>
          {PROPOSAL_STATUSES.map(s => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      )}

      {items === null && !error && <div className="card text-sm text-kpmg-gray-500">Loading…</div>}
      {items && items.length === 0 && (
        <EmptyState
          icon={FileText}
          title={statusFilter ? `No ${STATUS_LABEL[statusFilter as ProposalStatus]} proposals` : "No proposals yet"}
          description="Start from a template, or write one from scratch."
          action={
            <Link to="/proposals/new" className="btn-primary">
              <Plus className="h-4 w-4 mr-2" />
              New proposal
            </Link>
          }
        />
      )}
      {items && items.length > 0 && <DataTable columns={columns} rows={items} rowKey={r => r.id} />}

      <ConfirmDialog
        open={!!target}
        title="Delete proposal?"
        message="This permanently removes the proposal and its sections."
        objectName={target ? `${target.title}${target.client_name ? ` — ${target.client_name}` : ""}` : undefined}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
