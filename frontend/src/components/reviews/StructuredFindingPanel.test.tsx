import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StructuredFindingPanel } from "./StructuredFindingPanel";
import type { StructuredFinding } from "../../api/reviews";


function makeFinding(overrides: Partial<StructuredFinding> = {}): StructuredFinding {
  return {
    criterion_index: 1,
    criterion_name: "Value Proposition",
    score: 8.5,
    verdict: "strong",
    summary: "Strong, evidence-based.",
    strengths: [
      {
        title: "Contextual alignment to HHC",
        detail: "Maps capabilities to client needs.",
        slides_referenced: [12, 13],
      },
    ],
    gaps: [
      {
        title: "Missing KPIs",
        detail: "Outcomes not quantified.",
        recommendation: "Add a KPI table on slide 8.",
        severity: "medium",
        slides_referenced: [8],
      },
    ],
    extra_recommendations: ["Include a 90-day roadmap."],
    ...overrides,
  };
}


describe("StructuredFindingPanel — verdict rendering", () => {
  it("shows GREEN for verdict=strong", () => {
    render(<StructuredFindingPanel finding={makeFinding()} onSlideClick={vi.fn()} />);
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("GREEN");
  });

  it("shows AMBER for verdict=adequate", () => {
    render(
      <StructuredFindingPanel
        finding={makeFinding({ verdict: "adequate", score: 6.0 })}
        onSlideClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("AMBER");
  });

  it("shows RED for verdict=weak", () => {
    render(
      <StructuredFindingPanel
        finding={makeFinding({ verdict: "weak", score: 3.0 })}
        onSlideClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("RED");
  });

  it("renders the score with one decimal", () => {
    render(<StructuredFindingPanel finding={makeFinding()} onSlideClick={vi.fn()} />);
    expect(screen.getByText("8.5")).toBeInTheDocument();
  });
});


describe("StructuredFindingPanel — strengths and gaps panels", () => {
  it("renders the strengths panel with each strength's title and detail", () => {
    render(<StructuredFindingPanel finding={makeFinding()} onSlideClick={vi.fn()} />);
    expect(screen.getByTestId("strengths-panel")).toBeInTheDocument();
    expect(screen.getByText("Contextual alignment to HHC")).toBeInTheDocument();
    expect(screen.getByText("Maps capabilities to client needs.")).toBeInTheDocument();
  });

  it("renders the gaps panel with severity tag, detail, and recommendation", () => {
    render(<StructuredFindingPanel finding={makeFinding()} onSlideClick={vi.fn()} />);
    const gaps = screen.getByTestId("gaps-panel");
    expect(gaps).toBeInTheDocument();
    expect(gaps).toHaveTextContent("MEDIUM");
    expect(gaps).toHaveTextContent("Missing KPIs");
    expect(gaps).toHaveTextContent("Add a KPI table on slide 8.");
  });

  it("renders the extras panel only when extra_recommendations is non-empty", () => {
    const { rerender } = render(
      <StructuredFindingPanel finding={makeFinding()} onSlideClick={vi.fn()} />,
    );
    expect(screen.getByTestId("extra-rec-panel")).toBeInTheDocument();

    rerender(
      <StructuredFindingPanel
        finding={makeFinding({ extra_recommendations: [] })}
        onSlideClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("extra-rec-panel")).not.toBeInTheDocument();
  });

  it("renders an empty-state message when there are no strengths", () => {
    render(
      <StructuredFindingPanel
        finding={makeFinding({ strengths: [] })}
        onSlideClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/no strengths called out/i)).toBeInTheDocument();
  });

  it("renders an empty-state message when there are no gaps", () => {
    render(
      <StructuredFindingPanel
        finding={makeFinding({ gaps: [] })}
        onSlideClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/no gaps identified/i)).toBeInTheDocument();
  });
});


describe("StructuredFindingPanel — slide chips", () => {
  it("renders a chip per slide in slides_referenced", () => {
    render(<StructuredFindingPanel finding={makeFinding()} onSlideClick={vi.fn()} />);
    // Strength has slides 12 and 13; gap has slide 8.
    expect(screen.getByTestId("slide-chip-12")).toBeInTheDocument();
    expect(screen.getByTestId("slide-chip-13")).toBeInTheDocument();
    expect(screen.getByTestId("slide-chip-8")).toBeInTheDocument();
  });

  it("calls onSlideClick with the slide number when a chip is clicked", () => {
    const onSlideClick = vi.fn();
    render(<StructuredFindingPanel finding={makeFinding()} onSlideClick={onSlideClick} />);
    fireEvent.click(screen.getByTestId("slide-chip-12"));
    expect(onSlideClick).toHaveBeenCalledWith(12);
    fireEvent.click(screen.getByTestId("slide-chip-8"));
    expect(onSlideClick).toHaveBeenCalledWith(8);
  });

  it("renders nothing when slides_referenced is empty", () => {
    render(
      <StructuredFindingPanel
        finding={makeFinding({
          strengths: [{ title: "x", detail: "", slides_referenced: [] }],
          gaps: [],
        })}
        onSlideClick={vi.fn()}
      />,
    );
    // No chips at all.
    expect(screen.queryByTestId(/^slide-chip-/)).not.toBeInTheDocument();
  });
});
