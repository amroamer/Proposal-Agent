import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, FileStack } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { DataTable, type Column } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { listTemplates, deleteTemplate, type Template } from "../api/templates";
import { extractApiError } from "../api/client";

export function TemplatesListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    try {
      const r = await listTemplates();
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const columns = useMemo<Column<Template>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        cell: r => (
          <Link
            to={`/templates/${r.id}/edit`}
            className="text-kpmg-blue hover:text-kpmg-purple font-medium"
          >
            {r.name}
          </Link>
        ),
      },
      {
        key: "sections",
        header: "Sections",
        cell: r => (
          <span className="text-kpmg-gray-600">
            {r.sections.length} section{r.sections.length === 1 ? "" : "s"}
          </span>
        ),
      },
      {
        key: "description",
        header: "Description",
        cell: r => (
          <span className="text-kpmg-gray-600 line-clamp-1 max-w-md inline-block">
            {r.description || <em className="text-kpmg-gray-400">—</em>}
          </span>
        ),
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
        thClassName: "w-24",
        cell: r => (
          <div className="flex justify-end gap-1">
            <button
              onClick={() => navigate(`/templates/${r.id}/edit`)}
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
      await deleteTemplate(target.id);
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
        title="Templates"
        subtitle="Reusable proposal skeletons. Pick one when starting a new proposal."
        actions={
          <Link to="/templates/new" className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            New template
          </Link>
        }
      />

      {error && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      )}

      {items === null && !error && <div className="card text-sm text-kpmg-gray-500">Loading…</div>}
      {items && items.length === 0 && (
        <EmptyState
          icon={FileStack}
          title="No templates yet"
          description="Create reusable proposal skeletons authors can start from."
          action={
            <Link to="/templates/new" className="btn-primary">
              <Plus className="h-4 w-4 mr-2" />
              Create your first template
            </Link>
          }
        />
      )}
      {items && items.length > 0 && <DataTable columns={columns} rows={items} rowKey={r => r.id} />}

      <ConfirmDialog
        open={!!target}
        title="Delete template?"
        message="Existing proposals that referenced this template will keep their content but lose the link."
        objectName={target?.name}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
