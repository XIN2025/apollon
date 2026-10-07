"use client";

import { Maximize2, ScanLine } from "lucide-react";
import type { Run } from "@/lib/types";

export function EvidenceSnippet({ run, anchor, onOpen }: { run: Run; anchor: string; onOpen: (a: string) => void }) {
  const an = run.anchors[anchor];
  const doc = run.documents.find((d) => d.id === an?.doc);
  if (!an || !doc) return null;
  const [pw, ph] = doc.pages[an.page];
  const [x0, y0, x1, y1] = an.bbox;
  // Show the whole row band, from the left margin to just past the value, so the label and the number read together.
  const rx = Math.min(36, x0 - 8);
  const W = Math.min(pw - rx, Math.max(x1 + 48 - rx, 300));
  const H = Math.max(56, (y1 - y0) * 4.5);
  const ry = Math.min(Math.max((y0 + y1) / 2 - H / 2, 0), ph - H);
  const p = (v: number, d: number) => `${(v / d) * 100}%`;

  return (
    <button
      type="button"
      onClick={() => onOpen(anchor)}
      className="group relative block w-full overflow-hidden rounded-lg bg-white text-left ring-1 ring-border"
      style={{ aspectRatio: `${W / H}` }}
      aria-label={`Open the source page for “${an.text}”`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/data/pages/${run.scenario}/${doc.id}-p${an.page}.png`}
        alt=""
        className="absolute max-w-none select-none"
        style={{ width: p(pw, W), left: `-${p(rx, W)}`, top: `-${p(ry, H)}` }}
        draggable={false}
      />
      <span
        className="absolute rounded-[3px] bg-amber-300/30 ring-2 ring-amber-500"
        style={{ left: p(x0 - rx - 3, W), top: p(y0 - ry - 2, H), width: p(x1 - x0 + 6, W), height: p(y1 - y0 + 4, H) }}
      />
      <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <Maximize2 className="size-3" /> Open page
      </span>
      {an.ocr_score !== null && (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
          <ScanLine className="size-3" /> scanned · OCR {Math.round(an.ocr_score * 100)}%
        </span>
      )}
    </button>
  );
}
