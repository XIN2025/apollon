"use client";

import { Building2, Fingerprint, Home, Link2, MapPin, ShieldAlert, User } from "lucide-react";
import { DocIcon } from "@/components/doc-icon";
import { OwnershipChart } from "@/components/workspace/item-visuals";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/types";

const KIND = { org: { icon: Building2, label: "Borrower" }, collateral: { icon: Home, label: "Property" }, person: { icon: User, label: "Person" } };
const BASIS: Record<string, { label: string; icon: typeof Link2 }> = {
  ein: { label: "EIN", icon: Fingerprint },
  apn: { label: "parcel no.", icon: Fingerprint },
  ssn4: { label: "SSN", icon: Fingerprint },
  "name+address": { label: "name + address", icon: MapPin },
  "name+dob": { label: "name + birth date", icon: Link2 },
  legal_name: { label: "legal name", icon: Link2 },
  address: { label: "address", icon: MapPin },
  property_name: { label: "property name", icon: Link2 },
};

export function EntitiesPanel({ run }: { run: Run; onAnchor: (a: string) => void }) {
  const lf = run.loan_file;
  const order = { org: 0, collateral: 1, person: 2 };
  const ents = [...lf.entities].sort((a, b) => order[a.kind] - order[b.kind]);
  const typeOf = (d: string) => run.documents.find((x) => x.id === d)?.type ?? "";
  return (
    <div className="space-y-5">
      {Object.keys(lf.ownership).length > 0 && <OwnershipChart run={run} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ents.map((e) => {
          const K = KIND[e.kind];
          const bases = [...new Set(lf.entity_links.filter((l) => l.entity === e.id).map((l) => l.basis))];
          const near = [...new Map(lf.near_misses.filter((n) => n.a_entity === e.id || n.b_entity === e.id).map((n) => [n.a_entity === e.id ? n.b_entity : n.a_entity, n])).entries()];
          const notParty = e.kind === "person" && e.roles.length === 1 && e.roles[0] === "pfs";
          const own = lf.ownership[e.id];
          return (
            <div key={e.id} className={cn("space-y-3 rounded-2xl p-4 ring-1", notParty ? "bg-warn/[0.05] ring-warn/30" : "bg-card ring-border")}>
              <div className="flex items-center gap-3">
                <span className={cn("grid size-9 place-items-center rounded-xl", notParty ? "bg-warn/15 text-warn" : "bg-accent text-brand")}>
                  <K.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{e.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{notParty ? "not a party" : K.label}</div>
                </div>
                {own && <span className="tabular font-display text-[20px] font-bold">{own.working}%</span>}
              </div>
              <div className="flex flex-wrap gap-1.5" title="Documents that mention it">
                {[...new Set(e.docs.map(typeOf))].map((t) => (
                  <DocIcon key={t} type={t} size="sm" />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {bases.map((b) => {
                  const B = BASIS[b] ?? { label: b, icon: Link2 };
                  return (
                    <span key={b} className="inline-flex items-center gap-1 rounded-full bg-pass/10 px-2 py-0.5 text-[11.5px] text-pass">
                      <B.icon className="size-3" /> {B.label}
                    </span>
                  );
                })}
                {near.map(([other]) => (
                  <span key={other} className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[11.5px] text-warn">
                    <ShieldAlert className="size-3" /> kept apart from {lf.entities.find((x) => x.id === other)?.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
