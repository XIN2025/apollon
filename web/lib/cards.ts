import { DOC_TYPE_LABEL, FIELD_LABEL, money, pct, ratio } from "./format";
import type { Card, ObsView, Run } from "./types";

export const nameOf = (run: Run) => (id: string) => run.loan_file.entities.find((e) => e.id === id)?.name ?? id;

export function question(card: Card, run: Run): string {
  const name = nameOf(run);
  if (card.kind === "conflict" && card.concept === "ownership_pct")
    return "Two documents give different ownership. The newer one was signed after an amendment.";
  if (card.kind === "conflict")
    return `The borrower’s statement and the tax return report different ${(FIELD_LABEL[card.concept] ?? card.concept).toLowerCase()}.`;
  if (card.kind === "missing" && card.id.startsWith("missing:pfs:")) {
    const pid = card.id.slice("missing:pfs:".length);
    return `${name(pid)} owns ${run.loan_file.working.ownership[pid]}%, so policy needs their personal financial statement. It isn’t here.`;
  }
  if (card.kind === "missing") return `Policy requires a ${card.concept.replaceAll("_", " ")}. It isn’t in the package.`;
  if (card.kind === "entity") return "Similar name to a member, but a different SSN and birth date. Not the same person.";
  return card.summary;
}

/** "foot:rent_roll:total rent" → "Rent roll: total rent doesn’t add up" */
function footLabel(id: string): string {
  const [, doc, what] = id.split(":");
  return `${DOC_TYPE_LABEL[doc] ?? doc.replaceAll("_", " ")}: ${what} doesn’t add up`;
}

export function fmtRule(rule: string, v: string | string[] | null, name: (id: string) => string): string {
  if (v === null) return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => (x.startsWith("pfs:") ? `PFS from ${name(x.slice(4))}` : x.startsWith("foot:") ? footLabel(x) : name(x))).join(", ") : "none";
  if (rule === "dscr") return ratio(v);
  if (rule === "ltv" || rule === "occupancy") return pct(v);
  return v;
}

export function display(o: ObsView): string {
  if (o.value === null) return "—";
  if (o.field.endsWith("pct")) return `${o.value}%`;
  return /^-?\d+(\.\d+)?$/.test(o.value) ? money(o.value) : o.value;
}

export function subjectOf(o: ObsView, run: Run): string {
  if (o.id.includes("[")) {
    const key = `person@${o.doc}#${o.id.split(":")[1].split(".")[0]}`;
    return run.loan_file.entities.find((e) => e.mentions.includes(key))?.name ?? o.label;
  }
  return FIELD_LABEL[o.field] ?? o.field.replaceAll("_", " ");
}

export function docLabel(run: Run, docId: string): string {
  const t = run.documents.find((d) => d.id === docId)?.type ?? "";
  return DOC_TYPE_LABEL[t] ?? docId;
}

export const REASONS: Record<"accepted" | "requested" | "escalated", { label: string; codes: { id: string; label: string }[] }> = {
  accepted: {
    label: "Accept working value",
    codes: [
      { id: "verified_against_source", label: "Verified against the source document" },
      { id: "accepted_policy_value", label: "Accept the value policy chose" },
      { id: "borrower_explanation_received", label: "Borrower explanation received" },
    ],
  },
  requested: {
    label: "Request document",
    codes: [
      { id: "document_requested", label: "Ask the borrower for a document" },
      { id: "recertification_requested", label: "Ask for a re-signed certification" },
    ],
  },
  escalated: {
    label: "Escalate",
    codes: [{ id: "escalated_to_credit_officer", label: "Escalate to the credit officer" }],
  },
};
