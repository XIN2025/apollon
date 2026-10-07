import { PARTS } from "./architecture";

export type DecisionStatus = "built" | "designed" | "changed";

export interface DecisionRecord {
  n: number;
  title: string;
  why: string;
  rejected: string;
  cost: string;
  status: DecisionStatus;
  icon: "pointer" | "log" | "catalog" | "scale" | "policy" | "people" | "period" | "test" | "fix" | "models" | "recorded" | "scope";
  evidence: { value: string; label: string; href: string }[];
  source?: string;
}

export const DECISIONS: DecisionRecord[] = [
  {
    n: 1,
    title: "The AI points at cells. Code computes every number.",
    why: "A wrong number from a model looks exactly like a right one. A pointer can be checked against the page.",
    rejected: "Letting the model extract values directly.",
    cost: "More parsing work. Fields the parser cannot see stay unresolved.",
    status: "built",
    icon: "pointer",
    evidence: [
      { value: "0", label: "wrong values from a weak 4B model", href: "/eval" },
      { value: "51 vs 30", label: "numbers read: AI pointing vs label matching", href: "/eval" },
    ],
  },
  {
    n: 2,
    title: "An append-only event log is the source of truth.",
    why: "Anyone can see how the file looked when a decision was made, and replay it without calling a model.",
    rejected: "Updating a database record in place.",
    cost: "Rebuilding from the log is wasteful at scale; production would update views incrementally.",
    status: "built",
    icon: "log",
    evidence: [
      { value: "3 of 3", label: "replays identical, 0 model calls", href: "/eval" },
      { value: "1 of 1", label: "stale decision caught", href: "/loans/cedar-row?tab=activity" },
    ],
  },
  {
    n: 3,
    title: "Only a closed catalog can explain a difference.",
    why: "Interest, depreciation and amortization, each with its evidence and a tie-out. Credit policy owns the list.",
    rejected: "Letting a model explain any difference.",
    cost: "Legitimate differences outside the catalog still reach a person.",
    status: "built",
    icon: "catalog",
    evidence: [{ value: "14,600", label: "gap that equals insurance by chance, not taken as the cause", href: "/loans/cedar-row?tab=spread" }],
  },
  {
    n: 4,
    title: "Compare only what is comparable.",
    why: "Same property, same period, same basis first. A June rent roll is not a tax year.",
    rejected: "Diffing every field with the same name.",
    cost: "Some differences wait until the document that dates them arrives.",
    status: "built",
    icon: "period",
    evidence: [{ value: "4 vs 8", label: "items for a person vs a simple diff", href: "/loans/cedar-row?tab=matrix" }],
  },
  {
    n: 5,
    title: "Material means it changes a decision, or a borrower contradicts a source.",
    why: "Every conflict re-runs the rules with each value. A 2-point ownership change can decide who must be verified.",
    rejected: "A fixed dollar threshold.",
    cost: "Every conflict re-runs every rule.",
    status: "built",
    icon: "scale",
    evidence: [{ value: "24% → 26%", label: "crosses the beneficial-owner line", href: "/loans/cedar-row?item=conflict%3Aownership" }],
  },
  {
    n: 6,
    title: "Policy picks the working value. The conflict stays visible.",
    why: "A filed return outranks a borrower statement, but the underwriter still sees that the borrower’s figure was wrong.",
    rejected: "Silently using the more trusted source.",
    cost: "The authority order is example policy; each bank owns its own.",
    status: "built",
    icon: "policy",
    evidence: [{ value: "1.29x → 1.22x", label: "DSCR once the return is used", href: "/loans/cedar-row?item=conflict%3Are_taxes%3A2025" }],
  },
  {
    n: 7,
    title: "A similar name never merges two people.",
    why: "SSN, EIN and parcel number link automatically; name plus address links; a name alone becomes a review item.",
    rejected: "Fuzzy name matching.",
    cost: "A misread identifier creates a review item instead of a link.",
    status: "built",
    icon: "people",
    evidence: [{ value: "0", label: "people wrongly merged", href: "/loans/cedar-row?item=entity%3Aunmatched%3Apfs_ortiz" }],
  },
  {
    n: 8,
    title: "Test on a borrower the engine has never seen, once.",
    why: "Answers were written before the engine existed. The second borrower had different layouts and was run once.",
    rejected: "Tuning on every borrower until it passes.",
    cost: "The blind-test result has to be shown as it ran, including what it got wrong.",
    status: "built",
    icon: "test",
    evidence: [{ value: "4 of 4", label: "real issues found on the blind-test borrower", href: "/eval" }],
  },
  {
    n: 9,
    title: "Hide a subtotal that only differs because its lines do.",
    why: "The blind test showed “total income” as its own item next to the gross rents conflict. One cause, two items.",
    rejected: "Leaving the duplicate for the underwriter to spot.",
    cost: "Applies to subtotals with known lines only.",
    status: "changed",
    icon: "fix",
    source: "Found by the blind test",
    evidence: [{ value: "6 → 5", label: "items after replaying the same log", href: "/eval" }],
  },
  {
    n: 10,
    title: "Any model behind one gateway, free and local only.",
    why: "The engine must not depend on a vendor, and a bank may only allow its own models or none hosted at all.",
    rejected: "Building on one provider’s SDK.",
    cost: "Weaker models leave more for a person to check.",
    status: "built",
    icon: "models",
    evidence: [{ value: "3", label: "models compared, same prompts", href: "/eval" }],
  },
  {
    n: 11,
    title: "Show recorded runs, not live calls.",
    why: "The site is deterministic, costs nothing to visit, and keeps keys out of the browser. Every run can be replayed.",
    rejected: "Calling models from the site on every visit.",
    cost: "Visitors cannot upload their own documents.",
    status: "built",
    icon: "recorded",
    evidence: [{ value: "0", label: "model calls to view the site", href: "/loans/cedar-row?tab=activity" }],
  },
  {
    n: 12,
    title: "Design the rest, build the core.",
    why: "Everything else a bank needs is designed on the Architecture page: what stands in today, how it would be built, and the seam in the working code it attaches to.",
    rejected: "Mocking integrations that look real.",
    cost: "The PoC stops at the review queue.",
    status: "designed",
    icon: "scope",
    evidence: [{ value: String(PARTS.filter((x) => x.status === "designed").length), label: "parts designed, each with where it plugs in", href: "/architecture" }],
  },
];
