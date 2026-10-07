import { ArrowRight, Calculator, History, Landmark, Sparkles, Undo2, UserCheck } from "lucide-react";
import type { Rate } from "@/lib/types";

interface Local {
  model: string;
  accuracy: Rate;
  misses?: { left_unresolved: number; wrong_value: number };
}

function Card({ g, title, body, children }: { g: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="text-[11px] font-medium tracking-wide text-faint uppercase">{g}</div>
      <h3 className="mt-2 font-display text-[17px] leading-snug font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-4 rounded-xl bg-subtle p-3 text-[12.5px]">{children}</div>
    </article>
  );
}

export function TrustGrid({ local }: { local: Local | null }) {
  return (
    <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <Card g="HAX G1 · what it can do" title="Says what it reads, and what it doesn’t" body="Nine document types, one loan type, an example policy. Anything outside that is unresolved, not guessed.">
        <div className="flex flex-wrap gap-1.5">
          {["Rent roll", "Operating statement", "Form 8825", "Form 4562", "Appraisal", "Ownership", "+3"].map((x) => (
            <span key={x} className="rounded-full bg-card px-2 py-0.5 ring-1 ring-border">
              {x}
            </span>
          ))}
        </div>
      </Card>
      <Card g="HAX G2 · how well" title="Shows how good it is, with numbers" body="Measured accuracy sits next to the work, including where it fails: a scanned page lost four values.">
        <div className="space-y-1 tabular">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Values read · while building</span>
            <b>141 / 141</b>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Values read · blind test</span>
            <b>175 / 179</b>
          </div>
        </div>
      </Card>
      <Card g="HAX G11 · why it did that" title="Every item shows how it was built" body="Which cell the model pointed at, what code computed, which policy rule chose the working value.">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-model" /> AI pointed at line 10
          </div>
          <div className="flex items-center gap-2">
            <Calculator className="size-3.5" /> Code: 27,200 vs 41,800
          </div>
          <div className="flex items-center gap-2">
            <Landmark className="size-3.5 text-policy" /> Policy: filed return wins
          </div>
        </div>
      </Card>
      <Card g="HAX G16 · consequences" title="Shows what flips before you decide" body="Every conflict re-runs the rules with each value, so you see the decision it changes.">
        <div className="flex items-center justify-between">
          <span>DSCR ≥ 1.25x</span>
          <span className="tabular">
            1.29x <ArrowRight className="inline size-3" /> <b className="text-fail">1.22x</b>
          </span>
        </div>
      </Card>
      <Card g="HAX G10 · scope when in doubt" title="When unsure, it says so" body="A weak local model can’t make up a number: its misses become “unresolved” for a person.">
        {local?.misses ? (
          <div className="space-y-1 tabular">
            <div className="flex justify-between">
              <span className="text-muted-foreground">4B model · left unresolved</span>
              <b>{local.misses.left_unresolved}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">4B model · wrong values</span>
              <b className="text-pass">{local.misses.wrong_value}</b>
            </div>
          </div>
        ) : (
          <span>Misses stay unresolved.</span>
        )}
      </Card>
      <Card g="HAX G9 · efficient correction" title="One key to decide, one to undo" body="Accept, request a document or escalate, each with a reason code that is recorded with the facts.">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-lg bg-brand px-2 py-1 font-medium text-brand-foreground">Accept · A</span>
          <span className="rounded-lg bg-card px-2 py-1 ring-1 ring-border">Request · R</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Undo2 className="size-3" /> Undo
          </span>
        </div>
      </Card>
      <Card g="HAX G18 · notify about changes" title="Old decisions go stale when facts change" body="The underwriter accepted the owners; the amended agreement arrived and the decision was flagged.">
        <div className="flex items-center gap-2">
          <History className="size-3.5 text-warn" /> Marcus Lee 24% → 26% · decision stale
        </div>
      </Card>
      <Card g="Atlassian · Uses AI. Verify results." title="AI is always labelled, and never closes an item" body="The investigator suggests causes and what would confirm them. Only a person resolves.">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-model" /> Uses AI · unverified
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
            <UserCheck className="size-3.5" /> you decide
          </span>
        </div>
      </Card>
    </div>
  );
}
