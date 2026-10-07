"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play, RotateCcw, SkipBack, SkipForward, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOC_TYPE_LABEL, ratio } from "@/lib/format";

import type { ReplayStep } from "@/lib/steps";

type Card = ReplayStep["cards"][number];

const needsPerson = (c: Card) => !c.id.startsWith("missing:") || c.id.startsWith("missing:pfs");

function added(steps: ReplayStep[], i: number): Card[] {
  const prev = i > 0 ? steps[i - 1].cards : [];
  return steps[i].cards.filter((c) => needsPerson(c) && !prev.some((p) => p.id === c.id));
}

function narrate(steps: ReplayStep[], i: number): string {
  const s = steps[i];
  const prev = i > 0 ? steps[i - 1] : null;
  if (s.kind === "decision") return "An underwriter reviews the ownership certification and accepts the owners as certified. The engine records which facts that decision rested on.";
  const closed = prev ? prev.cards.filter((p) => !s.cards.some((c) => c.id === p.id)) : [];
  const parts: string[] = [];
  parts.push(`${DOC_TYPE_LABEL[s.docType ?? ""] ?? "A document"} arrives.`);
  if (i === 0) parts.push("The file starts with a checklist of what policy requires, so everything not yet received is open.");
  const realAdded = added(steps, i);
  if (closed.length && closed.every((c) => c.id.startsWith("missing:") && !c.id.startsWith("missing:pfs")))
    parts.push(closed.length === 1 ? "It closes one checklist item." : `It closes ${closed.length} checklist items.`);
  const otherClosed = closed.filter((c) => c.id.startsWith("missing:pfs"));
  if (otherClosed.length) parts.push(`${otherClosed.map((c) => c.title.replace(/^Personal financial statement missing: /, "")).join(", ")} is now under 25%, so no personal financial statement is needed from them.`);
  if (realAdded.length) parts.push(`New for review: ${realAdded.map((c) => c.title.charAt(0).toLowerCase() + c.title.slice(1)).join("; ").replace(/\.$/, "")}.`);
  if (prev && prev.dscr.result !== s.dscr.result && s.dscr.value)
    parts.push(`Debt service coverage moves to ${ratio(s.dscr.value)}, which ${s.dscr.result === "fail" ? "fails" : "passes"} policy.`);
  if (s.stale && !prev?.stale) parts.push("The underwriter's earlier decision rested on figures that just changed, so it is marked stale.");
  if (s.docType === "irs_8825" && !realAdded.length)
    parts.push("The return cannot be compared yet: Form 8825 does not print the tax year, and that comes with Form 4562.");
  if (parts.length === 1) parts.push("Everything in it agrees with the file, or differs only in ways the engine can explain.");
  return parts.join(" ");
}

function label(s: ReplayStep): { t: string; sub: string | null } {
  if (s.kind === "decision") return { t: "Decision", sub: "underwriter" };
  if (s.docType === "pfs") return { t: "PFS", sub: s.who?.split(" ").slice(-1)[0] ?? null };
  return { t: DOC_TYPE_LABEL[s.docType ?? ""] ?? "Document", sub: null };
}

