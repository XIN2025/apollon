import { Clock, Coins, FileQuestion, GitCompareArrows, GitMerge, History, Repeat, Ruler, Scale, ShieldAlert, Shuffle, Sparkles, Wand2 } from "lucide-react";
import { loadJson, loadScore } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { Rate, Score } from "@/lib/types";

export const metadata = { title: "Evaluation · Apollon" };

const KIND: Record<string, { icon: typeof GitMerge; label: string }> = {
  bridge: { icon: GitMerge, label: "explained gap" },
  real_conflict: { icon: GitCompareArrows, label: "real conflict" },
  missing: { icon: FileQuestion, label: "missing" },
  trap_coincidence: { icon: ShieldAlert, label: "trap" },
  trap_entity: { icon: ShieldAlert, label: "trap" },
  trap_period: { icon: ShieldAlert, label: "trap" },
  trap_timing: { icon: ShieldAlert, label: "trap" },
  noise_rounding: { icon: Wand2, label: "noise" },
  noise_mapping: { icon: Wand2, label: "noise" },
  noise_entity_names: { icon: Wand2, label: "noise" },
  noise_units: { icon: Wand2, label: "noise" },
  noise_collateral: { icon: Wand2, label: "noise" },
  tie_out: { icon: Scale, label: "tie-out" },
  rule_boundary: { icon: Ruler, label: "boundary" },
};

/** k of n as a fill bar, the 95% interval as a lighter band. `good` says which end is good. */
function RateBar({ r, good = "high", label }: { r?: Rate | null; good?: "high" | "low"; label: string }) {
  if (!r || !r.n) return <div className="text-[12px] text-faint">{label}: —</div>;
  const ok = good === "high" ? r.k === r.n : r.k === 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-semibold">
          {r.k} of {r.n}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-secondary" title={r.ci95 ? `95% interval ${Math.round(r.ci95[0] * 100)}–${Math.round(r.ci95[1] * 100)}%` : ""}>
        {r.ci95 && <span className="absolute inset-y-0 rounded-full bg-brand/15" style={{ left: `${r.ci95[0] * 100}%`, width: `${(r.ci95[1] - r.ci95[0]) * 100}%` }} />}
        <span className={cn("absolute inset-y-0 left-0 rounded-full", ok ? "bg-pass" : "bg-warn")} style={{ width: `${Math.max((r.k / r.n) * 100, good === "low" && r.k === 0 ? 0 : 2)}%` }} />
        {good === "low" && r.k === 0 && <span className="absolute top-1/2 left-0 size-2.5 -translate-y-1/2 rounded-full bg-pass" />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-[22px] font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function SplitCards({ dev, test, render }: { dev: Score; test: Score | null; render: (s: Score) => React.ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        { s: dev, t: "Used while building", sub: "the engine was tuned on it" },
        ...(test ? [{ s: test, t: "Blind test", sub: "run once, never tuned" }] : []),
      ].map(({ s, t, sub }) => (
        <div key={t} className="space-y-3 rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[15px] font-semibold">{t}</span>
            <span className="text-[11.5px] text-muted-foreground">{sub}</span>
          </div>
          {render(s)}
        </div>
      ))}
    </div>
  );
}

