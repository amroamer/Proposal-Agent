import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Branding panel */}
      <div className="md:w-1/2 bg-gradient-to-br from-kpmg-blue via-kpmg-purple to-kpmg-violet
                      text-white p-8 md:p-12 flex flex-col justify-between">
        <div>
          <div className="text-4xl font-bold tracking-tight">KPMG</div>
          <div className="mt-1 text-sm text-blue-200">Saudi Arabia | Advisory</div>
        </div>
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Proposal Agent</h1>
          <p className="text-lg text-blue-100 max-w-md">
            AI-powered consulting proposal generation. From RFP to submission-ready deck in days, not weeks.
          </p>
        </div>
        <div className="text-xs text-blue-200">
          © {new Date().getFullYear()} KPMG Professional Services. Confidential — Internal Use Only.
        </div>
      </div>

      {/* Form panel */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-kpmg-gray-50">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
