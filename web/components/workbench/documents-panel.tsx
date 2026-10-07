"use client";

import { AlertCircle, ScanLine, Sparkles } from "lucide-react";
import { DocIcon } from "@/components/doc-icon";
import { DOC_TYPE_LABEL } from "@/lib/format";
import type { Run } from "@/lib/types";

export function DocumentsPanel({ run, onDoc }: { run: Run; onDoc: (d: string) => void }) {
  const lf = run.loan_file;
  const calls = run.cost.model_calls_recorded;
  const cardsFor = (doc: string) => run.cards.filter((c) => c.observations.some((o) => o.doc === doc));
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {run.documents.map((d) => {
        const ex = lf.extraction[d.id];
        const values = lf.observations.filter((o) => o.doc_id === d.id).length;
        const scanned = Object.values(run.anchors).some((a) => a.doc === d.id && a.ocr_score !== null);
        const model = calls.find((c) => c.task === "picks" && c.doc === d.id)?.model?.split("/").pop();
        const flagged = cardsFor(d.id);
        const unresolved = ex?.unresolved.length ?? 0;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onDoc(d.id)}
            className="group overflow-hidden rounded-2xl bg-card text-left ring-1 ring-border transition-shadow hover:shadow-lg hover:ring-brand/40"
          >
            <div className="relative h-36 overflow-hidden bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/data/pages/${run.scenario}/${d.id}-p0.png`}
                alt=""
                className="absolute inset-x-3 top-3 w-[calc(100%-24px)] rounded-t-md shadow-sm ring-1 ring-black/5 transition-transform group-hover:-translate-y-1"
              />
              <span className="absolute top-2 left-2 rounded-full bg-card/90 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground ring-1 ring-border">#{d.seq}</span>
              {flagged.length > 0 && (
                <span className="absolute top-2 right-2 flex gap-1 rounded-full bg-card/90 px-1.5 py-1 ring-1 ring-border" title={`${flagged.length} review item${flagged.length > 1 ? "s" : ""}`}>
                  {flagged.map((c) => (
                    <span key={c.id} className={c.axes.includes("decision") ? "size-2 rounded-full bg-fail" : "size-2 rounded-full bg-warn"} />
                  ))}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 p-3.5">
              <DocIcon type={d.type} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{DOC_TYPE_LABEL[d.type] ?? d.type}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="tabular rounded-full bg-secondary px-1.5 py-px text-muted-foreground">{values} values</span>
                  {scanned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-px text-muted-foreground">
                      <ScanLine className="size-3" /> scan
                    </span>
                  )}
                  {model && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-model/10 px-1.5 py-px text-model" title={`AI pointed at the cells: ${model}`}>
                      <Sparkles className="size-3" /> AI
                    </span>
                  )}
                  {unresolved > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-1.5 py-px text-warn" title={ex!.unresolved.join(", ")}>
                      <AlertCircle className="size-3" /> {unresolved} unresolved
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
