import { ArchExplorer } from "@/components/architecture/arch-explorer";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { TIERS } from "@/lib/architecture";
import { DECISIONS } from "@/lib/decisions";
import { TrustGrid } from "@/components/site/trust-grid";
import { loadJson } from "@/lib/data";
import type { Rate } from "@/lib/types";

export const metadata = { title: "Architecture · Apollon" };

export default function ArchitecturePage() {
  const prov = loadJson<Record<string, { model: string; accuracy: Rate; misses?: { left_unresolved: number; wrong_value: number } }>>("providers_cedar_row.json");
  return (
    <div className="mx-auto w-full max-w-[1260px] space-y-20 px-4 pt-14 pb-24 sm:px-6">
      <header className="max-w-[68ch]">
        <p className="text-[13px] font-medium text-brand">Architecture</p>
        <h1 className="mt-2 font-display text-[40px] leading-tight font-bold tracking-tight">What runs, and what plugs in next.</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">Solid boxes run in this PoC. Dashed ones are designed. Click any box.</p>
      </header>

      <ArchExplorer />

      <Link href="/decisions" className="group flex items-center gap-5 rounded-2xl bg-card p-6 ring-1 ring-border transition-colors hover:bg-accent">
        <div className="flex-1">
          <div className="text-[13px] font-medium text-brand">Decision log</div>
          <div className="mt-1 font-display text-[22px] font-bold tracking-tight">Why it’s built this way</div>
          <div className="mt-1 text-[14px] text-muted-foreground">{DECISIONS.length} decisions, each with what was rejected, what it costs, and a link to its proof.</div>
        </div>
        <ArrowUpRight className="size-6 text-faint group-hover:text-brand" />
      </Link>

      <details id="trust" className="group scroll-mt-20 rounded-2xl bg-card ring-1 ring-border">
        <summary className="flex cursor-pointer list-none items-center gap-4 p-6 [&::-webkit-details-marker]:hidden">
          <div className="flex-1">
            <h2 className="text-[22px] font-semibold tracking-tight">Trust, guideline by guideline</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">Microsoft’s guidelines for human-AI interaction, each mapped to a screen.</p>
          </div>
          <ChevronDown className="size-5 shrink-0 text-faint transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-6 pb-6">
          <TrustGrid local={prov?.ollama ?? null} />
        </div>
      </details>

      <section className="space-y-6">
        <div className="max-w-[68ch]">
          <h2 className="text-[22px] font-semibold tracking-tight">Where it runs</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Designed. The model gateway already swaps providers from a config file; this PoC ran on hosted free tiers and a 4-billion
            parameter local model, with synthetic data only.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b text-left text-[13px] text-muted-foreground">
                <th className="px-4 py-2.5 font-normal">Tier</th>
                <th className="px-4 py-2.5 font-normal">Models</th>
                <th className="px-4 py-2.5 font-normal">Borrower data</th>
                <th className="px-4 py-2.5 font-normal">Fits</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.tier} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{t.tier}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.models}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.data}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.fit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
