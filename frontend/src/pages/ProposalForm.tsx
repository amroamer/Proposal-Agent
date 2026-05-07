import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";
import { Trash2, Plus } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import {
  createProposal,
  getProposal,
  updateProposal,
  PROPOSAL_STATUSES,
  STATUS_LABEL,
  type ProposalSection,
  type ProposalStatus,
} from "../api/proposals";
import { listTemplates, type Template } from "../api/templates";
import { extractApiError } from "../api/client";

interface FormValues {
  title: string;
  client_name: string;
  template_id: string; // form value as string ("" means none)
  status: ProposalStatus;
  sections: ProposalSection[];
  notes: string;
}

const blankSection = (): ProposalSection => ({ heading: "", content: "" });

export function ProposalFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [templates, setTemplates] = useState<Template[]>([]);

  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      defaultValues: {
        title: "",
        client_name: "",
        template_id: "",
        status: "draft",
        sections: [],
        notes: "",
      },
    });

  const { fields, append, remove, replace } = useFieldArray({ control, name: "sections" });

  // Load templates for picker
  useEffect(() => {
    listTemplates()
      .then(r => setTemplates(r.items))
      .catch(() => setTemplates([]));
  }, []);

  // Load existing proposal if editing
  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    getProposal(Number(id))
      .then(p => {
        if (cancelled) return;
        reset({
          title: p.title,
          client_name: p.client_name,
          template_id: p.template_id ? String(p.template_id) : "",
          status: p.status,
          sections: p.sections.length ? p.sections : [],
          notes: p.notes,
        });
        setLoading(false);
      })
      .catch(err => !cancelled && setApiError(extractApiError(err)));
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, reset]);

  // When the user picks a template on a NEW proposal, pre-seed sections from it.
  // Only do this if sections is currently empty (so we don't clobber edits).
  const watchedTemplateId = watch("template_id");
  useEffect(() => {
    if (isEdit) return;
    if (!watchedTemplateId) return;
    const t = templates.find(t => t.id === Number(watchedTemplateId));
    if (!t) return;
    if (fields.length === 0) {
      replace(t.sections.map(s => ({ heading: s.heading, content: s.default_content })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedTemplateId, templates]);

  const onSubmit = async (v: FormValues) => {
    setApiError(null);
    if (!v.title.trim()) {
      setApiError("Title is required.");
      return;
    }
    const payload = {
      title: v.title,
      client_name: v.client_name,
      template_id: v.template_id ? Number(v.template_id) : null,
      status: v.status,
      sections: v.sections.filter(s => s.heading.trim()),
      notes: v.notes,
    };
    try {
      const result =
        isEdit && id
          ? await updateProposal(Number(id), payload)
          : await createProposal(payload);
      navigate(`/proposals/${result.id}`);
    } catch (err) {
      setApiError(extractApiError(err));
    }
  };

  if (loading) return <div className="card max-w-3xl text-sm text-kpmg-gray-500">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={isEdit ? "Edit proposal" : "New proposal"}
        backTo={isEdit && id ? `/proposals/${id}` : "/proposals"}
        backLabel={isEdit ? "Back to proposal" : "Back to Proposals"}
      />

      {apiError && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Title</label>
            <input className="input-field" {...register("title", { required: true })} />
            {errors.title && <p className="mt-1 text-xs text-kpmg-error">Required.</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
                Client name
              </label>
              <input className="input-field" {...register("client_name")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Status</label>
              <select className="input-field" {...register("status")}>
                {PROPOSAL_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Template</label>
            <select className="input-field" {...register("template_id")} disabled={isEdit}>
              <option value="">None — start from scratch</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.sections.length} sections)
                </option>
              ))}
            </select>
            {!isEdit && (
              <p className="mt-1 text-xs text-kpmg-gray-400">
                Picking a template will seed the sections below from its defaults.
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-kpmg-gray-800">Sections</h2>
            <button
              type="button"
              onClick={() => append(blankSection())}
              className="btn-secondary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add section
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="card text-center text-sm text-kpmg-gray-500 py-8">
              No sections. Pick a template above, or click "Add section".
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="card border-l-4 border-kpmg-blue/40">
                  <div className="flex items-start gap-2 mb-3">
                    <div className="flex-1 space-y-3">
                      <input
                        className="input-field font-medium"
                        placeholder={`Section ${index + 1} heading`}
                        {...register(`sections.${index}.heading` as const)}
                      />
                      <textarea
                        rows={6}
                        className="input-field text-sm font-mono text-xs"
                        placeholder="Section content (Markdown)"
                        {...register(`sections.${index}.content` as const)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-1 text-kpmg-gray-400 hover:text-kpmg-error"
                      aria-label="Remove section"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
            Internal notes (not part of the proposal)
          </label>
          <textarea rows={3} className="input-field text-sm" {...register("notes")} />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/proposals")}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create proposal"}
          </button>
        </div>
      </form>
    </div>
  );
}

