"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  FileInput,
  History,
  Landmark,
  Link2,
  Sparkles,
  Undo2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { EvidenceSnippet } from "@/components/workbench/evidence-snippet";
import { Term } from "@/components/term";
import { FootingBars, IdentityCompare, MissingDoc, OwnerStatements, OwnershipChart } from "./item-visuals";
import { StatusIcon } from "./queue-pane";
import { useReview, type Resolution } from "@/components/shell/review-store";
import { REASONS, display, docLabel, fmtRule, nameOf, question, subjectOf } from "@/lib/cards";
import { KNOWN_ISSUES, itemTitle } from "@/lib/loans";
import { DOC_TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Card, Decision, Run, Step } from "@/lib/types";

interface Props {
  run: Run;
  card: Card;
  refId: string;
  index: number;
  total: number;
  decision: Decision | null;
  onMove: (delta: number) => void;
  onAnchor: (a: string) => void;
  onCard: (id: string) => void;
  onResolved: () => void;
}

function Impact({ card, run }: { card: Card; run: Run }) {
  const name = nameOf(run);
  const alt = card.observations.find((o) => o.role === "borrower_prepared" || o.role === "self_attested");
  if (!card.decision_impact.length) return null;
  return (
    <section data-tour="impact" className="overflow-hidden rounded-2xl border border-fail/25 bg-fail/[0.05]">
      <div className="flex items-center gap-2 border-b border-fail/20 px-4 py-2 text-[12px] font-medium text-fail">
        What changes
        {alt && card.working && (
          <span className="font-normal text-muted-foreground">
            · {DOC_TYPE_LABEL[alt.doc_type]} vs {docLabel(run, card.working.source)} (used)
          </span>
        )}
      </div>
      <ul className="divide-y divide-fail/10">
        {card.decision_impact.map((f) => (
          <li key={f.rule} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[13px]">
              {f.rule === "dscr" ? (
                <Term t="DSCR">{run.rule_labels[f.rule]}</Term>
              ) : f.rule === "beneficial_owners" ? (
                <Term t="beneficial owner">{run.rule_labels[f.rule]}</Term>
              ) : (
                run.rule_labels[f.rule]
              )}{" "}
              <span className="text-muted-foreground">{f.threshold.replace(/\(.*\)/, "")}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">
                {fmtRule(f.rule, f.alternative.value, name)} <span className="text-[11px]">{f.alternative.result}</span>
              </span>
              <ArrowRight className="size-3.5 text-faint" />
              <span className={cn("font-semibold", f.working.result === "fail" && "text-fail")}>
                {fmtRule(f.rule, f.working.value, name)} <span className="text-[11px]">{f.working.result}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sources({ card, run, onAnchor, hideTable = false }: { card: Card; run: Run; onAnchor: (a: string) => void; hideTable?: boolean }) {
  const working = card.working?.source;
  const docs = [...new Set(card.observations.map((o) => o.doc))].sort((a, b) => (a === working ? 1 : b === working ? -1 : 0));
  const rows = [...new Set(card.observations.map((o) => subjectOf(o, run)))];
  const cell = (row: string, doc: string) => card.observations.find((o) => o.doc === doc && subjectOf(o, run) === row);
  const differs = (row: string) => docs.length > 1 && new Set(docs.map((d) => cell(row, d)?.value)).size > 1;
  const [row, setRow] = useState(rows.find(differs) ?? rows[0]);

  return (
    <section data-tour="sources" className="space-y-3">
      <h3 className="text-[12px] font-medium text-muted-foreground">Where the numbers came from</h3>
      {hideTable ? null : rows.length === 1 && docs.length > 1 ? (
        <div className="grid grid-cols-2 gap-3">
          {docs.map((d) => {
            const o = cell(rows[0], d);
            const used = d === working;
            return (
              <div key={d} className={cn("rounded-2xl px-4 py-3", used ? "bg-accent ring-[1.5px] ring-brand" : "bg-secondary")}>
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {docLabel(run, d)}
                  {used && <span className="rounded-full bg-brand px-1.5 py-px text-[10px] font-medium text-brand-foreground">used</span>}
                </div>
                <div className="tabular font-display text-[26px] font-semibold tracking-tight">{o ? display(o) : "—"}</div>
                <div className="text-[11px] text-faint">{o?.role.replaceAll("_", " ")}</div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b text-[12px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-normal" />
              {docs.map((d) => (
                <th key={d} className="px-3 py-2 text-right font-normal whitespace-nowrap">
                  {docLabel(run, d)}
                  {d === working && <span className="ml-1.5 rounded bg-brand/15 px-1 py-px text-[10px] font-medium text-brand">used</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r}
                onClick={() => setRow(r)}
                className={cn("cursor-pointer border-b last:border-b-0 hover:bg-secondary/60", r === row && "bg-secondary")}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  {r}
                  {differs(r) && <span className="ml-2 inline-block size-1.5 rounded-full bg-fail align-middle" aria-label="differs" />}
                </td>
                {docs.map((d) => {
                  const o = cell(r, d);
                  return (
                    <td key={d} className={cn("tabular px-3 py-2 text-right whitespace-nowrap", differs(r) && d === working && "font-semibold")}>
                      {o ? display(o) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <div className="space-y-3">
        {docs.map((d) => {
          const o = cell(row, d);
          if (!o?.anchors[0]) return null;
          return (
            <figure key={d} className="space-y-1">
              <EvidenceSnippet run={run} anchor={o.anchors[0]} onOpen={onAnchor} />
              <figcaption className="text-[12px] text-muted-foreground">
                {docLabel(run, d)} · page {run.anchors[o.anchors[0]].page + 1} · <span className="text-faint">click to open the source</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

const ACTOR: Record<Step["by"] | "intake" | "human" | "you" | "stale", { icon: typeof Sparkles; tone: string; who: string }> = {
  intake: { icon: FileInput, tone: "text-muted-foreground", who: "Intake" },
  model_picked: { icon: Sparkles, tone: "text-model", who: "Engine · model" },
  code_computed: { icon: Calculator, tone: "text-muted-foreground", who: "Engine · code" },
  policy_chosen: { icon: Landmark, tone: "text-policy", who: "Policy" },
  model_suggested: { icon: Sparkles, tone: "text-model", who: "Investigator" },
  human_decided: { icon: UserCheck, tone: "text-human", who: "Underwriter" },
  human: { icon: UserCheck, tone: "text-human", who: "Underwriter (recorded)" },
  stale: { icon: History, tone: "text-warn", who: "Engine" },
  you: { icon: UserCheck, tone: "text-brand", who: "You" },
};

function Activity({ card, run, decision, onAnchor }: { card: Card; run: Run; decision: Decision | null; onAnchor: (a: string) => void }) {
  const { actions } = useReview();
  const a = actions[card.id];
  const firstSeen = run.timeline.find((t) => t.cards.some((c) => c.id === card.id))?.seq;
  const model = card.observations[0]?.by.model;
  type Entry = { kind: keyof typeof ACTOR; seq: number | null; text: React.ReactNode; anchors?: string[] };
  const entries: Entry[] = [];
  const docs = [...new Set(card.observations.map((o) => o.doc))];
  for (const d of docs) {
    const meta = run.documents.find((x) => x.id === d);
    if (meta) entries.push({ kind: "intake", seq: meta.seq, text: <>received <b className="font-medium">{DOC_TYPE_LABEL[meta.type]}</b></> });
  }
  if (decision) {
    entries.push({ kind: "human", seq: decision.seq, text: <>accepted the owners as certified · <span className="text-muted-foreground">{decision.reason_code.replaceAll("_", " ")}</span></> });
  }
  for (const s of card.steps.filter((s) => s.by !== "model_suggested" && s.by !== "human_decided")) {
    entries.push({ kind: s.by, seq: firstSeen ?? null, text: s.text, anchors: s.anchors });
  }
  if (decision?.stale) {
    entries.push({ kind: "stale", seq: decision.stale.trigger_seq, text: "marked the underwriter’s decision stale: the figures it rested on changed." });
  }
  entries.sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0));
  if (a) entries.push({ kind: "you", seq: null, text: <>{REASONS[a.resolution].label.toLowerCase()} · <span className="text-muted-foreground">{a.reason.replaceAll("_", " ")}</span>{a.note && <> · “{a.note}”</>}</> });

  return (
    <section className="space-y-3">
      <h3 className="sr-only">How it was built</h3>
      <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[9px] before:w-px before:bg-border">
        {entries.map((e, i) => {
          const m = ACTOR[e.kind];
          return (
            <li key={i} className="relative flex gap-3">
              <span className={cn("relative z-10 grid size-5 shrink-0 place-items-center rounded-full border bg-background", m.tone)}>
                <m.icon className="size-3" />
              </span>
              <div className="min-w-0 text-[13px] leading-relaxed">
                <span className="font-medium">{e.kind === "model_picked" && model ? `Engine · ${model.split("/").pop()}` : m.who}</span>
                {e.kind === "model_picked" && <span className="ml-1.5 rounded-full bg-model/10 px-1.5 py-px align-middle text-[10px] font-medium text-model">Uses AI · verify the cells</span>}{" "}
                <span className="text-foreground/85">{e.text}</span>
                {e.seq !== null && <span className="ml-1.5 font-mono text-[11px] text-faint">#{e.seq}</span>}
                {e.anchors && e.anchors.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {e.anchors.slice(0, 6).map((x) => (
                      <button
                        type="button"
                        key={x}
                        onClick={() => onAnchor(x)}
                        className="rounded border bg-card px-1.5 py-px font-mono text-[10px] text-muted-foreground hover:border-brand hover:text-brand"
                      >
                        {docLabel(run, run.anchors[x]?.doc ?? "")} · “{run.anchors[x]?.text}”
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Investigator({ card }: { card: Card }) {
  const h = card.hypothesis;
  const [open, setOpen] = useState(true);
  if (!h) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-model/25 bg-model/[0.04]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <Sparkles className="size-3.5 text-model" />
        <span className="text-[13px] font-medium">Investigator</span>
        <span className="rounded-full bg-model/10 px-1.5 py-px text-[10px] font-medium text-model">Uses AI · unverified</span>
        <span className="truncate text-[12px] text-muted-foreground">
          {h.by.model?.split("/").pop()} · worked for {h.by.latency_ms ? `${(h.by.latency_ms / 1000).toFixed(1)}s` : "a few seconds"}
        </span>
        {open ? <ChevronUp className="ml-auto size-4 text-muted-foreground" /> : <ChevronDown className="ml-auto size-4 text-muted-foreground" />}
      </button>
      <div className="space-y-2 px-4 pb-3 text-[13px] leading-relaxed">
        <p className={cn(!open && "line-clamp-2")}>{h.hypothesis}</p>
        {open && (
          <>
            <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
              {h.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p>
              <span className="text-muted-foreground">Would confirm it: </span>
              {h.verify_with}
            </p>
            <p className="text-[12px] text-muted-foreground">A suggestion cannot close or explain an item. A person decides.</p>
          </>
        )}
      </div>
    </section>
  );
}

function MoreDetail({ card, run, decision, onAnchor }: { card: Card; run: Run; decision: Decision | null; onAnchor: (a: string) => void }) {
  const [open, setOpen] = useState<"built" | "ai" | null>(null);
  const tabs = [
    { id: "built" as const, label: "How it was built" },
    ...(card.hypothesis ? [{ id: "ai" as const, label: "AI suggestion · unverified" }] : []),
  ];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOpen(open === t.id ? null : t.id)}
            aria-expanded={open === t.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] ring-1 ring-border transition-colors hover:bg-secondary",
              open === t.id && "bg-accent ring-brand",
              t.id === "ai" && "text-model",
            )}
          >
            {t.id === "ai" ? <Sparkles className="size-3.5" /> : <History className="size-3.5" />}
            {t.label}
            {open === t.id ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ))}
      </div>
      {open === "built" && <Activity card={card} run={run} decision={decision} onAnchor={onAnchor} />}
      {open === "ai" && <Investigator card={card} />}
    </section>
  );
}

function ActionDialog({ kind, onClose, onConfirm }: { kind: Resolution | null; onClose: () => void; onConfirm: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const spec = kind ? REASONS[kind] : null;
  return (
    <Dialog open={Boolean(kind)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{spec?.label}</DialogTitle>
          <DialogDescription>Every decision needs a reason. It is recorded with the facts it rested on, so it can go stale later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5" role="radiogroup" aria-label="Reason">
          {spec?.codes.map((c) => (
            <button
              type="button"
              role="radio"
              aria-checked={reason === c.id}
              key={c.id}
              onClick={() => setReason(c.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-[13px] transition-colors hover:bg-secondary",
                reason === c.id && "border-brand bg-brand/10",
              )}
            >
              <span className={cn("size-3.5 rounded-full border", reason === c.id && "border-[4px] border-brand")} />
              {c.label}
            </button>
          ))}
        </div>
        <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16 text-[13px]" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!reason} onClick={() => onConfirm(reason, note)}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ItemPane({ run, card, refId, index, total, decision, onMove, onAnchor, onCard, onResolved }: Props) {
  const { actions, act, undo } = useReview();
  const a = actions[card.id];
  const [dialog, setDialog] = useState<Resolution | null>(null);
  const isMissing = card.kind === "missing";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (a || dialog || el?.closest("input, textarea, [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a" && !isMissing) setDialog("accepted");
      if (e.key === "r") setDialog("requested");
      if (e.key === "e") setDialog("escalated");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a, dialog, isMissing]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4 text-[12px] text-muted-foreground">
        <StatusIcon card={card} resolved={Boolean(a)} />
        <span className="font-mono">{refId}</span>
        <span className="truncate">{itemTitle(card)}</span>
        <span className="tabular ml-auto">
          {index + 1} / {total}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Previous item (K)" disabled={index === 0} onClick={() => onMove(-1)}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next item (J)" disabled={index >= total - 1} onClick={() => onMove(1)}>
          <ChevronDown />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <article key={card.id} className="mx-auto max-w-[760px] space-y-7 px-5 py-6 sm:px-8">
          {a && (
            <div className="flex items-center gap-2 rounded-md border border-pass/30 bg-pass/[0.07] px-3 py-2 text-[13px]">
              <UserCheck className="size-4 text-pass" />
              <span>
                You chose <b className="font-medium">{REASONS[a.resolution].label.toLowerCase()}</b> · {a.reason.replaceAll("_", " ")}
              </span>
              <button type="button" onClick={() => undo(card.id)} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <Undo2 className="size-3.5" /> Undo
              </button>
            </div>
          )}
          {KNOWN_ISSUES[`${run.scenario}:${card.id}`] && (
            <div className="rounded-md border border-dashed px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              {KNOWN_ISSUES[`${run.scenario}:${card.id}`]}
            </div>
          )}
          <header className="space-y-2">
            <h1 className="font-display text-[26px] leading-tight font-semibold tracking-tight text-balance">{itemTitle(card)}</h1>
            <p className="text-[14px] leading-relaxed text-muted-foreground">{question(card, run)}</p>
            {card.depends_on && (
              <button type="button" onClick={() => onCard(card.depends_on!)} className="inline-flex items-center gap-1.5 text-[13px] text-brand hover:underline">
                <Link2 className="size-3.5" /> Appears because of: {run.cards.find((c) => c.id === card.depends_on)?.title}
              </button>
            )}
          </header>
          <Impact card={card} run={run} />
          {card.kind === "conflict" && card.concept === "ownership_pct" && <OwnershipChart run={run} />}
          {card.kind === "missing" && card.id.startsWith("missing:pfs:") && <OwnerStatements run={run} />}
          {card.kind === "missing" && !card.id.startsWith("missing:pfs:") && <MissingDoc run={run} card={card} />}
          {card.kind === "entity" && <IdentityCompare run={run} card={card} />}
          {card.kind === "integrity" && <FootingBars run={run} card={card} />}
          {card.observations.length > 0 && <Sources key={card.id} card={card} run={run} onAnchor={onAnchor} hideTable={card.concept === "ownership_pct" || card.kind === "entity"} />}
          <MoreDetail key={`m-${card.id}`} card={card} run={run} decision={decision} onAnchor={onAnchor} />
        </article>
      </div>

      {!a && (
        <div data-tour="actions" className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-panel px-4 py-2.5">
          {!isMissing && (
            <Button size="sm" className="rounded-full px-4" onClick={() => setDialog("accepted")}>
              Accept working value <Kbd className="ml-1 hidden bg-primary-foreground/15 text-primary-foreground sm:inline-flex">A</Kbd>
            </Button>
          )}
          <Button size="sm" className="rounded-full px-4" variant={isMissing ? "default" : "outline"} onClick={() => setDialog("requested")}>
            Request document <Kbd className="ml-1 hidden sm:inline-flex">R</Kbd>
          </Button>
          <Button size="sm" className="rounded-full px-4" variant="ghost" onClick={() => setDialog("escalated")}>
            Escalate <Kbd className="ml-1 hidden sm:inline-flex">E</Kbd>
          </Button>
          <span className="ml-auto hidden text-[11px] text-faint lg:inline">Recorded run · your choices stay in this browser</span>
        </div>
      )}

      <ActionDialog
        key={`${card.id}-${dialog}`}
        kind={dialog}
        onClose={() => setDialog(null)}
        onConfirm={(reason, note) => {
          const kind = dialog!;
          act(card.id, { resolution: kind, reason, note });
          setDialog(null);
          toast(`${refId} · ${REASONS[kind].label}`, { description: reason.replaceAll("_", " "), action: { label: "Undo", onClick: () => undo(card.id) } });
          onResolved();
        }}
      />
    </div>
  );
}
