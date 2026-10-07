import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { LOANS, itemTitle, type LoanIndex } from "./loans";
import type { Run, Score } from "./types";

const DIR = path.join(process.cwd(), "public", "data");

function read<T>(name: string): T | null {
  const file = path.join(DIR, name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as T) : null;
}

export function loadRun(scenario: string, order = "A"): Run | null {
  return read<Run>(`${scenario}__${order}.json`);
}

export function loadScore(scenario: string): Score | null {
  return read<Score>(`score_${scenario}.json`);
}

export function loadJson<T>(name: string): T | null {
  return read<T>(name);
}

export function loanIndex(): LoanIndex[] {
  return LOANS.flatMap((l) => {
    const run = loadRun(l.scenario);
    if (!run) return [];
    const lf = run.loan_file;
    const name = (id: string) => lf.entities.find((e) => e.id === id)?.name ?? id;
    return [
      {
        slug: l.slug,
        scenario: l.scenario,
        ref: l.ref,
        tag: l.tag,
        borrower: name(lf.borrower),
        collateral: name(lf.collateral),
        amount: lf.working.loan?.amount ?? null,
        dscr: { result: run.rules.dscr.result, value: (run.rules.dscr.value as string) ?? null },
        ltv: { result: run.rules.ltv.result, value: (run.rules.ltv.value as string) ?? null },
        docs: run.documents.length,
        missing: ((run.rules.required_documents.value as string[]) ?? []).length,
        missingDocs: ((run.rules.required_documents.value as string[]) ?? []).filter((m) => !m.startsWith("pfs:")).length,
        recordedAt: run.recorded_at,
        documents: run.documents.map((d) => ({ id: d.id, title: d.title, type: d.type })),
        items: run.cards.map((c, i) => ({
          id: c.id,
          ref: `${l.ref}-${i + 1}`,
          title: itemTitle(c),
          kind: c.kind,
          decision: c.axes.includes("decision"),
          missing: c.kind === "missing",
          sources:
            c.kind === "missing"
              ? [c.id.startsWith("missing:pfs:") ? "pfs" : c.concept]
              : [...new Set(c.observations.map((o) => o.doc_type))].slice(0, 2),
        })),
      },
    ];
  });
}
