import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, AlertTriangle, Loader2, Upload, FileText, Settings, CheckCircle2, XCircle, StopCircle, ShieldAlert, ShieldCheck, BookmarkCheck, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  EMPTY_METADATA,
  extractMetadata,
  streamReview,
  buildExtractedMarkdown,
  buildExtractedJson,
  downloadTextAs,
  type DocumentClass,
  type ReviewMetadata,
  type StreamStartEvent,
  type StreamDoneEvent,
  type SSEEvent,
  type ExtractMetadataResponse,
} from "../api/reviews";
import {
  getFramework,
  listFrameworks,
  type Framework,
  type FrameworkSummary,
} from "../api/frameworks";
import { getMyLLMPreferences } from "../api/llmPrefs";
import { extractApiError } from "../api/client";

const ACCEPTED = [".pptx", ".docx", ".pdf"];

const DOC_CLASSES: { value: DocumentClass; label: string; enabled: boolean }[] = [
  { value: "proposal", label: "Proposal", enabled: true },
  { value: "deliverable", label: "Deliverable", enabled: false },
  { value: "presentation", label: "Presentation", enabled: false },
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface ConsolidatedCriterion {
  name: string;        // display name (prefers name_en, falls back to name_ar)
  description: string; // display description (prefers description_en)
  fromFramework: string; // for the (source) hint
}

type CriterionStatus = "pending" | "running" | "pass" | "partial" | "fail" | "na" | "error";

interface CriterionResult {
  index: number;
  name: string;
  description: string;
  status: CriterionStatus;
  score?: number;
  markdown?: string;
  error?: string;
  duration_ms?: number;
}

export function ProposalReviewPage() {
  const navigate = useNavigate();

  // Step 1: document class
  const [docClass, setDocClass] = useState<DocumentClass>("proposal");

  // Step 2: file
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extractingMeta, setExtractingMeta] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: frameworks (multi-select) + per-criterion enable/disable
  const [frameworks, setFrameworks] = useState<FrameworkSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [frameworkDetails, setFrameworkDetails] = useState<Record<number, Framework>>({});
  const [disabledCriteria, setDisabledCriteria] = useState<Set<string>>(new Set());

  // Metadata form (auto-filled, editable)
  const [metadata, setMetadata] = useState<ReviewMetadata>(EMPTY_METADATA);
  // Full extraction payload kept around so the user can download the
  // parsed text / structured JSON without re-uploading.
  const [extractedPayload, setExtractedPayload] = useState<ExtractMetadataResponse | null>(null);
  // Which derivative the preview modal is showing — null = closed.
  const [previewMode, setPreviewMode] = useState<null | "md" | "json">(null);

  // Run + progressive streaming result
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criteriaResults, setCriteriaResults] = useState<CriterionResult[]>([]);
  const [streamMeta, setStreamMeta] = useState<StreamStartEvent | null>(null);
  const [streamDone, setStreamDone] = useState<StreamDoneEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // User's saved default model (for the header badge).
  const [defaultModel, setDefaultModel] = useState<string | null>(null);

  // ---------- Load frameworks ----------
  useEffect(() => {
    listFrameworks()
      .then(r => {
        setFrameworks(r.items);
        // Default-select the first framework with criteria.
        const first = r.items.find(f => f.criteria_count > 0);
        if (first) setSelectedIds(new Set([first.id]));
      })
      .catch(e => setError(extractApiError(e)));
    getMyLLMPreferences()
      .then(p => setDefaultModel(p.model))
      .catch(() => {});
  }, []);

  // Lazy-load detail when framework gets selected so we can show criteria.
  useEffect(() => {
    selectedIds.forEach(id => {
      if (frameworkDetails[id]) return;
      getFramework(id)
        .then(d => setFrameworkDetails(prev => ({ ...prev, [id]: d })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // ---------- File handling ----------
  const handleFile = async (f: File | null) => {
    setError(null);
    setFile(f);
    setMetadata(EMPTY_METADATA);
    setExtractedPayload(null);
    if (!f) return;
    if (!ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext))) {
      setError(`Unsupported file type. Accepted: ${ACCEPTED.join(", ")}`);
      setFile(null);
      return;
    }
    setExtractingMeta(true);
    try {
      const payload = await extractMetadata(f);
      setMetadata(payload.metadata);
      setExtractedPayload(payload);
    } catch (e) {
      // Non-fatal — let the user fill manually.
      setError(`Could not auto-extract metadata: ${extractApiError(e)}. Please fill manually.`);
    } finally {
      setExtractingMeta(false);
    }
  };

  const onDownloadMd = () => {
    if (!extractedPayload) return;
    const stem = (extractedPayload.source_filename || "document").replace(/\.[^.]+$/, "");
    downloadTextAs(`${stem}.md`, buildExtractedMarkdown(extractedPayload), "text/markdown;charset=utf-8");
  };

  const onDownloadJson = () => {
    if (!extractedPayload) return;
    const stem = (extractedPayload.source_filename || "document").replace(/\.[^.]+$/, "");
    downloadTextAs(`${stem}.json`, buildExtractedJson(extractedPayload), "application/json;charset=utf-8");
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (running) return;
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setMetadata(EMPTY_METADATA);
    setExtractedPayload(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---------- Consolidated criteria ----------
  const consolidated = useMemo<ConsolidatedCriterion[]>(() => {
    const seen = new Set<string>();
    const out: ConsolidatedCriterion[] = [];
    for (const id of selectedIds) {
      const fw = frameworkDetails[id];
      if (!fw) continue;
      for (const c of fw.criteria) {
        const displayName = c.name_en || c.name_ar || "";
        if (!displayName || seen.has(displayName)) continue;
        seen.add(displayName);
        out.push({
          name: displayName,
          description: c.description_en || c.description_ar || "",
          fromFramework: fw.name,
        });
      }
    }
    return out;
  }, [selectedIds, frameworkDetails]);

  // Reset disabled-criteria set whenever the selection changes (so newly-added
  // criteria default to enabled).
  useEffect(() => {
    setDisabledCriteria(prev => {
      const validNames = new Set(consolidated.map(c => c.name));
      const next = new Set<string>();
      prev.forEach(n => validNames.has(n) && next.add(n));
      return next;
    });
  }, [consolidated]);

  const toggleFramework = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCriterion = (name: string) => {
    setDisabledCriteria(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ---------- Submit ----------
  const enabledCount = consolidated.filter(c => !disabledCriteria.has(c.name)).length;
  const canRun = !!file && selectedIds.size > 0 && enabledCount > 0 && !running && !extractingMeta;

  const onCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  };

  const onRun = async () => {
    if (!file || !canRun) return;
    setError(null);
    setCriteriaResults([]);
    setStreamMeta(null);
    setStreamDone(null);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamReview(
        {
          file,
          framework_ids: Array.from(selectedIds),
          disabled_criteria: Array.from(disabledCriteria),
          metadata,
          document_class: docClass,
        },
        (event: SSEEvent) => {
          switch (event.type) {
            case "start":
              setStreamMeta(event.data);
              setCriteriaResults(
                Array.from({ length: event.data.total_criteria }, (_, i) => ({
                  index: i,
                  name: "",
                  description: "",
                  status: "pending" as const,
                }))
              );
              break;
            case "criterion_start":
              setCriteriaResults(prev =>
                prev.map(c =>
                  c.index === event.data.index
                    ? { ...c, name: event.data.name, description: event.data.description, status: "running" as const }
                    : c
                )
              );
              break;
            case "criterion_done":
              setCriteriaResults(prev =>
                prev.map(c =>
                  c.index === event.data.index
                    ? { ...c, name: event.data.name, status: event.data.status, score: event.data.score, markdown: event.data.markdown, duration_ms: event.data.duration_ms }
                    : c
                )
              );
              break;
            case "criterion_error":
              setCriteriaResults(prev =>
                prev.map(c =>
                  c.index === event.data.index
                    ? { ...c, name: event.data.name, status: "error" as const, error: event.data.error }
                    : c
                )
              );
              break;
            case "done":
              setStreamDone(event.data);
              if (event.data.review_id) {
                navigate(`/reviews/${event.data.review_id}`);
              }
              break;
            case "error":
              setError(event.data.error);
              break;
          }
        },
        controller.signal,
      );
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Stream failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div>
        <div className="eyebrow mb-2">New review</div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl md:text-[32px] font-bold text-pa-ink tracking-[-0.6px] leading-tight">
            Proposal Review
          </h1>
          <span
            className="text-[11px] px-2.5 py-1 rounded-md bg-pa-accent-soft text-kpmg-blue font-mono font-bold"
            title="Default LLM applied to reviews and metadata extraction. Change it in Settings → LLM."
          >
            LLM · {defaultModel ?? "system default"}
          </span>
        </div>
        <p className="mt-2 text-sm text-pa-muted max-w-[640px] leading-relaxed">
          Drop a proposal and the agent will run a 13-criterion readiness diagnostic.
        </p>
      </div>

      {/* DOC CLASS — three big chips. Disabled ones show "coming soon". */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DOC_CLASSES.map(c => {
          const active = docClass === c.value;
          const enabled = c.enabled;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => enabled && setDocClass(c.value)}
              disabled={!enabled}
              className={[
                "py-5 px-4 rounded-xl font-bold uppercase tracking-[0.04em] text-sm transition-colors text-center",
                active
                  ? "bg-kpmg-blue text-white shadow-accent-soft"
                  : enabled
                    ? "bg-white text-pa-body ring-1 ring-pa-line hover:ring-kpmg-blue/40 hover:text-kpmg-blue"
                    : "bg-white text-pa-muted ring-1 ring-pa-line cursor-not-allowed",
              ].join(" ")}
            >
              <div>{c.label}</div>
              {!enabled && (
                <div className="text-[10px] font-medium normal-case tracking-normal text-pa-muted mt-1">
                  coming soon
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* DROP ZONE */}
      <div
        onClick={() => !running && fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => {
          e.preventDefault();
          if (!running) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        className={[
          "rounded-2xl border-2 border-dashed transition-colors py-12 px-6 text-center cursor-pointer",
          running ? "opacity-50 cursor-not-allowed" : "",
          dragOver ? "border-kpmg-blue bg-pa-accent-soft" : file ? "border-kpmg-blue bg-white" : "border-pa-line bg-white hover:border-kpmg-blue/50",
        ].join(" ")}
      >
        {file ? (
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-kpmg-blue text-white flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="text-left min-w-0">
              <div className="text-[14px] font-bold text-pa-ink font-mono truncate max-w-[420px]">
                {file.name}
              </div>
              <div className="text-[12px] text-pa-muted mt-0.5">
                {fmtBytes(file.size)} · ready to run
              </div>
            </div>
            {!running && (
              <div className="flex items-center gap-1.5 ml-2">
                {extractedPayload && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewMode("md"); }}
                      className="px-2.5 py-1.5 rounded-md text-[11.5px] font-bold text-pa-body border border-pa-line hover:bg-pa-cream inline-flex items-center gap-1"
                      title="Preview the parsed text as Markdown"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      MD
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewMode("json"); }}
                      className="px-2.5 py-1.5 rounded-md text-[11.5px] font-bold text-pa-body border border-pa-line hover:bg-pa-cream inline-flex items-center gap-1"
                      title="Preview metadata + parsed text as JSON"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      JSON
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={clearFile}
                  className="px-3 py-1.5 rounded-md text-[11.5px] font-bold text-pa-body border border-pa-line hover:bg-pa-cream"
                  aria-label="Remove file"
                >
                  Replace
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-pa-accent-soft text-kpmg-blue flex items-center justify-center mx-auto mb-4">
              <Upload className="h-6 w-6" />
            </div>
            <div className="text-[18px] font-bold text-pa-ink tracking-[-0.3px]">
              Attach proposal
            </div>
            <div className="text-[13px] text-pa-muted mt-1.5">
              Drop a file or click to browse · {ACCEPTED.join(" · ")}
            </div>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0] ?? null)}
      />

      {/* DOCUMENT METADATA — cream-soft card with 2x2 grid */}
      <div className="rounded-2xl bg-pa-cream-soft border border-pa-line p-5 md:p-6 relative">
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow-muted">Document metadata</div>
          {!extractingMeta && metadata.document_title && (
            <div className="flex items-center gap-1 text-[11.5px] font-semibold text-pa-success">
              <CheckCircle2 className="h-3 w-3" />
              Auto-filled
            </div>
          )}
        </div>

        {extractingMeta && <ExtractionProgress />}

        <div className={extractingMeta ? "opacity-30 pointer-events-none mt-4" : ""}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetadataField
              label="Document title"
              value={metadata.document_title}
              onChange={v => setMetadata({ ...metadata, document_title: v })}
              extracting={extractingMeta}
            />
            <MetadataField
              label="Client name"
              placeholder="e.g. Ministry of Industry"
              value={metadata.client_name}
              onChange={v => setMetadata({ ...metadata, client_name: v })}
              extracting={extractingMeta}
            />
            <div>
              <FieldLabel>Submission date</FieldLabel>
              <input
                type="date"
                className="input-field"
                value={metadata.submission_date}
                onChange={e => setMetadata({ ...metadata, submission_date: e.target.value })}
                disabled={extractingMeta}
              />
            </div>
            <MetadataField
              label="Purpose & scope"
              placeholder="One sentence"
              value={metadata.purpose_and_scope}
              onChange={v => setMetadata({ ...metadata, purpose_and_scope: v })}
              extracting={extractingMeta}
            />
          </div>
          <div className="mt-4">
            <MetadataField
              label="Client mandatory requirements"
              value={metadata.client_mandatory_requirements}
              onChange={v =>
                setMetadata({ ...metadata, client_mandatory_requirements: v })
              }
              extracting={extractingMeta}
              multiline
              rows={4}
            />
          </div>
        </div>
      </div>

      {/* DIAGNOSTIC SCOPE — frameworks picker + consolidated criteria */}
      <div className="rounded-2xl bg-white border border-pa-line p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow-muted">Diagnostic scope</div>
          <Link to="/frameworks" className="text-[12px] font-semibold text-kpmg-blue hover:text-kpmg-mediumblue inline-flex items-center gap-1">
            <Settings className="h-3 w-3" />
            Manage frameworks
          </Link>
        </div>
        {frameworks.length === 0 ? (
          <p className="text-sm text-pa-muted">Loading frameworks…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {frameworks.map(fw => {
              const checked = selectedIds.has(fw.id);
              const enabled = fw.criteria_count > 0;
              return (
                <label
                  key={fw.id}
                  className={[
                    "flex items-start gap-3 p-3.5 rounded-xl cursor-pointer select-none transition-colors",
                    !enabled ? "opacity-40 cursor-not-allowed" : "",
                    checked
                      ? "bg-pa-accent-soft ring-1 ring-kpmg-blue/40"
                      : "ring-1 ring-pa-line hover:ring-kpmg-blue/30",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!enabled}
                    onChange={() => toggleFramework(fw.id)}
                    className="mt-0.5 h-4 w-4 accent-kpmg-blue shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13.5px] font-bold tracking-[-0.1px] truncate ${checked ? "text-kpmg-blue" : "text-pa-ink"}`}>
                      {fw.name}
                    </div>
                    <div className="text-[11.5px] text-pa-muted mt-0.5">
                      {fw.criteria_count} criteria{fw.is_public ? " · public" : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {selectedIds.size > 0 && consolidated.length > 0 && (
          <div className="mt-5 pt-5 border-t border-pa-line-soft">
            <div className="flex items-center justify-between mb-3">
              <div className="eyebrow-muted">Consolidated criteria</div>
              <div className="text-[11.5px] text-pa-muted">
                {enabledCount} of {consolidated.length} enabled
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
              {consolidated.map((c, idx) => {
                const enabled = !disabledCriteria.has(c.name);
                return (
                  <label
                    key={c.name}
                    className={[
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-[13px]",
                      enabled ? "ring-1 ring-pa-line hover:bg-pa-cream-soft" : "ring-1 ring-pa-line opacity-50",
                    ].join(" ")}
                  >
                    <span className="h-5 w-5 rounded-full bg-pa-cream text-pa-muted text-[10.5px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {idx + 1}
                    </span>
                    <span
                      className={`flex-1 truncate ${enabled ? "text-pa-ink" : "text-pa-muted line-through"}`}
                      title={c.description || c.fromFramework}
                    >
                      {c.name}
                    </span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleCriterion(c.name)}
                      className="h-4 w-4 accent-kpmg-blue"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[11px] bg-pa-danger text-white text-[13.5px] font-bold hover:brightness-95 shadow-card transition"
          >
            <StopCircle className="h-4 w-4" />
            Cancel diagnostic
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center justify-center px-5 py-3 rounded-[11px] bg-white border border-pa-line text-[13.5px] font-bold text-pa-body hover:bg-pa-cream transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onRun}
              disabled={!canRun}
              className={[
                "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[11px] text-[13.5px] font-bold transition-colors",
                canRun
                  ? "bg-kpmg-blue text-white hover:bg-kpmg-mediumblue shadow-accent"
                  : "bg-pa-line text-pa-muted cursor-not-allowed",
              ].join(" ")}
            >
              <Zap className="h-4 w-4" />
              Run AI diagnostic
            </button>
          </>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg bg-pa-danger-soft border border-pa-danger/20 text-sm text-pa-danger"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Progressive diagnostic results */}
      {criteriaResults.length > 0 && (
        <ReadinessReport
          criteriaResults={criteriaResults}
          streamMeta={streamMeta}
          streamDone={streamDone}
          running={running}
          metadata={metadata}
          navigate={navigate}
        />
      )}

      {/* MD / JSON preview modal — renders the same content the Download
          button would save. Lets the user verify before committing. */}
      {previewMode && extractedPayload && (
        <ExtractionPreviewModal
          mode={previewMode}
          payload={extractedPayload}
          onClose={() => setPreviewMode(null)}
          onDownload={previewMode === "md" ? onDownloadMd : onDownloadJson}
        />
      )}
    </div>
  );
}

// ---------- helpers ----------

function ExtractionPreviewModal({
  mode,
  payload,
  onClose,
  onDownload,
}: {
  mode: "md" | "json";
  payload: ExtractMetadataResponse;
  onClose: () => void;
  onDownload: () => void;
}) {
  const content = useMemo(
    () => mode === "md" ? buildExtractedMarkdown(payload) : buildExtractedJson(payload),
    [mode, payload],
  );
  const title = mode === "md" ? "Markdown preview" : "JSON preview";
  const subtitle =
    mode === "md"
      ? "How the parsed text + metadata will look in the .md file."
      : "Structured data that will be saved to the .json file.";

  // Close on Escape; also lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-pa-line w-full max-w-[1000px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-pa-line-soft">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-pa-ink">{title}</h2>
            <p className="text-[12px] text-pa-muted mt-0.5">{subtitle}</p>
            <p className="text-[11px] text-pa-muted/80 mt-0.5 font-mono truncate">
              {payload.source_filename || "document"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-md text-[11.5px] font-bold text-pa-body border border-pa-line hover:bg-pa-cream shrink-0"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-5 bg-pa-cream-soft">
          {mode === "md" ? (
            <article className="prose prose-sm max-w-none bg-white p-5 rounded-lg border border-pa-line-soft">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          ) : (
            <pre className="text-[12px] leading-[1.55] font-mono whitespace-pre-wrap break-words bg-white p-4 rounded-lg border border-pa-line-soft text-pa-ink">
              {content}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-pa-line-soft">
          <span className="text-[11.5px] text-pa-muted">
            {content.length.toLocaleString()} chars
            {mode === "md" ? " · Markdown" : " · JSON"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[12px] font-bold text-pa-body border border-pa-line hover:bg-pa-cream"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="px-4 py-1.5 rounded-md text-[12px] font-bold text-white bg-kpmg-blue hover:bg-kpmg-mediumblue inline-flex items-center gap-1.5"
              title={`Download as ${mode.toUpperCase()}`}
            >
              <FileText className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1 flex items-center gap-1">
      {children}
      <Sparkles className="h-3 w-3 text-kpmg-warning" />
    </div>
  );
}

function MetadataField({
  label,
  value,
  onChange,
  extracting,
  multiline = false,
  rows = 2,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  extracting: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {multiline ? (
        <textarea
          rows={rows}
          className="input-field"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          disabled={extracting}
        />
      ) : (
        <input
          className="input-field"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          disabled={extracting}
        />
      )}
    </div>
  );
}

// ---------- Extraction progress bar ----------

const EXTRACTION_STAGES = [
  { label: "Parsing document...", pct: 15 },
  { label: "Analyzing content structure...", pct: 35 },
  { label: "Extracting title & client info...", pct: 55 },
  { label: "Identifying requirements...", pct: 75 },
  { label: "Finalizing metadata...", pct: 90 },
];

function ExtractionProgress() {
  const [stageIdx, setStageIdx] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    // Animate initial rise to first stage
    const riseTimer = setTimeout(() => setPct(EXTRACTION_STAGES[0].pct), 100);

    // Advance through stages on intervals
    const interval = setInterval(() => {
      setStageIdx(prev => {
        const next = Math.min(prev + 1, EXTRACTION_STAGES.length - 1);
        setPct(EXTRACTION_STAGES[next].pct);
        return next;
      });
    }, 8000); // ~8s per stage

    return () => {
      clearTimeout(riseTimer);
      clearInterval(interval);
    };
  }, []);

  const stage = EXTRACTION_STAGES[stageIdx];

  return (
    <div className="rounded-lg border border-kpmg-blue/20 bg-kpmg-blue/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-kpmg-blue" />
        <span className="text-sm font-semibold text-kpmg-blue">
          AI extracting document metadata
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-kpmg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-kpmg-blue rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-kpmg-gray-500">{stage.label}</span>
        <span className="text-xs font-semibold text-kpmg-blue">{pct}%</span>
      </div>
    </div>
  );
}

// ---------- Readiness Report (matches KPMG readiness index design) ----------

function ReadinessReport({
  criteriaResults,
  streamMeta,
  streamDone,
  running,
  metadata,
  navigate,
}: {
  criteriaResults: CriterionResult[];
  streamMeta: StreamStartEvent | null;
  streamDone: StreamDoneEvent | null;
  running: boolean;
  metadata: ReviewMetadata;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  const completedResults = criteriaResults.filter(
    c => c.status !== "pending" && c.status !== "running"
  );
  const scoredResults = completedResults.filter(c => c.score != null && c.status !== "error");
  const overallScore = scoredResults.length > 0
    ? scoredResults.reduce((sum, c) => sum + (c.score || 0), 0) / scoredResults.length
    : 0;

  // Categorize criteria
  const mustFix = scoredResults.filter(c => (c.score || 0) < 5).length;
  const comments = scoredResults.filter(c => (c.score || 0) >= 5 && (c.score || 0) < 7).length;
  const goodToPass = scoredResults.filter(c => (c.score || 0) >= 7).length;

  const isGoDecision = overallScore >= 7;
  const totalCriteria = streamMeta?.total_criteria || criteriaResults.length;
  const progress = totalCriteria > 0 ? (completedResults.length / totalCriteria) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* -------- Header Card: Readiness Index -------- */}
      <div className="card bg-white">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-kpmg-blue">Readiness Index</h2>
              <Sparkles className="h-5 w-5 text-kpmg-warning" />
            </div>
            {metadata.document_title && (
              <p className="text-sm text-kpmg-gray-500 mt-1">{metadata.document_title}</p>
            )}
            {streamMeta && (
              <p className="text-xs text-kpmg-gray-400 mt-1">
                {streamMeta.model} · {streamMeta.framework_names.join(" + ")}
                {streamDone && ` · ${(streamDone.total_duration_ms / 1000).toFixed(1)}s`}
              </p>
            )}
          </div>

          {/* Score circle */}
          <div className="flex flex-col items-center gap-2">
            <div className={[
              "h-20 w-20 rounded-full flex items-center justify-center ring-4 transition-all duration-700",
              scoredResults.length > 0
                ? overallScore >= 7 ? "bg-green-50 ring-green-200" : overallScore >= 5 ? "bg-amber-50 ring-amber-200" : "bg-red-50 ring-red-200"
                : "bg-kpmg-gray-50 ring-kpmg-gray-200",
            ].join(" ")}>
              {scoredResults.length > 0 ? (
                <span className={[
                  "text-2xl font-black",
                  overallScore >= 7 ? "text-green-600" : overallScore >= 5 ? "text-amber-600" : "text-red-600",
                ].join(" ")}>
                  {overallScore.toFixed(1)}
                </span>
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-kpmg-gray-400" />
              )}
            </div>
            {streamDone?.review_id && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <BookmarkCheck className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
        </div>

        {/* Progress bar during streaming */}
        {running && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-kpmg-gray-500 mb-1">
              <span>{completedResults.length} of {totalCriteria} criteria evaluated</span>
              <span className="font-semibold text-kpmg-blue">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-kpmg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-kpmg-blue rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* -------- Decision Banner -------- */}
      {!running && scoredResults.length > 0 && (
        <div className={[
          "rounded-lg px-5 py-4 flex items-center gap-3",
          isGoDecision ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200",
        ].join(" ")}>
          {isGoDecision ? (
            <ShieldCheck className="h-6 w-6 text-green-600 flex-shrink-0" />
          ) : (
            <ShieldAlert className="h-6 w-6 text-red-600 flex-shrink-0" />
          )}
          <div>
            <div className={[
              "font-black uppercase tracking-wider text-sm",
              isGoDecision ? "text-green-700" : "text-red-700",
            ].join(" ")}>
              {isGoDecision ? "GO DECISION" : "NO GO DECISION"}
            </div>
            <p className={[
              "text-xs mt-0.5",
              isGoDecision ? "text-green-600" : "text-red-600",
            ].join(" ")}>
              {isGoDecision
                ? "Document meets quality threshold. Minor recommendations may apply."
                : "Critical items detected. Remediation is required prior to submission."}
            </p>
          </div>
          {streamDone?.review_id && (
            <button
              onClick={() => navigate(`/reviews/${streamDone.review_id}`)}
              className="ml-auto btn-secondary text-xs flex-shrink-0"
            >
              Open full report
            </button>
          )}
        </div>
      )}

      {/* -------- Stats Row -------- */}
      {scoredResults.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-200">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-bold text-red-700">MUST FIX: {mustFix}</span>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold text-amber-700">COMMENTS: {comments}</span>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-bold text-green-700">GOOD TO PASS: {goodToPass}</span>
          </div>
        </div>
      )}

      {/* -------- Criteria Card Grid -------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {criteriaResults.map(cr => (
          <CriterionScoreCard
            key={cr.index}
            criterion={cr}
            expanded={expandedCard === cr.index}
            onToggle={() => setExpandedCard(expandedCard === cr.index ? null : cr.index)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Per-criterion score card ----------

function CriterionScoreCard({
  criterion,
  expanded,
  onToggle,
}: {
  criterion: CriterionResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (criterion.status === "pending") {
    return (
      <div className="rounded-xl border border-kpmg-gray-100 bg-kpmg-gray-50/50 p-4 opacity-50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-kpmg-gray-200 animate-pulse" />
          <div className="flex-1">
            <div className="h-3 w-24 bg-kpmg-gray-200 rounded animate-pulse" />
            <div className="h-2 w-16 bg-kpmg-gray-100 rounded mt-2 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (criterion.status === "running") {
    return (
      <div className="rounded-xl border-2 border-kpmg-blue/30 bg-kpmg-blue/5 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-kpmg-blue/10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-kpmg-blue" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-kpmg-blue">
              {criterion.name || `Criterion ${criterion.index + 1}`}
            </h4>
            <p className="text-xs text-kpmg-gray-500 mt-0.5 animate-pulse">Evaluating...</p>
          </div>
        </div>
      </div>
    );
  }

  if (criterion.status === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-red-700">
              {criterion.name || `Criterion ${criterion.index + 1}`}
            </h4>
            <p className="text-xs text-red-500 mt-0.5">{criterion.error || "Evaluation failed"}</p>
          </div>
        </div>
      </div>
    );
  }

  const score = criterion.score || 5;
  const scoreColor = score >= 7 ? "bg-green-500" : score >= 5 ? "bg-amber-500" : "bg-red-500";

  // Extract first sentence of markdown as summary (skip score line)
  const summary = (() => {
    if (!criterion.markdown) return "";
    const lines = criterion.markdown.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.match(/^[Ss]core:/));
    const firstContent = lines.find(l => !l.startsWith("**") || l.startsWith("**Summary**"));
    if (firstContent) {
      return firstContent.replace(/^\*\*Summary\*\*\s*[-–—:]?\s*/, "").replace(/\*\*/g, "").slice(0, 120);
    }
    return lines[0]?.replace(/\*\*/g, "").slice(0, 120) || "";
  })();

  return (
    <div
      onClick={onToggle}
      className={[
        "rounded-xl border bg-white p-4 cursor-pointer transition-all duration-200 hover:shadow-md",
        expanded ? "ring-2 ring-kpmg-blue/40 shadow-md" : "border-kpmg-gray-100 hover:border-kpmg-gray-200",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Score badge */}
        <div className={[
          "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
          scoreColor,
        ].join(" ")}>
          <span className="text-white font-black text-sm">{score % 1 === 0 ? score.toFixed(0) : score.toFixed(1)}</span>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-kpmg-gray-800 leading-tight">
            {criterion.name || `Criterion ${criterion.index + 1}`}
          </h4>
          {!expanded && summary && (
            <p className="text-xs text-kpmg-gray-500 mt-1 line-clamp-2">{summary}</p>
          )}
        </div>
      </div>

      {/* Expanded markdown detail */}
      {expanded && criterion.markdown && (
        <div className="mt-4 pt-3 border-t border-kpmg-gray-100 prose prose-sm max-w-none prose-headings:text-kpmg-gray-800 prose-headings:font-semibold prose-p:text-kpmg-gray-700 prose-strong:text-kpmg-gray-800 prose-li:text-kpmg-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{criterion.markdown}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
