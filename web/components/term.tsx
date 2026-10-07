"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const GLOSSARY: Record<string, string> = {
  DSCR: "Debt service coverage: the property’s yearly income divided by the yearly loan payments. Below 1.25x, the example policy says no.",
  LTV: "Loan to value: the loan amount divided by the appraised value of the property.",
  NOI: "Net operating income: rent and other income minus running costs, before loan payments.",
  "Form 8825": "The IRS tax form where a partnership reports income and expenses for each rental property.",
  "Form 4562": "The IRS form for depreciation. It also tells us which tax year the return covers.",
  "beneficial owner": "Anyone owning 25% or more of the borrowing company. Banks must identify them (31 CFR 1010.230).",
  PFS: "Personal financial statement: an owner’s own assets, debts and net worth.",
  "operating statement": "The borrower’s own summary of the property’s income and costs for a year.",
  "operating agreement": "The legal document that says who owns the LLC, and in what share.",
  "working value": "The value the engine uses until you decide, chosen by the bank’s policy.",
};

export function Term({ t, children }: { t: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const def = GLOSSARY[t];
  if (!def) return <>{children ?? t}</>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        className="cursor-help underline decoration-faint decoration-dotted underline-offset-[3px]"
      >
        {children ?? t}
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-[12.5px] leading-snug">{def}</TooltipContent>
    </Tooltip>
  );
}
