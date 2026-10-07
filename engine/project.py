"""Event log -> loan file. A pure fold: the same events always give the same file, in any arrival order."""
import json
import sqlite3
from datetime import datetime, UTC
from decimal import Decimal as D
from pathlib import Path

import yaml

from engine.entities import resolve
from engine.extract import Obs
from engine.reconcile import EXPENSE, INCOME, LABEL, reconcile
from engine.rules import evaluate, flips

ROOT = Path(__file__).parent.parent
POLICY = yaml.safe_load((ROOT / "policy" / "example_bank.yaml").read_text(encoding="utf-8"))
RULE_LABEL = {"dscr": "Debt service coverage", "ltv": "Loan to value", "occupancy": "Occupancy", "appraisal_tie": "Appraisal tie-out",
              "beneficial_owners": "Beneficial owners identified", "ownership_total": "Ownership adds to 100%",
              "required_documents": "Required documents", "tax_return_entity": "Tax return filed by borrower",
              "documents_foot": "Documents add up"}


class Store:
    def __init__(self, path: Path, fresh=False):
        if fresh and path.exists():
            path.unlink()
        self.db = sqlite3.connect(path)
        self.db.execute("create table if not exists events (seq integer primary key, type text, payload text, at text)")

    def append(self, type_, payload):
        at = datetime.now(UTC).isoformat(timespec="seconds")
        cur = self.db.execute("insert into events (type, payload, at) values (?, ?, ?)", (type_, json.dumps(payload, default=str), at))
        self.db.commit()
        return cur.lastrowid

    def all(self):
        return [{"seq": s, "type": t, "payload": json.loads(p), "at": a}
                for s, t, p, a in self.db.execute("select seq, type, payload, at from events order by seq")]


def fold(events, policy=POLICY):
    docs, parsed, obs_by_doc, hyps, decisions = {}, {}, {}, {}, []
    for e in events:
        p = e["payload"]
        if e["type"] == "doc_received":
            docs[p["doc_id"]] = {"id": p["doc_id"], "seq": e["seq"], "file": p["file"], "pages": p["pages"], "type": None, "title": p["title"]}
        elif e["type"] == "doc_parsed":
            parsed[p["doc_id"]] = p["parsed"]
        elif e["type"] == "doc_classified":
            docs[p["doc_id"]]["type"] = p["type"]
            docs[p["doc_id"]]["title"] = p.get("title") or docs[p["doc_id"]]["title"]
        elif e["type"] == "observations_recorded":
            obs_by_doc[p["doc_id"]] = {"obs": [Obs(**o) for o in p["obs"]], "unresolved": p["unresolved"], "absent": p["absent"], "seq": e["seq"]}
        elif e["type"] == "hypothesis_recorded":
            hyps[p["card_id"]] = p
        elif e["type"] == "decision_recorded":
            decisions.append(p | {"seq": e["seq"]})
    obs = [o for d in sorted(obs_by_doc) for o in obs_by_doc[d]["obs"]]
    obs_ix = {o.id: o for o in obs}
    anchors = anchor_map(parsed)
    ents = resolve(obs)
    rec = reconcile(obs, ents, docs, policy)
    rules = evaluate(rec["working"], policy)
    cards = build_cards(rec, rules, ents, docs, obs_ix, anchors, policy)
    for c in cards:
        if c["id"] in hyps:
            h = hyps[c["id"]]
            c["hypothesis"] = {**h["data"], "by": h["by"], "unverified": True}
            c["steps"].append({"by": "model_suggested", "text": "Investigator suggestion (unverified, cannot resolve the card): " + h["data"]["hypothesis"],
                               "anchors": h["data"].get("cite_anchors", [])})
    decs = [decision_status(d, rec, rules, cards, docs, obs_ix) for d in decisions]
    for d in decs:
        for c in cards:
            if c["id"] == d.get("card_id"):
                c["steps"].append({"by": "human_decided", "text": f"{d['reviewer']}: {d['action']} ({d['reason_code']})"
                                   + (" - now STALE" if d["status"] == "stale" else ""), "anchors": []})
    index = {}
    for o in obs:
        for a in o.anchors:
            index.setdefault(a, {"obs": [], "cards": []})["obs"].append(o.id)
    for c in cards:
        for a in {a for ob in c["observations"] for a in ob["anchors"]}:
            index.setdefault(a, {"obs": [], "cards": []})["cards"].append(c["id"])
    return {"documents": docs, "observations": [o.model_dump() for o in obs],
            "extraction": {d: {"unresolved": v["unresolved"], "absent": v["absent"]} for d, v in obs_by_doc.items()},
            "entities": ents["entities"], "entity_links": ents["links"], "near_misses": ents["near_misses"],
            "borrower": rec["borrower"], "collateral": rec["collateral"], "statements": rec["statements"],
            "comparisons": rec["comparisons"], "bridges": rec["bridges"], "ownership": rec["ownership"],
            "rent_rolls": rec["rent_rolls"], "footing": rec["footing"], "working": rec["working"],
            "rules": rules, "cards": cards, "decisions": decs, "anchors_index": index, "anchors": anchors}


