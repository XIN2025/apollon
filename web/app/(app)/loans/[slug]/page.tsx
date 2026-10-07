import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { loadRun, loadScore } from "@/lib/data";
import { LOANS } from "@/lib/loans";

export function generateStaticParams() {
  return LOANS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: PageProps<"/loans/[slug]">) {
  const { slug } = await params;
  const l = LOANS.find((x) => x.slug === slug);
  const lf = l ? loadRun(l.scenario)?.loan_file : null;
  return { title: `${lf?.entities.find((e) => e.id === lf.borrower)?.name ?? "Loan file"} · Apollon` };
}

export default async function LoanPage({ params }: PageProps<"/loans/[slug]">) {
  const { slug } = await params;
  const l = LOANS.find((x) => x.slug === slug);
  const run = l ? loadRun(l.scenario) : null;
  if (!l || !run) notFound();
  const score = loadScore(l.scenario);
  const engine = { values: score ? { k: score.extraction.all_fields.k, n: score.extraction.all_fields.n } : null, split: l.slug === "cedar-row" ? "while building" : "blind test" };
  return (
    <Suspense>
      <Workspace run={run} slug={l.slug} refPrefix={l.ref} tag={l.tag} engine={engine} />
    </Suspense>
  );
}
