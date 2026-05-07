import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Pencil, Trash2, KeyRound, Undo2, ShieldCheck, ShieldOff,
  Mail, Calendar, Clock, Activity, UserCheck, UserX,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  adminResetPassword,
  deleteUser,
  getUser,
  getUserAudit,
  restoreUser,
  type AdminUser,
  type AuditEvent,
} from "../api/users";
import { extractApiError } from "../api/client";
import { useAuthStore } from "../stores/auth";

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);

  const [user, setUser] = useState<AdminUser | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const refresh = async () => {
    if (!id) return;
    try {
      const [u, a] = await Promise.all([getUser(Number(id)), getUserAudit(Number(id), 50, 0)]);
      setUser(u);
      setAudit(a.items);
      setAuditTotal(a.total);
      setError(null);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteUser(user.id);
      navigate("/users");
    } catch (e) {
      setError(extractApiError(e));
      setDeleting(false);
    }
  };

  const onRestore = async () => {
    if (!user) return;
    try {
      await restoreUser(user.id);
      setMsg(`Restored ${user.email}.`);
      refresh();
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  const onResetPassword = async () => {
    if (!user) return;
    setResetting(true);
    try {
      await adminResetPassword(user.id, newPassword);
      setMsg(`Password reset for ${user.email}.`);
      setNewPassword("");
      setResetOpen(false);
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setResetting(false);
    }
  };

  if (error && !user) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link to="/users" className="text-sm text-kpmg-blue hover:text-kpmg-purple inline-flex items-center">
          ← Back to Users
        </Link>
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">{error}</div>
      </div>
    );
  }

  if (!user) return <div className="card max-w-4xl text-sm text-kpmg-gray-500">Loading…</div>;

  const isSelf = me?.id === user.id;
  const isDeleted = !!user.deleted_at;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title={user.full_name || user.email}
        subtitle={user.full_name ? user.email : undefined}
        backTo="/users"
        backLabel="Back to Users"
        actions={
          <>
            {!isDeleted && (
              <button
                onClick={() => setResetOpen(true)}
                className="btn-secondary"
                title="Reset password"
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Reset password
              </button>
            )}
            {!isDeleted ? (
              <Link to={`/users/${user.id}/edit`} className="btn-secondary">
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Link>
            ) : (
              <button onClick={onRestore} className="btn-secondary">
                <Undo2 className="h-4 w-4 mr-2" />
                Restore
              </button>
            )}
            {!isSelf && !isDeleted && (
              <button onClick={() => setConfirmDelete(true)} className="btn-danger">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            )}
          </>
        }
      />

      {error && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      )}
      {msg && (
        <div role="status" className="p-3 rounded bg-blue-50 border border-blue-200 text-sm text-kpmg-blue">
          {msg}
        </div>
      )}

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {user.is_superadmin ? (
          <span className="px-2 py-0.5 rounded bg-kpmg-purple/10 text-kpmg-purple font-medium inline-flex items-center">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Admin
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-kpmg-gray-100 text-kpmg-gray-600 font-medium inline-flex items-center">
            <ShieldOff className="h-3 w-3 mr-1" />
            Regular user
          </span>
        )}
        {isDeleted ? (
          <span className="px-2 py-0.5 rounded bg-kpmg-gray-100 text-kpmg-gray-500 font-medium">
            Deleted {new Date(user.deleted_at!).toLocaleDateString()}
          </span>
        ) : user.is_active ? (
          <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium inline-flex items-center">
            <UserCheck className="h-3 w-3 mr-1" />
            Active
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium inline-flex items-center">
            <UserX className="h-3 w-3 mr-1" />
            Disabled
          </span>
        )}
        {user.is_email_verified ? (
          <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium inline-flex items-center">
            <Mail className="h-3 w-3 mr-1" />
            Email verified
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium inline-flex items-center">
            <Mail className="h-3 w-3 mr-1" />
            Unverified
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile facts */}
        <div className="card space-y-4">
          <h2 className="text-sm uppercase tracking-wider text-kpmg-gray-400 font-semibold">
            Profile
          </h2>
          <DetailRow label="Email" icon={Mail}>
            {user.email}
          </DetailRow>
          <DetailRow label="Full name" icon={UserCheck}>
            {user.full_name || <em className="text-kpmg-gray-400">—</em>}
          </DetailRow>
          <DetailRow label="Created" icon={Calendar}>
            {new Date(user.created_at).toLocaleString()}
          </DetailRow>
          <DetailRow label="Last login" icon={Clock}>
            {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
          </DetailRow>
          {isDeleted && (
            <DetailRow label="Deleted at" icon={Trash2}>
              {new Date(user.deleted_at!).toLocaleString()}
            </DetailRow>
          )}
        </div>

        {/* Audit log */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wider text-kpmg-gray-400 font-semibold inline-flex items-center">
              <Activity className="h-3 w-3 mr-1" />
              Activity
            </h2>
            <span className="text-xs text-kpmg-gray-400">
              {auditTotal} event{auditTotal === 1 ? "" : "s"}
            </span>
          </div>

          {audit.length === 0 ? (
            <p className="text-sm text-kpmg-gray-500">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2 max-h-[420px] overflow-y-auto">
              {audit.map(ev => (
                <li
                  key={ev.id}
                  className="text-sm border-l-2 border-kpmg-blue/30 pl-3 py-1"
                >
                  <div className="font-medium text-kpmg-gray-800">{ev.action}</div>
                  <div className="text-xs text-kpmg-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span>{new Date(ev.occurred_at).toLocaleString()}</span>
                    {ev.entity_type && (
                      <span>
                        {ev.entity_type}
                        {ev.entity_id ? `#${ev.entity_id}` : ""}
                      </span>
                    )}
                    {ev.ip_address && <span>{ev.ip_address}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Disable user account?"
        message="The account is soft-deleted: the user can no longer sign in, but the record is preserved for restore."
        objectName={user.email}
        confirmLabel="Disable"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {resetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !resetting && setResetOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-raise max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-kpmg-gray-800 mb-1">Reset password</h2>
            <p className="text-sm text-kpmg-gray-500 mb-4">
              Set a new password for{" "}
              <span className="font-medium text-kpmg-gray-800">{user.email}</span>.
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
              <button className="btn-secondary" onClick={() => setResetOpen(false)} disabled={resetting}>
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

function DetailRow({
  label, icon: Icon, children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-kpmg-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold">
          {label}
        </div>
        <div className="text-sm text-kpmg-gray-800 mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}
