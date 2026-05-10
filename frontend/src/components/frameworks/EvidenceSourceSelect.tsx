import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, X } from "lucide-react";
import { listSections } from "../../api/sections";
import {
  WILDCARD,
  evidenceSourceSchema,
  isWildcard,
  type SectionEntry,
} from "../../lib/sections";

interface EvidenceSourceSelectProps {
  /** Current value. `["*"]` is the wildcard / whole-proposal form. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Direction the editor is rendered in. AR criterion -> rtl, EN -> ltr.
   * When omitted, defaults to ltr (English-first editor). */
  dir?: "ltr" | "rtl";
  /** Optional override of the section list — exposed so tests don't need
   * to mock the network. Production usage leaves this undefined and
   * the component fetches GET /sections itself. */
  availableSections?: SectionEntry[];
}

/** Phase-5 UI for `criterion.evidence_source`.
 *
 * Two modes, switched by the toggle at the top:
 *   - Whole proposal — binds to ["*"]. The picker is hidden.
 *   - Specific sections — binds to a list of canonical section keys.
 *     At least one must be selected; an empty selection is reported as
 *     a validation error and is also rejected by the backend.
 *
 * The chip picker shows EN + AR labels side-by-side (RTL-aware). Chips
 * use the KPMG palette: blue for selected, light gray for available.
 */
export function EvidenceSourceSelect({
  value,
  onChange,
  disabled = false,
  dir = "ltr",
  availableSections,
}: EvidenceSourceSelectProps) {
  const [fetched, setFetched] = useState<SectionEntry[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Lazy fetch — but only when the parent didn't pre-supply the list.
  useEffect(() => {
    if (availableSections) return;
    let cancelled = false;
    listSections()
      .then((r) => {
        if (!cancelled) setFetched(r.sections);
      })
      .catch(() => {
        if (!cancelled) setFetchError("Could not load section list");
      });
    return () => {
      cancelled = true;
    };
  }, [availableSections]);

  const sections: SectionEntry[] = availableSections ?? fetched ?? [];
  const allowedKeys = useMemo(() => sections.map((s) => s.key), [sections]);

  const wildcard = isWildcard(value);

  // Validation — surface the same error the backend will return so the
  // user sees the problem at edit time instead of submit time.
  const validation = useMemo(() => {
    if (allowedKeys.length === 0) return { ok: true as const };
    const result = evidenceSourceSchema(allowedKeys).safeParse(value);
    if (result.success) {
      // Extra rule for the UI: "Specific sections" mode requires ≥1.
      if (!wildcard && (value?.length ?? 0) === 0) {
        return { ok: false as const, message: "Pick at least one section." };
      }
      return { ok: true as const };
    }
    return {
      ok: false as const,
      message: result.error.issues.map((i) => i.message).join(" "),
    };
  }, [value, wildcard, allowedKeys]);

  const onToggleWildcard = (next: boolean) => {
    if (disabled) return;
    onChange(next ? [WILDCARD] : []);
  };

  const onToggleSection = (key: string) => {
    if (disabled || wildcard) return;
    const set = new Set(value);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    // Preserve the canonical order coming from the API rather than the
    // user's click order — keeps persisted values stable across edits.
    const ordered = allowedKeys.filter((k) => set.has(k));
    onChange(ordered);
  };

  const isRtl = dir === "rtl";

  return (
    <div
      className="space-y-2"
      dir={dir}
      data-testid="evidence-source-select"
    >
      <div className="flex items-center justify-between gap-2">
        <label
          className={clsx(
            "block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold",
            isRtl && "text-right",
          )}
        >
          {isRtl ? "مصدر الأدلة" : "Evidence source"}
        </label>

        {/* Whole-proposal toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={wildcard}
          disabled={disabled}
          onClick={() => onToggleWildcard(!wildcard)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-kpmg-mediumblue",
            wildcard
              ? "bg-kpmg-blue text-white shadow-card"
              : "bg-kpmg-gray-100 text-kpmg-gray-600 hover:bg-kpmg-gray-200",
            disabled && "opacity-60 cursor-not-allowed",
          )}
          data-testid="evidence-wildcard-toggle"
        >
          <span
            className={clsx(
              "h-3 w-3 rounded-full border",
              wildcard
                ? "bg-white border-white"
                : "bg-white border-kpmg-gray-300",
            )}
          />
          {isRtl ? "العرض بالكامل" : "Whole proposal"}
        </button>
      </div>

      {/* Helper text */}
      <p
        className={clsx(
          "text-[11px] text-kpmg-gray-500",
          isRtl && "text-right",
        )}
      >
        {wildcard
          ? isRtl
            ? "سيقوم الذكاء الاصطناعي بالتقييم مقابل العرض بأكمله."
            : "The AI evaluates this criterion against the entire proposal."
          : isRtl
            ? "اختر الأقسام التي يستند إليها هذا المعيار."
            : "Pick the sections this criterion is evaluated against."}
      </p>

      {/* Chip picker */}
      {!wildcard && (
        <div
          className={clsx(
            "rounded-lg border p-2 bg-white",
            validation.ok
              ? "border-kpmg-gray-200"
              : "border-kpmg-error/40 ring-1 ring-kpmg-error/30",
          )}
          data-testid="evidence-section-picker"
        >
          {fetchError ? (
            <p className="text-xs text-kpmg-error">{fetchError}</p>
          ) : sections.length === 0 ? (
            <p className="text-xs text-kpmg-gray-400">Loading sections…</p>
          ) : (
            <ul
              className={clsx(
                "flex flex-wrap gap-1.5",
                isRtl && "flex-row-reverse",
              )}
              role="listbox"
              aria-multiselectable="true"
            >
              {sections.map((s) => {
                const selected = value.includes(s.key);
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={disabled}
                      onClick={() => onToggleSection(s.key)}
                      data-testid={`evidence-chip-${s.key}`}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
                        "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-kpmg-mediumblue",
                        selected
                          ? "bg-kpmg-violet text-white border-kpmg-violet hover:bg-kpmg-purple"
                          : "bg-white text-kpmg-gray-600 border-kpmg-gray-200 hover:border-kpmg-mediumblue hover:text-kpmg-blue",
                        disabled && "opacity-60 cursor-not-allowed",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      <span className={isRtl ? "font-arabic" : ""}>
                        {isRtl ? s.label_ar || s.label_en : s.label_en}
                      </span>
                      {/* When selected and we have an x affordance —
                          dim secondary label for context. */}
                      {!isRtl && s.label_ar && (
                        <span className="text-[10px] opacity-70 font-arabic">
                          {s.label_ar}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Validation message */}
      {!validation.ok && (
        <p
          role="alert"
          className={clsx(
            "text-[11px] text-kpmg-error",
            isRtl && "text-right",
          )}
          data-testid="evidence-validation-error"
        >
          {validation.message}
        </p>
      )}

      {/* Compact summary (read-only / disabled view) */}
      {disabled && (
        <p
          className={clsx(
            "text-[11px] text-kpmg-gray-400",
            isRtl && "text-right",
          )}
        >
          {wildcard
            ? isRtl
              ? "العرض بالكامل"
              : "Whole proposal"
            : value.length === 0
              ? isRtl
                ? "لم يتم تحديد أقسام"
                : "No sections selected"
              : value.join(", ")}
          {/* x icon when there's something to clear, but disabled view
              never lets users act on it. */}
          {value.length > 0 && (
            <X className="inline-block h-3 w-3 opacity-0" aria-hidden />
          )}
        </p>
      )}
    </div>
  );
}
