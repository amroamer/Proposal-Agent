import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, extractApiError } from "../api/client";

const schema = z.object({ email: z.string().email("Please enter a valid email address.") });
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      await api.post("/auth/forgot-password", values);
      setSent(true);
    } catch (err) {
      setApiError(extractApiError(err));
    }
  };

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-kpmg-gray-800 mb-2">Reset password</h2>
      {sent ? (
        <p className="text-sm text-kpmg-gray-600">
          If an account with that email exists, we&apos;ve sent a reset link. Check your inbox.
        </p>
      ) : (
        <>
          <p className="text-sm text-kpmg-gray-500 mb-6">
            Enter your email and we&apos;ll send a reset link.
          </p>
          {apiError && (
            <div role="alert" className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
              {apiError}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-kpmg-gray-700 mb-1">
                Email address
              </label>
              <input id="email" type="email" className="input-field" {...register("email")} />
              {errors.email && <p className="mt-1 text-xs text-kpmg-error">{errors.email.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p className="text-sm text-center text-kpmg-gray-500 pt-4">
        <Link to="/signin" className="text-kpmg-blue hover:text-kpmg-purple">Back to sign in</Link>
      </p>
    </div>
  );
}
