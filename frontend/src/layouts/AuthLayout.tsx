import { Outlet } from "react-router-dom";
import { Check } from "lucide-react";

// Auth split layout — pixel-mirror of the prototype's split layout, with
// the KPMG Blue palette substituted for the prototype's indigo-violet.
// Stacks vertically below the `md` breakpoint so it stays usable on
// narrow viewports.
export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-pa-cream font-sans text-pa-ink">
      {/* Branding panel */}
      <div
        className="md:w-1/2 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden min-h-[260px]"
        style={{
          background:
            "linear-gradient(160deg, #00338D 0%, #005EB8 60%, #0091DA 100%)",
        }}
      >
        {/* Soft halos */}
        <div
          aria-hidden
          className="absolute right-[-80px] bottom-[-80px] w-[280px] h-[280px] rounded-full bg-white/[0.08] pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute right-[60px] top-[80px] w-[140px] h-[140px] rounded-full bg-white/[0.06] pointer-events-none"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[9px] bg-white/20 flex items-center justify-center shrink-0">
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <div className="text-[15px] font-bold tracking-[-0.2px]">Proposal Agent</div>
        </div>

        <div className="relative max-w-[420px]">
          <h1 className="text-3xl md:text-[34px] font-bold leading-tight tracking-[-0.5px] mb-4">
            Audit every proposal before it leaves the room.
          </h1>
          <p className="text-[14px] text-white/90 leading-relaxed">
            Diagnostic logic, strategic prompts, and a readiness index — built for the partners
            who can&apos;t afford a misstep.
          </p>
        </div>

        <div className="relative text-[11.5px] text-white/75 tracking-[0.18em] uppercase">
          v2.4 · Atlas release
        </div>
      </div>

      {/* Form panel */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
