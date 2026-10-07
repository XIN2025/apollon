"use client";

import { CheckCircle2, CircleDashed, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemTitle } from "@/lib/loans";
import { DocIcon } from "@/components/doc-icon";
import { useReview } from "@/components/shell/review-store";
import type { Card } from "@/lib/types";

export function StatusIcon({ card, resolved, className }: { card: Card; resolved: boolean; className?: string }) {
  if (resolved) return <CheckCircle2 className={cn("size-4 text-pass", className)} />;
  const decision = card.axes.includes("decision");
  const Icon = decision ? CircleDot : CircleDashed;
  return <Icon className={cn("size-4", decision ? "text-fail" : "text-warn", className)} />;
}

interface Props {
  cards: Card[];
  refs: Record<string, string>;
  selected: string | null;
  onSelect: (id: string) => void;
  stale: Set<string>;
}

export function QueuePane({ cards, refs, selected, onSelect, stale }: Props) {
  const { actions } = useReview();
  const open = cards.filter((c) => !actions[c.id]);
  const groups = [
    { title: "Changes a decision", items: open.filter((c) => c.axes.includes("decision")) },
    { title: "Worth checking", items: open.filter((c) => !c.axes.includes("decision")) },
    { title: "Resolved", items: cards.filter((c) => actions[c.id]) },
  ].filter((g) => g.items.length);

  return (
    <nav aria-label="Review queue" className="space-y-4 p-2">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="flex items-center gap-2 px-2 pt-1 pb-1.5 text-[12px] font-medium text-muted-foreground">
            {g.title}
            <span className="tabular text-faint">{g.items.length}</span>
          </div>
          <ul className="space-y-px">
            {g.items.map((c) => {
              const active = c.id === selected;
              const done = Boolean(actions[c.id]);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary",
                      active && "bg-accent hover:bg-accent",
                    )}
                  >
                    <StatusIcon card={c} resolved={done} className="mt-px shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[13px] leading-5", done && "text-muted-foreground line-through decoration-faint")}>
                        {itemTitle(c)}
                      </span>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span className="tabular shrink-0 font-mono text-[11px] whitespace-nowrap text-faint">{refs[c.id]}</span>
                        <span className="flex items-center gap-1">
                          {(c.kind === "missing"
                            ? [c.id.startsWith("missing:pfs:") ? "pfs" : c.concept]
                            : [...new Set(c.observations.map((o) => o.doc_type))].slice(0, 2)
                          ).map((t) => (
                            <DocIcon key={t} type={t} size="xs" className={c.kind === "missing" ? "opacity-50 outline-dashed outline-1 outline-fail" : ""} />
                          ))}
                        </span>
                        {stale.has(c.id) && !done && <span className="shrink-0 rounded bg-warn/15 px-1 text-[10px] font-medium text-warn">stale</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
