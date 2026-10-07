import Link from "next/link";
import { loanIndex } from "@/lib/data";
import { money, pct } from "@/lib/format";
import { DscrGauge, DocBar, ItemDots } from "@/components/glance";

export const metadata = { title: "Loan files · Apollon" };

export default function LoansPage() {
  const loans = loanIndex();
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Loan files</h1>
        <p className="text-[13px] text-muted-foreground">Built from each borrower’s package as documents arrive. Synthetic borrowers, recorded runs.</p>
      </header>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b text-left text-[12px] text-muted-foreground">
              <th className="px-4 py-2.5 font-normal">Borrower</th>
              <th className="px-4 py-2.5 text-right font-normal">Amount</th>
              <th className="px-4 py-2.5 text-right font-normal">DSCR</th>
              <th className="px-4 py-2.5 text-right font-normal">LTV</th>
              <th className="px-4 py-2.5 text-right font-normal">Open</th>
              <th className="px-4 py-2.5 text-right font-normal">Documents</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.slug} className="border-b last:border-b-0 hover:bg-secondary/50">
                <td className="px-4 py-3">
                  <Link href={`/loans/${l.slug}`} className="block">
                    <span className="font-medium hover:underline">{l.borrower}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {l.collateral} · {l.tag}
                    </span>
                  </Link>
                </td>
                <td className="tabular px-4 py-3 text-right">${money(l.amount)}</td>
                <td className="px-4 py-3 text-right">
                  <DscrGauge value={l.dscr.value} result={l.dscr.result} className="justify-end" />
                </td>
                <td className="tabular px-4 py-3 text-right text-muted-foreground">{l.ltv.value ? pct(l.ltv.value) : "no appraisal"}</td>
                <td className="px-4 py-3 text-right">
                  <ItemDots items={l.items} className="justify-end" />
                </td>
                <td className="px-4 py-3 text-right">
                  <DocBar have={8 - l.missingDocs} total={8} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