def anchor_map(parsed):
    out = {}
    for doc, p in parsed.items():
        toks = {t["id"]: t for t in p["tokens"]}
        for c in p["cells"]:
            scores = [toks[t]["score"] for t in c["tokens"] if toks[t].get("score") is not None]
            out[c["id"]] = {"doc": doc, "page": c["page"], "bbox": c["bbox"], "text": c["text"], "row_label": c["row_label"],
                            "col_header": c["col_header"], "ocr_score": min(scores) if scores else None}
        for s in p["spans"]:
            out[s["id"]] = {"doc": doc, "page": s["page"], "bbox": s["bbox"], "text": s["text"], "row_label": "", "col_header": "",
                            "ocr_score": None}
    return out


def obs_view(o, docs, anchors, role=None):
    a = anchors.get(o.anchors[0], {}) if o.anchors else {}
    return {"id": o.id, "doc": o.doc_id, "doc_type": o.doc_type, "doc_title": docs[o.doc_id]["title"], "field": o.field,
            "value": o.value, "printed": o.raw, "label": a.get("row_label") or o.field, "anchors": o.anchors,
            "quote": o.quote, "transforms": o.transforms, "role": role or POLICY["roles"].get(o.doc_type),
            "by": {k: o.by.get(k) for k in ("provider", "model", "prompt_v")}}


def money(v):
    v = D(v)
    return f"{v:,.2f}" if v != v.to_integral() else f"{v:,.0f}"


