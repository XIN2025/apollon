"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Calculator, Check, ChevronDown, ChevronUp, HardDrive, History, ScanText, Sparkles } from "lucide-react";
import { DOC_ICON, DocIcon } from "@/components/doc-icon";
import { DOC_TYPE_LABEL, ratio } from "@/lib/format";
import { itemTitle } from "@/lib/loans";
import { cn } from "@/lib/utils";
import type { Run, TimelineStep } from "@/lib/types";

type Card = TimelineStep["cards"][number];
const isChecklist = (c: { id: string }) => c.id.startsWith("missing:") && !c.id.startsWith("missing:pfs");
const REQUIRED = 8;

const ENGINE: Record<string, { icon: typeof HardDrive; label: string; ai?: boolean }> = {
  doc_received: { icon: HardDrive, label: "Stored" },
  doc_parsed: { icon: ScanText, label: "Parsed into cells" },
  doc_classified: { icon: Sparkles, label: "Recognised type", ai: true },
  picks_recorded: { icon: Sparkles, label: "Pointed at cells", ai: true },
  observations_recorded: { icon: Calculator, label: "Read by code" },
  hypothesis_recorded: { icon: Sparkles, label: "AI suggestion", ai: true },
};

interface Col {
  i: number;
  step: TimelineStep;
  type: string;
  open: Card[];
  added: Card[];
  resolved: Card[];
  docs: number;
  dscr: number | null;
  dscrResult: string;
  stale: boolean;
  engine: { seq: number; type: string }[];
}

function columns(run: Run): Col[] {
  return run.timeline.map((t, i) => {
    const prev = i > 0 ? run.timeline[i - 1] : null;
    const real = (cs: Card[]) => cs.filter((c) => !isChecklist(c));
    const open = real(t.cards);
    const missing = ((t.rules.required_documents.value as string[]) ?? []).filter((m) => !m.startsWith("pfs:"));
    return {
      i,
      step: t,
      type: t.event === "decision_recorded" ? "decision" : run.documents.find((d) => d.id === t.doc)?.type ?? "",
      open,
      added: open.filter((c) => !prev || !prev.cards.some((p) => p.id === c.id)),
      resolved: prev ? real(prev.cards).filter((p) => !t.cards.some((c) => c.id === p.id)) : [],
      docs: REQUIRED - missing.length,
      dscr: t.rules.dscr.value ? Number(t.rules.dscr.value) : null,
      dscrResult: t.rules.dscr.result,
      stale: t.decisions.some((d) => d.status === "stale") && !prev?.decisions.some((d) => d.status === "stale"),
      engine: run.events.filter((e) => e.seq > (prev?.seq ?? 0) && e.seq <= t.seq && e.type !== "decision_recorded").map((e) => ({ seq: e.seq, type: e.type })),
    };
  });
}

const LO = 1.15;
const HI = 1.35;
const THRESHOLD = 1.25;

