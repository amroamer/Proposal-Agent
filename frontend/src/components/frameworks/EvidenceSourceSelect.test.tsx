import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvidenceSourceSelect } from "./EvidenceSourceSelect";
import { WILDCARD, type SectionEntry } from "../../lib/sections";

// Synthetic section list — the component prefers `availableSections`
// over fetching, so tests don't need to mock the network.
const sections: SectionEntry[] = [
  { key: "executive_summary",   label_en: "Executive Summary",   label_ar: "الملخص التنفيذي" },
  { key: "team_structure",      label_en: "Org Structure & CVs", label_ar: "الهيكل التنظيمي والسير الذاتية" },
  { key: "detailed_experience", label_en: "Detailed Experience", label_ar: "الخبرات التفصيلية" },
];

function setup(initial: string[] = [WILDCARD], dir: "ltr" | "rtl" = "ltr") {
  const onChange = vi.fn();
  const utils = render(
    <EvidenceSourceSelect
      value={initial}
      onChange={onChange}
      availableSections={sections}
      dir={dir}
    />,
  );
  return { onChange, ...utils };
}


describe("EvidenceSourceSelect — toggle behaviour", () => {
  it("renders the toggle in 'Whole proposal' mode by default", () => {
    setup([WILDCARD]);
    const toggle = screen.getByTestId("evidence-wildcard-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    // Picker is hidden in wildcard mode.
    expect(screen.queryByTestId("evidence-section-picker")).not.toBeInTheDocument();
  });

  it("switches to specific-sections mode and emits an empty list", async () => {
    const { onChange } = setup([WILDCARD]);
    const toggle = screen.getByTestId("evidence-wildcard-toggle");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("renders chips when value is a specific list", () => {
    setup(["team_structure"]);
    expect(screen.getByTestId("evidence-section-picker")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-chip-team_structure")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("evidence-chip-executive_summary")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("toggles a chip and emits the canonical-ordered list", async () => {
    const { onChange } = setup(["team_structure"]);
    await userEvent.click(screen.getByTestId("evidence-chip-executive_summary"));
    // Order MUST follow the canonical order from the API, not click order.
    expect(onChange).toHaveBeenLastCalledWith([
      "executive_summary",
      "team_structure",
    ]);
  });

  it("clicking a selected chip removes it", async () => {
    const { onChange } = setup(["team_structure", "detailed_experience"]);
    await userEvent.click(screen.getByTestId("evidence-chip-team_structure"));
    expect(onChange).toHaveBeenLastCalledWith(["detailed_experience"]);
  });

  it("toggle back to wildcard emits ['*']", async () => {
    const { onChange } = setup(["team_structure"]);
    await userEvent.click(screen.getByTestId("evidence-wildcard-toggle"));
    expect(onChange).toHaveBeenLastCalledWith([WILDCARD]);
  });
});


describe("EvidenceSourceSelect — validation states", () => {
  it("shows an error when no sections are selected in specific-sections mode", () => {
    setup([]);
    expect(screen.getByTestId("evidence-validation-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one section/i);
  });

  it("clears the error once a section is selected", () => {
    const { rerender } = render(
      <EvidenceSourceSelect
        value={[]}
        onChange={() => {}}
        availableSections={sections}
      />,
    );
    expect(screen.queryByTestId("evidence-validation-error")).toBeInTheDocument();

    rerender(
      <EvidenceSourceSelect
        value={["team_structure"]}
        onChange={() => {}}
        availableSections={sections}
      />,
    );
    expect(screen.queryByTestId("evidence-validation-error")).not.toBeInTheDocument();
  });

  it("does not show error in wildcard mode", () => {
    setup([WILDCARD]);
    expect(screen.queryByTestId("evidence-validation-error")).not.toBeInTheDocument();
  });
});


describe("EvidenceSourceSelect — RTL rendering", () => {
  it("applies dir=rtl to the root and uses Arabic labels", () => {
    setup(["team_structure"], "rtl");
    const root = screen.getByTestId("evidence-source-select");
    expect(root).toHaveAttribute("dir", "rtl");
    // Arabic toggle copy
    expect(screen.getByTestId("evidence-wildcard-toggle")).toHaveTextContent(
      "العرض بالكامل",
    );
    // Arabic chip label for team_structure
    expect(screen.getByTestId("evidence-chip-team_structure")).toHaveTextContent(
      "الهيكل التنظيمي والسير الذاتية",
    );
  });

  it("applies dir=ltr by default", () => {
    setup([WILDCARD]);
    const root = screen.getByTestId("evidence-source-select");
    expect(root).toHaveAttribute("dir", "ltr");
    expect(screen.getByTestId("evidence-wildcard-toggle")).toHaveTextContent(
      "Whole proposal",
    );
  });
});


describe("EvidenceSourceSelect — disabled state", () => {
  it("disables the wildcard toggle and chips", () => {
    const onChange = vi.fn();
    render(
      <EvidenceSourceSelect
        value={["team_structure"]}
        onChange={onChange}
        availableSections={sections}
        disabled
      />,
    );
    const toggle = screen.getByTestId("evidence-wildcard-toggle");
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();

    const chip = screen.getByTestId("evidence-chip-team_structure");
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(onChange).not.toHaveBeenCalled();
  });
});
