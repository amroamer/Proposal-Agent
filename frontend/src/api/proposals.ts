import { api } from "./client";

export type ProposalStatus = "draft" | "in_review" | "approved" | "submitted" | "archived";

export const PROPOSAL_STATUSES: ProposalStatus[] = [
  "draft",
  "in_review",
  "approved",
  "submitted",
  "archived",
];

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  submitted: "Submitted",
  archived: "Archived",
};

export interface ProposalSection {
  heading: string;
  content: string;
}

export interface Proposal {
  id: number;
  owner_user_id: number | null;
  template_id: number | null;
  title: string;
  client_name: string;
  status: ProposalStatus;
  sections: ProposalSection[];
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalListResponse {
  items: Proposal[];
  total: number;
}

export interface ProposalCreateInput {
  title: string;
  client_name: string;
  template_id: number | null;
  status: ProposalStatus;
  sections: ProposalSection[];
  notes: string;
}

export type ProposalUpdateInput = Partial<ProposalCreateInput>;

export interface ProposalListParams {
  search?: string;
  status_filter?: ProposalStatus;
  limit?: number;
  offset?: number;
}

export async function listProposals(params: ProposalListParams = {}): Promise<ProposalListResponse> {
  const res = await api.get<ProposalListResponse>("/proposals", { params });
  return res.data;
}

export async function getProposal(id: number): Promise<Proposal> {
  const res = await api.get<Proposal>(`/proposals/${id}`);
  return res.data;
}

export async function createProposal(input: ProposalCreateInput): Promise<Proposal> {
  const res = await api.post<Proposal>("/proposals", input);
  return res.data;
}

export async function updateProposal(id: number, input: ProposalUpdateInput): Promise<Proposal> {
  const res = await api.patch<Proposal>(`/proposals/${id}`, input);
  return res.data;
}

export async function deleteProposal(id: number): Promise<void> {
  await api.delete(`/proposals/${id}`);
}
