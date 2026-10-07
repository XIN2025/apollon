import { Inbox } from "@/components/inbox/inbox";
import { loanIndex } from "@/lib/data";

export const metadata = { title: "Inbox · Apollon" };

export default function InboxPage() {
  return <Inbox loans={loanIndex()} />;
}
