import { api } from "./client";
import { useAuthStore } from "../stores/auth";

export type DocumentClass = "proposal" | "deliverable" | "presentation";

export interface ReviewMetadata {
  document_title: string;
  client_name: string;
  submission_date: string;
  purpose_and_scope: string;
  client_mandatory_requirements: string;
}

export const EMPTY_METADATA: ReviewMetadata = {
  document_title: "",
  client_name: "",
  submission_date: "",
  purpose_and_scope: "",
  client_mandatory_requirements: "",
};

export interface ReviewSummary {
  id: number;
  source_filename: string;
  source_kind: "pptx" | "docx" | "pdf";
  source_size_bytes: number;
  model: string;
  duration_ms: number;
  prompt_preview: string;
  document_class: DocumentClass;
  framework_ids: number[];
  extracted_metadata: ReviewMetadata;
  /** Average of per-criterion scores parsed from the review output (0-10).
   *  null when no `Score: X/10` lines could be parsed. */
  aggregate_score: number | null;
  created_at: string;
}

export interface ReviewDetail {
  id: number;
  created_by: number;
  source_filename: string;
  source_kind: "pptx" | "docx" | "pdf";
  source_size_bytes: number;
  extracted_text: string;
  prompt: string;
  review_output: string;
  model: string;
  duration_ms: number;
  document_class: DocumentClass;
  framework_ids: number[];
  disabled_criteria: string[];
  extracted_metadata: ReviewMetadata;
  created_at: string;
}

export interface ReviewListResponse {
  items: ReviewSummary[];
  total: number;
}

export interface CreateReviewInput {
  file: File;
  framework_ids?: number[];
  disabled_criteria?: string[];
  prompt?: string;
  metadata?: ReviewMetadata;
  document_class?: DocumentClass;
}

export async function createReview(input: CreateReviewInput): Promise<ReviewDetail> {
  const fd = new FormData();
  fd.append("file", input.file);
  if (input.framework_ids && input.framework_ids.length) {
    fd.append("framework_ids", JSON.stringify(input.framework_ids));
  }
  if (input.disabled_criteria && input.disabled_criteria.length) {
    fd.append("disabled_criteria", JSON.stringify(input.disabled_criteria));
  }
  if (input.prompt && input.prompt.trim()) fd.append("prompt", input.prompt);
  if (input.metadata) fd.append("metadata", JSON.stringify(input.metadata));
  if (input.document_class) fd.append("document_class", input.document_class);
  const res = await api.post<ReviewDetail>("/reviews", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 5 * 60 * 1000,
  });
  return res.data;
}

export async function extractMetadata(file: File): Promise<ReviewMetadata> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post<{ metadata: ReviewMetadata }>(
    "/reviews/extract-metadata",
    fd,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    },
  );
  return res.data.metadata;
}

export async function listReviews(limit = 50, offset = 0): Promise<ReviewListResponse> {
  const res = await api.get<ReviewListResponse>("/reviews", { params: { limit, offset } });
  return res.data;
}

export async function getReview(id: number): Promise<ReviewDetail> {
  const res = await api.get<ReviewDetail>(`/reviews/${id}`);
  return res.data;
}

/** Fetch the original uploaded file for a review as a Blob.
 *  Returns null if the review predates V013 (no stored bytes). */
export async function getReviewFileBlob(
  id: number,
  disposition: "attachment" | "inline" = "attachment",
): Promise<{ blob: Blob; filename: string } | null> {
  const res = await api.get(`/reviews/${id}/file`, {
    params: { disposition },
    responseType: "blob",
    // Tolerate 404 so the caller can handle "not stored" gracefully.
    validateStatus: s => s === 200 || s === 404,
  });
  if (res.status === 404) return null;

  // Try to recover the filename from the server's Content-Disposition.
  // Falls back to a generic name if parsing fails.
  let filename = `review-${id}`;
  const cd = res.headers["content-disposition"];
  if (typeof cd === "string") {
    // RFC 5987: filename*=UTF-8''<percent-encoded>
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (star) {
      try { filename = decodeURIComponent(star[1]); } catch { /* keep fallback */ }
    } else {
      const plain = /filename="?([^";]+)"?/i.exec(cd);
      if (plain) filename = plain[1];
    }
  }
  return { blob: res.data as Blob, filename };
}

