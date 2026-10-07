"use client";

import { Check, X, Minus } from "lucide-react";
import { DocIcon } from "@/components/doc-icon";
import { DscrGauge, Meter } from "@/components/glance";
import { money, pct, ratio } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Bridge, Run } from "@/lib/types";

/** From the tax return's net income to the borrower's NOI: catalog bridges stack up; the leftover is the gap. */
export function NoiWaterfall({ bridge }: { bridge: Bridge }) {
  const start = Number(bridge.net_income);
  const stated = Number(bridge.stated_noi);
  const steps = [
    { label: "Form 8825 net income", type: "irs_8825", from: 0, to: start, kind: "base" as const },
    ...bridge.components.reduce<{ label: string; type: string; from: number; to: number; kind: "add" }[]>((acc, c) => {
      const from = acc.length ? acc[acc.length - 1].to : start;
      acc.push({ label: `+ ${c.type}`, type: c.type === "depreciation" || c.type === "amortization" ? "irs_4562" : "irs_8825", from, to: from + Number(c.value), kind: "add" });
      return acc;
    }, []),
  ];
  const bridged = Number(bridge.bridged);
  const max = Math.max(stated, bridged) * 1.04;
  const x = (v: number) => `${(v / max) * 100}%`;
  const located = bridge.located_in.filter((e) => Math.abs(Number(e.effect)) >= 1);
  const LABEL: Record<string, string> = { re_taxes: "real estate taxes", gross_rents: "gross rents", other_income: "other income" };
  const gap = stated - bridged;
  return (
    <section className="space-y-2 rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
        <span className="font-display text-[15px] font-semibold text-foreground">Why the two NOIs differ</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-pass/60" /> explained by the catalog</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-fail/70" /> not explained</span>
      </div>
      {steps.map((s) => (
        <Row key={s.label} label={s.label} type={s.type} value={s.to - s.from}>
          <span className={cn("absolute inset-y-0 rounded-md", s.kind === "base" ? "bg-muted-foreground/35" : "bg-pass/60")} style={{ left: x(s.from), width: x(s.to - s.from) }} />
        </Row>
      ))}
      <Row label="= Tax-basis NOI" type="irs_8825" value={bridged} strong>
        <span className="absolute inset-y-0 left-0 rounded-md bg-brand" style={{ width: x(bridged) }} />
      </Row>
      <Row label="Borrower’s NOI" type="operating_statement" value={stated} strong>
        <span className="absolute inset-y-0 left-0 rounded-l-md bg-brand/40" style={{ width: x(Math.min(stated, bridged)) }} />
        {gap > 0 && <span className="absolute inset-y-0 rounded-r-md bg-fail/70" style={{ left: x(bridged), width: x(gap) }} />}
      </Row>
      <div className="flex flex-wrap items-center gap-2 pt-2 pl-[176px] text-[12.5px]">
        {located.map((e) => (
          <span key={e.cmp} className={cn("rounded-full px-2.5 py-1", Math.abs(Number(e.effect)) >= 100 ? "bg-fail/10 font-medium text-fail" : "bg-secondary text-muted-foreground")}>
            {money(Math.abs(Number(e.effect)))} · {LABEL[e.concept] ?? e.concept.replaceAll("_", " ")}
          </span>
        ))}
        {bridge.coincidences.map((c) => (
          <span key={c.cmp} className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground line-through decoration-faint" title={c.why_rejected}>
            {money(c.value)} · {c.concept} (coincidence, rejected)
          </span>
        ))}
      </div>
    </section>
  );
}

function Row({ label, type, value, strong, children }: { label: string; type: string; value: number; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[168px_minmax(0,1fr)_84px] items-center gap-2">
      <span className={cn("flex items-center gap-2 truncate text-[12.5px]", strong ? "font-semibold" : "text-muted-foreground")}>
        <DocIcon type={type} size="xs" />
        {label}
      </span>
      <span className="relative h-5">{children}</span>
      <span className={cn("tabular text-right text-[12.5px]", strong && "font-semibold")}>{money(value)}</span>
    </div>
  );
}

