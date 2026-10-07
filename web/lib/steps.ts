import { itemTitle } from "./loans";
import type { Run } from "./types";

export interface ReplayStep {
  seq: number;
  kind: "document" | "decision";
  docId: string | null;
  docType: string | null;
  who: string | null;
  cards: { id: string; title: string; decision: boolean }[];
  dscr: { result: string; value: string | null };
  decision: "active" | "stale" | null;
  stale: boolean;
}

export function toSteps(run: Run): ReplayStep[] {
  return run.timeline.map((t) => {
    const doc = run.documents.find((d) => d.id === t.doc);
    const status = t.decisions[0]?.status;
    return {
      seq: t.seq,
      kind: t.event === "decision_recorded" ? "decision" : "document",
      docId: doc?.id ?? null,
      docType: doc?.type ?? null,
      who: doc?.type === "pfs" ? (doc.title.split(/\s*-\s*/).pop() ?? null) : null,
      cards: t.cards.map((c) => ({ id: c.id, title: itemTitle(c), decision: c.axes.includes("decision") })),
      dscr: { result: t.rules.dscr.result, value: (t.rules.dscr.value as string) ?? null },
      decision: status === "active" || status === "stale" ? status : null,
      stale: t.decisions.some((d) => d.status === "stale"),
    };
  });
}
