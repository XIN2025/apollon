"use client";

import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DscrBuild, NoiWaterfall, RuleTiles } from "@/components/workspace/spread-visuals";
import { money, shortTitle } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/types";

const LINES: [string, string][] = [
  ["gross_rents", "Gross rents"],
  ["other_income", "Other income"],
  ["advertising", "Advertising"],
  ["cleaning_maintenance", "Cleaning and maintenance"],
  ["insurance", "Insurance"],
  ["legal_professional", "Legal and professional"],
  ["re_taxes", "Real estate taxes"],
  ["repairs", "Repairs"],
  ["utilities", "Utilities"],
  ["other_opex", "Management and other"],
];
const INCOME = new Set(["gross_rents", "other_income"]);

export function SpreadPanel({ run, onAnchor }: { run: Run; onAnchor: (a: string) => void }) {
  const lf = run.loan_file;
  const obs = useMemo(() => new Map(lf.observations.map((o) => [o.id, o])), [lf.observations]);
  const title = (d: string) => shortTitle(run.documents.find((x) => x.id === d)?.title ?? d);
  const anchorOf = (ids: string[]) => obs.get(ids[0])?.anchors[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        {lf.bridges.map((b) => (
          <NoiWaterfall key={b.id} bridge={b} />
        ))}
        <DscrBuild run={run} />
      </div>
      <RuleTiles run={run} />
      {lf.working.statements.map((ws) => {
        const st = lf.statements.find((s) => s.doc === ws.doc)!;
        const tax = lf.statements.find((s) => s.type === "irs_8825" && s.period && st.period && s.period[0] === st.period[0] && s.period[1] === st.period[1]);
        let noi = 0;
        return (
          <section key={ws.doc} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold">Net operating income: {title(ws.doc)}</h3>
              <span className="text-[12px] text-muted-foreground">
                {st.period ? `${st.period[0]} to ${st.period[1]}` : "period unknown"} · working value = filed return where one exists for the same period
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-normal text-muted-foreground">Line</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">{title(ws.doc)}</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">{tax ? "Form 8825" : "—"}</TableHead>
                    <TableHead className="text-right font-normal text-muted-foreground">Working</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LINES.filter(([k]) => ws.lines[k] !== undefined).map(([k, label]) => {
                    const stated = st.lines[k];
                    const filed = tax?.lines[k];
                    const w = ws.lines[k];
                    noi += (INCOME.has(k) ? 1 : -1) * Number(w);
                    const differs = filed && Math.abs(Number(stated?.value) - Number(filed.value)) >= 1;
                    return (
                      <TableRow key={k}>
                        <TableCell className="text-[13px]">{label}</TableCell>
                        <TableCell className="text-right">
                          <button type="button" className="tabular hover:text-brand" onClick={() => stated && onAnchor(anchorOf(stated.obs) ?? "")}>
                            {money(stated?.value)}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          {filed ? (
                            <button type="button" className="tabular hover:text-brand" onClick={() => onAnchor(anchorOf(filed.obs) ?? "")}>
                              {money(filed.value)}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={cn("tabular text-right font-medium", differs && "text-policy")}>
                          {money(w)}
                          {differs && <span className="ml-1 text-[10px] font-normal">from return</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-subtle font-semibold">
                    <TableCell>NOI (income − expenses)</TableCell>
                    <TableCell className="tabular text-right">{money(st.stated.noi)}</TableCell>
                    <TableCell />
                    <TableCell className="tabular text-right">{money(noi.toFixed(2))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}

    </div>
  );
}
