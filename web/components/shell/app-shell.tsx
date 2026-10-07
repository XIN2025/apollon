"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BookOpen,
  FlaskConical,
  FolderKanban,
  Inbox,
  Landmark,
  Menu,
  Moon,
  Network,
  Scale,
  Search,
  Sun,
  User,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Kbd } from "@/components/ui/kbd";
import { ApollonMark } from "@/components/brand";
import { CommandMenu } from "./command-menu";
import { useReview } from "./review-store";
import { cn } from "@/lib/utils";
import type { LoanIndex } from "@/lib/loans";

function NavLink({ href, icon: Icon, label, count, active }: { href: string; icon: typeof Inbox; label: string; count?: number; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "bg-secondary text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 && <span className="tabular ml-auto text-[11px] text-muted-foreground">{count}</span>}
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- theme is only known after mount
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function SidebarBody({ loans, onSearch }: { loans: LoanIndex[]; onSearch: () => void }) {
  const path = usePathname();
  const { actions } = useReview();
  const open = (l: LoanIndex) => l.items.filter((i) => !actions[i.id]).length;
  const inbox = loans.reduce((n, l) => n + open(l), 0);
  return (
    <div className="flex h-full flex-col gap-4 px-2.5 py-3">
      <div className="flex items-center gap-2 px-1">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><Landmark className="size-4" /></span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-semibold">Sample Bank</div>
          <div className="truncate text-[11px] text-muted-foreground">Demo workspace · CRE lending</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="flex h-8 items-center gap-2 rounded-md border bg-card px-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-3.5" />
        Search or jump to…
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>

      <nav className="space-y-0.5">
        <NavLink href="/inbox" icon={Inbox} label="Inbox" count={inbox} active={path === "/inbox"} />
        <NavLink href="/loans" icon={FolderKanban} label="Loan files" active={path === "/loans"} />
      </nav>

      <div className="space-y-0.5">
        <div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">Loan files</div>
        {loans.map((l) => (
          <Link
            key={l.slug}
            href={`/loans/${l.slug}`}
            className={cn(
              "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground",
              path.startsWith(`/loans/${l.slug}`) && "bg-secondary text-foreground",
            )}
          >
            <span className={cn("size-2 shrink-0 rounded-sm", l.dscr.result === "fail" ? "bg-fail" : "bg-pass")} />
            <span className="truncate">{l.borrower}</span>
            {open(l) > 0 && <span className="tabular ml-auto text-[11px]">{open(l)}</span>}
          </Link>
        ))}
      </div>

      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium text-muted-foreground"><ApollonMark className="size-4" /> About Apollon</div>
        <NavLink href="/" icon={BookOpen} label="Overview" active={false} />
        <NavLink href="/decisions" icon={Scale} label="Decisions" active={false} />
        <NavLink href="/eval" icon={FlaskConical} label="Evaluation" active={path === "/eval"} />
        <NavLink href="/architecture" icon={Network} label="Architecture" active={path === "/architecture"} />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t px-1 pt-3">
        <span className="grid size-6 place-items-center rounded-full bg-secondary text-muted-foreground"><User className="size-3.5" /></span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12px]">You</div>
          <div className="truncate text-[11px] text-muted-foreground">Underwriter view</div>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppShell({ loans, children }: { loans: LoanIndex[]; children: React.ReactNode }) {
  const [search, setSearch] = useState(false);
  const [mobile, setMobile] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside className="hidden w-[232px] shrink-0 border-r bg-panel md:block">
          <SidebarBody loans={loans} onSearch={() => setSearch(true)} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-panel px-3 md:hidden">
            <button type="button" aria-label="Open navigation" onClick={() => setMobile(true)} className="grid size-8 place-items-center rounded-md hover:bg-secondary">
              <Menu className="size-4" />
            </button>
            <span className="text-[13px] font-semibold">Sample Bank</span>
            <button type="button" aria-label="Search" onClick={() => setSearch(true)} className="ml-auto grid size-8 place-items-center rounded-md hover:bg-secondary">
              <Search className="size-4" />
            </button>
          </div>
          <main key={path} className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-[260px] bg-panel p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div onClick={(e) => (e.target as HTMLElement).closest("a") && setMobile(false)} className="h-full">
            <SidebarBody loans={loans} onSearch={() => { setMobile(false); setSearch(true); }} />
          </div>
        </SheetContent>
      </Sheet>
      <CommandMenu loans={loans} open={search} onOpenChange={setSearch} />
    </>
  );
}
