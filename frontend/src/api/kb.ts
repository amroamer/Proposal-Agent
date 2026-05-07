import { api } from "./client";

export interface KBItem {
  id: number;
  owner_user_id: number | null;
  title: string;
  category: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface KBListResponse {
  items: KBItem[];
  total: number;
}

export interface KBCreateInput {
  title: string;
  category: string;
  body: string;
  tags: string[];
}

export type KBUpdateInput = Partial<KBCreateInput>;

export interface KBListParams {
  search?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export async function listKB(params: KBListParams = {}): Promise<KBListResponse> {
  const res = await api.get<KBListResponse>("/knowledge-base", { params });
  return res.data;
}

export async function listCategories(): Promise<string[]> {
  const res = await api.get<string[]>("/knowledge-base/categories");
  return res.data;
}

export async function getKB(id: number): Promise<KBItem> {
  const res = await api.get<KBItem>(`/knowledge-base/${id}`);
  return res.data;
}

export async function createKB(input: KBCreateInput): Promise<KBItem> {
  const res = await api.post<KBItem>("/knowledge-base", input);
  return res.data;
}

export async function updateKB(id: number, input: KBUpdateInput): Promise<KBItem> {
  const res = await api.patch<KBItem>(`/knowledge-base/${id}`, input);
  return res.data;
}

export async function deleteKB(id: number): Promise<void> {
  await api.delete(`/knowledge-base/${id}`);
}
