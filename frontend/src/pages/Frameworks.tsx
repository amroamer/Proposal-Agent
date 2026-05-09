import { useEffect, useRef, useState } from "react";
import { Download, FileUp, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  autoGenCriteria,
  createFramework,
  deleteFramework,
  exportFramework,
  getFramework,
  importFramework,
  listFrameworks,
  updateFramework,
  type Framework,
  type FrameworkSummary,
} from "../api/frameworks";
import { formatModelLabel, listModels, type OllamaModel } from "../api/llm";
import { extractApiError } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { CriteriaEditor } from "../components/frameworks/CriteriaEditor";

export function FrameworksPage() {
  const me = useAuthStore((s) => s.user);
  const [list, setList] = useState<FrameworkSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Framework | null>(null);
  const [draft, setDraft] = useState<Framework | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const [autoGenLoading, setAutoGenLoading] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importJsonRef = useRef<HTMLInputElement>(null);

  // Load Ollama models once.
  useEffect(() => {
    listModels()
      .then((r) => setModels(r.models))
      .catch(() => setModels([]));
  }, []);

  // Initial load: fetch list and select first item.
  useEffect(() => {
    let cancelled = false;
    listFrameworks()
      .then((r) => {
        if (cancelled) return;
        setList(r.items);
        if (r.items.length && selectedId === null) setSelectedId(r.items[0].id);
      })
      .catch((e) => !cancelled && setError(extractApiError(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load detail whenever selection changes.
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setDraft(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    getFramework(selectedId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setDraft(d);
        setDirty(false);
        setLoadingDetail(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(extractApiError(e));
        setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const refreshList = async () => {
    try {
      const r = await listFrameworks();
      setList(r.items);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  const onCreate = async () => {
    setError(null);
    try {
      const fw = await createFramework({
        name: "New Framework",
        persona_instruction: "",
        model: "gemma4:latest",
        is_public: false,
        criteria: [],
      });
      await refreshList();
      setSelectedId(fw.id);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  const onChange = <K extends keyof Framework>(key: K, value: Framework[K]) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setDirty(true);
  };

  const onSave = async () => {
    if (!draft || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFramework(draft.id, {
        name: draft.name,
        persona_instruction: draft.persona_instruction,
        model: draft.model,
        is_public: draft.is_public,
        criteria: draft.criteria.filter(
          (c) =>
            (c.name_en.trim() || c.name_ar.trim()) &&
            (c.prompt_instruction_en.trim() || c.prompt_instruction_ar.trim()),
        ),
      });
      setDetail(updated);
      setDraft(updated);
      setDirty(false);
      await refreshList();
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!detail) return;
    try {
      await deleteFramework(detail.id);
      setConfirmDelete(false);
      const r = await listFrameworks();
      setList(r.items);
      setSelectedId(r.items[0]?.id ?? null);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  const onImportFrom = async (sourceId: number) => {
    if (!draft) return;
    setImportPickerOpen(false);
    try {
      const src = await getFramework(sourceId);
      setDraft({ ...draft, criteria: [...draft.criteria, ...src.criteria] });
      setDirty(true);
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  const onAutoGenFile = async (file: File) => {
    if (!draft) return;
    setAutoGenLoading(true);
    setError(null);
    try {
      const result = await autoGenCriteria(file);
      setDraft({
        ...draft,
        criteria: [...draft.criteria, ...result.criteria],
      });
      setDirty(true);
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setAutoGenLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onImportJson = async (file: File) => {
    setError(null);
    try {
      const fw = await importFramework(file);
      await refreshList();
      setSelectedId(fw.id);
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      if (importJsonRef.current) importJsonRef.current.value = "";
    }
  };

  const canEdit = !draft
    ? false
    : !draft.owner_user_id ||
      draft.owner_user_id === me?.id ||
      !!me?.is_superadmin;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-2">Configure</div>
          <h1 className="text-3xl md:text-[32px] font-semibold text-pa-ink tracking-[-0.6px] leading-tight">
            Framework Management
          </h1>
          <p className="mt-2 text-sm text-pa-muted max-w-[540px] leading-relaxed">
            Diagnostic logic and strategic prompts that the agent uses to evaluate every proposal.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => importJsonRef.current?.click()}
            className="btn-secondary text-sm"
          >
            <FileUp className="h-4 w-4" />
            Import JSON
          </button>
          <input
            ref={importJsonRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportJson(f);
            }}
          />
          <button onClick={onCreate} className="btn-primary">
            <Plus className="h-4 w-4" />
            New framework
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6">
        {/* Library */}
        <aside className="space-y-2.5">
          <div className="eyebrow-muted px-1">
            Library · {String(list.length).padStart(2, "0")}
          </div>
          {list.length === 0 ? (
            <div className="rounded-2xl bg-white border border-pa-line p-5 text-sm text-pa-muted">
              No frameworks yet. Click &quot;New framework&quot; to create one.
            </div>
          ) : (
            list.map((fw) => (
              <button
                key={fw.id}
                onClick={() => {
                  if (dirty && !confirm("Discard unsaved changes?")) return;
                  setSelectedId(fw.id);
                }}
                className={`relative w-full text-left rounded-2xl border p-4 transition-colors ${
                  selectedId === fw.id
                    ? "border-pa-accent/30 bg-pa-accent-soft"
                    : "border-pa-line bg-white hover:border-pa-accent/30"
                }`}
              >
                {selectedId === fw.id && (
                  <span className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-pa-accent" />
                )}
                <div
                  className={`text-[14.5px] font-semibold tracking-[-0.1px] ${selectedId === fw.id ? "text-pa-accent" : "text-pa-ink"}`}
                >
                  {fw.name}
                </div>
                <div className="text-[12px] text-pa-muted mt-1">
                  {fw.criteria_count} criteria{fw.is_public && " \u00b7 public"}
                </div>
              </button>
            ))
          )}
        </aside>

        {/* Detail */}
        <section className="min-w-0">
          {loadingDetail && (
            <div className="card text-sm text-kpmg-gray-500">
              Loading framework...
            </div>
          )}

          {!loadingDetail && draft && (
            <div className="card space-y-6">
              {/* Name */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-2">
                  Framework Name
                </label>
                <input
                  className="input-field text-2xl font-bold text-kpmg-blue"
                  value={draft.name}
                  onChange={(e) => onChange("name", e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              {/* Owner + Model */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-2">
                    Framework Owner
                  </label>
                  <input
                    className="input-field bg-kpmg-gray-50"
                    value={
                      draft.owner_user_id === me?.id
                        ? me?.full_name || me?.email || "You"
                        : draft.owner_user_id
                          ? `User #${draft.owner_user_id}`
                          : "System"
                    }
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-2">
                    AI Engine / Model
                  </label>
                  <select
                    className="input-field"
                    value={draft.model}
                    onChange={(e) => onChange("model", e.target.value)}
                    disabled={!canEdit || models.length === 0}
                  >
                    {models.length === 0 && (
                      <option value={draft.model}>
                        {draft.model || "(loading models...)"}
                      </option>
                    )}
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {formatModelLabel(m)}
                      </option>
                    ))}
                    {models.length > 0 &&
                      !models.find((m) => m.name === draft.model) &&
                      draft.model && (
                        <option value={draft.model}>
                          {draft.model} (not available locally)
                        </option>
                      )}
                  </select>
                  {models.length === 0 && (
                    <p className="mt-1 text-xs text-kpmg-warning">
                      Could not reach the local LLM. Check that Ollama is
                      running.
                    </p>
                  )}
                </div>
              </div>

              {/* Persona */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-2">
                  Framework Persona Instruction
                </label>
                <textarea
                  rows={3}
                  className="input-field font-mono text-xs"
                  value={draft.persona_instruction}
                  onChange={(e) =>
                    onChange("persona_instruction", e.target.value)
                  }
                  disabled={!canEdit}
                  placeholder="You are a top-tier management consultant..."
                />
              </div>

              {/* Public toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                    draft.is_public ? "bg-kpmg-blue" : "bg-kpmg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform mt-0.5 ${
                      draft.is_public ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={draft.is_public}
                  onChange={(e) => onChange("is_public", e.target.checked)}
                  disabled={!canEdit}
                />
                <span className="text-sm uppercase tracking-wider text-kpmg-gray-500 font-semibold">
                  Public framework (available to all users)
                </span>
              </label>

              <hr className="border-kpmg-gray-100" />

              {/* Criteria Editor */}
              <CriteriaEditor
                criteria={draft.criteria}
                onChange={(criteria) => {
                  setDraft({ ...draft, criteria });
                  setDirty(true);
                }}
                canEdit={canEdit}
                onImport={() => setImportPickerOpen(true)}
                onAutoGenClick={() => fileInputRef.current?.click()}
                autoGenLoading={autoGenLoading}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pptx,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAutoGenFile(f);
                }}
              />

              {/* Export / Save / Delete */}
              {canEdit && (
                <div className="flex items-center justify-between pt-4 border-t border-kpmg-gray-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="btn-danger text-sm"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Export buttons */}
                    <button
                      type="button"
                      onClick={() => exportFramework(draft.id, "json")}
                      className="btn-secondary text-sm"
                      title="Export as JSON"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => exportFramework(draft.id, "xlsx")}
                      className="btn-secondary text-sm"
                      title="Export as Excel"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Excel
                    </button>

                    {dirty && (
                      <span className="text-xs text-kpmg-warning font-medium">
                        Unsaved changes
                      </span>
                    )}
                    <button
                      onClick={onSave}
                      disabled={!dirty || saving}
                      className="btn-primary"
                    >
                      {saving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              )}

              {!canEdit && (
                <div className="flex items-center justify-between pt-4 border-t border-kpmg-gray-100">
                  <div className="text-xs text-kpmg-gray-500 italic">
                    This framework is read-only — you don&apos;t own it. Create
                    your own from the &quot;New framework&quot; button to
                    customise.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportFramework(draft.id, "json")}
                      className="btn-secondary text-sm"
                      title="Export as JSON"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => exportFramework(draft.id, "xlsx")}
                      className="btn-secondary text-sm"
                      title="Export as Excel"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Excel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete framework?"
        message="Past reviews that were run against this framework will keep their results. The framework itself will be removed."
        objectName={detail?.name}
        confirmLabel="Delete"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Import existing framework picker */}
      {importPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setImportPickerOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-raise max-w-md w-full p-6 max-h-[70vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-kpmg-gray-800 mb-1">
              Import criteria
            </h2>
            <p className="text-sm text-kpmg-gray-500 mb-4">
              Append all criteria from another framework into this one.
            </p>
            <div className="space-y-2">
              {list
                .filter((f) => f.id !== draft?.id)
                .map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onImportFrom(f.id)}
                    className="w-full text-left p-3 rounded border border-kpmg-gray-100 hover:bg-kpmg-gray-50"
                  >
                    <div className="font-medium text-kpmg-gray-800">
                      {f.name}
                    </div>
                    <div className="text-xs text-kpmg-gray-500">
                      {f.criteria_count} criteria
                    </div>
                  </button>
                ))}
              {list.filter((f) => f.id !== draft?.id).length === 0 && (
                <p className="text-sm text-kpmg-gray-500">
                  No other frameworks to import from.
                </p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setImportPickerOpen(false)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
