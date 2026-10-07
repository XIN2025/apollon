import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  BookCheck,
  Bot,
  CalendarRange,
  FlaskConical,
  Layers,
  Landmark,
  MousePointerClick,
  PlayCircle,
  Scale,
  ScrollText,
  Users,
  Wrench,
} from "lucide-react";
import { DECISIONS, type DecisionRecord } from "@/lib/decisions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Decisions · Apollon" };

const ICON: Record<DecisionRecord["icon"], typeof Scale> = {
  pointer: MousePointerClick,
  log: ScrollText,
  catalog: BookCheck,
  period: CalendarRange,
  scale: Scale,
  policy: Landmark,
  people: Users,
  test: FlaskConical,
  fix: Wrench,
  models: Bot,
  recorded: PlayCircle,
  scope: Layers,
};

const STATUS: Record<DecisionRecord["status"], { label: string; cls: string }> = {
  built: { label: "Built", cls: "bg-pass/10 text-pass" },
  designed: { label: "Designed", cls: "bg-secondary text-muted-foreground" },
  changed: { label: "Changed after testing", cls: "bg-warn/10 text-warn" },
};

/** The four a first-time reader needs; the rest stay one click away. */
const CORE = [1, 3, 5, 8];

function Evidence({ d }: { d: DecisionRecord }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {d.evidence.map((e) => (
          <Link key={e.label} href={e.href} className="group rounded-xl bg-subtle p-3 transition-colors hover:bg-accent">
            <div className="flex items-start justify-between gap-2">
              <span className="tabular font-display text-[22px] leading-none font-bold tracking-tight">{e.value}</span>
              <ArrowUpRight className="size-4 text-faint group-hover:text-brand" />
            </div>
            <div className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{e.label}</div>
          </Link>
        ))}
      </div>
      <div className="mt-auto grid gap-2 border-t pt-3 text-[12.5px] sm:grid-cols-2">
        <div>
          <span className="font-medium text-fail/80">✕ Rejected </span>
          <span className="text-muted-foreground">{d.rejected}</span>
        </div>
        <div>
          <span className="font-medium text-warn">⚖ Cost </span>
          <span className="text-muted-foreground">{d.cost}</span>
        </div>
      </div>
    </>
  );
}

function Heading({ d }: { d: DecisionRecord }) {
  const Icon = ICON[d.icon];
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="tabular font-mono text-faint">#{String(d.n).padStart(2, "0")}</span>
          <span className={cn("rounded-full px-2 py-px font-medium", STATUS[d.status].cls)}>{STATUS[d.status].label}</span>
          {d.source && <span className="text-warn">{d.source}</span>}
        </div>
        <h2 className="mt-1 font-display text-[17px] leading-snug font-semibold tracking-tight">{d.title}</h2>
      </div>
    </div>
  );
}

export default function DecisionsPage() {
  const counts = {
    built: DECISIONS.filter((d) => d.status === "built").length,
    changed: DECISIONS.filter((d) => d.status === "changed").length,
    designed: DECISIONS.filter((d) => d.status === "designed").length,
  };
  const core = DECISIONS.filter((d) => CORE.includes(d.n));
  const rest = DECISIONS.filter((d) => !CORE.includes(d.n));
  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-10 px-6 pt-14 pb-24">
      <header className="space-y-5">
        <div>
          <p className="text-[13px] font-medium text-brand">Decision log</p>
          <h1 className="mt-2 font-display text-[40px] leading-tight font-bold tracking-tight">Why it’s built this way.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => (
            <span key={k} className={cn("rounded-full px-3 py-1.5 text-[13px] font-medium", STATUS[k].cls)}>
              {counts[k]} {STATUS[k].label.toLowerCase()}
            </span>
          ))}
          <span className="text-[13px] text-muted-foreground">Every number links to where it happens.</span>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-[13px] font-medium text-muted-foreground">The four that shape it</h2>
        <ol className="grid gap-4 md:grid-cols-2">
          {core.map((d) => (
            <li key={d.n} className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border">
              <Heading d={d} />
              <p className="text-[14px] leading-relaxed text-muted-foreground">{d.why}</p>
              <Evidence d={d} />
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-[13px] font-medium text-muted-foreground">{rest.length} more, open any one</h2>
        <ol className="grid items-start gap-3 md:grid-cols-2">
          {rest.map((d) => (
            <li key={d.n}>
              <details className="group rounded-2xl bg-card ring-1 ring-border open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1">
                    <Heading d={d} />
                  </div>
                  <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-col gap-4 px-4 pb-4">
                  <p className="text-[14px] leading-relaxed text-muted-foreground">{d.why}</p>
                  <Evidence d={d} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
