import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideCitationDrawer, extractSlideText } from "./SlideCitationDrawer";

// downloadReviewFile / openReviewFile both hit `api.get` underneath.
// We mock the api module so the component renders without a network.
vi.mock("../../api/reviews", async () => {
  const actual = await vi.importActual<typeof import("../../api/reviews")>(
    "../../api/reviews",
  );
  return {
    ...actual,
    downloadReviewFile: vi.fn().mockResolvedValue(true),
    openReviewFile: vi.fn().mockResolvedValue(true),
  };
});


describe("extractSlideText", () => {
  const sample = `## Slide 1
Cover

## Slide 2
This is the executive summary.
Bullet point.

## Slide 3
Detailed approach.
`;

  it("returns the text between two slide markers", () => {
    expect(extractSlideText(sample, 2)).toContain("executive summary");
    expect(extractSlideText(sample, 2)).toContain("Bullet point.");
    expect(extractSlideText(sample, 2)).not.toContain("Detailed approach");
  });

  it("returns the trailing text for the last slide", () => {
    expect(extractSlideText(sample, 3)).toContain("Detailed approach.");
  });

  it("returns empty string for a missing slide", () => {
    expect(extractSlideText(sample, 99)).toBe("");
  });

  it("returns empty string when extractedText is falsy", () => {
    expect(extractSlideText("", 1)).toBe("");
  });

  it("handles Page markers (PDF source)", () => {
    const pdfSample = `## Page 1\nIntro\n\n## Page 2\nMain body\n`;
    expect(extractSlideText(pdfSample, 2)).toContain("Main body");
  });
});


describe("SlideCitationDrawer", () => {
  it("is translated off-screen when slide is null", () => {
    render(
      <SlideCitationDrawer
        reviewId={1}
        slide={null}
        onClose={vi.fn()}
        filename="deck.pptx"
      />,
    );
    // Drawer is in DOM (so the open transition can run) but translated
    // off-canvas via the translate-x-full class.
    const drawer = screen.getByTestId("slide-citation-drawer");
    expect(drawer.className).toContain("translate-x-full");
  });

  it("renders slide number and excerpt when open", () => {
    render(
      <SlideCitationDrawer
        reviewId={1}
        slide={{ number: 12, excerpt: "Sample excerpt from slide 12" }}
        onClose={vi.fn()}
        filename="deck.pptx"
      />,
    );
    expect(screen.getByText("Slide 12")).toBeInTheDocument();
    expect(screen.getByTestId("slide-excerpt")).toHaveTextContent(
      "Sample excerpt from slide 12",
    );
    expect(screen.getByText("deck.pptx")).toBeInTheDocument();
  });

  it("renders the empty-excerpt fallback when no text was extracted", () => {
    render(
      <SlideCitationDrawer
        reviewId={1}
        slide={{ number: 7, excerpt: "" }}
        onClose={vi.fn()}
        filename="deck.pptx"
      />,
    );
    expect(screen.getByTestId("slide-excerpt-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("slide-excerpt")).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <SlideCitationDrawer
        reviewId={1}
        slide={{ number: 1, excerpt: "x" }}
        onClose={onClose}
        filename="deck.pptx"
      />,
    );
    fireEvent.click(screen.getByLabelText("Close drawer"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
