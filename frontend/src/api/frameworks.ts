import { api } from "./client";

export interface FrameworkCriterion {
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  prompt_instruction_en: string;
  prompt_instruction_ar: string;
  group: string;
  /** Phase-5: list of canonical section_keys, or ["*"] for whole proposal.
   * Optional on the wire so legacy clients keep working; the backend
   * defaults missing values to ["*"]. */
  evidence_source?: string[];
  /** When false, the criterion is skipped by the review runner.
   * Optional on the wire — backend defaults to true. */
  active?: boolean;
}

export interface FrameworkSummary {
  id: number;
  owner_user_id: number | null;
  name: string;
  is_public: boolean;
  criteria_count: number;
  updated_at: string;
}

export interface Framework {
  id: number;
  owner_user_id: number | null;
  name: string;
  persona_instruction: string;
  persona_instruction_ar: string;
  model: string;
  is_public: boolean;
  criteria: FrameworkCriterion[];
  created_at: string;
  updated_at: string;
}

export interface FrameworkListResponse {
  items: FrameworkSummary[];
  total: number;
}

export interface FrameworkCreateInput {
  name: string;
  persona_instruction: string;
  persona_instruction_ar: string;
  model: string;
  is_public: boolean;
  criteria: FrameworkCriterion[];
}

export type FrameworkUpdateInput = Partial<FrameworkCreateInput>;

export async function listFrameworks(search?: string): Promise<FrameworkListResponse> {
  const res = await api.get<FrameworkListResponse>("/frameworks", { params: { search } });
  return res.data;
}

export async function getFramework(id: number): Promise<Framework> {
  const res = await api.get<Framework>(`/frameworks/${id}`);
  return res.data;
}

export async function createFramework(input: FrameworkCreateInput): Promise<Framework> {
  const res = await api.post<Framework>("/frameworks", input);
  return res.data;
}

export async function updateFramework(id: number, input: FrameworkUpdateInput): Promise<Framework> {
  const res = await api.patch<Framework>(`/frameworks/${id}`, input);
  return res.data;
}

export async function deleteFramework(id: number): Promise<void> {
  await api.delete(`/frameworks/${id}`);
}

export async function autoGenCriteria(file: File): Promise<{ criteria: FrameworkCriterion[] }> {
  const fd = new FormData();
  fd.append("file", file);
  // axios auto-sets Content-Type with boundary for FormData. Manual override breaks it.
  const res = await api.post<{ criteria: FrameworkCriterion[] }>(
    "/frameworks/auto-gen",
    fd,
    { timeout: 5 * 60 * 1000 },
  );
  return res.data;
}

/** Trigger a file download for framework export. */
export function exportFramework(id: number, format: "json" | "xlsx"): void {
  const url = `${api.defaults.baseURL}/frameworks/${id}/export?format=${format}`;
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);

  // Use fetch to handle auth headers, then trigger download
  fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      const ext = format === "xlsx" ? "xlsx" : "json";
      a.download = `framework.${ext}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      a.remove();
    })
    .catch(() => a.remove());
}

function getToken(): string {
  // Import dynamically to avoid circular deps at module level
  try {
    const state = JSON.parse(sessionStorage.getItem("auth-storage") || "{}");
    return state?.state?.accessToken || "";
  } catch {
    return "";
  }
}

export async function importFramework(file: File): Promise<Framework> {
  const fd = new FormData();
  fd.append("file", file);
  // axios auto-sets Content-Type with boundary for FormData. Manual override breaks it.
  const res = await api.post<Framework>("/frameworks/import", fd);
  return res.data;
}
