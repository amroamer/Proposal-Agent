import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api, extractApiError } from "../../api/client";
import { updateMyProfile } from "../../api/users";
import { useAuthStore } from "../../stores/auth";

interface ProfileForm {
  full_name: string;
}

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [email, setEmail] = useState<string | null>(user?.email ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ProfileForm>({
    defaultValues: { full_name: user?.full_name ?? "" },
  });

  useEffect(() => {
    if (user) return;
    api
      .get("/auth/me")
      .then(r => {
        const u = r.data;
        setUser({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          is_superadmin: u.is_superadmin,
        });
        setEmail(u.email);
        reset({ full_name: u.full_name });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (v: ProfileForm) => {
    setMsg(null);
    setError(null);
    try {
      const updated = await updateMyProfile(v.full_name.trim());
      setUser({
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        is_superadmin: updated.is_superadmin,
      });
      setMsg("Profile updated.");
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-kpmg-gray-800">Profile</h2>
        <p className="text-sm text-kpmg-gray-500 mt-1">Your name and the email shown across the app.</p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {error}
        </div>
      )}
      {msg && (
        <div role="status" className="p-3 rounded bg-green-50 border border-green-200 text-sm text-green-800">
          {msg}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Email</label>
          <input className="input-field bg-kpmg-gray-50" value={email ?? ""} disabled />
        </div>
        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Full name</label>
          <input
            className="input-field"
            {...register("full_name", { required: true, minLength: 1, maxLength: 200 })}
          />
          {errors.full_name && <p className="mt-1 text-xs text-kpmg-error">Required.</p>}
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </section>
  );
}