function Track({ steps, i, go }: { steps: ReplayStep[]; i: number; go: (k: number) => void }) {
  const n = steps.length;
  const inset = `${50 / n}%`;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const cur = el?.querySelector("[aria-current=step]");
    if (!el || !cur || el.scrollWidth <= el.clientWidth) return;
    const r = cur.getBoundingClientRect();
    el.scrollTo({ left: el.scrollLeft + r.left - el.getBoundingClientRect().left - (el.clientWidth - r.width) / 2, behavior: "smooth" });
  }, [i]);
  return (
    <div ref={box} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="relative grid min-w-[760px] pt-6" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <span className="absolute top-[37px] h-0.5 rounded-full bg-border" style={{ left: inset, right: inset }} />
        <span
          className="absolute top-[37px] h-0.5 rounded-full bg-brand transition-[width] duration-700 ease-out"
          style={{ left: inset, width: `calc((100% - ${100 / n}%) * ${i / (n - 1)})` }}
        />
        {steps.map((st, k) => {
          const { t, sub } = label(st);
          const plus = added(steps, k).length;
          return (
            <li key={st.seq} className="relative flex flex-col items-center">
              {k <= i && plus > 0 && (
                <span className="absolute -top-5 animate-in rounded-full bg-fail/10 px-1.5 text-[10.5px] font-semibold text-fail fade-in zoom-in-50">+{plus}</span>
              )}
              <button
                type="button"
                onClick={() => go(k)}
                aria-label={`Step ${k + 1}: ${t}${sub ? ` ${sub}` : ""}`}
                aria-current={k === i ? "step" : undefined}
                className={cn(
                  "relative z-10 grid size-7 place-items-center rounded-full text-[11px] font-semibold transition-all duration-300",
                  k < i && "bg-brand text-brand-foreground",
                  k === i && "scale-110 bg-brand text-brand-foreground ring-4 ring-brand/20",
                  k > i && "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground",
                )}
              >
                {st.kind === "decision" ? <UserCheck className="size-3.5" /> : k < i ? <Check className="size-3.5" /> : k + 1}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => go(k)}
                className={cn("mt-2 px-1 text-center text-[11.5px] leading-tight transition-colors", k === i ? "font-medium text-foreground" : "text-muted-foreground")}
              >
                {t}
                {sub && <span className="block text-faint">{sub}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const TILT = [0, -3.5, 2.5, -1.5];

function PageStack({ scenario, steps, i }: { scenario: string; steps: ReplayStep[]; i: number }) {
  const s = steps[i];
  const docs = steps.slice(0, i + 1).filter((x) => x.kind === "document" && x.docId);
  const shown = docs.slice(-TILT.length);
  const top = docs[docs.length - 1];
  const stamp = s.kind === "decision" ? "active" : s.stale && i > 0 && !steps[i - 1].stale ? "stale" : null;
  return (
    <div className="relative grid h-full place-items-center overflow-hidden rounded-2xl bg-subtle px-6 pt-10 pb-6">
      <div className="grid-lines pointer-events-none absolute inset-0" />
      <div className="relative aspect-[612/792] w-[150px] sm:w-[200px] lg:w-[230px]">
        {shown.map((d, k) => {
          const depth = shown.length - 1 - k;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={d.docId}
              src={`/data/pages/${scenario}/${d.docId}-p0.png`}
              alt={depth === 0 ? `${DOC_TYPE_LABEL[d.docType ?? ""]}, first page` : ""}
              className={cn(
                "absolute inset-0 size-full rounded-[3px] bg-white object-cover object-top shadow-[0_12px_30px_rgba(40,25,90,.16)] ring-1 ring-black/5 transition-all duration-500 ease-out",
                depth === 0 && "animate-in fade-in slide-in-from-top-10 zoom-in-95",
              )}
              style={{ transform: `translate(${depth * 9}px, ${-depth * 7}px) rotate(${TILT[depth]}deg)`, zIndex: 10 - depth, opacity: 1 - depth * 0.12 }}
            />
          );
        })}
        {stamp && (
          <span
            key={stamp}
            className={cn(
              "absolute -bottom-3 -left-6 z-20 flex -rotate-6 whitespace-nowrap animate-in items-center gap-1.5 rounded-lg border-2 bg-card/95 px-2.5 py-1 text-[12px] font-bold tracking-wide uppercase shadow-md zoom-in-150 fade-in duration-300",
              stamp === "active" ? "border-pass text-pass" : "border-warn text-warn",
            )}
          >
            {stamp === "active" ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}
            {stamp === "active" ? "Owners accepted" : "Decision now stale"}
          </span>
        )}
      </div>
      <div className="relative mt-7 text-center">
        <div className="text-[12px] font-medium text-brand">{s.kind === "decision" ? "Recorded" : "Just arrived"}</div>
        <div className="mt-0.5 font-display text-[16px] font-semibold tracking-tight">
          {s.kind === "decision" ? "Underwriter decision" : DOC_TYPE_LABEL[top?.docType ?? ""]}
        </div>
        {s.kind === "document" && s.who && <div className="text-[13px] text-muted-foreground">{s.who}</div>}
      </div>
    </div>
  );
}

const LO = 1.1;
const HI = 1.4;
const MIN = 1.25;
const pct = (v: number) => `${Math.min(Math.max((v - LO) / (HI - LO), 0), 1) * 100}%`;

function DscrMeter({ dscr }: { dscr: ReplayStep["dscr"] }) {
  const v = dscr.value ? Number(dscr.value) : null;
  const fail = dscr.result === "fail";
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] text-muted-foreground">Debt service coverage</span>
        {v !== null ? (
          <>
            <span className={cn("tabular font-display text-[30px] leading-none font-bold tracking-tight transition-colors", fail ? "text-fail" : "text-foreground")}>
              {ratio(dscr.value as string)}
            </span>
            <span
              key={dscr.result}
              className={cn("animate-in rounded-full px-2 py-0.5 text-[12px] font-semibold fade-in zoom-in-75", fail ? "bg-fail/10 text-fail" : "bg-pass/10 text-pass")}
            >
              {fail ? "fails policy" : "passes"}
            </span>
          </>
        ) : (
          <span className="text-[15px] font-medium text-muted-foreground">not known yet · needs the property’s income</span>
        )}
      </div>
      <div className="relative mt-4 h-2 rounded-full">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-fail/15" style={{ width: pct(MIN) }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full bg-pass/15" style={{ left: pct(MIN) }} />
        <span className="absolute -inset-y-1.5 w-px bg-foreground/40" style={{ left: pct(MIN) }} />
        {v !== null && (
          <span
            className={cn("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-card shadow transition-[left,background-color] duration-700 ease-out", fail ? "bg-fail" : "bg-pass")}
            style={{ left: pct(v) }}
          />
        )}
      </div>
      <div className="tabular relative mt-2 h-4 text-[11px] text-muted-foreground">
        <span className="absolute left-0">{LO.toFixed(2)}x</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-foreground" style={{ left: pct(MIN) }}>
          {MIN.toFixed(2)}x minimum
        </span>
        <span className="absolute right-0">{HI.toFixed(2)}x</span>
      </div>
    </div>
  );
}

function FileState({ steps, i }: { steps: ReplayStep[]; i: number }) {
  const s = steps[i];
  const fresh = new Set(added(steps, i).map((c) => c.id));
  const review = s.cards.filter(needsPerson);
  const toCome = s.cards.filter((c) => c.id.startsWith("missing:"));
  return (
    <div className="grid gap-6">
      <div>
        <div className="text-[13px] text-muted-foreground">Needs a person · {review.length + (s.decision === "stale" ? 1 : 0)}</div>
        <ul className="mt-2 grid gap-1.5">
          {review.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex items-start gap-2.5 rounded-xl px-3 py-2 text-[14px] ring-1 transition-colors duration-700",
                fresh.has(c.id) ? "animate-in bg-accent ring-brand/30 fade-in slide-in-from-right-4" : "bg-card ring-border",
              )}
            >
              <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", c.decision ? "bg-fail" : "bg-warn")} />
              <span className="min-w-0 flex-1">{c.title}</span>
              {fresh.has(c.id) && <span className="shrink-0 rounded-full bg-brand px-1.5 py-px text-[10.5px] font-semibold text-brand-foreground">New</span>}
            </li>
          ))}
          {s.decision === "stale" && (
            <li className="flex items-start gap-2.5 rounded-xl bg-warn/[0.07] px-3 py-2 text-[14px] ring-1 ring-warn/25">
              <RotateCcw className="mt-[3px] size-3.5 shrink-0 text-warn" />
              <span className="min-w-0 flex-1">Earlier decision is stale: owners accepted as certified</span>
            </li>
          )}
          {!review.length && !s.decision && <li className="rounded-xl px-3 py-2 text-[14px] text-muted-foreground border border-dashed">Nothing yet.</li>}
        </ul>
      </div>
      <div>
        <div className="text-[13px] text-muted-foreground">{toCome.length ? `Still to come · ${toCome.length}` : "Required documents"}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {toCome.map((c) => (
            <span key={c.id} className="rounded-full border border-dashed border-faint/60 px-2.5 py-1 text-[12.5px] text-muted-foreground">
              {DOC_TYPE_LABEL[c.id.slice("missing:".length)] ?? c.title.replace(/^Personal financial statement missing: /, "PFS · ")}
            </span>
          ))}
          {!toCome.length && (
            <span className="inline-flex items-center gap-1 rounded-full bg-pass/10 px-2.5 py-1 text-[12.5px] font-medium text-pass">
              <Check className="size-3.5" /> All in
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Replay({ scenario, steps }: { scenario: string; steps: ReplayStep[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const touched = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;
  const running = playing && i < last;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI((x) => x + 1), 2000);
    return () => clearTimeout(t);
  }, [running, i]);

  // Plays once on first view, unless the visitor already took over or prefers less motion.
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (!touched.current) setPlaying(true);
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const next = steps.slice(i + 1).find((x) => x.kind === "document" && x.docId);
    if (next) new Image().src = `/data/pages/${scenario}/${next.docId}-p0.png`;
  }, [i, steps, scenario]);

  const go = (k: number) => {
    touched.current = true;
    setPlaying(false);
    setI(Math.min(Math.max(k, 0), last));
  };

  return (
    <div ref={root} className="float overflow-hidden rounded-[24px] bg-card ring-1 ring-border">
      <div className="border-b px-5 pt-4 pb-3 sm:px-7">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous" disabled={i === 0} onClick={() => go(i - 1)}>
            <SkipBack />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              touched.current = true;
              if (i >= last) {
                setI(0);
                setPlaying(true);
              } else setPlaying(!running);
            }}
          >
            {running ? <Pause /> : i >= last ? <RotateCcw /> : <Play />} {running ? "Pause" : i >= last ? "Replay" : "Play"}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next" disabled={i >= last} onClick={() => go(i + 1)}>
            <SkipForward />
          </Button>
          <span className="tabular ml-auto text-[12px] text-muted-foreground">
            step {i + 1} of {steps.length}
          </span>
        </div>
        <Track steps={steps} i={i} go={go} />
      </div>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8">
        <PageStack scenario={scenario} steps={steps} i={i} />
        <div className="flex min-w-0 flex-col gap-7 lg:min-h-[470px]">
          <p key={i} className="min-h-[5.2em] max-w-[60ch] animate-in text-[17px] leading-relaxed text-balance fade-in duration-500">
            {narrate(steps, i)}
          </p>
          <DscrMeter dscr={steps[i].dscr} />
          <FileState steps={steps} i={i} />
        </div>
      </div>
    </div>
  );
}