function Planted({ s }: { s: Score }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {s.planted.map((p) => {
          const K = KIND[p.kind] ?? { icon: Sparkles, label: p.kind };
          return (
            <div
              key={p.id}
              title={`${p.id} · ${p.what}`}
              className={cn("flex flex-col items-center gap-1 rounded-xl p-2.5 ring-1", p.pass ? "bg-pass/[0.07] ring-pass/25 text-pass" : "bg-fail/[0.07] ring-fail/30 text-fail")}
            >
              <K.icon className="size-4" />
              <span className="font-mono text-[11px] font-semibold">{p.id}</span>
              <span className="text-[9.5px] text-muted-foreground">{K.label}</span>
            </div>
          );
        })}
      </div>
      <details className="group">
        <summary className="cursor-pointer list-none text-[13px] font-medium text-brand">
          <span className="group-open:hidden">What each case is</span>
          <span className="hidden group-open:inline">Hide</span>
        </summary>
        <ul className="mt-2 divide-y rounded-xl bg-card ring-1 ring-border">
          {s.planted.map((p) => (
            <li key={p.id} className="px-4 py-2.5 text-[13px] leading-relaxed">
              <span className={cn("mr-2 font-mono text-[11px]", p.pass ? "text-pass" : "text-fail")}>{p.id}</span>
              {p.what}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function EvalPage() {
  const dev = loadScore("cedar_row");
  const test = loadScore("birchview");
  const cons = loadJson<{ runs: number; providers: string[]; agreement: Rate }>("consistency_cedar_row.json");
  const prov = loadJson<Record<string, { model: string; accuracy: Rate; failed_docs: string[]; misses?: { left_unresolved: number; wrong_value: number }; median_latency_ms: number | null }>>("providers_cedar_row.json");
  const replay = ["A", "B", "C"].map((o) => loadJson<{ cards_and_rules_identical: boolean }>(`replay_cedar_row__${o}.json`));
  if (!dev) return <div className="p-6 text-sm text-muted-foreground">No scores yet.</div>;
  const blind = test ?? dev;

  return (
    <main className="mx-auto w-full max-w-[1000px] space-y-16 px-6 pt-14 pb-24">
      <header className="space-y-6">
        <div>
          <p className="text-[13px] font-medium text-brand">Evaluation</p>
          <h1 className="mt-2 font-display text-[40px] leading-tight font-bold tracking-tight">Planted answers. A blind test.</h1>
        </div>
        <p className="-mt-3 text-[15px] text-muted-foreground">On the blind test: a second borrower with new layouts, run once at the end.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [`${blind.headline.real_issue_recall.k} of ${blind.headline.real_issue_recall.n}`, "real issues found"],
            [`${blind.headline.naive_diff_recall.k} of ${blind.headline.naive_diff_recall.n}`, `found by a simple diff, in ${blind.headline.alert_load.naive_diff_alerts} alerts`],
            [`${blind.extraction.all_fields.k} of ${blind.extraction.all_fields.n}`, "values read correctly"],
          ].map(([v, k]) => (
            <div key={k} className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <div className="tabular font-display text-[36px] leading-none font-bold tracking-tight">{v}</div>
              <div className="mt-2 text-[13px] text-muted-foreground">{k}</div>
            </div>
          ))}
        </div>
      </header>

      <Section title="What matters most">
        <SplitCards
          dev={dev}
          test={test}
          render={(s) => (
            <>
              <RateBar r={s.headline.real_issue_recall} label="Real issues surfaced" />
              <RateBar r={s.headline.false_explained_rate} good="low" label="Real conflicts hidden as noise" />
              <RateBar r={s.traps_and_noise_handled} label="Noise and traps handled" />
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-2">
                <div>
                  <div className="text-[11.5px] text-muted-foreground">For a person</div>
                  <div className="flex items-end gap-1">
                    {Array.from({ length: s.headline.alert_load.engine_cards }, (_, i) => (
                      <span key={i} className="h-6 w-2 rounded-sm bg-brand" />
                    ))}
                    <span className="ml-1 tabular text-[13px] font-semibold">{s.headline.alert_load.engine_cards}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11.5px] text-muted-foreground">Simple diff</div>
                  <div className="flex items-end gap-1">
                    {Array.from({ length: s.headline.alert_load.naive_diff_alerts }, (_, i) => (
                      <span key={i} className="h-6 w-2 rounded-sm bg-muted-foreground/35" />
                    ))}
                    <span className="ml-1 tabular text-[13px] font-semibold">{s.headline.alert_load.naive_diff_alerts}</span>
                  </div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">
                    caught {s.headline.naive_diff_recall.k} of {s.headline.naive_diff_recall.n} real issues
                  </div>
                </div>
              </div>
            </>
          )}
        />
      </Section>

      <Section title="Every planted case">
        <SplitCards dev={dev} test={test} render={(s) => <Planted s={s} />} />
        {test && (
          <div className="rounded-2xl bg-warn/[0.06] p-5 ring-1 ring-warn/25">
            <div className="font-display text-[15px] font-semibold">What the blind test caught</div>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
              <li><b className="text-foreground">Grader bug.</b> T7 first scored as a fail; the check also counted the legitimate T2 item. Fixed and rescored the same recorded run.</li>
              <li><b className="text-foreground">Duplicate item.</b> A subtotal became its own item. Shown as run (6); the engine fix brings a replay of the same log to 5, with no new model calls.</li>
              <li><b className="text-foreground">OCR misses.</b> Four values on a scanned page came back unresolved, not guessed.</li>
            </ul>
          </div>
        )}
      </Section>

      <Section title="Reading the documents">
        <SplitCards
          dev={dev}
          test={test}
          render={(s) => (
            <>
              <RateBar r={s.extraction.all_fields} label="All values read, numbers and text" />
              <RateBar r={s.extraction.numeric_llm} label="Numbers only · AI points, code reads" />
              <RateBar r={s.extraction.numeric_fuzzy_baseline} label="Numbers only · label-matching baseline" />
            </>
          )}
        />
        {cons && (
          <div className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
            <Repeat className="size-5 text-brand" />
            <div className="flex-1">
              <RateBar r={cons.agreement} label={`Same pick in all ${cons.runs} runs, cache off`} />
            </div>
          </div>
        )}
      </Section>

      {prov && (
        <Section title="Different models, same pointers">
          <div className="space-y-3 rounded-2xl bg-card p-5 ring-1 ring-border">
            {Object.entries(prov).map(([name, p]) => {
              const n = p.accuracy.n;
              const wrong = p.misses?.wrong_value ?? 0;
              const unres = p.misses?.left_unresolved ?? n - p.accuracy.k - wrong;
              return (
                <div key={name} className="grid grid-cols-[110px_minmax(0,1fr)_48px] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)_70px]">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{p.model.split("/").pop()?.replace(":free", "")}</div>
                    <div className="text-[11px] text-muted-foreground">{name === "ollama" ? "local, 4 GB GPU" : "free hosted tier"}</div>
                  </div>
                  <div className="flex h-4 overflow-hidden rounded-full bg-secondary" title={`${p.accuracy.k} correct · ${unres} unresolved · ${wrong} wrong`}>
                    <span className="bg-pass" style={{ width: `${(p.accuracy.k / n) * 100}%` }} />
                    <span className="bg-warn/70" style={{ width: `${(unres / n) * 100}%` }} />
                    <span className="bg-fail" style={{ width: `${(wrong / n) * 100}%` }} />
                  </div>
                  <span className="tabular inline-flex items-center justify-end gap-1 text-[12px] text-muted-foreground">
                    <Clock className="size-3" />
                    {p.median_latency_ms ? `${(p.median_latency_ms / 1000).toFixed(0)}s` : "—"}
                  </span>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-4 text-[11.5px] sm:pl-[162px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-pass" />correct</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-warn/70" />left for a person</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-fail" />wrong number (none)</span>
            </div>
          </div>
        </Section>
      )}

      <Section title="Properties of the file">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Shuffle, v: `${dev.order_invariance.k} of ${dev.order_invariance.n}`, k: "arrival orders, same result" },
            { icon: Repeat, v: `${replay.filter((r) => r?.cards_and_rules_identical).length} of ${replay.length}`, k: "replays identical, 0 model calls" },
            { icon: History, v: dev.stale_decisions ? `${dev.stale_decisions.k} of ${dev.stale_decisions.n}` : "—", k: "stale decision caught" },
          ].map((x) => (
            <div key={x.k} className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand">
                <x.icon className="size-5" />
              </span>
              <div>
                <div className="tabular font-display text-[22px] leading-none font-bold">{x.v}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">{x.k}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cost per loan file">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Sparkles, v: String(dev.cost_per_file.model_calls), k: "model calls" },
            { icon: Coins, v: `${Math.round(dev.cost_per_file.tokens_in / 1000)}k`, k: "input tokens" },
            { icon: Repeat, v: "0", k: "model calls to replay" },
          ].map((x) => (
            <div key={x.k} className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand">
                <x.icon className="size-5" />
              </span>
              <div>
                <div className="tabular font-display text-[22px] leading-none font-bold">{x.v}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">{x.k}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

    </main>
  );
}
