export type RuleId =
  | "dscr"
  | "ltv"
  | "occupancy"
  | "appraisal_tie"
  | "beneficial_owners"
  | "ownership_total"
  | "required_documents"
  | "tax_return_entity"
  | "documents_foot";

export type RuleResult = "pass" | "fail" | "unresolved";

export interface Rule {
  result: RuleResult;
  value: string | string[] | null;
  threshold: string;
  derivation: Record<string, unknown>;
}

export interface Anchor {
  doc: string;
  page: number;
  bbox: [number, number, number, number];
  text: string;
  row_label: string;
  col_header: string;
  ocr_score: number | null;
}

export interface Stamp {
  provider: string | null;
  model: string | null;
  prompt_v: string | null;
}

export interface ObsView {
  id: string;
  doc: string;
  doc_type: string;
  doc_title: string;
  field: string;
  value: string | null;
  printed: string;
  label: string;
  anchors: string[];
  quote: string | null;
  transforms: string[];
  role: string;
  by: Stamp;
}

export type StepBy = "model_picked" | "code_computed" | "policy_chosen" | "human_decided" | "model_suggested";

export interface Step {
  by: StepBy;
  text: string;
  anchors: string[];
}

export interface Flip {
  rule: RuleId;
  working: { result: RuleResult; value: string | string[] | null };
  alternative: { result: RuleResult; value: string | string[] | null };
  threshold: string;
}

export interface Hypothesis {
  hypothesis: string;
  steps: string[];
  verify_with: string;
  cite_anchors: string[];
  unverified: true;
  by: Stamp & { latency_ms?: number };
}

export type CardKind = "conflict" | "missing" | "entity" | "integrity" | "breach";

export interface BridgeComponent {
  type: "interest" | "depreciation" | "amortization";
  value: string;
  evidence: string[];
  tie: string | null;
}

export interface Card {
  id: string;
  kind: CardKind;
  title: string;
  concept: string;
  severity: "high" | "medium";
  axes: ("decision" | "integrity")[];
  summary: string;
  observations: ObsView[];
  working: { value: unknown; source: string; basis: string } | null;
  decision_impact: Flip[];
  steps: Step[];
  hypothesis: Hypothesis | null;
  status: string;
  depends_on?: string | null;
  finding?: string;
  related?: { doc: string; value: string; reason: string }[];
  bridge?: {
    id: string;
    components: BridgeComponent[];
    residual: string;
    coincidences: { concept: string; value: string; why_rejected: string }[];
    status: string;
  } | null;
}

export interface Decision {
  id: string;
  target: string;
  action: string;
  reason_code: string;
  reviewer: string;
  card_id: string | null;
  seq: number;
  status: "active" | "stale";
  stale: {
    trigger_seq: number;
    trigger_doc: string;
    changed: { person: string; was: string; now: string; source_now: string }[];
    outcome_was: string[];
    outcome_now: string[];
  } | null;
}

export interface DocMeta {
  id: string;
  type: string;
  title: string;
  pages: [number, number][];
  seq: number;
  pdf: string;
}

export interface TimelineStep {
  seq: number;
  event: "observations_recorded" | "decision_recorded";
  doc: string | null;
  cards: Card[];
  rules: Record<RuleId, { result: RuleResult; value: string | string[] | null }>;
  decisions: { id: string; status: "active" | "stale" }[];
}

export interface Entity {
  id: string;
  kind: "org" | "collateral" | "person";
  name: string;
  mentions: string[];
  docs: string[];
  roles: string[];
}

export interface Comparison {
  id: string;
  concept: string;
  a: { doc: string; obs: string[]; value: string | null };
  b: { doc: string; obs: string[]; value: string | null };
  status: "agreed" | "equal_after_transform" | "equal_after_mapping" | "not_comparable" | "difference";
  reason: string | null;
  transform: string | null;
  delta?: string;
  subject?: string;
}

export interface Statement {
  doc: string;
  type: string;
  role: string;
  period: [string, string] | null;
  period_note: string | null;
  basis: string | null;
  lines: Record<string, { value: string; obs: string[]; formula: string | null }>;
  stated: Record<string, string>;
}

