import { api } from "./client";

/** Mirrors `LLMOptions` on the backend. Every field is optional —
 * leaving it null means "use the model's default". */
export interface LLMOptions {
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  num_ctx?: number | null;
  num_predict?: number | null;
  repeat_penalty?: number | null;
  seed?: number | null;
  mirostat?: number | null;
  mirostat_eta?: number | null;
  mirostat_tau?: number | null;
  stop?: string[] | null;
}

export interface LLMPreference {
  user_id: number;
  model: string | null;
  options: LLMOptions;
  updated_at: string;
}

export interface LLMPreferenceUpdate {
  model: string | null;
  options: LLMOptions;
}

export interface LLMTestRequest {
  model?: string | null;
  options?: LLMOptions;
  prompt?: string;
}

export interface LLMTestResponse {
  output: string;
  model: string;
  duration_ms: number;
}

export async function getMyLLMPreferences(): Promise<LLMPreference> {
  const res = await api.get<LLMPreference>("/me/llm-preferences");
  return res.data;
}

export async function updateMyLLMPreferences(
  body: LLMPreferenceUpdate,
): Promise<LLMPreference> {
  const res = await api.put<LLMPreference>("/me/llm-preferences", body);
  return res.data;
}

export async function testLLM(body: LLMTestRequest): Promise<LLMTestResponse> {
  const res = await api.post<LLMTestResponse>("/me/llm-preferences/test", body, {
    timeout: 5 * 60 * 1000,
  });
  return res.data;
}
