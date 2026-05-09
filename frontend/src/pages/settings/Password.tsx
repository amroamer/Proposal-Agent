import { useState } from "react";
import { useForm } from "react-hook-form";
import { extractApiError } from "../../api/client";
import { changeMyPassword } from "../../api/users";

interface PasswordForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export function PasswordPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { isSubmitting } } =
    useForm<PasswordForm>({
      defaultValues: { current_password: "", new_password: "", confirm_password: "" },
    });

  const onSubmit = async (v: PasswordForm) => {
    setMsg(null);
    setError(null);
    if (v.new_password !== v.confirm_password) {
      setError("New passwords don't match.");
      return;
    }
    try {
      await changeMyPassword(v.current_password, v.new_password);
      reset({ current_password: "", new_password: "", confirm_password: "" });
      setMsg("Password changed.");
    } catch (e) {
      setError(extractApiError(e));
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[20px] font-bold text-pa-ink tracking-[-0.3px]">Password</h2>
        <p className="text-sm text-pa-muted mt-1.5 max-w-[560px]">
          Change the password used to sign in.
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
            Current password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            className="input-field"
            {...register("current_password", { required: true })}
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-pa-muted mb-1.5">
            New password
          </label>
          <input
            type="password"
            autoComplete="new-password"
            className="input-field"
            {...register("new_password", { required: true, minLength: 12, maxLength: 128 })}
          />
          <p className="mt-1.5 text-xs text-pa-muted">
            Min 12 chars, must include upper, lower, digit, and symbol.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-pa-muted mb-1.5">
            Confirm new password
          </label>
          <input
            type="password"
            autoComplete="new-password"
            className="input-field"
            {...register("confirm_password", { required: true })}
          />
        </div>
        <div className="flex justify-end pt-1">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
