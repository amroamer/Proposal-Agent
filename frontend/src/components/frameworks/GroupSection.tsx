import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import type { FrameworkCriterion } from "../../api/frameworks";
import { CriterionCard } from "./CriterionCard";

export interface CriterionWithKey extends FrameworkCriterion {
  _key: string;
  _globalIndex: number;
}

interface GroupSectionProps {
  groupName: string;
  criteria: CriterionWithKey[];
  expandedSet: Set<string>;
  onToggleExpand: (key: string) => void;
  onCriterionChange: (
    globalIndex: number,
    patch: Partial<FrameworkCriterion>,
  ) => void;
  onCriterionRemove: (globalIndex: number) => void;
  onAddCriterion: (group: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onDeleteGroup: (groupName: string) => void;
  canEdit: boolean;
  isCollapsed: boolean;
  onToggleGroupCollapse: () => void;
  availableGroups: string[];
}

export function GroupSection({
  groupName,
  criteria,
  expandedSet,
  onToggleExpand,
  onCriterionChange,
  onCriterionRemove,
  onAddCriterion,
  onRenameGroup,
  onDeleteGroup,
  canEdit,
  isCollapsed,
  onToggleGroupCollapse,
  availableGroups,
}: GroupSectionProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(groupName);
  const isUngrouped = groupName === "";
  const displayName = isUngrouped ? "Ungrouped" : groupName;

  const { setNodeRef } = useDroppable({
    id: `group-${groupName}`,
    data: { group: groupName },
  });

  const handleRenameSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== groupName) {
      onRenameGroup(groupName, trimmed);
    }
    setEditing(false);
  };

  const sortableIds = criteria.map((c) => c._key);

  return (
    <div className="space-y-1.5">
      {/* Group header */}
      <div className="flex items-center gap-2 py-1.5 px-1">
        <button
          type="button"
          className="p-0.5 text-kpmg-gray-400 hover:text-kpmg-gray-600"
          onClick={onToggleGroupCollapse}
          aria-label={isCollapsed ? "Expand group" : "Collapse group"}
        >
          <ChevronDown
            className={clsx(
              "h-4 w-4 transition-transform duration-200",
              isCollapsed && "-rotate-90",
            )}
          />
        </button>

        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              autoFocus
              className="input-field text-sm font-semibold py-0.5 flex-1"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button
              type="button"
              onClick={handleRenameSubmit}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-1 text-kpmg-gray-400 hover:bg-kpmg-gray-50 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-xs uppercase tracking-wider text-kpmg-gray-500 font-bold">
              {displayName}
            </span>
            <span className="text-[10px] text-kpmg-gray-400">
              ({criteria.length})
            </span>

            {canEdit && !isUngrouped && (
              <button
                type="button"
                onClick={() => {
                  setEditValue(groupName);
                  setEditing(true);
                }}
                className="p-1 text-kpmg-gray-300 hover:text-kpmg-gray-500"
                aria-label="Rename group"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}

            <div className="flex-1" />

            {canEdit && (
              <button
                type="button"
                onClick={() => onAddCriterion(groupName)}
                className="p-1 text-kpmg-gray-300 hover:text-kpmg-blue"
                aria-label="Add criterion to this group"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}

            {canEdit && !isUngrouped && (
              <button
                type="button"
                onClick={() => onDeleteGroup(groupName)}
                className="p-1 text-kpmg-gray-300 hover:text-kpmg-error"
                aria-label="Delete group (moves criteria to Ungrouped)"
                title="Delete group (moves criteria to Ungrouped)"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Group body */}
      {!isCollapsed && (
        <div ref={setNodeRef} className="space-y-1.5 min-h-[4px]">
          <SortableContext
            items={sortableIds}
            strategy={verticalListSortingStrategy}
          >
            {criteria.map((c) => (
              <CriterionCard
                key={c._key}
                id={c._key}
                criterion={c}
                index={c._globalIndex}
                expanded={expandedSet.has(c._key)}
                onToggleExpand={() => onToggleExpand(c._key)}
                onChange={(patch) => onCriterionChange(c._globalIndex, patch)}
                onRemove={() => onCriterionRemove(c._globalIndex)}
                canEdit={canEdit}
                availableGroups={availableGroups}
              />
            ))}
          </SortableContext>

          {criteria.length === 0 && (
            <div className="rounded border border-dashed border-kpmg-gray-200 py-3 text-center text-xs text-kpmg-gray-400">
              No criteria in this section. Drag items here or click + to add.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
