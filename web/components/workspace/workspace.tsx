"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { QueuePane } from "./queue-pane";
import { ItemPane } from "./item-pane";
import { PropertiesPane, type EngineStats } from "./properties-pane";
import { MatrixView } from "./matrix-view";
import { ActivityView } from "./activity-view";
import { EvidenceViewer } from "@/components/workbench/evidence-viewer";
import { SpreadPanel } from "@/components/workbench/spread-panel";
import { DocumentsPanel } from "@/components/workbench/documents-panel";
import { EntitiesPanel } from "@/components/workbench/entities-panel";
import { useReview } from "@/components/shell/review-store";
import { Tour, TOUR_KEY } from "./tour";
import { docLabel } from "@/lib/cards";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/types";

const TABS = [
  { id: "review", label: "Review" },
  { id: "matrix", label: "Matrix" },
  { id: "spread", label: "Spread" },
  { id: "docs", label: "Documents" },
  { id: "people", label: "People" },
  { id: "activity", label: "Activity" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function SourcePane({ run, anchor, doc, highlights, onClose }: { run: Run; anchor: string | null; doc: string | null; highlights: string[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(anchor);
  const [page, setPage] = useState(anchor ? run.anchors[anchor]?.page ?? 0 : 0);
  const docId = (selected && run.anchors[selected]?.doc) || doc;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-[12px] text-muted-foreground">Source</span>
        <span className="truncate text-[13px] font-medium">{docId ? docLabel(run, docId) : ""}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Close source" className="ml-auto" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <EvidenceViewer run={run} doc={docId} page={page} onPage={setPage} highlights={highlights} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  );
}

export function Workspace({ run, slug, refPrefix, tag, engine }: { run: Run; slug: string; refPrefix: string; tag: string; engine: EngineStats }) {
  const router = useRouter();
  const params = useSearchParams();
  const { actions } = useReview();
  const cards = run.cards;
  const refs = useMemo(() => Object.fromEntries(cards.map((c, i) => [c.id, `${refPrefix}-${i + 1}`])), [cards, refPrefix]);
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "review");
  const [cardId, setCardId] = useState<string>(params.get("item") ?? cards[0]?.id ?? "");
  const [tour, setTour] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(TOUR_KEY) === "done";
    } catch {
      /* treat as unseen */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open once after layout is ready
    if (params.get("tour") === "1" || !seen) setTour(true);
  }, [params]);
  const [source, setSource] = useState<{ anchor: string | null; doc: string | null } | null>(params.get("doc") ? { anchor: null, doc: params.get("doc") } : null);
  const ordered = useMemo(
    () => [...cards.filter((c) => !actions[c.id]), ...cards.filter((c) => actions[c.id])],
    [cards, actions],
  );
  const card = cards.find((c) => c.id === cardId) ?? ordered[0] ?? null;
  const index = card ? ordered.findIndex((c) => c.id === card.id) : 0;

  const move = useCallback(
    (d: number) => {
      const next = ordered[Math.min(Math.max(index + d, 0), ordered.length - 1)];
      if (next) {
        setCardId(next.id);
        setSource(null);
      }
    },
    [ordered, index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (tab !== "review" || el?.closest("input, textarea, [role=dialog]") || e.metaKey || e.ctrlKey) return;
      if (e.key === "j" || e.key === "ArrowDown") move(1);
      if (e.key === "k" || e.key === "ArrowUp") move(-1);
      if (e.key === "Escape") setSource(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, tab]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setSource(null);
    router.replace(`/loans/${slug}${t === "review" ? "" : `?tab=${t}`}`, { scroll: false });
  };

  const decision = (id: string) => run.decisions.find((d) => d.card_id === id || (d.target === "ownership" && id === "conflict:ownership")) ?? null;
  const stale = new Set(cards.filter((c) => decision(c.id)?.status === "stale").map((c) => c.id));
  const highlights = card && tab === "review" ? [...new Set(card.observations.flatMap((o) => o.anchors))] : Object.keys(run.anchors);
  const openAnchor = (anchor: string) => setSource({ anchor, doc: null });
  const borrower = run.loan_file.entities.find((e) => e.id === run.loan_file.borrower)?.name;
  const openCount = cards.filter((c) => !actions[c.id]).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b bg-panel">
        <div className="flex h-11 items-center gap-2 px-4 text-[13px]">
          <Link href="/loans" className="text-muted-foreground hover:text-foreground">
            Loan files
          </Link>
          <ChevronRight className="size-3.5 text-faint" />
          <span className="truncate font-medium">{borrower}</span>
          <span className="ml-1 hidden rounded-full border px-2 py-px text-[11px] text-muted-foreground sm:inline">{tag}</span>
          <button
            type="button"
            onClick={() => { switchTab("review"); setTour(true); }}
            className="ml-auto hidden rounded-full px-2.5 py-1 text-[12px] text-brand ring-1 ring-brand/30 hover:bg-accent sm:inline"
          >
            Take the tour
          </button>
          <span className={cn("rounded-full px-2 py-px text-[11px] font-medium", openCount ? "bg-warn/15 text-warn" : "bg-pass/15 text-pass")}>
            {openCount ? `In review · ${openCount} open` : "Ready for credit"}
          </span>
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto px-3" aria-label="Loan file views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={cn(
                "shrink-0 border-b-2 border-transparent px-2.5 pt-1 pb-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground",
                tab === t.id && "border-brand text-foreground",
              )}
            >
              {t.label}
              {t.id === "review" && openCount > 0 && <span className="tabular ml-1.5 text-[11px] text-faint">{openCount}</span>}
            </button>
          ))}
        </nav>
      </header>

      {tab === "review" && card ? (
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]",
            source ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,auto)]" : "xl:grid-cols-[280px_minmax(0,1fr)_minmax(0,auto)]",
          )}
        >
          <aside data-tour="queue" className={cn("hidden min-h-0 overflow-y-auto border-r lg:block", source && "xl:hidden")}>
            <QueuePane cards={cards} refs={refs} selected={card.id} onSelect={(id) => { setCardId(id); setSource(null); }} stale={stale} />
          </aside>
          <section className="min-h-0 min-w-0">
            <ItemPane
              run={run}
              card={card}
              refId={refs[card.id]}
              index={index}
              total={ordered.length}
              decision={decision(card.id)}
              onMove={move}
              onAnchor={openAnchor}
              onCard={(id) => setCardId(id)}
              onResolved={() => {
                const next = cards.find((c) => c.id !== card.id && !actions[c.id]);
                if (next) setTimeout(() => setCardId(next.id), 350);
              }}
            />
          </section>
          <aside className={cn("hidden min-h-0 overflow-y-auto border-l bg-panel xl:block", source ? "xl:w-[600px]" : "xl:w-[300px]")}>
            {source ? (
              <SourcePane key={`${source.anchor}|${source.doc}`} run={run} anchor={source.anchor} doc={source.doc} highlights={highlights} onClose={() => setSource(null)} />
            ) : (
              <PropertiesPane run={run} card={card} engine={engine} />
            )}
          </aside>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "matrix" && <MatrixView run={run} onAnchor={openAnchor} />}
          {tab === "spread" && (
            <div className="mx-auto max-w-[1100px] p-4 sm:p-6">
              <SpreadPanel run={run} onAnchor={openAnchor} />
            </div>
          )}
          {tab === "docs" && (
            <div className="mx-auto max-w-[1100px] p-4 sm:p-6">
              <DocumentsPanel run={run} onDoc={(doc) => setSource({ anchor: null, doc })} />
            </div>
          )}
          {tab === "people" && (
            <div className="mx-auto max-w-[1100px] p-4 sm:p-6">
              <EntitiesPanel run={run} onAnchor={openAnchor} />
            </div>
          )}
          {tab === "activity" && (
            <ActivityView
              run={run}
              onOpenItem={(id) => {
                setCardId(id);
                switchTab("review");
              }}
            />
          )}
        </div>
      )}

      <Tour open={tour && tab === "review"} onClose={() => setTour(false)} />
      {/* Below xl, and on every non-review tab, the source opens in a sheet. */}
      <Sheet open={Boolean(source) && (tab !== "review" || !isXl())} onOpenChange={(o) => !o && setSource(null)}>
        <SheetContent side="right" className="w-full gap-0 bg-panel p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[720px]">
          <SheetTitle className="sr-only">Source document</SheetTitle>
          {source && <SourcePane key={`s-${source.anchor}|${source.doc}`} run={run} anchor={source.anchor} doc={source.doc} highlights={highlights} onClose={() => setSource(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function isXl() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches;
}
