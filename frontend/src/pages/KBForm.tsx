import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "../components/PageHeader";
import { createKB, getKB, updateKB } from "../api/kb";
import { extractApiError } from "../api/client";

const schema = z.object({
  title: z.string().min(1, "Title is required.").max(300),
  category: z.string().min(1, "Category is required.").max(100),
  body: z.string().min(1, "Body is required."),
  tagsCsv: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

export function KBFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { title: "", category: "general", body: "", tagsCsv: "" },
    });

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    getKB(Number(id))
      .then(item => {
        if (cancelled) return;
        reset({
          title: item.title,
          category: item.category,
          body: item.body,
          tagsCsv: item.tags.join(", "),
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
    const tags = (v.tagsCsv || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    try {
      if (isEdit && id) {
        await updateKB(Number(id), { title: v.title, category: v.category, body: v.body, tags });
      } else {
        await createKB({ title: v.title, category: v.category, body: v.body, tags });
      }
      navigate("/knowledge");
    } catch (err) {
      setApiError(extractApiError(err));
    }
  };

  if (loading) return <div className="card max-w-3xl text-sm text-kpmg-gray-500">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={isEdit ? "Edit knowledge item" : "Add knowledge item"}
        backTo="/knowledge"
        backLabel="Back to Knowledge Base"
      />

      {apiError && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Title</label>
          <input className="input-field" {...register("title")} />
          {errors.title && <p className="mt-1 text-xs text-kpmg-error">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Category</label>
            <input
              className="input-field"
              placeholder="e.g. advisory, tax, general"
              {...register("category")}
            />
            {errors.category && (
              <p className="mt-1 text-xs text-kpmg-error">{errors.category.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Tags</label>
            <input
              className="input-field"
              placeholder="comma, separated, tags"
              {...register("tagsCsv")}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
            Body (Markdown)
          </label>
          <textarea
            rows={14}
            className="input-field font-mono text-xs"
            {...register("body")}
          />
          {errors.body && <p className="mt-1 text-xs text-kpmg-error">{errors.body.message}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/knowledge")}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
