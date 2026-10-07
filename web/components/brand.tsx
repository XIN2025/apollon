/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

export function ApollonMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block size-7 shrink-0", className)} aria-hidden>
      <img src="/brand/apollon-light.png" alt="" className="absolute inset-0 size-full dark:hidden" />
      <img src="/brand/apollon-dark.png" alt="" className="absolute inset-0 hidden size-full dark:block" />
    </span>
  );
}

export function ApollonWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ApollonMark className="size-9 -my-1" />
      <span className="font-display text-[15px] font-semibold tracking-tight">Apollon</span>
    </span>
  );
}
