"use client";

import { Check, X } from "lucide-react";
import { DOC_TYPE_LABEL, money, pct } from "@/lib/format";
import { docLabel } from "@/lib/cards";
import { REASONS } from "@/lib/cards";
import { useReview } from "@/components/shell/review-store";
import { Term } from "@/components/term";
import { DscrGauge, Meter } from "@/components/glance";
import { DocIcon } from "@/components/doc-icon";
import type { Card, Run } from "@/lib/types";

function Row({ k, children }: { k: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-2 py-1 text-[13px]">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-3 last:border-b-0">
      <h3 className="mb-1 text-[12px] font-medium text-muted-foreground">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}


export interface EngineStats {
  values: { k: number; n: number } | null;
  split: string;
}

export function PropertiesPane({ run, card, engine }: { run: Run; card: Card | null; engine: EngineStats }) {
  const { actions } = useReview();
  const a = card ? actions[card.id] : undefined;
  const loan = run.loan_file.working.loan;
  const r = run.rules;
  const present = new Set((r.required_documents.derivation as { present?: string[] }).present ?? []);
  const missing = (r.required_documents.value as string[] | null) ?? [];
  const required = ["loan_request", "rent_roll", "operating_statement", "appraisal", "ownership_certification", "operating_agreement", "irs_8825", "irs_4562"];
  const bo = (r.beneficial_owners.value as string[]) ?? [];

  return (
    <div className="text-[13px]">
      {card && (
        <Section title="Item">
          <Row k="Status">
            {a ? <span className="text-pass">{REASONS[a.resolution].label}</span> : <span>Open</span>}
          </Row>
          <Row k="Impact">
            <span className={card.axes.includes("decision") ? "text-fail" : "text-warn"}>
              {card.axes.includes("decision") ? "Changes a decision" : "Integrity check"}
            </span>
          </Row>
          {card.working && (
            <>
              <Row k={<Term t="working value">Working value</Term>}>
                <span className="tabular">
                  {typeof card.working.value === "string" && /^-?\d/.test(card.working.value) ? money(card.working.value) : "From source"}
                </span>
              </Row>
              <Row k="Source">{docLabel(run, card.working.source)}</Row>
            </>
          )}
          <Row k="Policy"><span title={run.policy.version}>Example policy</span></Row>
        </Section>
      )}
      <Section title="Loan">
        <Row k="Amount">
          <span className="tabular">${money(loan?.amount)}</span>
        </Row>
        <Row k="Rate · amort.">
          <span className="tabular">
            {loan ? `${(Number(loan.rate) * 100).toFixed(2)}% · ${Number(loan.amort_months) / 12} yr` : "—"}
          </span>
        </Row>
        <Row k={<Term t="DSCR" />}>
          <DscrGauge value={(r.dscr.value as string) ?? null} result={r.dscr.result} />
        </Row>
        <Row k={<Term t="LTV" />}>
          <Meter value={r.ltv.value ? Number(r.ltv.value) : null} threshold={0.75} max={1} better="lower" label={r.ltv.value ? pct(r.ltv.value as string) : "no appraisal"} />
        </Row>
        <Row k="Occupancy">
          <Meter value={r.occupancy.value ? Number(r.occupancy.value) : null} threshold={0.85} max={1} better="higher" label={r.occupancy.value ? pct(r.occupancy.value as string) : "—"} />
        </Row>
        <Row k={<Term t="beneficial owner">Owners ≥ 25%</Term>}>
          <span>{bo.length}</span>
        </Row>
      </Section>
      <Section title="This engine">
        <Row k="Reads">9 document types</Row>
        <Row k="Loan types">1 · investor CRE</Row>
        <Row k="Values read">
          <span className="tabular">{engine.values ? `${engine.values.k} of ${engine.values.n}` : "—"}</span>
          <span className="ml-1.5 text-[11px] text-muted-foreground">{engine.split}</span>
        </Row>
        <Row k="When unsure">Leaves it unresolved</Row>
        <Row k="AI role">Points · suggests</Row>
      </Section>
      <Section title={`Documents · ${missing.length ? `${missing.length} missing` : "all received"}`}>
        <div className="flex flex-wrap gap-2 pt-1.5">
          {required.map((t) => (
            <span key={t} className="relative" title={`${DOC_TYPE_LABEL[t]}: ${present.has(t) ? "received" : "missing"}`}>
              <DocIcon type={t} size="sm" className={present.has(t) ? "" : "opacity-40 outline-dashed outline-1 outline-fail"} />
              <span className={`absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full ring-2 ring-panel ${present.has(t) ? "bg-pass" : "bg-fail"}`}>
                {present.has(t) ? <Check className="size-2 text-white" /> : <X className="size-2 text-white" />}
              </span>
            </span>
          ))}
          {missing
            .filter((m) => m.startsWith("pfs:"))
            .map((m) => (
              <span key={m} className="relative" title={`Personal financial statement missing: ${run.loan_file.entities.find((e) => e.id === m.slice(4))?.name}`}>
                <DocIcon type="pfs" size="sm" className="opacity-40 outline-dashed outline-1 outline-fail" />
                <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-fail ring-2 ring-panel">
                  <X className="size-2 text-white" />
                </span>
              </span>
            ))}
        </div>
      </Section>
    </div>
  );
}
