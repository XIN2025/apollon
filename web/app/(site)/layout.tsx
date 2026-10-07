import { ApollonWordmark } from "@/components/brand";
import { SiteNav } from "@/components/site/site-nav";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      {children}
      <footer className="border-t">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-[13px] text-muted-foreground">
          <ApollonWordmark className="text-foreground" />
          <span>A proof of concept. Synthetic borrowers, real IRS form layouts, example policy, recorded runs.</span>
          <span className="sm:ml-auto">Built by Rajesh Sharma</span>
        </div>
      </footer>
    </div>
  );
}
