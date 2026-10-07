"use client";

import { useRef, useState } from "react";
import { CircleDashed, Plug } from "lucide-react";
import { ArchDiagram } from "./arch-diagram";
import { PARTS } from "@/lib/architecture";
import { cn } from "@/lib/utils";

export function ArchExplorer() {
  const [sel, setSel] = useState("reconcile");
  const top = useRef<HTMLDivElement>(null);
  const p = PARTS.find((x) => x.id === sel)!;
  const designed = PARTS.filter((x) => x.status === "designed");
  const pick = (id: string) => {
    setSel(id);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="space-y-16">
      <div ref={top} className="scroll-mt-20 space-y-6">
        <ArchDiagram selected={sel} onSelect={setSel} />
        <div className="space-y-5">
          <ul className="flex flex-wrap gap-1 md:hidden">
            {PARTS.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setSel(x.id)}
                  className={cn(
                    "rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:text-foreground",
                    x.id === sel ? "bg-secondary text-foreground" : "text-muted-foreground",
                    x.status === "designed" && x.id !== sel && "text-muted-foreground/70",
                  )}
                >
                  {x.name}
                </button>
              </li>
            ))}
          </ul>
          <article className="grid gap-x-10 gap-y-4 rounded-2xl bg-card p-5 ring-1 ring-border sm:p-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[13px]">
                <span className={cn("size-1.5 rounded-full", p.status === "built" ? "bg-pass" : "bg-muted-foreground/50")} />
                <span className="text-muted-foreground">{p.status === "built" ? "Built and running in this PoC" : "Designed, not built"}</span>
              </div>
              <h3 className="text-[22px] font-semibold tracking-tight">{p.name}</h3>
              <div className="space-y-1">
                <div className="text-[13px] font-medium text-muted-foreground">What it does</div>
                <p className="text-[15px] leading-relaxed">{p.what}</p>
              </div>
              {p.today && (
                <div className="rounded-xl bg-warn/[0.07] px-3.5 py-2.5 text-[13.5px] leading-relaxed ring-1 ring-warn/20">
                  <span className="font-medium text-warn">In the PoC today: </span>
                  {p.today}
                </div>
              )}
              {!p.build && p.code && <p className="font-mono text-[12px] text-muted-foreground">{p.code}</p>}
            </div>
            <div className="space-y-4">
              {p.build && (
                <div className="space-y-1.5">
                  <div className="text-[13px] font-medium text-muted-foreground">How I’d build it</div>
                  <ol className="space-y-1.5">
                    {p.build.map((b, i) => (
                      <li key={b} className="flex gap-2.5 text-[14px] leading-relaxed">
                        <span className="tabular mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-brand">
                          {i + 1}
                        </span>
                        {b}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {p.plugsIn && (
                <div className="space-y-1.5 rounded-xl bg-subtle p-3.5">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    <Plug className="size-3.5 text-brand" /> Where it plugs in
                  </div>
                  <code className="inline-block rounded bg-card px-1.5 py-0.5 font-mono text-[11.5px] text-foreground ring-1 ring-border">
                    {p.plugsIn.at}
                  </code>
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">{p.plugsIn.how}</p>
                </div>
              )}
              {!p.build && (
                <div className="space-y-1">
                  <div className="text-[13px] font-medium text-muted-foreground">Why this way</div>
                  <p className="text-[15px] leading-relaxed">{p.why}</p>
                </div>
              )}
            </div>
          </article>
        </div>
      </div>

      <section className="space-y-5">
        <div className="max-w-[68ch]">
          <h2 className="text-[22px] font-semibold tracking-tight">Not built yet, and where each one plugs in</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {designed.length} parts a production system needs. Each attaches to something that already runs in this PoC.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {designed.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => pick(x.id)}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border border-dashed bg-card p-4 text-left transition-colors hover:border-brand/50 hover:bg-accent/40",
                x.id === sel && "border-brand/60",
              )}
            >
              <div className="flex items-center gap-2">
                <CircleDashed className="size-4 text-muted-foreground" />
                <span className="text-[15px] font-semibold">{x.name}</span>
                <span className="ml-auto flex gap-0.5" title={`${x.build?.length ?? 0} build steps`}>
                  {x.build?.map((b) => <span key={b} className="h-1.5 w-3 rounded-full bg-brand/40" />)}
                </span>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">
                <span className="font-medium text-warn">Today </span>
                {x.today}
              </p>
              {x.plugsIn && (
                <div className="mt-auto flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Plug className="size-3 shrink-0 text-brand" />
                  <code className="truncate font-mono">{x.plugsIn.at}</code>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