/** Lesser-of NOI over annual debt service, as bars, ending in the DSCR gauge. */
export function DscrBuild({ run }: { run: Run }) {
  const d = run.rules.dscr;
  const der = d.derivation as { underwritten_noi?: string; noi_source?: string; annual_debt_service?: string; candidates?: { source: string; noi: string; formula?: string }[] };
  const cands = der.candidates ?? [];
  const ads = Number(der.annual_debt_service ?? 0);
  const max = Math.max(ads, ...cands.map((c) => Number(c.noi))) * 1.05;
  const type = (doc: string) => run.documents.find((x) => x.id === doc)?.type ?? "";
  return (
    <section className="space-y-2.5 rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-[15px] font-semibold">Debt service coverage</span>
        <DscrGauge value={(d.value as string) ?? null} result={d.result} />
      </div>
      {cands.map((c) => {
        const used = c.source === der.noi_source;
        return (
          <div key={c.source} className="grid grid-cols-[168px_minmax(0,1fr)_84px] items-center gap-2">
            <span className={cn("flex items-center gap-2 text-[12.5px]", used ? "font-semibold" : "text-muted-foreground")} title={c.formula}>
              <DocIcon type={type(c.source)} size="xs" /> {c.source === "appraisal" ? "Appraisal NOI" : "Recomputed NOI"} {used && "· used"}
            </span>
            <span className="relative h-5">
              <span className={cn("absolute inset-y-0 left-0 rounded-md", used ? "bg-brand" : "bg-brand/30")} style={{ width: `${(Number(c.noi) / max) * 100}%` }} />
              <span className="absolute inset-y-[-3px] border-l-2 border-dashed border-fail/70" style={{ left: `${((ads * 1.25) / max) * 100}%` }} />
            </span>
            <span className={cn("tabular text-right text-[12.5px]", used && "font-semibold")}>{money(c.noi)}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[168px_minmax(0,1fr)_84px] items-center gap-2">
        <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <DocIcon type="loan_request" size="xs" /> Loan payments / year
        </span>
        <span className="relative h-5">
          <span className="absolute inset-y-0 left-0 rounded-md bg-muted-foreground/40" style={{ width: `${(ads / max) * 100}%` }} />
          <span className="absolute inset-y-[-3px] border-l-2 border-dashed border-fail/70" style={{ left: `${((ads * 1.25) / max) * 100}%` }} title="NOI needed for 1.25x" />
        </span>
        <span className="tabular text-right text-[12.5px]">{money(ads)}</span>
      </div>
      <div className="pl-[176px] text-[11.5px] text-muted-foreground">
        <span className="mr-1 inline-block h-2.5 border-l-2 border-dashed border-fail/70 align-middle" /> NOI needed to pass 1.25x: {money((ads * 1.25).toFixed(0))}
      </div>
    </section>
  );
}

const RULE_VIEW: Record<string, (v: unknown) => React.ReactNode> = {
  dscr: (v) => (v ? ratio(v as string) : "—"),
  ltv: (v) => <Meter value={v ? Number(v) : null} threshold={0.75} max={1} better="lower" label={v ? pct(v as string) : "no appraisal"} />,
  occupancy: (v) => <Meter value={v ? Number(v) : null} threshold={0.85} max={1} better="higher" label={v ? pct(v as string) : "—"} />,
  appraisal_tie: (v) => (v ? `${(Number(v) * 100).toFixed(2)}% off` : "—"),
};

/** Every policy rule as a tile: icon by result, value or meter. */
export function RuleTiles({ run }: { run: Run }) {
  const name = (id: string) => run.loan_file.entities.find((e) => e.id === id.replace(/^pfs:/, ""))?.name ?? id;
  return (
    <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(run.rules).map(([k, r]) => {
        const Icon = r.result === "pass" ? Check : r.result === "fail" ? X : Minus;
        const view = RULE_VIEW[k];
        return (
          <div key={k} className={cn("flex items-start gap-3 rounded-2xl p-4 ring-1", r.result === "fail" ? "bg-fail/[0.05] ring-fail/25" : "bg-card ring-border")}>
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", r.result === "pass" ? "bg-pass/15 text-pass" : r.result === "fail" ? "bg-fail/15 text-fail" : "bg-secondary text-faint")}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium">{run.rule_labels[k as keyof typeof run.rule_labels]}</div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">
                {view
                  ? view(r.value)
                  : Array.isArray(r.value)
                    ? r.value.length
                      ? r.value.map((v) => name(v)).join(", ")
                      : "all clear"
                    : (r.value ?? "—")}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
