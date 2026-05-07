import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthLayout } from "./layouts/AuthLayout";
import { AppShell } from "./layouts/AppShell";
import { SignInPage } from "./pages/SignIn";
import { SignUpPage } from "./pages/SignUp";
import { ForgotPasswordPage } from "./pages/ForgotPassword";
import { DashboardPage } from "./pages/Dashboard";

import { ProposalReviewPage } from "./pages/ProposalReview";
import { ReviewsListPage } from "./pages/ReviewsList";
import { ReviewDetailPage } from "./pages/ReviewDetail";
import { FrameworksPage } from "./pages/Frameworks";

import { KBListPage } from "./pages/KBList";
import { KBFormPage } from "./pages/KBForm";

import { TemplatesListPage } from "./pages/TemplatesList";
import { TemplateFormPage } from "./pages/TemplateForm";

import { ProposalsListPage } from "./pages/ProposalsList";
import { ProposalFormPage } from "./pages/ProposalForm";
import { ProposalViewPage } from "./pages/ProposalView";

import { UsersListPage } from "./pages/UsersList";
import { UserFormPage } from "./pages/UserForm";
import { UserDetailPage } from "./pages/UserDetail";

import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { ProfilePage } from "./pages/settings/Profile";
import { PasswordPage } from "./pages/settings/Password";
import { LLMPage } from "./pages/settings/LLM";

import { useAuthStore } from "./stores/auth";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken);
  if (!token) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken);
  if (token) return <Navigate to="/proposals/review" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter basename="/ProposalAgent">
      <Routes>
        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/signin" element={<RedirectIfAuth><SignInPage /></RedirectIfAuth>} />
          <Route path="/signup" element={<RedirectIfAuth><SignUpPage /></RedirectIfAuth>} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* App routes */}
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Proposal review (the AI review feature) */}
          <Route path="/proposals/review" element={<ProposalReviewPage />} />
          <Route path="/reviews" element={<ReviewsListPage />} />
          <Route path="/reviews/:id" element={<ReviewDetailPage />} />

          {/* Review frameworks */}
          <Route path="/frameworks" element={<FrameworksPage />} />

          {/* Knowledge base */}
          <Route path="/knowledge" element={<KBListPage />} />
          <Route path="/knowledge/new" element={<KBFormPage />} />
          <Route path="/knowledge/:id/edit" element={<KBFormPage />} />

          {/* Templates */}
          <Route path="/templates" element={<TemplatesListPage />} />
          <Route path="/templates/new" element={<TemplateFormPage />} />
          <Route path="/templates/:id/edit" element={<TemplateFormPage />} />

          {/* Proposals (CRUD). NOTE: order matters — /proposals/review and
              /proposals/new must come before /proposals/:id so they don't
              get parsed as IDs. */}
          <Route path="/proposals" element={<ProposalsListPage />} />
          <Route path="/proposals/new" element={<ProposalFormPage />} />
          <Route path="/proposals/:id/edit" element={<ProposalFormPage />} />
          <Route path="/proposals/:id" element={<ProposalViewPage />} />

          {/* Users (admin only — gated server-side; nav item hidden for non-admins) */}
          <Route path="/users" element={<UsersListPage />} />
          <Route path="/users/new" element={<UserFormPage />} />
          <Route path="/users/:id" element={<UserDetailPage />} />
          <Route path="/users/:id/edit" element={<UserFormPage />} />

          {/* Settings (with sub-routes) */}
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="password" element={<PasswordPage />} />
            <Route path="llm" element={<LLMPage />} />
          </Route>
        </Route>

        {/* Default */}
        <Route path="/" element={<Navigate to="/proposals/review" replace />} />
        <Route path="*" element={<Navigate to="/proposals/review" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
