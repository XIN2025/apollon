import { BadgeCheck, Building2, FileSignature, FileSpreadsheet, FileText, LayoutList, Receipt, ScrollText, UserRound, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const DOC_ICON: Record<string, { icon: typeof FileText; tint: string; short: string }> = {
  loan_request: { icon: FileSignature, tint: "bg-sky-500/12 text-sky-600 dark:text-sky-400", short: "Loan request" },
  rent_roll: { icon: LayoutList, tint: "bg-teal-500/12 text-teal-600 dark:text-teal-400", short: "Rent roll" },
  operating_statement: { icon: Receipt, tint: "bg-amber-500/12 text-amber-700 dark:text-amber-400", short: "Op. statement" },
  appraisal: { icon: Building2, tint: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400", short: "Appraisal" },
  ownership_certification: { icon: BadgeCheck, tint: "bg-rose-500/12 text-rose-600 dark:text-rose-400", short: "Ownership cert." },
  operating_agreement: { icon: ScrollText, tint: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400", short: "Op. agreement" },
  pfs: { icon: UserRound, tint: "bg-slate-500/12 text-slate-600 dark:text-slate-300", short: "Personal fin." },
  irs_8825: { icon: FileSpreadsheet, tint: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", short: "Form 8825" },
  irs_4562: { icon: FileSpreadsheet, tint: "bg-green-500/12 text-green-700 dark:text-green-400", short: "Form 4562" },
  decision: { icon: UserCheck, tint: "bg-brand/12 text-brand", short: "Reviewer" },
};

export function DocIcon({ type, size = "md", className }: { type: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const m = DOC_ICON[type] ?? { icon: FileText, tint: "bg-secondary text-muted-foreground", short: type };
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        m.tint,
        size === "xs" && "size-[18px] rounded-md",
        size === "sm" && "size-6 rounded-lg",
        size === "md" && "size-9",
        size === "lg" && "size-11",
        className,
      )}
    >
      <Icon className={cn(size === "xs" ? "size-3" : size === "sm" ? "size-3.5" : size === "md" ? "size-4.5" : "size-5")} />
    </span>
  );
}
