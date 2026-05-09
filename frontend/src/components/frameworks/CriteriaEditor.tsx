import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FolderPlus,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import type { FrameworkCriterion } from "../../api/frameworks";
import { GroupSection, type CriterionWithKey } from "./GroupSection";

interface CriteriaEditorProps {
  criteria: FrameworkCriterion[];
  onChange: (criteria: FrameworkCriterion[]) => void;
  canEdit: boolean;
  onImport: () => void;
  onAutoGenClick: () => void;
  autoGenLoading: boolean;
}

/** Stable key map — assign a unique key per criterion on mount/change. */
let keyCounter = 0;
function nextKey() {
  return `c-${++keyCounter}`;
}

export function CriteriaEditor({
  criteria,
  onChange,
  canEdit,
  onImport,
  onAutoGenClick,
  autoGenLoading,
}: CriteriaEditorProps) {
  // Stable keys for each criterion (regenerated when criteria array ref changes from parent)
  const [keyMap, setKeyMap] = useState<string[]>(() =>
    criteria.map(() => nextKey()),
  );

  // Sync keys when parent criteria length changes (add/remove/import/load)
  if (keyMap.length !== criteria.length) {
    const next = criteria.map((_, i) => keyMap[i] ?? nextKey());
    setKeyMap(next);
  }

  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [newGroupInput, setNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Derive groups in order of first appearance, "" (Ungrouped) always last
  const { groups, groupedCriteria, allGroupNames } = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const grouped: Record<string, CriterionWithKey[]> = {};

    criteria.forEach((c, i) => {
      const g = c.group || "";
      if (!seen.has(g)) {
        seen.add(g);
        ordered.push(g);
        grouped[g] = [];
      }
      grouped[g].push({ ...c, _key: keyMap[i] ?? `tmp-${i}`, _globalIndex: i });
    });

    // Ensure "" is always last
    const withoutEmpty = ordered.filter((g) => g !== "");
    const finalOrder = seen.has("")
      ? [...withoutEmpty, ""]
      : [...withoutEmpty];

    // If no criteria exist, show ungrouped
    if (finalOrder.length === 0) finalOrder.push("");
    if (!grouped[""]) grouped[""] = [];

    return {
      groups: finalOrder,
      groupedCriteria: grouped,
      allGroupNames: [...new Set(criteria.map((c) => c.group || ""))],
    };
  }, [criteria, keyMap]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = keyMap.indexOf(active.id as string);
    const newIndex = keyMap.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newCriteria = arrayMove([...criteria], oldIndex, newIndex);
    const newKeys = arrayMove([...keyMap], oldIndex, newIndex);

    // If dropped on an item in a different group, update the group
    const targetGroup = newCriteria[newIndex]?.group;
    const sourceGroup = criteria[oldIndex]?.group;
    if (targetGroup !== undefined && targetGroup !== sourceGroup) {
      // Find what group the item at newIndex belonged to (the items around it)
      const neighborGroup =
        newIndex > 0
          ? newCriteria[newIndex - 1]?.group
          : newCriteria[newIndex + 1]?.group;
      if (neighborGroup !== undefined) {
        newCriteria[newIndex] = {
          ...newCriteria[newIndex],
          group: neighborGroup,
        };
      }
    }

    setKeyMap(newKeys);
    onChange(newCriteria);
  };

  // Expand/collapse
  const toggleExpand = (key: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedSet(new Set(keyMap));
  const collapseAll = () => setExpandedSet(new Set());

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  // Criterion mutations
  const updateCriterion = (
    globalIndex: number,
    patch: Partial<FrameworkCriterion>,
  ) => {
    const next = criteria.map((c, i) =>
      i === globalIndex ? { ...c, ...patch } : c,
    );
    onChange(next);
  };

  const removeCriterion = (globalIndex: number) => {
    const next = criteria.filter((_, i) => i !== globalIndex);
    const nextKeys = keyMap.filter((_, i) => i !== globalIndex);
    setKeyMap(nextKeys);
    onChange(next);
  };

  const addCriterion = (group: string = "") => {
    const blank: FrameworkCriterion = {
      name_en: "",
      name_ar: "",
      description_en: "",
      description_ar: "",
      prompt_instruction_en: "",
      prompt_instruction_ar: "",
      group,
    };
    const newKey = nextKey();
    setKeyMap([...keyMap, newKey]);
    setExpandedSet((prev) => new Set(prev).add(newKey));
    onChange([...criteria, blank]);
  };

  // Group mutations
  const renameGroup = (oldName: string, newName: string) => {
    const next = criteria.map((c) =>
      c.group === oldName ? { ...c, group: newName } : c,
    );
    onChange(next);
    // Update collapsed state
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(oldName)) {
        next.delete(oldName);
        next.add(newName);
      }
      return next;
    });
  };

  const deleteGroup = (groupName: string) => {
    // Move all criteria in this group to ungrouped
    const next = criteria.map((c) =>
      c.group === groupName ? { ...c, group: "" } : c,
    );
    onChange(next);
  };

  const createNewGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setNewGroupInput(false);
    setNewGroupName("");
    // Add a blank criterion in the new group
    addCriterion(trimmed);
  };

  const activeCriterion = activeDragId
    ? criteria[keyMap.indexOf(activeDragId)]
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider text-kpmg-gray-400 font-semibold">
          Diagnostic Prompt Logic
        </div>
        {criteria.length > 0 && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={expandAll}
              className="text-[10px] text-kpmg-gray-400 hover:text-kpmg-blue flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-kpmg-gray-50"
            >
              <ChevronsUpDown className="h-3 w-3" />
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="text-[10px] text-kpmg-gray-400 hover:text-kpmg-blue flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-kpmg-gray-50"
            >
              <ChevronsDownUp className="h-3 w-3" />
              Collapse all
            </button>
          </div>
        )}
      </div>

      {criteria.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-kpmg-gray-200 p-6 text-center text-sm text-kpmg-gray-500">
          No criteria yet. Use the buttons below to add some.
        </div>
      )}

      {criteria.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-4">
            {groups.map((groupName) => (
              <GroupSection
                key={groupName || "__ungrouped__"}
                groupName={groupName}
                criteria={groupedCriteria[groupName] || []}
                expandedSet={expandedSet}
                onToggleExpand={toggleExpand}
                onCriterionChange={updateCriterion}
                onCriterionRemove={removeCriterion}
                onAddCriterion={addCriterion}
                onRenameGroup={renameGroup}
                onDeleteGroup={deleteGroup}
                canEdit={canEdit}
                isCollapsed={collapsedGroups.has(groupName)}
                onToggleGroupCollapse={() => toggleGroupCollapse(groupName)}
                availableGroups={allGroupNames}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDragId && activeCriterion ? (
              <div className="rounded-lg border border-kpmg-blue/40 bg-white shadow-raise px-3 py-2 flex items-center gap-2 rotate-1 max-w-md">
                <span className="h-6 w-6 rounded-full bg-kpmg-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {keyMap.indexOf(activeDragId) + 1}
                </span>
                <span className="font-semibold text-kpmg-blue text-sm truncate">
                  {activeCriterion.name_en ||
                    activeCriterion.name_ar ||
                    "Untitled"}
                </span>
                {activeCriterion.group && (
                  <span className="text-[10px] uppercase tracking-wider text-kpmg-purple bg-kpmg-purple/10 px-2 py-0.5 rounded-full flex-shrink-0 font-semibold">
                    {activeCriterion.group}
                  </span>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Action buttons */}
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addCriterion("")}
            className="btn-secondary border-dashed"
          >
            <Plus className="h-4 w-4 mr-2" />
            Define dimension
          </button>

          {newGroupInput ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                className="input-field text-sm py-1.5 px-3 w-full sm:w-44"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createNewGroup();
                  if (e.key === "Escape") {
                    setNewGroupInput(false);
                    setNewGroupName("");
                  }
                }}
                placeholder="Section name..."
              />
              <button
                type="button"
                onClick={createNewGroup}
                className="btn-primary text-sm py-1.5"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewGroupInput(false);
                  setNewGroupName("");
                }}
                className="btn-secondary text-sm py-1.5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNewGroupInput(true)}
              className="btn-secondary border-dashed"
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              New section
            </button>
          )}

          <button
            type="button"
            onClick={onImport}
            className="btn-secondary border-dashed"
          >
            <Copy className="h-4 w-4 mr-2" />
            Import existing
          </button>

          <button
            type="button"
            onClick={onAutoGenClick}
            disabled={autoGenLoading}
            className="btn-secondary border-dashed"
          >
            {autoGenLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Auto-gen...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Auto-gen (file)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
