import type { Card, RuleResult } from "./types";
import { DOC_TYPE_LABEL } from "./format";

export const LOANS = [
  { slug: "cedar-row", scenario: "cedar_row", ref: "CR", tag: "Used while building" },
  { slug: "northgate-birchview", scenario: "birchview", ref: "NB", tag: "Blind test" },
] as const;

export type LoanSlug = (typeof LOANS)[number]["slug"];

export interface ItemIndex {
  id: string;
  ref: string;
  title: string;
  kind: Card["kind"];
  decision: boolean;
  sources: string[];
  missing: boolean;
}

export interface LoanIndex {
  slug: string;
  scenario: string;
  ref: string;
  tag: string;
  borrower: string;
  collateral: string;
  amount: string | null;
  dscr: { result: RuleResult; value: string | null };
  ltv: { result: RuleResult; value: string | null };
  docs: number;
  missing: number;
  missingDocs: number;
  items: ItemIndex[];
  recordedAt: string;
  documents: { id: string; title: string; type: string }[];
}

export function itemTitle(c: { id: string; kind: string; title: string }): string {
  if (c.kind === "entity") return "Financial statement from someone not in the file";
  if (c.kind === "integrity" && c.title.endsWith(" does not add up")) return `${DOC_TYPE_LABEL[c.id.split(":")[1]] ?? "Document"} doesn’t add up`;
  return c.title.replace(/^(.*[^s]) disagree$/, "$1 figures disagree");
}

/** Found by the blind test run and fixed in the engine afterwards. The recorded run is shown as it happened. */
export const KNOWN_ISSUES: Record<string, string> = {
  "birchview:conflict:total_income:2025": "Duplicate found by this blind-test run: the subtotal only differs because gross rents do. Fixed in the engine afterwards; replaying this run's log through the fix removes it. Shown as it ran.",
};
