"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIELD_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/types";

interface Props {
  run: Run;
  doc: string | null;
  page: number;
  onPage: (p: number) => void;
  highlights: string[];
  selected: string | null;
  onSelect: (anchor: string) => void;
  bare?: boolean;
}

export function EvidenceViewer({ run, doc, page, onPage, highlights, selected, onSelect }: Props) {
  const meta = run.documents.find((d) => d.id === doc);
  const boxRef = useRef<HTMLButtonElement>(null);
  const onPageAnchors = useMemo(
    () => highlights.filter((a) => run.anchors[a]?.doc === doc && run.anchors[a]?.page === page),
    [highlights, run.anchors, doc, page],
  );

  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected, page, doc]);

  if (!meta) return null;
  const [w, h] = meta.pages[page] ?? meta.pages[0];
  const sel = selected ? run.anchors[selected] : null;
  const usedBy = selected ? run.anchors_index[selected] : null;
  const fieldOf = (a: string) => {
    const id = run.anchors_index[a]?.obs[0];
    const o = id ? run.loan_file.observations.find((x) => x.id === id) : null;
    if (!o) return null;
    const f = o.field.replace(/^(units|owners|members)\./, "");
    return FIELD_LABEL[f] ?? f.replaceAll("_", " ");
  };
  const box = (x0: number, y0: number, x1: number, y1: number) => ({
    left: `${((x0 - 2) / w) * 100}%`,
    top: `${((y0 - 1.5) / h) * 100}%`,
    width: `${((x1 - x0 + 4) / w) * 100}%`,
    height: `${((y1 - y0 + 3) / h) * 100}%`,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
        {meta.pages.length > 1 ? (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>
              <ChevronLeft />
            </Button>
            <span className="tabular">
              Page {page + 1} of {meta.pages.length}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= meta.pages.length - 1} onClick={() => onPage(page + 1)}>
              <ChevronRight />
            </Button>
          </>
        ) : (
          <span className="px-1">1 page</span>
        )}
        <a
          href={`/data/pages/${run.scenario}/${meta.id}.pdf`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"
        >
          Original PDF <ExternalLink className="size-3" />
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-secondary p-3">
        <div className="relative mx-auto w-full max-w-[680px] bg-white shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/data/pages/${run.scenario}/${meta.id}-p${page}.png`}
            alt={`${meta.title}, page ${page + 1}`}
            className="block h-auto w-full select-none"
            draggable={false}
          />
          {onPageAnchors.map((a) => {
            const [x0, y0, x1, y1] = run.anchors[a].bbox;
            const isSel = a === selected;
            const label = isSel ? fieldOf(a) : null;
            return (
              <span key={a} className="contents">
                {label && (
                  <span
                    className="pointer-events-none absolute z-10 -translate-y-full rounded-t-[3px] bg-amber-500 px-1.5 py-px text-[10px] font-medium whitespace-nowrap text-white"
                    style={{ left: `${((x0 - 2) / w) * 100}%`, top: `${((y0 - 1.5) / h) * 100}%` }}
                  >
                    {label}
                  </span>
                )}
                <button
                  ref={isSel ? boxRef : undefined}
                  type="button"
                  aria-label={`Evidence: ${run.anchors[a].text}`}
                  onClick={() => onSelect(a)}
                  className={cn(
                    "absolute rounded-[3px] transition-colors",
                    isSel ? "bg-amber-300/30 ring-2 ring-amber-500" : "bg-brand/[0.07] ring-1 ring-brand/40 hover:bg-brand/15",
                  )}
                  style={box(x0, y0, x1, y1)}
                />
              </span>
            );
          })}
        </div>
      </div>

      {sel && (
        <p className="px-1 text-[13px] text-muted-foreground">
          Printed <span className="font-medium text-foreground">“{sel.text}”</span>
          {sel.row_label && <> on the row “{sel.row_label}”</>}
          {usedBy && usedBy.cards.length > 0 && <>. Used by {usedBy.cards.length} review item{usedBy.cards.length > 1 ? "s" : ""}.</>}
        </p>
      )}
    </div>
  );
}