export interface WorkingStatement {
  doc: string;
  period: [string, string] | null;
  lines: Record<string, string>;
  sources: Record<string, string[]>;
}

export interface Bridge {
  id: string;
  os_doc: string;
  tax_doc: string;
  stated_noi: string;
  net_income: string;
  components: BridgeComponent[];
  bridged: string;
  residual: string;
  located_in: { cmp: string; concept: string; effect: string }[];
  remainder: string;
  coincidences: { cmp: string; concept: string; value: string; why_rejected: string }[];
  status: string;
}

export interface Observation {
  id: string;
  doc_id: string;
  doc_type: string;
  field: string;
  kind: string;
  value: string | null;
  raw: string;
  anchors: string[];
  quote: string | null;
  transforms: string[];
  subject: string;
  by: Stamp & { latency_ms?: number; tokens_in?: number; tokens_out?: number };
}

export interface LoanFile {
  documents: Record<string, DocMeta & { file: string; type: string }>;
  observations: Observation[];
  extraction: Record<string, { unresolved: string[]; absent: string[] }>;
  entities: Entity[];
  entity_links: { a: string; b: string; basis: string; entity: string }[];
  near_misses: { a: string; b: string; why: string; a_entity: string; b_entity: string }[];
  borrower: string;
  collateral: string;
  statements: Statement[];
  comparisons: Comparison[];
  bridges: Bridge[];
  ownership: Record<string, { values: { doc: string; type: string; value: string; date: string | null; obs: string }[]; working: string; working_doc: string; cert: string | null }>;
  rent_rolls: { doc: string; as_of: string; units: number; occupied: number; sum_rent: string; stated_total: string | null }[];
  footing: { id: string; doc: string; check: string; stated: string; computed: string; ok: boolean }[];
  working: {
    loan: { amount: string; rate: string; amort_months: string } | null;
    statements: WorkingStatement[];
    appraisal: Record<string, unknown> | null;
    ownership: Record<string, string>;
    cert_ownership: Record<string, string>;
    pfs_persons?: string[];
  };
}

export interface Run {
  scenario: string;
  order: string;
  recorded_at: string;
  policy: { version: string; label: string };
  rule_labels: Record<RuleId, string>;
  documents: DocMeta[];
  anchors: Record<string, Anchor>;
  events: { seq: number; type: string; at: string; doc: string | null }[];
  loan_file: LoanFile;
  anchors_index: Record<string, { obs: string[]; cards: string[] }>;
  cards: Card[];
  rules: Record<RuleId, Rule>;
  decisions: Decision[];
  timeline: TimelineStep[];
  cost: {
    model_calls_recorded: ({ seq: number; task: string; doc: string } & Stamp & { latency_ms?: number; tokens_in?: number; tokens_out?: number })[];
    live_calls_this_run: number;
    tokens_in: number;
    tokens_out: number;
    wall_seconds: number;
  };
}

export interface Rate {
  k: number;
  n: number;
  rate: number | null;
  ci95: [number, number] | null;
}

export interface Score {
  scenario: string;
  split: "dev" | "test";
  headline: {
    real_issue_recall: Rate;
    false_explained_rate: Rate;
    alert_load: { engine_cards: number; naive_diff_alerts: number; naive_fields: string[] };
    naive_diff_recall: Rate;
    naive_caught: string[];
  };
  extraction: {
    all_fields: Rate;
    numeric_llm: Rate;
    numeric_fuzzy_baseline: Rate;
    wrong: { field: string; expected: string; got: string | null }[];
  };
  planted: { id: string; kind: string; what: string; pass: boolean; evidence: string }[];
  traps_and_noise_handled: Rate;
  order_invariance: Rate & { orders: string[]; identical_to_A: string[] };
  stale_decisions: Rate | null;
  wrong_merges: number;
  cost_per_file: { model_calls: number; tokens_in: number; tokens_out: number; providers: string[] };
}
