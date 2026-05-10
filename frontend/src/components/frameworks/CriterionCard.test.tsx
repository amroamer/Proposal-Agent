import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { CriterionCard } from "./CriterionCard";
import type { FrameworkCriterion } from "../../api/frameworks";

// CriterionCard relies on @dnd-kit's sortable context. Wrap in the
// minimal providers it expects so the component renders in tests.
function renderCard(opts: {
  criterion: FrameworkCriterion;
  expanded?: boolean;
  onChange?: (patch: Partial<FrameworkCriterion>) => void;
}) {
  const onChange = opts.onChange ?? vi.fn();
  return {
    onChange,
    ...render(
      <DndContext>
        <SortableContext items={["c-1"]}>
          <CriterionCard
            id="c-1"
            criterion={opts.criterion}
            index={0}
            expanded={opts.expanded ?? false}
            onToggleExpand={() => {}}
            onChange={onChange}
            onRemove={() => {}}
            canEdit
            availableGroups={["Team", "Strategy"]}
          />
        </SortableContext>
      </DndContext>,
    ),
  };
}

const baseCriterion: FrameworkCriterion = {
  name_en: "Value Proposition",
  name_ar: "عرض القيمة",
  description_en: "Eval value proposition",
  description_ar: "",
  prompt_instruction_en: "evaluate",
  prompt_instruction_ar: "",
  group: "Strategy",
};


describe("CriterionCard active toggle", () => {
  it("renders the toggle switch in the collapsed header", () => {
    renderCard({ criterion: baseCriterion });
    const toggle = screen.getByTestId("criterion-active-toggle-c-1");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeChecked(); // default-active
  });

  it("emits active=false when toggled off", () => {
    const { onChange } = renderCard({
      criterion: { ...baseCriterion, active: true },
    });
    fireEvent.click(screen.getByTestId("criterion-active-toggle-c-1"));
    expect(onChange).toHaveBeenCalledWith({ active: false });
  });

  it("emits active=true when toggled on", () => {
    const { onChange } = renderCard({
      criterion: { ...baseCriterion, active: false },
    });
    fireEvent.click(screen.getByTestId("criterion-active-toggle-c-1"));
    expect(onChange).toHaveBeenCalledWith({ active: true });
  });

  it("legacy criteria (no `active` key) default to checked", () => {
    // Deliberately omit `active` to simulate pre-V018 storage shape.
    const legacy = { ...baseCriterion };
    renderCard({ criterion: legacy });
    expect(screen.getByTestId("criterion-active-toggle-c-1")).toBeChecked();
  });

  it("inactive criteria render with strikethrough name and Inactive badge", () => {
    const { container } = renderCard({
      criterion: { ...baseCriterion, active: false },
    });
    // Strikethrough class on the name span
    const name = screen.getByText("Value Proposition");
    expect(name.className).toContain("line-through");
    // Inactive badge is shown
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    // Group badge is HIDDEN when inactive — scope to the collapsed
    // header to ignore the dropdown's <option> elements that always
    // exist in the DOM regardless of expand state.
    const header = container.querySelector(".cursor-pointer");
    expect(header?.textContent).not.toContain("Strategy");
    // Card root has data-criterion-active=false
    const root = container.querySelector("[data-criterion-active]");
    expect(root).toHaveAttribute("data-criterion-active", "false");
  });

  it("active criteria show the group badge, not Inactive", () => {
    const { container } = renderCard({ criterion: { ...baseCriterion, active: true } });
    const header = container.querySelector(".cursor-pointer");
    // Group badge text appears in the collapsed header
    expect(header?.textContent).toContain("Strategy");
    // No Inactive badge anywhere on the card
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });
});
