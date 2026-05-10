import { api } from "./client";
import type { SectionsResponse } from "../lib/sections";

/** Canonical proposal sections (EN + AR labels). The frontend uses
 * this to populate the EvidenceSourceSelect picker — adding a new
 * section is a backend-only change. */
export async function listSections(): Promise<SectionsResponse> {
  const res = await api.get<SectionsResponse>("/sections");
  return res.data;
}
