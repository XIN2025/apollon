import { cn } from "@/lib/utils";
import { ratio } from "@/lib/format";

/** DSCR on a 1.0–1.5 track, with the 1.25x minimum as a tick. Readable without the number. */
export function DscrGauge({ value, result, className }: { value: string | null; result: string; className?: string }) {
  const lo = 1.0;
  const hi = 1.5;
  const pos = (v: number) => `${((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100}%`;
  const v = value ? Number(value) : null;
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={v ? `DSCR ${ratio(v)} · minimum 1.25x` : "DSCR not known yet"}>
      <span className="relative h-2 w-20 rounded-full bg-gradient-to-r from-fail/25 via-fail/15 to-pass/25">
        <span className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-foreground/50" style={{ left: pos(1.25) }} />
        {v !== null && (
          <span
            className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card", result === "fail" ? "bg-fail" : "bg-pass")}
            style={{ left: pos(v) }}
          />
        )}
      </span>
      <span className={cn("tabular text-[12.5px] font-semibold", result === "fail" ? "text-fail" : result === "pass" ? "text-foreground" : "text-faint")}>
        {v !== null ? ratio(v) : "—"}
      </span>
    </span>
  );
}

/** One segment per required document: filled when received, red when missing. */
export function DocBar({ have, total, className }: { have: number; total: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} title={`${have} of ${total} required document types`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-3 w-1.5 rounded-[2px]", i < have ? "bg-brand" : "bg-fail/60")} />
      ))}
    </span>
  );
}

/** Open items as dots: red changes a decision, amber is worth checking. */
export function ItemDots({ items, className }: { items: { decision: boolean }[]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={`${items.length} open`}>
      {items.map((x, i) => (
        <span key={i} className={cn("size-2.5 rounded-full", x.decision ? "bg-fail" : "bg-warn")} />
      ))}
      {!items.length && <span className="size-2.5 rounded-full bg-pass" />}
    </span>
  );
}

/** A value against a policy line. `better` says which side passes. */
export function Meter({ value, threshold, max, better, label, className }: { value: number | null; threshold: number; max: number; better: "higher" | "lower"; label: string; className?: string }) {
  const pos = (v: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%`;
  const pass = value === null ? null : better === "higher" ? value >= threshold : value <= threshold;
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={label}>
      <span className="relative h-2 w-20 rounded-full bg-secondary">
        {value !== null && <span className={cn("absolute inset-y-0 left-0 rounded-full", pass ? "bg-pass/70" : "bg-fail/70")} style={{ width: pos(value) }} />}
        <span className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-foreground/60" style={{ left: pos(threshold) }} />
      </span>
      <span className={cn("tabular text-[12.5px] font-semibold", pass === false && "text-fail", pass === null && "text-faint")}>{label}</span>
    </span>
  );
}
