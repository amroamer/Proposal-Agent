import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { FrameworkCriterion } from "../../api/frameworks";
import { EvidenceSourceSelect } from "./EvidenceSourceSelect";
import { WILDCARD } from "../../lib/sections";

interface CriterionCardProps {
  id: string;
  criterion: FrameworkCriterion;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<FrameworkCriterion>) => void;
  onRemove: () => void;
  canEdit: boolean;
  availableGroups: string[];
}

export function CriterionCard({
  id,
  criterion,
  index,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
  canEdit,
  availableGroups,
}: CriterionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Default to active for legacy criteria stored before the toggle existed.
  const isActive = criterion.active !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-lg border bg-white transition-opacity",
        isDragging
          ? "border-kpmg-blue/40 shadow-raise opacity-80 z-50"
          : isActive
            ? "border-kpmg-gray-100"
            : "border-dashed border-kpmg-gray-200 bg-kpmg-gray-50",
        !isActive && !isDragging && "opacity-70",
      )}
      data-criterion-active={isActive}
    >
      {/* Collapsed header row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        {/* Drag handle */}
        {canEdit && (
          <button
            type="button"
            className="p-1 text-kpmg-gray-300 hover:text-kpmg-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        {/* Number badge */}
        <span
          className={clsx(
            "h-6 w-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0",
            isActive ? "bg-kpmg-blue" : "bg-kpmg-gray-300",
          )}
        >
          {index + 1}
        </span>

        {/* Name EN */}
        <span
          className={clsx(
            "font-semibold text-sm truncate min-w-0",
            isActive
              ? "text-kpmg-blue"
              : "text-kpmg-gray-400 line-through decoration-kpmg-gray-300",
          )}
        >
          {criterion.name_en || criterion.name_ar || "Untitled"}
        </span>

        {/* Name AR (if present) */}
        {criterion.name_ar && (
          <span
            className={clsx(
              "text-sm font-arabic truncate min-w-0",
              isActive ? "text-kpmg-gray-400" : "text-kpmg-gray-300 line-through",
            )}
            dir="rtl"
          >
            {criterion.name_ar}
          </span>
        )}

        {/* Description preview */}
        <span className="text-xs text-kpmg-gray-400 truncate min-w-0 hidden md:inline">
          {criterion.description_en}
        </span>

        {/* Inactive badge — only shown when off, in the same slot the
            group badge would otherwise occupy. Keeps the row compact. */}
        {!isActive && (
          <span className="ml-auto text-[10px] uppercase tracking-wider text-kpmg-gray-500 bg-kpmg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 font-semibold">
            Inactive
          </span>
        )}

        {/* Group badge */}
        {isActive && criterion.group && (
          <span className="ml-auto text-[10px] uppercase tracking-wider text-kpmg-purple bg-kpmg-purple/10 px-2 py-0.5 rounded-full flex-shrink-0 font-semibold">
            {criterion.group}
          </span>
        )}

        {/* Active toggle — visible from the collapsed header so the
            operator can flip a criterion on/off without expanding it.
            Wrapped in a label so the click target is generous; stops
            propagation so it doesn't toggle the expand state. */}
        {canEdit && (
          <label
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              !isActive && !criterion.group ? "" : "ml-1",
              "inline-flex items-center cursor-pointer flex-shrink-0",
            )}
            title={isActive ? "Deactivate criterion" : "Activate criterion"}
          >
            <input
              type="checkbox"
              role="switch"
              className="sr-only peer"
              checked={isActive}
              onChange={(e) => onChange({ active: e.target.checked })}
              data-testid={`criterion-active-toggle-${id}`}
              aria-label={isActive ? "Deactivate criterion" : "Activate criterion"}
            />
            <span
              className={clsx(
                "relative inline-block h-4 w-7 rounded-full transition-colors",
                isActive ? "bg-kpmg-blue" : "bg-kpmg-gray-300",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-kpmg-mediumblue peer-focus-visible:ring-offset-1",
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                  isActive ? "translate-x-3.5" : "translate-x-0.5",
                )}
              />
            </span>
          </label>
        )}

        {/* Expand chevron */}
        <ChevronRight
          className={clsx(
            "h-4 w-4 text-kpmg-gray-400 flex-shrink-0 transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
      </div>

      {/* Expanded body */}
      <div
        className={clsx(
          "overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out",
          expanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-kpmg-gray-100">
          {/* Bilingual Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1">
                Name (English)
              </label>
              <input
                className="input-field text-sm font-semibold text-kpmg-blue"
                value={criterion.name_en}
                onChange={(e) => onChange({ name_en: e.target.value })}
                placeholder="Criterion name"
                disabled={!canEdit}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1 text-right">
                الاسم (عربي)
              </label>
              <input
                className="input-field text-sm font-semibold font-arabic text-right"
                value={criterion.name_ar}
                onChange={(e) => onChange({ name_ar: e.target.value })}
                placeholder="اسم المعيار"
                disabled={!canEdit}
                dir="rtl"
              />
            </div>
          </div>

          {/* Bilingual Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1">
                Description (English)
              </label>
              <textarea
                rows={2}
                className="input-field text-sm"
                value={criterion.description_en}
                onChange={(e) => onChange({ description_en: e.target.value })}
                placeholder="Short description for humans"
                disabled={!canEdit}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1 text-right">
                الوصف (عربي)
              </label>
              <textarea
                rows={2}
                className="input-field text-sm font-arabic text-right"
                value={criterion.description_ar}
                onChange={(e) => onChange({ description_ar: e.target.value })}
                placeholder="وصف مختصر"
                disabled={!canEdit}
                dir="rtl"
              />
            </div>
          </div>

          {/* Bilingual Prompt Instruction */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1">
                AI Prompt Instruction (English)
              </label>
              <textarea
                rows={4}
                className="input-field text-sm font-mono text-xs"
                value={criterion.prompt_instruction_en}
                onChange={(e) =>
                  onChange({ prompt_instruction_en: e.target.value })
                }
                placeholder="Tell the AI exactly how to evaluate this dimension"
                disabled={!canEdit}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1 text-right">
                تعليمات التقييم (عربي)
              </label>
              <textarea
                rows={4}
                className="input-field text-sm font-arabic text-right"
                value={criterion.prompt_instruction_ar}
                onChange={(e) =>
                  onChange({ prompt_instruction_ar: e.target.value })
                }
                placeholder="أخبر الذكاء الاصطناعي كيف يقيّم هذا البعد"
                disabled={!canEdit}
                dir="rtl"
              />
            </div>
          </div>

          {/* Evidence Source (Phase 5) — sits between prompt instruction
              and Section/Group, per spec. */}
          <EvidenceSourceSelect
            value={criterion.evidence_source ?? [WILDCARD]}
            onChange={(next) => onChange({ evidence_source: next })}
            disabled={!canEdit}
          />

          {/* Group + Delete row */}
          <div className="flex items-end gap-3 pt-1">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wider text-kpmg-gray-400 font-semibold mb-1">
                Section / Group
              </label>
              <div className="flex gap-2">
                <select
                  className="input-field text-sm flex-1"
                  value={criterion.group}
                  onChange={(e) => onChange({ group: e.target.value })}
                  disabled={!canEdit}
                >
                  <option value="">Ungrouped</option>
                  {availableGroups
                    .filter((g) => g !== "")
                    .map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="p-2 text-kpmg-gray-400 hover:text-kpmg-error rounded hover:bg-red-50 transition-colors"
                aria-label="Remove criterion"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
