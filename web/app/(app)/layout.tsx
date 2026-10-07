import { AppShell } from "@/components/shell/app-shell";
import { loanIndex } from "@/lib/data";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell loans={loanIndex()}>{children}</AppShell>;
}
