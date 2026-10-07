"use client";

import { Check, X } from "lucide-react";
import { DocIcon } from "@/components/doc-icon";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Card, Observation, Run } from "@/lib/types";

const PERSON_TINT = ["bg-sky-500", "bg-fuchsia-500", "bg-amber-500", "bg-teal-500"];

function personRows(run: Run) {
  const lf = run.loan_file;
  return Object.entries(lf.ownership).map(([pid, o], k) => ({
    pid,
    name: lf.entities.find((e) => e.id === pid)?.name ?? pid,
    tint: PERSON_TINT[k % PERSON_TINT.length],
    values: o.values,
    working: Number(o.working),
  }));
}

/** Each owner, one bar per document, against the 25% beneficial-owner line. */
export function OwnershipChart({ run }: { run: Run }) {
  const rows = personRows(run);
  const max = 60;
  const x = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <DocIcon type="ownership_certification" size="sm" /> certification
        </span>
        <span className="inline-flex items-center gap-1.5">
          <DocIcon type="operating_agreement" size="sm" /> operating agreement (used)
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className="h-3 border-l-2 border-dashed border-fail" /> 25% line
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.pid} className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
          <span className="truncate text-[13px] font-medium">{r.name}</span>
          <div className="relative space-y-1">
            <span className="absolute inset-y-[-4px] z-10 border-l-2 border-dashed border-fail/70" style={{ left: x(25) }} />
            {["ownership_certification", "operating_agreement"].map((t) => {
              const v = Number(r.values.find((x) => x.type === t)?.value ?? 0);
              const crosses = v >= 25;
              return (
                <div key={t} className="flex items-center gap-2">
                  <span className="relative h-3.5 flex-1 rounded-full bg-secondary">
                    <span
                      className={cn("absolute inset-y-0 left-0 rounded-full", r.tint, t === "ownership_certification" && "opacity-45")}
                      style={{ width: x(v) }}
                    />
                  </span>
                  <span className={cn("tabular w-10 text-right text-[12.5px]", crosses ? "font-semibold" : "text-muted-foreground")}>{v}%</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Owners at or above 25% and whether each one's personal financial statement is in the file. */
export function OwnerStatements({ run }: { run: Run }) {
  const rows = personRows(run);
  const have = new Set(run.loan_file.working.pfs_persons ?? []);
  return (
    <section className="grid gap-2 rounded-2xl bg-card p-4 ring-1 ring-border sm:grid-cols-3">
      {rows.map((r) => {
        const needs = r.working >= 25;
        const ok = have.has(r.pid);
        return (
          <div key={r.pid} className={cn("flex items-center gap-3 rounded-xl p-3", needs && !ok ? "bg-fail/[0.07] ring-1 ring-fail/30" : "bg-subtle")}>
            <div className="relative">
              <DocIcon type="pfs" size="md" className={cn(!ok && "opacity-40 outline-dashed outline-1 outline-fail")} />
              <span className={cn("absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-card", ok ? "bg-pass" : needs ? "bg-fail" : "bg-faint")}>
                {ok ? <Check className="size-2.5 text-white" /> : <X className="size-2.5 text-white" />}
              </span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{r.name}</div>
              <div className="tabular text-[12px] text-muted-foreground">
                {r.working}% {needs ? "· needs one" : "· not required"}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Person({ title, type, keys, vals }: { title: string; type: string; keys: string[]; vals: (string | null)[] }) {
  return (
    <div className="flex-1 rounded-2xl bg-subtle p-4">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <DocIcon type={type} size="sm" /> {title}
      </div>
      {keys.map((k, i) => (
        <div key={k} className="flex items-baseline justify-between gap-2 py-1 text-[13px]">
          <span className="text-muted-foreground">{k}</span>
          <span className="tabular truncate font-medium">{vals[i] ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** Two identity cards side by side; each field matches or not. */
export function IdentityCompare({ run, card }: { run: Run; card: Card }) {
  const lf = run.loan_file;
  const pfsDoc = card.id.replace("entity:unmatched:", "");
  const near = lf.near_misses.find((n) => n.a === `person@${pfsDoc}` || n.b === `person@${pfsDoc}`);
  const otherKey = near ? (near.a === `person@${pfsDoc}` ? near.b : near.a).replace("person@", "") : null;
  const get = (pred: (o: Observation) => boolean) => lf.observations.filter(pred);
  const mine = get((o) => o.doc_id === pfsDoc);
  const theirs = otherKey ? get((o) => o.subject === otherKey) : [];
  const field = (obs: Observation[], f: string) => obs.find((o) => o.field === f || o.field.endsWith(`.${f}`))?.value ?? null;
  const norm = (v: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const rows = [
    { k: "Name", a: field(mine, "name"), b: field(theirs, "name"), same: (a: string | null, b: string | null) => norm(a) === norm(b) },
    { k: "SSN", a: field(mine, "ssn"), b: field(theirs, "ssn"), same: (a: string | null, b: string | null) => norm(a).slice(-4) === norm(b).slice(-4) },
    { k: "Born", a: field(mine, "dob"), b: field(theirs, "dob"), same: (a: string | null, b: string | null) => a === b },
  ];
  const docType = run.documents.find((d) => d.id === otherKey?.split("#")[0])?.type ?? "ownership_certification";
  return (
    <section className="flex flex-col items-stretch gap-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center">
      <Person title="This statement" type="pfs" keys={rows.map((r) => r.k)} vals={rows.map((r) => r.a)} />
      <div className="flex shrink-0 flex-row justify-center gap-2 sm:flex-col">
        {rows.map((r) => {
          const ok = r.a && r.b ? r.same(r.a, r.b) : false;
          const close = r.k === "Name" && !ok;
          return (
            <span key={r.k} className={cn("grid size-7 place-items-center rounded-full", ok ? "bg-pass/15 text-pass" : close ? "bg-warn/15 text-warn" : "bg-fail/15 text-fail")} title={`${r.k}: ${ok ? "same" : close ? "similar" : "different"}`}>
              {ok ? <Check className="size-3.5" /> : close ? <span className="text-[12px] font-bold">≈</span> : <X className="size-3.5" />}
            </span>
          );
        })}
      </div>
      <Person title="Closest member" type={docType} keys={rows.map((r) => r.k)} vals={rows.map((r) => r.b)} />
    </section>
  );
}

/** Two numbers as bars, so the size of the gap is visible. */
function ValueBars({ items }: { items: { label: string; type: string; value: number; used?: boolean }[] }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2.5">
          <DocIcon type={i.type} size="sm" />
          <span className="relative h-3 flex-1 rounded-full bg-secondary">
            <span className={cn("absolute inset-y-0 left-0 rounded-full", i.used ? "bg-brand" : "bg-muted-foreground/40")} style={{ width: `${(Math.abs(i.value) / max) * 100}%` }} />
          </span>
          <span className={cn("tabular w-20 text-right text-[12.5px]", i.used && "font-semibold")}>{money(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** A total that does not add up: what the document says vs what its rows sum to. */
export function FootingBars({ run, card }: { run: Run; card: Card }) {
  const f = run.loan_file.footing.find((x) => card.id === `integrity:${x.doc}:${x.check}`);
  if (!f) return null;
  const type = run.documents.find((d) => d.id === f.doc)?.type ?? "";
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <ValueBars
        items={[
          { label: "stated", type, value: Number(f.stated) },
          { label: "rows add up to", type, value: Number(f.computed), used: true },
        ]}
      />
      <div className="mt-2 flex justify-between pl-9 text-[11.5px] text-muted-foreground">
        <span>stated total ↑ · rows add up to ↓</span>
        <span className="tabular font-medium text-warn">off by {money(Math.abs(Number(f.stated) - Number(f.computed)))}</span>
      </div>
    </section>
  );
}

/** The required-document checklist with the missing one marked. */
export function MissingDoc({ run, card }: { run: Run; card: Card }) {
  const required = ["loan_request", "rent_roll", "operating_statement", "appraisal", "ownership_certification", "operating_agreement", "irs_8825", "irs_4562"];
  const present = new Set(run.documents.map((d) => d.type));
  return (
    <section className="flex flex-wrap gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
      {required.map((t) => {
        const ok = present.has(t);
        const isThis = card.concept === t;
        return (
          <span key={t} className={cn("relative", isThis && "rounded-xl ring-2 ring-fail ring-offset-2 ring-offset-card")}>
            <DocIcon type={t} size="md" className={cn(!ok && "opacity-40 outline-dashed outline-1 outline-fail")} />
            <span className={cn("absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-card", ok ? "bg-pass" : "bg-fail")}>
              {ok ? <Check className="size-2.5 text-white" /> : <X className="size-2.5 text-white" />}
            </span>
          </span>
        );
      })}
    </section>
  );
}
