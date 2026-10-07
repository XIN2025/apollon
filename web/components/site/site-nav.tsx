"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApollonWordmark } from "@/components/brand";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#trust", label: "How it earns trust" },
  { href: "/decisions", label: "Decisions" },
  { href: "/eval", label: "Evaluation" },
  { href: "/architecture", label: "Architecture" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <ApollonWordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground",
                path === l.href && "text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/inbox" className="ml-auto rounded-full bg-foreground px-4 py-2 text-[13.5px] font-medium text-background transition-opacity hover:opacity-90">
          Open workspace
        </Link>
      </div>
    </header>
  );
}