function DscrLine({ cols, onSel }: { cols: Col[]; onSel: (i: number) => void }) {
  const W = cols.length * 100;
  const H = 90;
  const y = (v: number) => H - 8 - ((Math.min(Math.max(v, LO), HI) - LO) / (HI - LO)) * (H - 16);
  const x = (i: number) => i * 100 + 50;
  const pts = cols.filter((c) => c.dscr !== null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[90px] w-full overflow-visible" role="img" aria-label="Debt service coverage over time">
      <rect x={0} y={0} width={W} height={y(THRESHOLD)} className="fill-pass/[0.06]" />
      <rect x={0} y={y(THRESHOLD)} width={W} height={H - y(THRESHOLD)} className="fill-fail/[0.06]" />
      <line x1={0} x2={W} y1={y(THRESHOLD)} y2={y(THRESHOLD)} className="stroke-muted-foreground/50" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
      {pts.slice(1).map((c, k) => {
        const a = pts[k];
        return (
          <line
            key={c.i}
            x1={x(a.i)}
            y1={y(a.dscr!)}
            x2={x(c.i)}
            y2={y(c.dscr!)}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            className={c.dscrResult === "fail" ? "stroke-fail" : "stroke-pass"}
          />
        );
      })}
      {cols.map((c) => (
        <rect key={c.i} x={c.i * 100} y={0} width={100} height={H} className="cursor-pointer fill-transparent" onClick={() => onSel(c.i)} />
      ))}
    </svg>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="self-center pr-2 text-right text-[11px] text-muted-foreground">{children}</div>;
}

function Evolution({ cols, sel, onSel }: { cols: Col[]; sel: number; onSel: (i: number) => void }) {
  const maxOpen = Math.max(4, ...cols.map((c) => c.open.length));
  const grid = { gridTemplateColumns: `72px repeat(${cols.length}, minmax(52px,1fr))` };
  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-border">
      <div className="min-w-[760px] p-4">
        <div className="grid" style={grid}>
          <div />
          {cols.map((c) => (
            <button key={c.i} type="button" onClick={() => onSel(c.i)} className={cn("flex flex-col items-center gap-1 rounded-t-xl px-1 pt-2 pb-1", c.i === sel && "bg-accent")}>
              <DocIcon type={c.type} size="sm" />
              <span className="line-clamp-1 text-[10.5px] text-muted-foreground">{DOC_ICON[c.type]?.short}</span>
            </button>
          ))}

          <Label>Needs you</Label>
          {cols.map((c) => (
            <button key={c.i} type="button" onClick={() => onSel(c.i)} className={cn("flex flex-col-reverse items-center gap-[3px] px-1 py-2", c.i === sel && "bg-accent")} style={{ minHeight: maxOpen * 13 + 24 }}>
              {c.open.map((card) => (
                <span
                  key={card.id}
                  title={itemTitle(card)}
                  className={cn(
                    "h-2.5 w-7 rounded-[3px]",
                    card.axes.includes("decision") ? "bg-fail" : "bg-warn",
                    c.added.some((a) => a.id === card.id) && c.i > 0 && "ring-2 ring-offset-1 ring-offset-card",
                    c.added.some((a) => a.id === card.id) && c.i > 0 && (card.axes.includes("decision") ? "ring-fail/40" : "ring-warn/40"),
                  )}
                />
              ))}
              {c.stale && <History className="mb-0.5 size-3.5 text-warn" />}
            </button>
          ))}

          <Label>Documents</Label>
          {cols.map((c) => (
            <button key={c.i} type="button" onClick={() => onSel(c.i)} className={cn("flex items-center gap-1 px-2 py-2", c.i === sel && "bg-accent")}>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(c.docs / REQUIRED) * 100}%` }} />
              </span>
            </button>
          ))}

          <Label>DSCR</Label>
          <div className="relative" style={{ gridColumn: `2 / span ${cols.length}` }}>
            <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(52px,1fr))` }}>
              {cols.map((c) => (
                <div key={c.i} className={cn(c.i === sel && "rounded-b-xl bg-accent")} />
              ))}
            </div>
            <div className="relative">
              <DscrLine cols={cols} onSel={onSel} />
              <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(52px,1fr))` }}>
                {cols.map((c) => (
                  <div key={c.i} className="relative">
                    {c.dscr !== null ? (
                      <span
                        className={cn("absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card", c.dscrResult === "fail" ? "bg-fail" : "bg-pass")}
                        style={{ top: `${((90 - 8 - ((Math.min(Math.max(c.dscr, LO), HI) - LO) / (HI - LO)) * 74) / 90) * 100}%` }}
                      />
                    ) : (
                      <span className="absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-faint/60" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-[72px] text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-[2px] bg-fail" />changes a decision</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-[2px] bg-warn" />worth checking</span>
          <span className="inline-flex items-center gap-1.5"><History className="size-3 text-warn" />decision went stale</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-muted-foreground" />1.25x minimum</span>
        </div>
      </div>
    </div>
  );
}

function Detail({ c, prev, onOpenItem }: { c: Col; prev: Col | null; onOpenItem: (id: string) => void }) {
  const delta = (prev?.dscr ?? null) !== c.dscr;
  return (
    <div className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-border md:grid-cols-[200px_minmax(0,1fr)_200px]">
      <div className="flex items-center gap-3">
        <DocIcon type={c.type} size="lg" />
        <div>
          <div className="font-display text-[16px] font-semibold leading-tight">{c.type === "decision" ? "Reviewer decision" : DOC_TYPE_LABEL[c.type]}</div>
          <div className="font-mono text-[11px] text-faint">#{c.step.seq}</div>
        </div>
      </div>

      <div className="flex flex-wrap content-center gap-2">
        {c.added.filter(() => c.i > 0).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpenItem(a.id)}
            className={cn("inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-shadow hover:ring-1 hover:ring-current", a.axes.includes("decision") ? "bg-fail/10 text-fail" : "bg-warn/10 text-warn")}
          >
            <span className="text-[15px] leading-none">+</span>
            {itemTitle(a)}
            <ArrowRight className="size-3.5" />
          </button>
        ))}
        {c.resolved.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-2 rounded-xl bg-pass/10 px-3 py-2 text-[13px] text-pass line-through decoration-pass/50">
            <Check className="size-3.5" />
            {itemTitle(r)}
          </span>
        ))}
        {c.stale && (
          <span className="inline-flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[13px] font-medium text-warn">
            <History className="size-3.5" /> decision stale
          </span>
        )}
        {(c.i === 0 || (!c.added.length && !c.resolved.length && !c.stale)) && (
          <span className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
            <Check className="size-3.5 text-pass" /> {c.i === 0 ? "file opened" : "agrees with the file"}
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 font-display">
        {delta && prev?.dscr != null && <span className="tabular text-[18px] text-muted-foreground line-through decoration-faint">{ratio(prev.dscr)}</span>}
        {delta && prev?.dscr != null && <ArrowRight className="size-4 text-faint" />}
        <span className={cn("tabular text-[30px] font-bold tracking-tight", c.dscrResult === "fail" ? "text-fail" : c.dscrResult === "pass" ? "text-pass" : "text-faint")}>
          {c.dscr !== null ? ratio(c.dscr) : "—"}
        </span>
        <span className="text-[11px] font-sans text-muted-foreground">DSCR</span>
      </div>

      {c.engine.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3 md:col-span-3">
          {c.engine.map((x, k) => {
            const m = ENGINE[x.type] ?? { icon: HardDrive, label: x.type };
            return (
              <span key={x.seq} className="inline-flex items-center gap-1.5">
                {k > 0 && <span className="h-px w-3 bg-border" />}
                <span
                  title={`#${x.seq} · ${m.label}${m.ai ? " · uses AI" : ""}`}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]", m.ai ? "bg-model/10 text-model" : "bg-secondary text-muted-foreground")}
                >
                  <m.icon className="size-3" />
                  {m.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActivityView({ run, onOpenItem }: { run: Run; onOpenItem: (id: string) => void }) {
  const cols = useMemo(() => columns(run), [run]);
  const [sel, setSel] = useState(cols.length - 1);
  const [log, setLog] = useState(false);
  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 sm:p-6">
      <Evolution cols={cols} sel={sel} onSel={setSel} />
      <Detail c={cols[sel]} prev={sel > 0 ? cols[sel - 1] : null} onOpenItem={onOpenItem} />
      <div>
        <button type="button" onClick={() => setLog(!log)} className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          {log ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          Full event log · {run.events.length} events · replays with no model calls
        </button>
        {log && (
          <ol className="mt-2 divide-y rounded-xl bg-card ring-1 ring-border">
            {run.events.map((e) => {
              const m = ENGINE[e.type];
              const doc = run.documents.find((d) => d.id === e.doc);
              return (
                <li key={e.seq} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                  <span className="w-9 font-mono text-[10.5px] text-faint">#{e.seq}</span>
                  {doc ? <DocIcon type={doc.type} size="sm" /> : <DocIcon type="decision" size="sm" />}
                  <span className={cn(m?.ai && "text-model")}>{m?.label ?? (e.type === "decision_recorded" ? "Reviewer decision" : e.type)}</span>
                  {m?.ai && <Sparkles className="size-3 text-model" />}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
