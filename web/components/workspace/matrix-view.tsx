"use client";

import { useMemo, useState } from "react";
import { DOC_TYPE_LABEL, FIELD_LABEL, money } from "@/lib/format";
import { DocIcon } from "@/components/doc-icon";
import { cn } from "@/lib/utils";
import type { Observation, Run } from "@/lib/types";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Income and expenses",
    rows: [
      ["gross_rents", "Gross rents"],
      ["other_income", "Other income"],
      ["total_income", "Total income"],
      ["advertising", "Advertising"],
      ["cleaning_maintenance", "Cleaning and maintenance"],
      ["insurance", "Insurance"],
      ["legal_professional", "Legal and professional"],
      ["re_taxes", "Real estate taxes"],
      ["repairs", "Repairs"],
      ["utilities", "Utilities"],
      ["management", "Management fees"],
      ["other_expenses", "Other expenses"],
      ["other_deductions", "Other deductions (8825 l.17)"],
      ["interest", "Interest"],
      ["depreciation", "Depreciation"],
      ["amortization", "Amortization"],
      ["noi", "Net operating income"],
      ["net_income", "Net income (8825 l.19)"],
    ],
  },
  {
    title: "Property and value",
    rows: [
      ["units", "Units"],
      ["occupied_units", "Occupied units"],
      ["stated_total_rent", "Monthly rent (stated)"],
      ["value", "Appraised value"],
      ["cap_rate", "Cap rate"],
    ],
  },
  {
    title: "Loan",
    rows: [
      ["loan_amount", "Loan amount"],
      ["rate", "Rate"],
      ["amortization_months", "Amortization (months)"],
    ],
  },
];

function fmt(o: Observation) {
  if (o.value === null) return "—";
  if (o.kind === "pct") return `${o.value}%`;
  if (o.kind === "money") return money(o.value);
  return o.value;
}

export function MatrixView({ run, onAnchor }: { run: Run; onAnchor: (a: string) => void }) {
  const lf = run.loan_file;
  const [sel, setSel] = useState<string | null>(null);
  const conflictObs = useMemo(() => new Set(run.cards.filter((c) => c.kind === "conflict").flatMap((c) => c.observations.map((o) => o.id))), [run.cards]);
  const usedDocs = useMemo(() => new Map(run.cards.filter((c) => c.working).map((c) => [c.id, c.working!.source])), [run.cards]);
  const usedObs = useMemo(
    () => new Set(run.cards.filter((c) => c.working).flatMap((c) => c.observations.filter((o) => o.doc === usedDocs.get(c.id)).map((o) => o.id))),
    [run.cards, usedDocs],
  );

  const at = (doc: string, field: string) => {
    const f = field === "amortization_months" ? "amortization" : field;
    return lf.observations.find((o) => o.doc_id === doc && o.field === f && (field !== "amortization" || o.doc_type !== "loan_request") && (field !== "amortization_months" || o.doc_type === "loan_request"));
  };
  const people = lf.entities.filter((e) => e.kind === "person");
  const ownership = (doc: string, pid: string) =>
    lf.observations.find((o) => o.doc_id === doc && o.field.endsWith(".pct") && people.find((p) => p.id === pid)?.mentions.includes(`person@${o.subject}`));

  const groups = [
    ...GROUPS,
    { title: "Ownership", rows: people.filter((p) => lf.ownership[p.id]).map((p) => [`pct:${p.id}`, p.name] as [string, string]) },
  ];
  const get = (doc: string, key: string) => (key.startsWith("pct:") ? ownership(doc, key.slice(4)) : at(doc, key));
  const docs = run.documents.filter((d) => groups.some((g) => g.rows.some(([k]) => get(d.id, k))));

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted-foreground">
        <span>Every value the engine read, by document. Click a cell to see where it came from.</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-fail/25 ring-1 ring-fail/60" /> in a conflict
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm ring-1 ring-brand" /> value used
        </span>
      </div>
      <div className="overflow-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b">
              <th className="sticky left-0 z-20 min-w-[200px] bg-card px-3 py-2 text-left text-[12px] font-normal text-muted-foreground">Field</th>
              {docs.map((d) => (
                <th key={d.id} className="min-w-[132px] border-l px-3 py-2 text-right text-[12px] font-normal text-muted-foreground">
                  <div className="flex flex-col items-end gap-1">
                    <DocIcon type={d.type} size="sm" />
                    <span className="text-foreground">{DOC_TYPE_LABEL[d.type] ?? d.type}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <MatrixGroup key={g.title} title={g.title} span={docs.length + 1}>
                {g.rows
                  .filter(([k]) => docs.some((d) => get(d.id, k)))
                  .map(([k, label]) => (
                    <tr key={k} className="border-b last:border-b-0 hover:bg-secondary/40">
                      <td className="sticky left-0 z-10 bg-card px-3 py-1.5 whitespace-nowrap text-muted-foreground">{FIELD_LABEL[k] && !k.startsWith("pct:") ? label : label}</td>
                      {docs.map((d) => {
                        const o = get(d.id, k);
                        if (!o) return <td key={d.id} className="border-l px-3 py-1.5 text-right text-faint">·</td>;
                        const conflict = conflictObs.has(o.id);
                        const used = usedObs.has(o.id);
                        return (
                          <td key={d.id} className="border-l p-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSel(o.id);
                                if (o.anchors[0]) onAnchor(o.anchors[0]);
                              }}
                              title={o.raw}
                              className={cn(
                                "tabular w-full rounded-[4px] px-2.5 py-1 text-right transition-colors hover:bg-secondary",
                                conflict && "bg-fail/15 ring-1 ring-fail/50 ring-inset hover:bg-fail/20",
                                used && "ring-1 ring-brand ring-inset",
                                sel === o.id && "bg-highlight",
                              )}
                            >
                              {fmt(o)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </MatrixGroup>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixGroup({ title, span, children }: { title: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-b bg-subtle">
        <td colSpan={span} className="sticky left-0 px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}
