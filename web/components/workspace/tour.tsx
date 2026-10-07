"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const TOUR_KEY = "loanfile.tour.v1";

const STEPS = [
  { target: "queue", title: "Start here", body: "Only the items that need a person. Red ones change the credit decision." },
  { target: "impact", title: "What changes", body: "The decision with each number. Here, the loan passes with one and fails with the other." },
  { target: "sources", title: "Where it came from", body: "Every number is a cell on a real page. Click the crop to open it." },
  { target: "actions", title: "Decide", body: "Accept, ask for a document, or escalate. One key each, and you can undo." },
];

type Rect = { top: number; left: number; width: number; height: number };

function visible(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
}

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = STEPS;
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const available = useCallback(() => steps.filter((s) => visible(document.querySelector(`[data-tour="${s.target}"]`))), [steps]);

  const measure = useCallback(() => {
    const list = available();
    const step = list[Math.min(i, list.length - 1)];
    const el = step ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    if (!visible(el)) return setRect(null);
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
  }, [available, i]);

  useLayoutEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- position depends on layout
    measure();
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, measure]);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_KEY, "done");
    } catch {
      /* not remembered; fine */
    }
    setI(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, finish]);

  if (!open || !rect) return null;
  const list = available();
  const idx = Math.min(i, list.length - 1);
  const step = list[idx];
  const tall = rect.height > window.innerHeight * 0.5;
  const above = rect.top - 200 >= 12;
  const side = rect.left + rect.width + 344 < window.innerWidth ? rect.left + rect.width + 12 : Math.max(rect.left - 332, 12);
  const cardLeft = tall ? side : Math.min(Math.max(rect.left, 12), window.innerWidth - 332);
  // Keep the card off the numbers each step explains: above the target when it fits, low beside tall ones.
  const cardTop = tall ? window.innerHeight - 212 : above ? rect.top - 200 : Math.min(rect.top + rect.height + 12, window.innerHeight - 200);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Product tour">
      <div className="absolute inset-0" onClick={finish} />
      <div
        className="pointer-events-none absolute rounded-2xl ring-2 ring-brand transition-all duration-300"
        style={{ ...rect, boxShadow: "0 0 0 9999px rgba(23, 16, 52, 0.55)" }}
      />
      <div
        className="absolute w-[320px] rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-border transition-all duration-300"
        style={{ left: cardLeft, top: cardTop }}
      >
        <div className="text-[12px] font-medium text-brand">
          {idx + 1} of {list.length}
        </div>
        <div className="mt-1 font-display text-[18px] font-semibold tracking-tight">{step.title}</div>
        <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={finish} className="text-[13px] text-muted-foreground hover:text-foreground">
            Skip
          </button>
          {idx > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto rounded-full" onClick={() => setI(idx - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" className={idx > 0 ? "rounded-full px-4" : "ml-auto rounded-full px-4"} onClick={() => (idx >= list.length - 1 ? finish() : setI(idx + 1))}>
            {idx >= list.length - 1 ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
