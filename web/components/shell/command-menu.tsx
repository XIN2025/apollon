"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BookOpen, FileText, FlaskConical, FolderKanban, GitCompareArrows, Inbox, Network, SunMoon } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DOC_TYPE_LABEL } from "@/lib/format";
import type { LoanIndex } from "@/lib/loans";

export function CommandMenu({ loans, open, onOpenChange }: { loans: LoanIndex[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a review item, document or page">
      <Command>
      <CommandInput placeholder="Search review items, documents, pages…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Review items">
          {loans.flatMap((l) =>
            l.items.map((i) => (
              <CommandItem key={i.id} value={`${i.ref} ${i.title} ${l.borrower}`} onSelect={() => go(`/loans/${l.slug}?item=${encodeURIComponent(i.id)}`)}>
                <GitCompareArrows />
                <span className="tabular w-11 shrink-0 whitespace-nowrap text-muted-foreground">{i.ref}</span>
                <span className="truncate">{i.title}</span>
              </CommandItem>
            )),
          )}
        </CommandGroup>
        <CommandGroup heading="Documents">
          {loans.flatMap((l) =>
            l.documents.map((d) => (
              <CommandItem key={l.slug + d.id} value={`${d.title} ${DOC_TYPE_LABEL[d.type]} ${l.borrower}`} onSelect={() => go(`/loans/${l.slug}?tab=docs&doc=${d.id}`)}>
                <FileText />
                <span className="truncate">{DOC_TYPE_LABEL[d.type] ?? d.type}</span>
                <span className="truncate text-muted-foreground">{l.borrower}</span>
              </CommandItem>
            )),
          )}
        </CommandGroup>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/inbox")}>
            <Inbox /> Inbox
          </CommandItem>
          <CommandItem onSelect={() => go("/loans")}>
            <FolderKanban /> Loan files
          </CommandItem>
          <CommandItem onSelect={() => go("/")}>
            <BookOpen /> Overview
          </CommandItem>
          <CommandItem onSelect={() => go("/decisions")}>
            <BookOpen /> Decisions
          </CommandItem>
          <CommandItem onSelect={() => go("/eval")}>
            <FlaskConical /> Evaluation
          </CommandItem>
          <CommandItem onSelect={() => go("/architecture")}>
            <Network /> Architecture
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              onOpenChange(false);
            }}
          >
            <SunMoon /> Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
