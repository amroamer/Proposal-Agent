import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
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
    <div>
      <div className="eyebrow mb-2">Sign in</div>
      <h2 className="text-[28px] font-semibold text-pa-ink tracking-[-0.5px] mb-1.5">
        Welcome back.
      </h2>
      <p className="text-[13.5px] text-pa-muted mb-8">
        Continue your review work or start a fresh assessment.
      </p>

      {apiError && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-pa-danger-soft border border-pa-danger/20 text-sm text-pa-danger">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <input
          id="email" type="email" autoComplete="email"
          className="w-full px-3.5 py-3 rounded-[11px] bg-pa-cream-soft border border-pa-line text-pa-ink text-sm focus:outline-none focus:border-pa-accent focus:ring-2 focus:ring-pa-accent/20"
          {...register("email")}
        />
        {errors.email && <p className="-mt-2 text-xs text-pa-danger">{errors.email.message}</p>}

        <FieldLabel htmlFor="password">Password</FieldLabel>
        <input
          id="password" type="password" autoComplete="current-password"
          className="w-full px-3.5 py-3 rounded-[11px] bg-pa-cream-soft border border-pa-line text-pa-ink text-sm focus:outline-none focus:border-pa-accent focus:ring-2 focus:ring-pa-accent/20"
          {...register("password")}
        />
        {errors.password && <p className="-mt-2 text-xs text-pa-danger">{errors.password.message}</p>}

        <div className="flex items-center justify-between text-sm pt-1.5">
          <label className="flex items-center gap-2 text-[12.5px] text-pa-muted cursor-pointer select-none">
            <input
              type="checkbox"
              defaultChecked
              className="accent-pa-accent w-3.5 h-3.5"
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-[12.5px] font-semibold text-pa-accent hover:text-pa-accent-2">
            Forgot?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-[11px] bg-pa-accent text-white text-[14px] font-semibold tracking-[0.2px] shadow-accent hover:bg-pa-accent-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
        >
          {isSubmitting ? "Signing in…" : (
            <>
              <span>Continue to dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-[12px] text-pa-muted text-center pt-1">
          Single sign-on via your workspace identity provider
        </p>

        <p className="text-sm text-center text-pa-muted pt-2">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="text-pa-accent hover:text-pa-accent-2 font-semibold">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-bold text-pa-muted uppercase tracking-[0.08em] mb-1.5"
    >
      {children}
    </label>
  );
}
