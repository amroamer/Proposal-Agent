import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader } from "../components/PageHeader";
import { api, extractApiError } from "../api/client";
import { changeMyPassword, updateMyProfile } from "../api/users";
import { useAuthStore } from "../stores/auth";

interface ProfileForm {
  full_name: string;
}
interface PasswordForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(user?.email ?? null);

  const profile = useForm<ProfileForm>({
    defaultValues: { full_name: user?.full_name ?? "" },
  });
  const pwd = useForm<PasswordForm>({
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  // If we don't have the user yet (sessionStorage hadn't hydrated), fetch /auth/me
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
        profile.reset({ full_name: u.full_name });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onProfileSubmit = async (v: ProfileForm) => {
    setProfileMsg(null);
    setProfileError(null);
    try {
      const updated = await updateMyProfile(v.full_name.trim());
      setUser({
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        is_superadmin: updated.is_superadmin,
      });
      setProfileMsg("Profile updated.");
    } catch (e) {
      setProfileError(extractApiError(e));
    }
  };

  const onPwdSubmit = async (v: PasswordForm) => {
    setPwdMsg(null);
    setPwdError(null);
    if (v.new_password !== v.confirm_password) {
      setPwdError("New passwords don't match.");
      return;
    }
    try {
      await changeMyPassword(v.current_password, v.new_password);
      pwd.reset({ current_password: "", new_password: "", confirm_password: "" });
      setPwdMsg("Password changed.");
    } catch (e) {
      setPwdError(extractApiError(e));
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader title="Settings" subtitle="Your account profile and password." />

      <section>
        <h2 className="text-lg font-semibold text-kpmg-gray-800 mb-3">Profile</h2>
        {profileError && (
          <div role="alert" className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
            {profileError}
          </div>
        )}
        {profileMsg && (
          <div role="status" className="mb-3 p-3 rounded bg-green-50 border border-green-200 text-sm text-green-800">
            {profileMsg}
          </div>
        )}
        <form onSubmit={profile.handleSubmit(onProfileSubmit)} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Email</label>
            <input className="input-field bg-kpmg-gray-50" value={email ?? ""} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">Full name</label>
            <input
              className="input-field"
              {...profile.register("full_name", { required: true, minLength: 1, maxLength: 200 })}
            />
            {profile.formState.errors.full_name && (
              <p className="mt-1 text-xs text-kpmg-error">Required.</p>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary"
              disabled={profile.formState.isSubmitting}
            >
              {profile.formState.isSubmitting ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-kpmg-gray-800 mb-3">Change password</h2>
        {pwdError && (
          <div role="alert" className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
            {pwdError}
          </div>
        )}
        {pwdMsg && (
          <div role="status" className="mb-3 p-3 rounded bg-green-50 border border-green-200 text-sm text-green-800">
            {pwdMsg}
          </div>
        )}
        <form onSubmit={pwd.handleSubmit(onPwdSubmit)} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
              Current password
            </label>
            <input
              type="password"
              className="input-field"
              autoComplete="current-password"
              {...pwd.register("current_password", { required: true })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
              New password
            </label>
            <input
              type="password"
              className="input-field"
              autoComplete="new-password"
              {...pwd.register("new_password", { required: true, minLength: 12, maxLength: 128 })}
            />
            <p className="mt-1 text-xs text-kpmg-gray-400">
              Min 12 chars, must include upper, lower, digit, and symbol.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-kpmg-gray-700 mb-1">
              Confirm new password
            </label>
            <input
              type="password"
              className="input-field"
              autoComplete="new-password"
              {...pwd.register("confirm_password", { required: true })}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary"
              disabled={pwd.formState.isSubmitting}
            >
              {pwd.formState.isSubmitting ? "Saving…" : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
