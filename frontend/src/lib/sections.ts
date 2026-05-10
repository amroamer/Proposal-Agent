import { z } from "zod";

/** Canonical section keys — must match SECTION_KEYS in
 * backend/app/services/proposal_review/section_mapping.py. The frontend
 * doesn't hardcode the order or labels — it fetches the live list from
 * GET /sections — but it does need the literal `"*"` wildcard symbol
 * and a TypeScript type for it. */
export const WILDCARD = "*";

export interface SectionEntry {
  key: string;
  label_en: string;
  label_ar: string;
}

export interface SectionsResponse {
  sections: SectionEntry[];
  wildcard: string;
}

/** Zod schema validating an `evidence_source` value before save.
 *
 * Rules (mirror backend `validate_evidence_source`):
 *   - `["*"]` is the wildcard form. It MUST be the only entry.
 *   - Any other value is a list of canonical section keys.
 *   - Empty list / undefined falls back to ["*"].
 *
 * Section keys are validated against the live list passed in (we don't
 * hardcode them on the frontend — single source of truth lives in the
 * Python `section_mapping`).
 */
export function evidenceSourceSchema(allowedKeys: readonly string[]) {
  return z
    .array(z.string())
    .transform((xs) => (xs.length === 0 ? [WILDCARD] : xs))
    .superRefine((xs, ctx) => {
      if (xs.includes(WILDCARD)) {
        if (xs.length !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Whole-proposal cannot be combined with specific sections. Pick one or the other.",
          });
        }
        return;
      }
      const allowed = new Set(allowedKeys);
      const bad = xs.filter((k) => !allowed.has(k));
      if (bad.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown section keys: ${bad.join(", ")}`,
        });
      }
    });
}

/** Convenience: is this evidence_source the wildcard form? */
export function isWildcard(value: readonly string[] | null | undefined): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === WILDCARD;
}
