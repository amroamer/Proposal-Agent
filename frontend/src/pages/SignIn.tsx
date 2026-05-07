import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, extractApiError } from "../api/client";
import { useAuthStore } from "../stores/auth";

const schema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});
type FormValues = z.infer<typeof schema>;

export function SignInPage() {
  const navigate = useNavigate();
  const { setTokens } = useAuthStore();
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      const res = await api.post("/auth/signin", values);
      setTokens(res.data.access_token, res.data.refresh_token);
      navigate("/dashboard");
    } catch (err) {
      setApiError(extractApiError(err));
    }
  };

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-kpmg-gray-800 mb-2">Sign in</h2>
      <p className="text-sm text-kpmg-gray-500 mb-6">Access your Proposal Agent workspace.</p>

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
          <input
            id="email" type="email" autoComplete="email"
            className="input-field"
            {...register("email")}
          />
          {errors.email && <p className="mt-1 text-xs text-kpmg-error">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-kpmg-gray-700 mb-1">
            Password
          </label>
          <input
            id="password" type="password" autoComplete="current-password"
            className="input-field"
            {...register("password")}
          />
          {errors.password && <p className="mt-1 text-xs text-kpmg-error">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-kpmg-blue hover:text-kpmg-purple">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-sm text-center text-kpmg-gray-500 pt-2">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="text-kpmg-blue hover:text-kpmg-purple font-medium">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
