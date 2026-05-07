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
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-kpmg-gray-800">Password</h2>
        <p className="text-sm text-kpmg-gray-500 mt-1">Change the password used to sign in.</p>
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
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Current password</label>
          <input
            type="password"
            autoComplete="current-password"
            className="input-field"
            {...register("current_password", { required: true })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">New password</label>
          <input
            type="password"
            autoComplete="new-password"
            className="input-field"
            {...register("new_password", { required: true, minLength: 12, maxLength: 128 })}
          />
          <p className="mt-1 text-xs text-kpmg-gray-400">
            Min 12 chars, must include upper, lower, digit, and symbol.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            autoComplete="new-password"
            className="input-field"
            {...register("confirm_password", { required: true })}
          />
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
