import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, X } from "lucide-react";
import clsx from "clsx";
import { downloadReviewFile, openReviewFile } from "../../api/reviews";

interface SlideCitationDrawerProps {
  /** Review id used to look up the original file. */
  reviewId: number;
  /** When set, the drawer is open and showing this slide's context. */
  slide: SlideContext | null;
  onClose: () => void;
  /** Original filename — shown in the header so the operator knows
   *  what file the download button will produce. */
  filename: string;
}

export interface SlideContext {
  /** Slide / page number, 1-based. */
  number: number;
  /** Plain-text excerpt from the proposal at this slide, if available.
   *  We extract it from the review's `extracted_text` blob in the
   *  parent component using the standard `## Slide N` markers. */
  excerpt: string;
}


export function SlideCitationDrawer({
  reviewId,
  slide,
  onClose,
  filename,
}: SlideCitationDrawerProps) {
  const [busy, setBusy] = useState<"download" | "view" | "">("");
  const [err, setErr] = useState<string | null>(null);

  // Close on Escape — keeps the drawer keyboard-friendly.
  useEffect(() => {
    if (!slide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slide, onClose]);

  const onDownload = async () => {
    setBusy("download");
    setErr(null);
    try {
      await downloadReviewFile(reviewId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Download failed";
      setErr(msg);
    } finally {
      setBusy("");
    }
  };

  const onView = async () => {
    setBusy("view");
    setErr(null);
    try {
      await openReviewFile(reviewId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Open failed";
      setErr(msg);
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-black/30 transition-opacity",
          slide ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={clsx(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-raise",
          "transform transition-transform duration-200 ease-in-out",
          slide ? "translate-x-0" : "translate-x-full",
          "flex flex-col",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Slide citation"
        data-testid="slide-citation-drawer"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-pa-line">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-pa-muted mb-1">
              Source citation
            </div>
            <div className="text-[20px] font-bold text-kpmg-blue tabular-nums leading-none">
              Slide {slide?.number ?? "—"}
            </div>
            <div className="text-[11.5px] text-pa-muted truncate mt-1.5" title={filename}>
              {filename}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-pa-muted hover:bg-pa-cream"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Excerpt */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-[0.1em] uppercase text-pa-muted mb-2">
            <FileText className="h-3.5 w-3.5" />
            Excerpt
          </div>
          {slide?.excerpt ? (
            <pre
              className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-pa-body bg-pa-cream-soft border border-pa-line rounded-lg p-3"
              data-testid="slide-excerpt"
            >
              {slide.excerpt}
            </pre>
          ) : (
            <div className="text-[12.5px] text-pa-muted italic" data-testid="slide-excerpt-empty">
              No text could be extracted for this slide. Open the original
              file to inspect it.
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-pa-line flex flex-col gap-2">
          {err && (
            <div className="text-[11px] text-pa-danger leading-tight" role="alert">
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onView}
              disabled={busy !== ""}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-pa-line bg-white text-pa-ink text-[12px] font-bold hover:bg-pa-cream disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Open the original file in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {busy === "view" ? "Opening…" : "Open original"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={busy !== ""}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-kpmg-blue text-white text-[12px] font-bold hover:bg-kpmg-mediumblue disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Download the original file"
            >
              <Download className="h-3.5 w-3.5" />
              {busy === "download" ? "Saving…" : "Download"}
            </button>
          </div>
          <p className="text-[10.5px] text-pa-muted text-center">
            Desktop PowerPoint will open at slide 1; navigate to the cited
            slide manually. Web preview jumps to the cited slide directly.
          </p>
        </div>
      </aside>
    </>
  );
}


/** Pull a slide's text out of the review's flat `extracted_text` blob.
 *  The parser used `## Slide N` (or `## Page N` for PDFs) as section
 *  separators when extracting; we cut on those markers and return the
 *  slice that belongs to the requested slide. */
export function extractSlideText(extractedText: string, slideNumber: number): string {
  if (!extractedText) return "";
  const re = new RegExp(`##\\s+(?:Slide|Page)\\s+${slideNumber}\\b`);
  const start = extractedText.search(re);
  if (start < 0) return "";
  // Skip the marker line itself.
  const afterMarker = extractedText.indexOf("\n", start);
  if (afterMarker < 0) return "";
  // Find the next slide/page marker so we know where to stop.
  const nextRe = /##\s+(?:Slide|Page)\s+\d+/g;
  nextRe.lastIndex = afterMarker;
  const next = nextRe.exec(extractedText);
  const end = next ? next.index : extractedText.length;
  return extractedText.slice(afterMarker, end).trim();
}
