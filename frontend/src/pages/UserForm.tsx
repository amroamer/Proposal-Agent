import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "../components/PageHeader";
import { createUser, getUser, updateUser } from "../api/users";
import { extractApiError } from "../api/client";

const createSchema = z.object({
  email: z.string().email("Valid email required."),
  full_name: z.string().min(1, "Name is required.").max(200),
  password: z
    .string()
    .min(12, "At least 12 characters.")
    .max(128),
  is_active: z.boolean(),
  is_superadmin: z.boolean(),
});

const updateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  password: z.string().optional(), // unused on update
  is_active: z.boolean(),
  is_superadmin: z.boolean(),
});

type FormValues = z.infer<typeof createSchema>;

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(isEdit ? updateSchema : createSchema),
      defaultValues: {
        email: "",
        full_name: "",
        password: "",
        is_active: true,
        is_superadmin: false,
      },
    });

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    getUser(Number(id))
      .then(u => {
        if (cancelled) return;
        reset({
          email: u.email,
          full_name: u.full_name,
          password: "",
          is_active: u.is_active,
          is_superadmin: u.is_superadmin,
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
    try {
      if (isEdit && id) {
        await updateUser(Number(id), {
          full_name: v.full_name,
          is_active: v.is_active,
          is_superadmin: v.is_superadmin,
        });
      } else {
        await createUser({
          email: v.email.toLowerCase().trim(),
          full_name: v.full_name,
          password: v.password,
          is_active: v.is_active,
          is_superadmin: v.is_superadmin,
        });
      }
      navigate("/users");
    } catch (err) {
      setApiError(extractApiError(err));
    }
  };

  if (loading) return <div className="card max-w-2xl text-sm text-kpmg-gray-500">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={isEdit ? "Edit user" : "Add user"}
        backTo="/users"
        backLabel="Back to Users"
      />

      {apiError && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
            Email address
          </label>
          <input
            type="email"
            className="input-field"
            disabled={isEdit}
            {...register("email")}
          />
          {errors.email && <p className="mt-1 text-xs text-kpmg-error">{errors.email.message}</p>}
          {isEdit && (
            <p className="mt-1 text-xs text-kpmg-gray-400">
              Email cannot be changed once a user is created.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Full name</label>
          <input className="input-field" {...register("full_name")} />
          {errors.full_name && (
            <p className="mt-1 text-xs text-kpmg-error">{errors.full_name.message}</p>
          )}
        </div>

        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
              Initial password
            </label>
            <input type="password" className="input-field" {...register("password")} />
            {errors.password && (
              <p className="mt-1 text-xs text-kpmg-error">{errors.password.message}</p>
            )}
            <p className="mt-1 text-xs text-kpmg-gray-400">
              Min 12 chars, must include upper, lower, digit, and symbol.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" {...register("is_active")} />
            <span>Active</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" {...register("is_superadmin")} />
            <span>Admin</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/users")}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create user"}
          </button>
        </div>
      </form>
    </div>
  );
}
