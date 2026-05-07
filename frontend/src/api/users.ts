import { api } from "./client";

export type UserRoleFilter = "all" | "admin" | "user";
export type UserStatusFilter = "all" | "active" | "inactive" | "deleted";
export type BulkAction = "activate" | "deactivate" | "delete" | "restore";

export interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  is_email_verified: boolean;
  is_superadmin: boolean;
  last_login_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface UserListResponse {
  items: AdminUser[];
  total: number;
}

export interface UserStats {
  total: number;
  active: number;
  admins: number;
  deleted: number;
}

export interface AuditEvent {
  id: number;
  actor_user_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
}

export interface UserAuditResponse {
  items: AuditEvent[];
  total: number;
}

export interface UserCreateInput {
  email: string;
  full_name: string;
  password: string;
  is_active: boolean;
  is_superadmin: boolean;
}

export interface UserUpdateInput {
  full_name?: string;
  is_active?: boolean;
  is_superadmin?: boolean;
}

export interface ListUsersParams {
  search?: string;
  role?: UserRoleFilter;
  status_filter?: UserStatusFilter;
  limit?: number;
  offset?: number;
}

export async function listUsers(params: ListUsersParams = {}): Promise<UserListResponse> {
  const res = await api.get<UserListResponse>("/users", { params });
  return res.data;
}

export async function getUserStats(): Promise<UserStats> {
  const res = await api.get<UserStats>("/users/stats");
  return res.data;
}

export async function getUser(id: number): Promise<AdminUser> {
  const res = await api.get<AdminUser>(`/users/${id}`);
  return res.data;
}

export async function getUserAudit(id: number, limit = 50, offset = 0): Promise<UserAuditResponse> {
  const res = await api.get<UserAuditResponse>(`/users/${id}/audit`, {
    params: { limit, offset },
  });
  return res.data;
}

export async function createUser(input: UserCreateInput): Promise<AdminUser> {
  const res = await api.post<AdminUser>("/users", input);
  return res.data;
}

export async function updateUser(id: number, input: UserUpdateInput): Promise<AdminUser> {
  const res = await api.patch<AdminUser>(`/users/${id}`, input);
  return res.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function restoreUser(id: number): Promise<AdminUser> {
  const res = await api.post<AdminUser>(`/users/${id}/restore`);
  return res.data;
}

export async function adminResetPassword(id: number, new_password: string): Promise<AdminUser> {
  const res = await api.post<AdminUser>(`/users/${id}/reset-password`, { new_password });
  return res.data;
}

export async function bulkUserAction(
  user_ids: number[],
  action: BulkAction,
): Promise<{ affected: number }> {
  const res = await api.post<{ affected: number }>("/users/bulk", { user_ids, action });
  return res.data;
}

// Self-service profile (kept for backwards compat with Settings page)
export async function updateMyProfile(full_name: string): Promise<AdminUser> {
  const res = await api.patch<AdminUser>("/me/profile", { full_name });
  return res.data;
}

export async function changeMyPassword(current_password: string, new_password: string): Promise<void> {
  await api.post("/me/change-password", { current_password, new_password });
}
