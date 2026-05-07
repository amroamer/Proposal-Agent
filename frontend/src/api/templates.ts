import { api } from "./client";

export interface TemplateSection {
  heading: string;
  instructions: string;
  default_content: string;
}

export interface Template {
  id: number;
  owner_user_id: number | null;
  name: string;
  description: string;
  sections: TemplateSection[];
  created_at: string;
  updated_at: string;
}

export interface TemplateListResponse {
  items: Template[];
  total: number;
}

export interface TemplateCreateInput {
  name: string;
  description: string;
  sections: TemplateSection[];
}

export type TemplateUpdateInput = Partial<TemplateCreateInput>;

export async function listTemplates(search?: string): Promise<TemplateListResponse> {
  const res = await api.get<TemplateListResponse>("/templates", { params: { search } });
  return res.data;
}

export async function getTemplate(id: number): Promise<Template> {
  const res = await api.get<Template>(`/templates/${id}`);
  return res.data;
}

export async function createTemplate(input: TemplateCreateInput): Promise<Template> {
  const res = await api.post<Template>("/templates", input);
  return res.data;
}

export async function updateTemplate(id: number, input: TemplateUpdateInput): Promise<Template> {
  const res = await api.patch<Template>(`/templates/${id}`, input);
  return res.data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/templates/${id}`);
}