/** Trigger a browser download of the review's source file. */
export async function downloadReviewFile(id: number): Promise<boolean> {
  const got = await getReviewFileBlob(id, "attachment");
  if (!got) return false;
  const url = URL.createObjectURL(got.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = got.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before we revoke.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Open the review's source file in a new tab (PDFs render inline; Office
 *  formats will typically download since browsers can't render them). */
export async function openReviewFile(id: number): Promise<boolean> {
  const got = await getReviewFileBlob(id, "inline");
  if (!got) return false;
  const url = URL.createObjectURL(got.blob);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    // Pop-up blocker fired — fall back to a same-tab nav.
    window.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Download a generated readiness report (PDF or XLSX) for a review.
 *  Returns the filename it saved as, or null if the request failed. */
export async function exportReviewReport(
  id: number,
  format: "pdf" | "xlsx",
): Promise<string | null> {
  const res = await api.get(`/reviews/${id}/export`, {
    params: { format },
    responseType: "blob",
    // Surface 4xx as a thrown axios error so the caller sees the message.
  });

  // Recover server-supplied filename; fall back to a sensible default.
  let filename = `review-${id}.${format}`;
  const cd = res.headers["content-disposition"];
  if (typeof cd === "string") {
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (star) {
      try { filename = decodeURIComponent(star[1]); } catch { /* keep fallback */ }
    } else {
      const plain = /filename="?([^";]+)"?/i.exec(cd);
      if (plain) filename = plain[1];
    }
  }

  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return filename;
}

// -------- SSE Streaming types & client --------

export interface StreamStartEvent {
  total_criteria: number;
  framework_names: string[];
  model: string;
}

export interface CriterionStartEvent {
  index: number;
  name: string;
  description: string;
}

export interface CriterionDoneEvent {
  index: number;
  name: string;
  status: "pass" | "partial" | "fail" | "na";
  score: number;
  markdown: string;
  duration_ms: number;
}

export interface CriterionErrorEvent {
  index: number;
  name: string;
  error: string;
}

export interface StreamDoneEvent {
  review_id: number | null;
  total_duration_ms: number;
  succeeded: number;
  failed: number;
}

export type SSEEvent =
  | { type: "start"; data: StreamStartEvent }
  | { type: "criterion_start"; data: CriterionStartEvent }
  | { type: "criterion_done"; data: CriterionDoneEvent }
  | { type: "criterion_error"; data: CriterionErrorEvent }
  | { type: "done"; data: StreamDoneEvent }
  | { type: "error"; data: { error: string } };

/**
 * Streams a per-criterion AI diagnostic review via SSE.
 * Calls `onEvent` for each SSE event as it arrives.
 */
export async function streamReview(
  input: CreateReviewInput,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const fd = new FormData();
  fd.append("file", input.file);
  if (input.framework_ids?.length) {
    fd.append("framework_ids", JSON.stringify(input.framework_ids));
  }
  if (input.disabled_criteria?.length) {
    fd.append("disabled_criteria", JSON.stringify(input.disabled_criteria));
  }
  if (input.prompt?.trim()) fd.append("prompt", input.prompt);
  if (input.metadata) fd.append("metadata", JSON.stringify(input.metadata));
  if (input.document_class) fd.append("document_class", input.document_class);

  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch("/ProposalAgent/api/v1/reviews/stream", {
    method: "POST",
    body: fd,
    headers,
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.detail || parsed.error?.message || detail;
    } catch {
      if (text) detail = text;
    }
    throw new Error(detail);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames from the buffer
    const parts = buffer.split("\n\n");
    // Last element is incomplete (no trailing \n\n yet)
    buffer = parts.pop() || "";

    for (const frame of parts) {
      if (!frame.trim()) continue;
      let eventType = "";
      let eventData = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          eventData = line.slice(6);
        }
      }
      if (eventType && eventData) {
        try {
          const parsed = JSON.parse(eventData);
          onEvent({ type: eventType, data: parsed } as SSEEvent);
        } catch {
          // skip malformed events
        }
      }
    }
  }
}
