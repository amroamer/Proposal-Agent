import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Search, BookOpen } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { DataTable, type Column } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { listKB, deleteKB, type KBItem } from "../api/kb";
import { extractApiError } from "../api/client";

export function KBListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<KBItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<KBItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    try {
      const r = await listKB({ search: search || undefined });
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  useEffect(() => {
    const t = setTimeout(refresh, search ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const columns = useMemo<Column<KBItem>[]>(
    () => [
      {
        key: "title",
        header: "Title",
        cell: r => (
          <Link
            to={`/knowledge/${r.id}/edit`}
            className="text-kpmg-blue hover:text-kpmg-purple font-medium"
          >
            {r.title}
          </Link>
        ),
      },
      {
        key: "category",
        header: "Category",
        cell: r => (
          <span className="inline-block text-xs px-2 py-0.5 rounded bg-kpmg-gray-100 text-kpmg-gray-700">
            {r.category}
          </span>
        ),
      },
      {
        key: "tags",
        header: "Tags",
        cell: r => (
          <div className="flex flex-wrap gap-1">
            {r.tags.slice(0, 4).map(t => (
              <span
                key={t}
                className="text-xs px-1.5 py-0.5 rounded bg-kpmg-blue/10 text-kpmg-blue"
              >
                {t}
              </span>
            ))}
            {r.tags.length > 4 && (
              <span className="text-xs text-kpmg-gray-400">+{r.tags.length - 4}</span>
            )}
          </div>
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
              onClick={() => navigate(`/knowledge/${r.id}/edit`)}
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
      await deleteKB(target.id);
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
        title="Knowledge Base"
        subtitle="Reusable content snippets — pull these into proposals."
        actions={
          <Link to="/knowledge/new" className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add item
          </Link>
        }
      />

      <div className="relative">
        <Search className="h-4 w-4 text-kpmg-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          placeholder="Search title or body…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-9 max-w-md"
        />
      </div>

      {error && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      )}

      {items === null && !error && <div className="card text-sm text-kpmg-gray-500">Loading…</div>}
      {items && items.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No knowledge items yet"
          description="Add reusable content snippets that authors can pull into proposals."
          action={
            <Link to="/knowledge/new" className="btn-primary">
              <Plus className="h-4 w-4 mr-2" />
              Add your first item
            </Link>
          }
        />
      )}
      {items && items.length > 0 && <DataTable columns={columns} rows={items} rowKey={r => r.id} />}

      <ConfirmDialog
        open={!!target}
        title="Delete knowledge item?"
        message="This permanently removes the snippet. Existing proposals are unaffected."
        objectName={target?.title}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
