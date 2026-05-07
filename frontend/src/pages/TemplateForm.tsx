import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import {
  createTemplate,
  getTemplate,
  updateTemplate,
  type TemplateSection,
} from "../api/templates";
import { extractApiError } from "../api/client";

interface FormValues {
  name: string;
  description: string;
  sections: TemplateSection[];
}

const blankSection = (): TemplateSection => ({
  heading: "",
  instructions: "",
  default_content: "",
});

export function TemplateFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      defaultValues: { name: "", description: "", sections: [blankSection()] },
    });

  const { fields, append, remove, move } = useFieldArray({ control, name: "sections" });

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    getTemplate(Number(id))
      .then(t => {
        if (cancelled) return;
        reset({
          name: t.name,
          description: t.description,
          sections: t.sections.length ? t.sections : [blankSection()],
        });
        setLoading(false);
      })
      .catch(err => !cancelled && setApiError(extractApiError(err)));
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, reset]);

  const onSubmit = async (v: FormValues) => {
    setApiError(null);
    if (!v.name.trim()) {
      setApiError("Name is required.");
      return;
    }
    const cleanSections = v.sections.filter(s => s.heading.trim());
    try {
      if (isEdit && id) {
        await updateTemplate(Number(id), {
          name: v.name,
          description: v.description,
          sections: cleanSections,
        });
      } else {
        await createTemplate({
          name: v.name,
          description: v.description,
          sections: cleanSections,
        });
      }
      navigate("/templates");
    } catch (err) {
      setApiError(extractApiError(err));
    }
  };

  if (loading) return <div className="card max-w-3xl text-sm text-kpmg-gray-500">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={isEdit ? "Edit template" : "New template"}
        backTo="/templates"
        backLabel="Back to Templates"
      />

      {apiError && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Name</label>
            <input className="input-field" {...register("name", { required: true })} />
            {errors.name && <p className="mt-1 text-xs text-kpmg-error">Required.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
              Description
            </label>
            <textarea rows={3} className="input-field" {...register("description")} />
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
              No sections yet. Click "Add section" to start.
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="card border-l-4 border-kpmg-blue/40">
                  <div className="flex items-start gap-2 mb-3">
                    <div className="text-xs text-kpmg-gray-400 mt-2 font-mono">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <input
                        className="input-field font-medium"
                        placeholder={`Section ${index + 1} heading`}
                        {...register(`sections.${index}.heading` as const)}
                      />
                      <textarea
                        rows={2}
                        className="input-field text-sm"
                        placeholder="Author instructions (optional) — what should go here?"
                        {...register(`sections.${index}.instructions` as const)}
                      />
                      <textarea
                        rows={4}
                        className="input-field text-sm font-mono text-xs"
                        placeholder="Default content (optional) — copied into proposals seeded from this template."
                        {...register(`sections.${index}.default_content` as const)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => index > 0 && move(index, index - 1)}
                        disabled={index === 0}
                        className="p-1 text-xs text-kpmg-gray-400 hover:text-kpmg-blue disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => index < fields.length - 1 && move(index, index + 1)}
                        disabled={index === fields.length - 1}
                        className="p-1 text-xs text-kpmg-gray-400 hover:text-kpmg-blue disabled:opacity-30"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
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
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/templates")}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </button>
        </div>
      </form>
    </div>
  );
}
