import { api } from "./client";

export interface OllamaModel {
  name: string;
  parameter_size: string | null;
  family: string | null;
  size_bytes: number | null;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

export async function listModels(): Promise<OllamaModelsResponse> {
  const res = await api.get<OllamaModelsResponse>("/llm/models");
  return res.data;
}

/**
 * Format a model for display in dropdowns.
 *   gemma4:latest (8.0B, gemma4) -> "gemma4:latest — 8.0B"
 */
export function formatModelLabel(m: OllamaModel): string {
  const parts: string[] = [m.name];
  if (m.parameter_size) parts.push(m.parameter_size);
  return parts.join(" — ");
}
