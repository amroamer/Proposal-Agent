import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, extractApiError } from "../api/client";

// Mirrors the backend password policy (backend/app/core/security.py)
const passwordSchema = z.string()
  .min(12, "At least 12 characters.")
  .refine(v => /[A-Z]/.test(v), "Must contain an uppercase letter.")
  .refine(v => /[a-z]/.test(v), "Must contain a lowercase letter.")
  .refine(v => /\d/.test(v),    "Must contain a digit.")
  .refine(v => /[^A-Za-z0-9]/.test(v), "Must contain a symbol.");

const schema = z.object({
  full_name: z.string().min(1, "Full name is required.").max(200),
  email: z.string().email("Please enter a valid email address."),
  password: passwordSchema,
  confirm_password: z.string(),
  accept_terms: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms and PDPL notice." }) }),
}).refine(d => d.password === d.confirm_password, {
  path: ["confirm_password"], message: "Passwords do not match.",
});
type FormValues = z.infer<typeof schema>;

export function SignUpPage() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { accept_terms: false as any },
  });

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      await api.post("/auth/signup", {
        email: values.email,
        full_name: values.full_name,
        password: values.password,
        accept_terms: values.accept_terms,
      });
      setSuccess(true);
      setTimeout(() => navigate("/signin"), 2000);
    } catch (err) {
      setApiError(extractApiError(err));
    }
  };

  if (success) {
    return (
      <div className="card">
        <h2 className="text-2xl font-bold text-kpmg-gray-800 mb-2">Account created</h2>
        <p className="text-sm text-kpmg-gray-600">
          Please check your email to verify your address. Redirecting you to sign in…
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-kpmg-gray-800 mb-2">Create account</h2>
      <p className="text-sm text-kpmg-gray-500 mb-6">Join the Proposal Agent workspace.</p>

      {apiError && (
        <div role="alert" className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-kpmg-gray-700 mb-1">Full name</label>
          <input id="full_name" className="input-field" {...register("full_name")} />
          {errors.full_name && <p className="mt-1 text-xs text-kpmg-error">{errors.full_name.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-kpmg-gray-700 mb-1">Email address</label>
          <input id="email" type="email" autoComplete="email" className="input-field" {...register("email")} />
          {errors.email && <p className="mt-1 text-xs text-kpmg-error">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-kpmg-gray-700 mb-1">Password</label>
          <input id="password" type="password" autoComplete="new-password" className="input-field" {...register("password")} />
          {errors.password && <p className="mt-1 text-xs text-kpmg-error">{errors.password.message}</p>}
          <p className="mt-1 text-xs text-kpmg-gray-500">
            At least 12 characters with upper, lower, digit, and symbol.
          </p>
        </div>

        <div>
          <label htmlFor="confirm_password" className="block text-sm font-medium text-kpmg-gray-700 mb-1">Confirm password</label>
          <input id="confirm_password" type="password" autoComplete="new-password" className="input-field" {...register("confirm_password")} />
          {errors.confirm_password && <p className="mt-1 text-xs text-kpmg-error">{errors.confirm_password.message}</p>}
        </div>

        <label className="flex items-start gap-2 text-sm text-kpmg-gray-600">
          <input type="checkbox" className="mt-0.5" {...register("accept_terms")} />
          <span>
            I accept the <a href="#" className="text-kpmg-blue">Terms of Use</a> and the{" "}
            <a href="#" className="text-kpmg-blue">PDPL privacy notice</a>.
          </span>
        </label>
        {errors.accept_terms && <p className="text-xs text-kpmg-error">{errors.accept_terms.message}</p>}

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>

        <p className="text-sm text-center text-kpmg-gray-500 pt-2">
          Already have an account?{" "}
          <Link to="/signin" className="text-kpmg-blue hover:text-kpmg-purple font-medium">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
