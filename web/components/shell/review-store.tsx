"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Resolution = "accepted" | "requested" | "escalated";
export interface Action {
  resolution: Resolution;
  reason: string;
  note: string;
  at: string;
}

interface Store {
  actions: Record<string, Action>;
  act: (cardId: string, a: Omit<Action, "at">) => void;
  undo: (cardId: string) => void;
}

const Ctx = createContext<Store | null>(null);
const KEY = "loanfile.review.v1";

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = useState<Record<string, Action>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate once from this viewer's browser
      if (raw) setActions(JSON.parse(raw));
    } catch {
      /* storage blocked: start empty */
    }
  }, []);

  const save = (next: Record<string, Action>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not persisted; the page still works */
    }
  };

  const act = useCallback((cardId: string, a: Omit<Action, "at">) => {
    setActions((prev) => {
      const next = { ...prev, [cardId]: { ...a, at: new Date().toISOString() } };
      save(next);
      return next;
    });
  }, []);

  const undo = useCallback((cardId: string) => {
    setActions((prev) => {
      const next = { ...prev };
      delete next[cardId];
      save(next);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ actions, act, undo }}>{children}</Ctx.Provider>;
}

export function useReview() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useReview outside ReviewProvider");
  return c;
}
