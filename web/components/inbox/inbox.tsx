"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, CircleDot } from "lucide-react";
import { useReview } from "@/components/shell/review-store";
import { cn } from "@/lib/utils";
import { DscrGauge, DocBar, ItemDots } from "@/components/glance";
import { DocIcon } from "@/components/doc-icon";
import { KNOWN_ISSUES, type LoanIndex } from "@/lib/loans";

export function Inbox({ loans }: { loans: LoanIndex[] }) {
  const { actions } = useReview();
  const all = loans.flatMap((l) => l.items.map((i) => ({ ...i, loan: l })));
  const open = all.filter((i) => !actions[i.id]);
  const done = all.filter((i) => actions[i.id]);

  return (
    <div className="mx-auto max-w-[980px] px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Inbox</h1>
          <p className="text-[13px] text-muted-foreground">
            {open.length} items need you across {loans.length} loan files. Each one comes with its sources and what it changes.
          </p>
        </div>
        <div className="flex gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
            <CircleDot className="size-3.5 text-fail" /> {open.filter((i) => i.decision).length} change a decision
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
            <CircleDashed className="size-3.5 text-warn" /> {open.filter((i) => !i.decision).length} worth checking
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {loans.map((l) => {
          const items = open.filter((i) => i.loan.slug === l.slug);
          return (
            <section key={l.slug} className="overflow-hidden rounded-lg border bg-card">
              <Link href={`/loans/${l.slug}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-panel px-4 py-2.5 hover:bg-secondary/60">
                <span className="text-[13px] font-semibold">{l.borrower}</span>
                <span className="text-[12px] text-muted-foreground">{l.collateral}</span>
                <span className="rounded-full border px-2 py-px text-[11px] text-muted-foreground">{l.tag}</span>
                <span className="ml-auto flex items-center gap-5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    DSCR <DscrGauge value={l.dscr.value} result={l.dscr.result} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    Docs <DocBar have={8 - l.missingDocs} total={8} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    Open <ItemDots items={items} />
                  </span>
                </span>
              </Link>
              {items.length === 0 ? (
                <p className="px-4 py-4 text-[13px] text-muted-foreground">Nothing open. Ready for the credit officer.</p>
              ) : (
                <ul className="divide-y">
                  {items.map((i) => {
                    const Icon = i.decision ? CircleDot : CircleDashed;
                    return (
                      <li key={i.id}>
                        <Link
                          href={`/loans/${l.slug}?item=${encodeURIComponent(i.id)}`}
                          className="grid grid-cols-[18px_52px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-secondary/60"
                        >
                          <Icon className={cn("size-4", i.decision ? "text-fail" : "text-warn")} />
                          <span className="font-mono text-[11px] text-faint">{i.ref}</span>
                          <span className="truncate">
                            {i.title}
                            {KNOWN_ISSUES[`${l.scenario}:${i.id}`] && <span className="ml-2 text-[11px] text-muted-foreground">known duplicate · fixed after the blind test</span>}
                          </span>
                          <span className="hidden items-center gap-1.5 sm:flex" title={i.missing ? "Missing document" : "Documents that disagree"}>
                            {i.sources.map((t, k) => (
                              <span key={t} className="flex items-center gap-1.5">
                                {k > 0 && <span className="text-[10px] text-faint">vs</span>}
                                <DocIcon type={t} size="sm" className={i.missing ? "opacity-60 ring-1 ring-fail ring-dashed outline-dashed outline-1 outline-fail/60" : ""} />
                              </span>
                            ))}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">Resolved by you ({done.length})</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {done.map((i) => (
              <li key={i.id}>
                <Link href={`/loans/${i.loan.slug}?item=${encodeURIComponent(i.id)}`} className="flex items-center gap-3 px-4 py-2 text-[13px] text-muted-foreground hover:bg-secondary/60">
                  <CheckCircle2 className="size-4 text-pass" />
                  <span className="font-mono text-[11px] text-faint">{i.ref}</span>
                  <span className="truncate line-through decoration-faint">{i.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