def build_cards(rec, rules, ents, docs, obs_ix, anchors, policy):
    cards, w = [], rec["working"]
    title = lambda d: docs[d]["title"]
    stmt = {s["doc"]: s for s in rec["statements"]}
    in_bridge = {e["cmp"]: b for b in rec["bridges"] for e in b["located_in"]}
    def explained_subtotal(c):
        """A total that differs only because its own lines differ adds nothing; the line-level card already carries it."""
        pair = {c["a"]["doc"], c["b"]["doc"]}
        parts = [x for x in rec["comparisons"] if x["concept"] in INCOME and {x["a"]["doc"], x["b"]["doc"]} == pair and "delta" in x]
        sign = lambda x: 1 if x["a"]["doc"] == c["a"]["doc"] else -1
        return parts and abs(sum(sign(x) * D(x["delta"]) for x in parts) - D(c["delta"])) < 1

    for c in rec["comparisons"]:
        if c["status"] != "difference" or c["concept"] not in INCOME + EXPENSE + ["total_income"]:
            continue
        if c["concept"] == "total_income" and explained_subtotal(c):
            continue
        a, b = stmt[c["a"]["doc"]], stmt[c["b"]["doc"]]
        tax, bor = (a, b) if a["role"] == "tax_return" else (b, a)
        if tax["role"] != "tax_return":
            continue
        bv = c["a"]["value"] if bor is a else c["b"]["value"]
        tv = c["b"]["value"] if bor is a else c["a"]["value"]

        def mutate(alt, doc=bor["doc"], concept=c["concept"], value=bv):
            for s in alt["statements"]:
                if s["doc"] == doc and concept in s["lines"]:
                    s["lines"][concept] = value
        impact = flips(w, policy, mutate) if c["concept"] != "total_income" else []
        axes = (["decision"] if impact else []) + (["integrity"] if c.get("material_integrity") else [])
        if not axes:
            continue
        ob = [obs_ix[i] for i in c["a"]["obs"] + c["b"]["obs"]]
        related = [x for x in rec["comparisons"] if x["concept"] == c["concept"] and x["status"] == "not_comparable"
                   and x["reason"] == "estimate_vs_actual"]
        br = in_bridge.get(c["id"])
        steps = [
            {"by": "model_picked", "text": f"Pointed to the {LABEL[c['concept']].lower()} line in {title(bor['doc'])} and in {title(tax['doc'])}.",
             "anchors": [a for o in ob for a in o.anchors]},
            {"by": "code_computed", "text": f"Same property and period ({bor['period'][0]} to {bor['period'][1]}): {money(bv)} vs {money(tv)}, "
             f"a difference of {money(abs(D(bv) - D(tv)))}.", "anchors": []},
            {"by": "policy_chosen", "text": f"Working value {money(tv)} from {title(tax['doc'])}: a filed return outranks a borrower-prepared statement "
             f"for the same period (example policy).", "anchors": []}]
        if impact:
            steps.append({"by": "code_computed", "text": "Re-ran every rule with each value: " + "; ".join(
                f"{RULE_LABEL[i['rule']]} {fmt_rule(i['alternative'])} with the statement vs {fmt_rule(i['working'])} with the return ({i['threshold']})"
                for i in impact) + ".", "anchors": []})
        if br:
            gap = D(br["stated_noi"]) - D(br["net_income"])
            parts = ", ".join(f"{x['type']} {money(x['value'])}" + (f" (ties: {x['tie']})" if x["tie"] else "") for x in br["components"])
            mine = next(e for e in br["located_in"] if e["cmp"] == c["id"])
            text = (f"NOI bridge: statement NOI {money(br['stated_noi'])} vs Form 8825 line 19 {money(br['net_income'])}, a gap of {money(gap)}. "
                    f"Catalog bridges explain {money(gap - D(br['residual']))} ({parts}). Of the {money(br['residual'])} left, this line accounts for "
                    f"{money(abs(D(mine['effect'])))}" + (" and rounding for the rest" if abs(D(br['residual']) - D(mine['effect'])) >= D('0.005') else "") + ".")
            for co in br["coincidences"]:
                text += f" {LABEL[co['concept']]} is also {money(co['value'])}, but it agrees on both documents, so it is not the cause."
            steps.append({"by": "code_computed", "text": text, "anchors": []})
        cards.append({"id": f"conflict:{c['concept']}:{bor['period'][0][:4]}", "kind": "conflict", "title": f"{LABEL[c['concept']]} disagree",
                      "concept": c["concept"], "severity": "high" if impact else "medium", "axes": axes,
                      "summary": f"{title(bor['doc'])} shows {money(bv)}; {title(tax['doc'])} shows {money(tv)}.",
                      "observations": [obs_view(o, docs, anchors) for o in ob], "comparison": c["id"],
                      "working": {"value": tv, "source": tax["doc"], "basis": "authority: filed return over borrower statement"},
                      "decision_impact": impact, "bridge": br and {k: br[k] for k in ("id", "components", "residual", "coincidences", "status")},
                      "related": [{"doc": x["a"]["doc"], "value": x["a"]["value"], "reason": x["reason"]} for x in related],
                      "steps": steps, "hypothesis": None, "investigate": True, "status": "open"})
    own = [c for c in rec["comparisons"] if c["concept"] == "ownership_pct" and c["status"] == "difference"]
    if own:
        def mutate(alt):
            for pid, v in alt["cert_ownership"].items():
                alt["ownership"][pid] = v
        impact = flips(w, policy, mutate)
        ob = [obs_ix[i] for c in own for i in c["a"]["obs"] + c["b"]["obs"]]
        own_rec = rec["ownership"]
        names = {e["id"]: e["name"] for e in ents["entities"]}
        gov = next(v for o in own_rec.values() for v in o["values"] if v["type"] == "operating_agreement")
        cert = next(v for o in own_rec.values() for v in o["values"] if v["type"] == "ownership_certification")
        diffs = "; ".join(f"{names[c['subject']]}: {c['a']['value']}% vs {c['b']['value']}%" for c in own)
        steps = [{"by": "model_picked", "text": f"Read the owner rows of {title(cert['doc'])} and the member rows of {title(gov['doc'])}.",
                  "anchors": [a for o in ob for a in o.anchors]},
                 {"by": "code_computed", "text": f"Matched people across documents by name and address / SSN. Percentages differ: {diffs}.", "anchors": []},
                 {"by": "policy_chosen", "text": f"Working values from {title(gov['doc'])} (dated {gov['date']}): the governing document outranks a "
                  f"self-attested certification (dated {cert['date']}), which predates it.", "anchors": []}]
        if impact:
            steps.append({"by": "code_computed", "text": "Re-ran every rule with the certified percentages: " + "; ".join(
                f"{RULE_LABEL[i['rule']]} changes" for i in impact) + ".", "anchors": []})
        cards.append({"id": "conflict:ownership", "kind": "conflict", "title": "Ownership percentages disagree", "concept": "ownership_pct",
                      "severity": "high" if impact else "medium", "axes": (["decision"] if impact else []) + ["integrity"],
                      "summary": f"The certification ({cert['date']}) and the operating agreement ({gov['date']}) disagree: {diffs}.",
                      "observations": [obs_view(o, docs, anchors) for o in ob], "comparison": [c["id"] for c in own],
                      "working": {"value": {names[p]: o["working"] for p, o in own_rec.items()}, "source": gov["doc"],
                                  "basis": "authority: governing document, latest amendment"},
                      "decision_impact": impact, "finding": "The beneficial ownership certification predates the amendment and needs re-signing.",
                      "steps": steps, "hypothesis": None, "investigate": False, "status": "open"})
    for b in rec["bridges"]:
        if b["status"] == "unexplained_remainder":
            ob = [obs_ix[b["noi_obs"]], obs_ix[b["net_income_obs"]]]
            cards.append({"id": f"conflict:noi_gap:{b['os_doc']}", "kind": "conflict", "title": "NOI gap not explained", "concept": "noi",
                          "severity": "medium", "axes": ["integrity"], "summary": f"{money(b['remainder'])} of the NOI difference is not explained by the "
                          "bridge catalog or by any line-level difference.", "observations": [obs_view(o, docs, anchors) for o in ob],
                          "working": None, "decision_impact": [], "bridge": b, "steps": [], "hypothesis": None, "investigate": True, "status": "open"})
    for f in rec["footing"]:
        if not f["ok"]:
            ob = [obs_ix[i] for i in f["obs"][:1]]
            cards.append({"id": f"integrity:{f['doc']}:{f['check']}", "kind": "integrity", "title": f"{title(f['doc'])} does not add up",
                          "concept": f["check"], "severity": "medium", "axes": ["integrity"],
                          "summary": f"Stated {f['check']} {money(f['stated'])}; its own rows add up to {money(f['computed'])} "
                          f"(off by {money(abs(D(f['stated']) - D(f['computed'])))}).", "observations": [obs_view(o, docs, anchors) for o in ob],
                          "working": {"value": f["computed"], "source": f["doc"], "basis": "computed from the document's own rows"},
                          "decision_impact": [], "steps": [
                              {"by": "model_picked", "text": "Pointed to the totals row and the rent column.", "anchors": ob[0].anchors},
                              {"by": "code_computed", "text": f"Added {len(f['obs']) - 1} rows: {money(f['computed'])} vs stated {money(f['stated'])}.", "anchors": []}],
                          "hypothesis": None, "investigate": False, "status": "open"})
    names = {e["id"]: e["name"] for e in ents["entities"]}
    own_card = next((c for c in cards if c["id"] == "conflict:ownership"), None)
    for m in rules["required_documents"]["value"]:
        if m.startswith("pfs:"):
            pid = m[4:]
            certified = D(w["cert_ownership"].get(pid, "0"))
            dep = own_card["id"] if own_card and certified < D(str(policy["beneficial_owner_pct"])) else None
            cards.append({"id": f"missing:pfs:{pid}", "kind": "missing", "title": f"Personal financial statement missing: {names[pid]}",
                          "concept": "pfs", "severity": "high", "axes": ["decision"],
                          "summary": f"{names[pid]} owns {w['ownership'][pid]}% (25% or more), so policy requires a personal financial statement."
                          + (" This only surfaces once the ownership conflict is resolved: the certification says "
                             f"{w['cert_ownership'].get(pid)}%." if dep else ""), "observations": [], "depends_on": dep,
                          "working": None, "decision_impact": [], "steps": [
                              {"by": "policy_chosen", "text": "Example policy: every beneficial owner (25% or more) provides a personal financial statement.", "anchors": []},
                              {"by": "code_computed", "text": f"No statement in the file resolves to {names[pid]}.", "anchors": []}],
                          "hypothesis": None, "investigate": False, "status": "open"})
        else:
            cards.append({"id": f"missing:{m}", "kind": "missing", "title": f"Missing document: {m.replace('_', ' ')}", "concept": m,
                          "severity": "high", "axes": ["decision"], "summary": "Required by policy; not in the package. "
                          + ("LTV cannot be computed without it." if m == "appraisal" else ""), "observations": [], "working": None,
                          "decision_impact": [], "steps": [], "hypothesis": None, "investigate": False, "status": "open"})
    by_key = {p["key"]: p for p in ents["persons"]}
    for e in ents["entities"]:
        if e["kind"] == "person" and e["roles"] == ["pfs"]:
            m = by_key[e["mentions"][0]]
            near = [n for n in ents["near_misses"] if e["id"] in (n["a_entity"], n["b_entity"])]
            other = sorted({n["b_entity"] if n["a_entity"] == e["id"] else n["a_entity"] for n in near})
            ob = [o for o in (m["name"], m["ssn"], m["dob"]) if o is not None]
            cards.append({"id": f"entity:unmatched:{m['doc']}", "kind": "entity", "title": f"Statement for someone not in the file: {e['name']}",
                          "concept": "person", "severity": "medium", "axes": ["integrity"],
                          "summary": f"{title(m['doc'])} does not match any owner or member." + (
                              " Closest: " + ", ".join(names[o] for o in other) + " - " + "; ".join(n["why"] for n in near) + ". Not merged." if near else ""),
                          "observations": [obs_view(o, docs, anchors) for o in ob], "working": None, "decision_impact": [],
                          "steps": [{"by": "model_picked", "text": "Read the name, SSN and date of birth on the statement.", "anchors": [a for o in ob for a in o.anchors]},
                                    {"by": "code_computed", "text": "Compared hard identifiers with every owner and member. A similar name is not enough "
                                     "to merge two people.", "anchors": []}],
                          "hypothesis": None, "investigate": False, "status": "open"})
    covered = {i["rule"] for c in cards for i in c["decision_impact"]}
    for k, r in rules.items():
        if r["result"] == "fail" and k not in covered and k not in ("required_documents", "documents_foot", "beneficial_owners"):
            cards.append({"id": f"breach:{k}", "kind": "breach", "title": f"{RULE_LABEL[k]} below policy", "concept": k, "severity": "high",
                          "axes": ["decision"], "summary": f"{RULE_LABEL[k]} {fmt_rule(r)} ({r['threshold']}).", "observations": [],
                          "working": None, "decision_impact": [], "steps": [], "hypothesis": None, "investigate": False, "status": "open"})
    order = {"high": 0, "medium": 1}
    return sorted(cards, key=lambda c: (order[c["severity"]], c["kind"] != "conflict", c["id"]))


