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
    <section className="space-y-5">
      <div>
        <h2 className="text-[20px] font-bold text-pa-ink tracking-[-0.3px]">Profile</h2>
        <p className="text-sm text-pa-muted mt-1.5 max-w-[560px]">
          Your name and the email shown across the app.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-pa-danger-soft border border-pa-danger/20 text-sm text-pa-danger">
          {error}
        </div>
      )}
      {msg && (
        <div role="status" className="p-3 rounded-lg bg-pa-success-soft border border-pa-success/20 text-sm text-pa-success">
          {msg}
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-2xl bg-white border border-pa-line p-5 md:p-6 space-y-4"
      >
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-pa-muted mb-1.5">
            Email
          </label>
          <input className="input-field bg-pa-cream-soft" value={email ?? ""} disabled />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-pa-muted mb-1.5">
            Full name
          </label>
          <input
            className="input-field"
            {...register("full_name", { required: true, minLength: 1, maxLength: 200 })}
          />
          {errors.full_name && <p className="mt-1 text-xs text-pa-danger">Required.</p>}
        </div>
        <div className="flex justify-end pt-1">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </section>
  );
}
