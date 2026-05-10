import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceCoverageRow } from "./SourceCoverageRow";
import type { StructuredFinding } from "../../api/reviews";


function makeFinding(overrides: Partial<StructuredFinding> = {}): StructuredFinding {
  return {
    criterion_index: 0,
    criterion_name: "Value Proposition",
    score: 9,
    verdict: "strong",
    summary: "x",
    strengths: [
      { title: "s1", detail: "", slides_referenced: [12, 13] },
      { title: "s2", detail: "", slides_referenced: [40] },
    ],
    gaps: [],
    extra_recommendations: [],
    coverage: {
      slides_total: 177,
      slides_sent_min: 1,
      slides_sent_max: 38,
      chars_sent: 60_000,
      chars_total: 276_135,
      char_cap_hit: true,
    },
    ...overrides,
  };
}


describe("SourceCoverageRow", () => {
  it("shows reviewed range and cited count", () => {
    render(<SourceCoverageRow finding={makeFinding()} />);
    expect(screen.getByTestId("coverage-row")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-row")).toHaveTextContent(
      "slides 1–38 of 177",
    );
    expect(screen.getByTestId("coverage-row")).toHaveTextContent("3 slides");
  });

  it("warns when a citation is outside the reviewed window", () => {
    render(<SourceCoverageRow finding={makeFinding()} />);
    // Slide 40 is cited, but slides_sent_max=38 — so 1 citation is OOW.
    const warn = screen.getByTestId("coverage-out-of-window");
    expect(warn).toBeInTheDocument();
    expect(warn).toHaveTextContent("1 citation outside reviewed window");
  });

  it("does NOT warn when every citation is within the reviewed window", () => {
    render(
      <SourceCoverageRow
        finding={makeFinding({
          strengths: [{ title: "s", detail: "", slides_referenced: [10, 12] }],
          gaps: [],
        })}
      />,
    );
    expect(screen.queryByTestId("coverage-out-of-window")).not.toBeInTheDocument();
  });

  it("shows the Truncated chip when char_cap_hit is true", () => {
    render(<SourceCoverageRow finding={makeFinding()} />);
    expect(screen.getByTestId("coverage-row")).toHaveTextContent("Truncated");
  });

  it("does not show Truncated chip when the full doc fit", () => {
    render(
      <SourceCoverageRow
        finding={makeFinding({
          coverage: {
            slides_total: 5,
            slides_sent_min: 1,
            slides_sent_max: 5,
            chars_sent: 8_000,
            chars_total: 8_000,
            char_cap_hit: false,
          },
        })}
      />,
    );
    expect(screen.queryByText("Truncated")).not.toBeInTheDocument();
  });

  it("falls back to 'cited only' line when coverage is absent (legacy row)", () => {
    render(
      <SourceCoverageRow
        finding={makeFinding({ coverage: undefined })}
      />,
    );
    expect(screen.getByTestId("coverage-row-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-row-fallback")).toHaveTextContent(
      "slides 12, 13, 40",
    );
  });

  it("renders 'no slides' when nothing was cited", () => {
    render(
      <SourceCoverageRow
        finding={makeFinding({
          strengths: [{ title: "s", detail: "", slides_referenced: [] }],
          gaps: [],
        })}
      />,
    );
    expect(screen.getByTestId("coverage-row")).toHaveTextContent("none");
  });
});
