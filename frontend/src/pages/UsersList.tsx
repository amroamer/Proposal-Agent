import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Users, KeyRound, Search, RefreshCw,
  ShieldCheck, UserCheck, UserX, Undo2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  adminResetPassword,
  bulkUserAction,
  deleteUser,
  getUserStats,
  listUsers,
  restoreUser,
  type AdminUser,
  type BulkAction,
  type UserRoleFilter,
  type UserStats,
  type UserStatusFilter,
} from "../api/users";
import { extractApiError } from "../api/client";
import { useAuthStore } from "../stores/auth";

const PAGE_SIZE = 25;

const ROLES: { value: UserRoleFilter; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admins" },
  { value: "user", label: "Users" },
];

const STATUSES: { value: UserStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Disabled" },
  { value: "deleted", label: "Deleted" },
  { value: "all", label: "All" },
];

export function UsersListPage() {
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);

  // Data
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState<UserRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("active");
  const [page, setPage] = useState(0);

  // Selection (bulk)
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // ----- Debounced search -----
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // ----- Reset page when filters change -----
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, role, statusFilter]);

  // ----- Load data -----
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listUsers({
        search: debouncedSearch || undefined,
        role,
        status_filter: statusFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
      getUserStats(),
    ])
      .then(([list, s]) => {
        if (cancelled) return;
        setItems(list.items);
        setTotal(list.total);
        setStats(s);
        setError(null);
        // Drop selections that are no longer in view
        setSelected(prev => {
          const visible = new Set(list.items.map(u => u.id));
          const next = new Set<number>();
          prev.forEach(id => visible.has(id) && next.add(id));
          return next;
        });
      })
      .catch(e => !cancelled && setError(extractApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, role, statusFilter, page, refreshNonce]);

  const refresh = () => setRefreshNonce(n => n + 1);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPageSelected = useMemo(() => {
    if (!items || items.length === 0) return false;
    return items.every(u => selected.has(u.id));
  }, [items, selected]);

  const togglePageSelection = () => {
    if (!items) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) items.forEach(u => next.delete(u.id));
      else items.forEach(u => next.add(u.id));
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onBulk = async (action: BulkAction) => {
    if (selected.size === 0) return;
    if (action === "delete" && !confirm(`Delete ${selected.size} user(s)?`)) return;
    setBulkRunning(true);
    setError(null);
    try {
      const r = await bulkUserAction(Array.from(selected), action);
      setSelected(new Set());
      refresh();
      setResetMsg(`${r.affected} user(s) updated.`);
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setBulkRunning(false);
    }
  };

  // ----- Single-row actions -----
  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  const onRestore = async (u: AdminUser) => {
    try {
      await restoreUser(u.id);
      refresh();
      setResetMsg(`Restored ${u.email}.`);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  const onResetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    setResetMsg(null);
    try {
      await adminResetPassword(resetTarget.id, newPassword);
      setResetMsg(`Password reset for ${resetTarget.email}.`);
      setNewPassword("");
      setResetTarget(null);
    } catch (e) {
      setResetMsg(extractApiError(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader
        title="Users"
        subtitle="Manage user accounts, roles, and access."
        actions={
          <Link to="/users/new" className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add user
          </Link>
        }
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Active" value={stats.active} icon={UserCheck} color="text-green-700" bg="bg-green-50" />
          <StatCard label="Total" value={stats.total} icon={Users} color="text-kpmg-blue" bg="bg-kpmg-blue/10" />
          <StatCard label="Admins" value={stats.admins} icon={ShieldCheck} color="text-kpmg-purple" bg="bg-kpmg-purple/10" />
          <StatCard label="Deleted" value={stats.deleted} icon={UserX} color="text-kpmg-gray-500" bg="bg-kpmg-gray-100" />
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      )}
      {resetMsg && (
        <div role="status" className="p-3 rounded bg-blue-50 border border-blue-200 text-sm text-kpmg-blue">
          {resetMsg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 text-kpmg-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search email or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                role === r.value
                  ? "bg-kpmg-blue text-white"
                  : "bg-white ring-1 ring-kpmg-gray-200 text-kpmg-gray-600 hover:bg-kpmg-gray-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-kpmg-blue text-white"
                  : "bg-white ring-1 ring-kpmg-gray-200 text-kpmg-gray-600 hover:bg-kpmg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          className="text-xs px-3 py-1.5 rounded font-medium bg-white ring-1 ring-kpmg-gray-200 text-kpmg-gray-600 hover:bg-kpmg-gray-50 inline-flex items-center"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-kpmg-blue/5 ring-1 ring-kpmg-blue/30 rounded-md">
          <span className="text-sm font-medium text-kpmg-blue">
            {selected.size} selected
          </span>
          <span className="flex-1" />
          <BulkBtn label="Activate"   onClick={() => onBulk("activate")}   disabled={bulkRunning} icon={UserCheck} />
          <BulkBtn label="Deactivate" onClick={() => onBulk("deactivate")} disabled={bulkRunning} icon={UserX} />
          {statusFilter === "deleted" ? (
            <BulkBtn label="Restore" onClick={() => onBulk("restore")} disabled={bulkRunning} icon={Undo2} />
          ) : (
            <BulkBtn label="Delete"  onClick={() => onBulk("delete")}  disabled={bulkRunning} icon={Trash2} variant="danger" />
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs px-2 py-1 text-kpmg-gray-500 hover:text-kpmg-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {items === null && !error ? (
        <div className="card text-sm text-kpmg-gray-500">Loading…</div>
      ) : items && items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users match these filters"
          description="Try clearing search or switching the status filter."
        />
      ) : items ? (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-kpmg-gray-50 text-xs uppercase tracking-wide text-kpmg-gray-500">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={togglePageSelection}
                      className="h-4 w-4 accent-kpmg-blue"
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Last login</th>
                  <th className="text-right px-4 py-3 font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kpmg-gray-100">
                {items.map(u => {
                  const isSelf = me?.id === u.id;
                  const isDeleted = !!u.deleted_at;
                  return (
                    <tr key={u.id} className="hover:bg-kpmg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleOne(u.id)}
                          className="h-4 w-4 accent-kpmg-blue"
                          aria-label={`Select ${u.email}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/users/${u.id}`}
                          className="text-kpmg-blue hover:text-kpmg-purple font-medium"
                        >
                          {u.email}
                        </Link>
                        {isSelf && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold">
                            you
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-kpmg-gray-700">
                        {u.full_name || <em className="text-kpmg-gray-400">—</em>}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_superadmin ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-kpmg-purple/10 text-kpmg-purple font-medium">
                            Admin
                          </span>
                        ) : (
                          <span className="text-xs text-kpmg-gray-500">User</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isDeleted ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-kpmg-gray-100 text-kpmg-gray-500">
                            Deleted
                          </span>
                        ) : u.is_active ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-kpmg-gray-500">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {isDeleted ? (
                            <button
                              onClick={() => onRestore(u)}
                              className="p-1.5 rounded hover:bg-kpmg-gray-100 text-kpmg-gray-500 hover:text-green-700"
                              title="Restore user"
                              aria-label="Restore user"
                            >
                              <Undo2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setResetMsg(null);
                                  setNewPassword("");
                                  setResetTarget(u);
                                }}
                                className="p-1.5 rounded hover:bg-kpmg-gray-100 text-kpmg-gray-500 hover:text-kpmg-blue"
                                title="Reset password"
                                aria-label="Reset password"
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => navigate(`/users/${u.id}/edit`)}
                                className="p-1.5 rounded hover:bg-kpmg-gray-100 text-kpmg-gray-500 hover:text-kpmg-blue"
                                title="Edit"
                                aria-label="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(u)}
                                disabled={isSelf}
                                className="p-1.5 rounded hover:bg-kpmg-gray-100 text-kpmg-gray-500 hover:text-kpmg-error disabled:opacity-30 disabled:cursor-not-allowed"
                                title={isSelf ? "You cannot delete yourself" : "Delete"}
                                aria-label="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Pagination */}
      {items && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-kpmg-gray-600">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary text-xs"
            >
              <ChevronLeft className="h-3 w-3 mr-1" />
              Prev
            </button>
            <span className="text-xs">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary text-xs"
            >
              Next
              <ChevronRight className="h-3 w-3 ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Disable user account?"
        message="The account is soft-deleted: the user can no longer sign in, but their record is kept for restore. You can restore it from the 'Deleted' filter."
        objectName={deleteTarget?.email}
        confirmLabel="Disable"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Reset password modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !resetting && setResetTarget(null)}
        >
          <div
            className="bg-white rounded-lg shadow-raise max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-kpmg-gray-800 mb-1">Reset password</h2>
            <p className="text-sm text-kpmg-gray-500 mb-4">
              Set a new password for{" "}
              <span className="font-medium text-kpmg-gray-800">{resetTarget.email}</span>. The
              user must use this on next sign-in.
            </p>
            <input
              type="password"
              className="input-field mb-4"
              placeholder="New password (min 12 chars, mixed case, digit, symbol)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => setResetTarget(null)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={onResetPassword}
                disabled={resetting || newPassword.length < 12}
              >
                {resetting ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------

function StatCard({
  label, value, icon: Icon, color, bg,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="card flex items-start gap-3">
      <div className={`h-9 w-9 rounded-md ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold">
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold text-kpmg-gray-800 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function BulkBtn({
  label, onClick, disabled, icon: Icon, variant = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "primary" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-1.5 rounded font-medium inline-flex items-center disabled:opacity-50 ${
        variant === "danger"
          ? "bg-kpmg-error text-white hover:brightness-90"
          : "bg-white ring-1 ring-kpmg-gray-200 text-kpmg-gray-700 hover:bg-kpmg-gray-50"
      }`}
    >
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </button>
  );
}