def fmt_rule(r):
    v = r["value"]
    if isinstance(v, list):
        return f"{r['result']} ({', '.join(v) or 'none'})"
    return f"{r['result']} ({v})" if v is not None else r["result"]


def decision_status(d, rec, rules, cards, docs, obs_ix):
    out = {k: v for k, v in d.items() if k != "snapshot"} | {"status": "active", "stale": None, "snapshot": d["snapshot"]}
    if d["target"] == "ownership":
        now = {p: {"value": o["working"], "obs": o["working_obs"]} for p, o in rec["ownership"].items()}
        changed = [{"person": p, "was": s["value"], "now": now[p]["value"], "source_now": now[p]["obs"]}
                   for p, s in d["snapshot"]["ownership"].items() if p in now and now[p]["value"] != s["value"]]
        if changed:
            trigger_doc = obs_ix[changed[0]["source_now"]].doc_id
            out["status"] = "stale"
            out["stale"] = {"trigger_seq": docs[trigger_doc]["seq"], "trigger_doc": trigger_doc, "changed": changed,
                            "outcome_was": d["snapshot"]["beneficial_owners"], "outcome_now": rules["beneficial_owners"]["value"]}
            out["card_id"] = "conflict:ownership" if any(c["id"] == "conflict:ownership" for c in cards) else None
    return out
