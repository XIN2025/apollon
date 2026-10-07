import Link from "next/link";
import { ArrowRight, Check, Eye, Gauge, ShieldQuestion, UserCheck } from "lucide-react";
import { DocCrop } from "@/components/site/doc-crop";
import { Replay } from "@/components/overview/replay";
import { toSteps } from "@/lib/steps";
import { loadRun, loadScore } from "@/lib/data";
import { DOC_TYPE_LABEL, money, ratio } from "@/lib/format";

const TAXES = "conflict:re_taxes:2025";
const TOUR = `/loans/cedar-row?item=${encodeURIComponent(TAXES)}&tour=1`;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-brand">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 font-display text-[34px] leading-tight font-bold tracking-tight">{children}</h2>;
}

export default function Landing() {
  const run = loadRun("cedar_row");
  const dev = loadScore("cedar_row");
  const test = loadScore("birchview");
  if (!run || !dev) return null;
  const card = run.cards.find((c) => c.id === TAXES)!;
  const os = card.observations.find((o) => o.doc_type === "operating_statement")!;
  const tax = card.observations.find((o) => o.doc_type === "irs_8825")!;
  const osDoc = run.documents.find((d) => d.id === os.doc)!;
  const taxDoc = run.documents.find((d) => d.id === tax.doc)!;
  const flip = card.decision_impact[0];

  const conflictCard = (compact = false) => (
    <div className={`float rounded-[20px] border border-white bg-card/95 ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-center gap-2 text-[12px] font-semibold text-fail">
        <span className="size-2 rounded-full bg-fail" /> Changes the decision
      </div>
      <h3 className={`mt-1.5 font-display font-semibold tracking-tight ${compact ? "text-[17px]" : "text-[21px]"}`}>Real estate taxes disagree</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-secondary px-3.5 py-2.5">
          <div className="text-[11.5px] text-muted-foreground">Borrower says</div>
          <div className={`tabular font-display font-semibold ${compact ? "text-[20px]" : "text-[24px]"}`}>{money(os.value)}</div>
        </div>
        <div className="rounded-2xl bg-accent px-3.5 py-2.5 ring-[1.5px] ring-brand">
          <div className="text-[11.5px] text-muted-foreground">Tax return says</div>
          <div className={`tabular font-display font-semibold ${compact ? "text-[20px]" : "text-[24px]"}`}>{money(tax.value)}</div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 rounded-2xl bg-fail/[0.07] px-3.5 py-2 text-[13px]">
        <span>Loan passes?</span>
        <span className="tabular">
          yes, {ratio(flip.alternative.value as string)} <span className="text-faint">→</span>{" "}
          <b className="text-fail">no, {ratio(flip.working.value as string)}</b>
        </span>
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 text-[13.5px] font-semibold">
          <Link href={TOUR} className="rounded-xl bg-brand py-2.5 text-center text-brand-foreground">
            <Check className="mr-1 inline size-4" /> Accept
          </Link>
          <span className="rounded-xl bg-secondary py-2.5 text-center">Request document</span>
          <span className="rounded-xl bg-secondary px-4 py-2.5 text-center">Escalate</span>
        </div>
      )}
    </div>
  );

  const steps = [
    {
      n: 1,
      t: "Documents arrive",
      b: "PDFs and scans, in any order.",
      visual: (
        <div className="flex flex-wrap content-center gap-1.5">
          {[...new Set(run.documents.map((d) => d.type))].map((t) => (
            <span key={t} className="rounded-full bg-card px-2.5 py-1 text-[12px] ring-1 ring-border">
              {DOC_TYPE_LABEL[t]}
            </span>
          ))}
        </div>
      ),
    },
    {
      n: 2,
      t: "Every number is traced",
      b: "To the exact cell, on the real page.",
      visual: (
        <div className="mx-auto w-full max-w-[440px] overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <DocCrop scenario={run.scenario} anchor={run.anchors[tax.anchors[0]]} pages={taxDoc.pages} label="Real estate taxes" />
        </div>
      ),
    },
    { n: 3, t: "You decide what matters", b: "Noise is explained away. The rest comes to you.", visual: conflictCard(true) },
  ];

  const blind = test ?? dev;
  const h = blind.headline;
  const proof = [
    { v: `${h.real_issue_recall.k} of ${h.real_issue_recall.n}`, k: "real issues found" },
    { v: String(h.false_explained_rate.k), k: "real problems hidden as noise" },
    { v: `${h.naive_diff_recall.k} of ${h.naive_diff_recall.n}`, k: `found by a simple diff, in ${h.alert_load.naive_diff_alerts} alerts` },
  ];

  return (
    <main>
      <section className="soft-bg relative overflow-hidden">
        <div className="grid-lines pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-6 pt-14 pb-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-20 lg:pb-24">
          <div>
            <Eyebrow>For commercial real-estate underwriters · a proof of concept on synthetic files</Eyebrow>
            <h1 className="mt-4 font-display text-[48px] leading-[1.0] font-bold tracking-[-0.035em] sm:text-[64px] xl:text-[72px]">
              Four things
              <br />
              need you.
              <br />
              <span className="text-brand">Not eight.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-muted-foreground">
              Apollon reads a borrower’s documents. A simple diff here raises {dev.headline.alert_load.naive_diff_alerts} alerts and misses{" "}
              {dev.headline.naive_diff_recall.n - dev.headline.naive_diff_recall.k} real issues.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={TOUR}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-[15px] font-semibold text-brand-foreground shadow-[0_10px_30px_rgba(108,76,245,.35)] transition-transform hover:-translate-y-px"
              >
                Take the 60-second tour <ArrowRight className="size-4" />
              </Link>
              <Link href="/decisions" className="inline-flex items-center rounded-full bg-card px-5 py-3 text-[15px] font-semibold shadow-sm ring-1 ring-border transition-transform hover:-translate-y-px">
                Why it’s built this way
              </Link>
            </div>
          </div>
          <div className="relative flex flex-col gap-4 lg:block lg:h-[520px]">
            <div className="float overflow-hidden rounded-2xl border border-white bg-card lg:absolute lg:top-0 lg:left-4 lg:w-[400px]">
              <div className="border-b px-4 py-2 text-[12px] text-muted-foreground">Borrower’s operating statement</div>
              <DocCrop scenario={run.scenario} anchor={run.anchors[os.anchors[0]]} pages={osDoc.pages} label="Property taxes" />
            </div>
            <div className="lg:absolute lg:top-[170px] lg:right-0 lg:w-[430px]">{conflictCard()}</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <Eyebrow>How it works</Eyebrow>
        <H2>Three steps. You only do the last one.</H2>
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="space-y-4">
              <div className="flex h-[230px] items-center rounded-2xl bg-subtle p-5 lg:h-[260px]">{s.visual}</div>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[15px] font-bold text-brand">{s.n}</span>
                <div>
                  <div className="font-display text-[18px] font-semibold">{s.t}</div>
                  <div className="text-[14px] text-muted-foreground">{s.b}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-subtle">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <Eyebrow>A living loan file</Eyebrow>
          <H2>Watch it build as documents arrive.</H2>
          <p className="mt-3 text-[15px] text-muted-foreground">Ten documents, in the order they came in. Click any step.</p>
          <div className="mt-10">
            <Replay scenario={run.scenario} steps={toSteps(run)} />
          </div>
        </div>
      </section>

      <section id="trust" className="mx-auto max-w-[1200px] scroll-mt-16 px-6 py-24">
        <Eyebrow>Why you can trust it</Eyebrow>
        <H2>The AI points. You decide.</H2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Eye, t: "Shows its source", b: "Every number opens the page it came from." },
            { icon: ShieldQuestion, t: "Says when unsure", b: "No guesses. Unclear values come to you." },
            { icon: Gauge, t: "Shows what changes", b: "See the decision flip before you choose." },
            { icon: UserCheck, t: "Never decides for you", b: "AI is labelled, and can’t close an item." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <span className="grid size-9 place-items-center rounded-xl bg-accent text-brand">
                <x.icon className="size-4" />
              </span>
              <div className="mt-4 font-display text-[17px] font-semibold">{x.t}</div>
              <div className="mt-1 text-[14px] text-muted-foreground">{x.b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-subtle">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <Eyebrow>Measured, not guessed</Eyebrow>
          <H2>Tested on a borrower it had never seen.</H2>
          <p className="mt-3 text-[15px] text-muted-foreground">New layouts, run once at the end. Nothing was tuned on it.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {proof.map((x) => (
              <div key={x.k} className="rounded-2xl bg-card p-6 ring-1 ring-border">
                <div className="tabular font-display text-[44px] leading-none font-bold tracking-tight">{x.v}</div>
                <div className="mt-2 text-[14px] text-muted-foreground">{x.k}</div>
              </div>
            ))}
          </div>
          <Link href="/eval" className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand hover:underline">
            See how it was measured <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="soft-bg relative overflow-hidden rounded-[28px] px-8 py-14 ring-1 ring-border sm:px-14">
          <h2 className="font-display text-[34px] leading-tight font-bold tracking-tight">See it in 60 seconds.</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={TOUR} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-[15px] font-semibold text-brand-foreground">
              Take the tour <ArrowRight className="size-4" />
            </Link>
            <Link href="/inbox" className="inline-flex items-center rounded-full bg-card px-5 py-3 text-[15px] font-semibold ring-1 ring-border">
              Explore on my own
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
