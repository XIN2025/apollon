"""Observations + entities -> comparisons, bridges, footing checks and the working facts the rules read."""
from collections import defaultdict
from datetime import date
from decimal import Decimal as D

INCOME = ["gross_rents", "other_income"]
EXPENSE = ["advertising", "cleaning_maintenance", "insurance", "legal_professional", "re_taxes", "repairs", "utilities",
           "wages", "other_opex"]
LABEL = {"gross_rents": "Gross rents", "other_income": "Other income", "total_income": "Total income",
         "advertising": "Advertising", "cleaning_maintenance": "Cleaning and maintenance", "insurance": "Insurance",
         "legal_professional": "Legal and professional", "re_taxes": "Real estate taxes", "repairs": "Repairs",
         "utilities": "Utilities", "wages": "Wages", "other_opex": "Management and other expenses",
         "ownership_pct": "Ownership", "occupancy": "Occupancy", "noi": "Net operating income", "loan_amount": "Loan amount"}


def dec(o):
    return D(o.value) if o is not None and o.value is not None else None


class Line:
    def __init__(self, value, obs, formula=None):
        self.value, self.obs, self.formula = value, obs, formula

    def to(self):
        return {"value": str(self.value), "obs": [o.id for o in self.obs], "formula": self.formula}


def statement_lines(t, f, amort):
    lines = {}
    for c in INCOME + EXPENSE + ["total_income"]:
        if c in f:
            lines[c] = Line(dec(f[c]), [f[c]])
    if t == "operating_statement":
        parts = [f[k] for k in ("management", "other_expenses") if k in f]
        if parts:
            lines["other_opex"] = Line(sum(dec(o) for o in parts), parts, " + ".join(o.field for o in parts))
    elif "other_deductions" in f:
        if amort is not None:
            lines["other_opex"] = Line(dec(f["other_deductions"]) - dec(amort), [f["other_deductions"], amort],
                                       "line 17 other deductions - 4562 amortization")
        else:
            lines["other_opex"] = Line(dec(f["other_deductions"]), [f["other_deductions"]], "line 17 other deductions")
    return lines


def reconcile(obs, ents, docs, policy):
    me = ents["mention_entity"]
    by_doc = defaultdict(dict)
    rows = defaultdict(dict)
    for o in obs:
        (rows[o.subject].__setitem__(o.field.split(".", 1)[1], o) if "." in o.field else by_doc[o.doc_id].__setitem__(o.field, o))
    of_type = lambda t: sorted(d for d in by_doc if docs[d]["type"] == t)
    roles = policy["roles"]
    tol_abs, tol_rel = D(str(policy["tolerance"]["abs"])), D(str(policy["tolerance"]["rel"]))

    lr = by_doc.get(next(iter(of_type("loan_request")), None), {})
    borrower = me.get(f"org@{of_type('loan_request')[0]}") if of_type("loan_request") else None
    collateral = me.get(f"collateral@{of_type('loan_request')[0]}") if of_type("loan_request") else None
    if borrower is None:
        borrower = next((e["id"] for e in ents["entities"] if e["kind"] == "org"), None)
    if collateral is None:
        collateral = next((e["id"] for e in ents["entities"] if e["kind"] == "collateral"), None)

    returns_4562 = {me.get(f"org@{d}"): (d, by_doc[d]) for d in of_type("irs_4562")}
    stmts = []
    for d in of_type("operating_statement") + of_type("irs_8825"):
        f, t = by_doc[d], docs[d]["type"]
        period, assumed, amort = None, None, None
        if t == "operating_statement" and "period" in f:
            s, e = f["period"].value.split("/")
            period = (s, e)
        if t == "irs_8825":
            r = returns_4562.get(me.get(f"org@{d}"))
            if r and "form_year" in r[1]:
                y = int(D(r[1]["form_year"].value))
                period, assumed = (f"{y}-01-01", f"{y}-12-31"), f"tax year {y} from Form 4562 header; calendar year assumed"
                amort = r[1].get("amortization")
        stmts.append({"doc": d, "type": t, "role": roles[t], "period": period, "period_note": assumed,
                      "collateral": me.get(f"collateral@{d}"), "fields": f, "lines": statement_lines(t, f, amort),
                      "basis": f["basis"].value if "basis" in f else None, "r4562": r if t == "irs_8825" else None})

    comparisons, cid = [], defaultdict(int)

    def compare(concept, sa, oa, va, sb, ob, vb, status=None, reason=None, transform=None):
        cid[concept] += 1
        c = {"id": f"cmp:{concept}:{cid[concept]}", "concept": concept,
             "a": {"doc": sa, "obs": [o.id for o in oa], "value": str(va) if va is not None else None},
             "b": {"doc": sb, "obs": [o.id for o in ob], "value": str(vb) if vb is not None else None},
             "status": status, "reason": reason, "transform": transform}
        if status is None:
            delta = va - vb
            c["delta"] = str(delta)
            tol = max(tol_abs, tol_rel * max(abs(va), abs(vb)))
            if abs(delta) < D("0.005"):
                c["status"] = "agreed"
            elif abs(delta) < 1 and "tax_return" in (roles[docs[sa]["type"]], roles[docs[sb]["type"]]):
                c["status"], c["transform"] = "equal_after_transform", "round_whole_dollars"
            else:
                c["status"] = "difference"
                c["material_integrity"] = abs(delta) > tol and {roles[docs[sa]["type"]], roles[docs[sb]["type"]]} & \
                    {"borrower_prepared", "self_attested"} != set() and roles[docs[sa]["type"]] != roles[docs[sb]["type"]]
        comparisons.append(c)
        return c

    def comparable(a, b):
        if a["collateral"] is None or a["collateral"] != b["collateral"]:
            return "different_property"
        if a["period"] is None or b["period"] is None:
            return "period_unknown"
        if a["period"] != b["period"]:
            return "different_period"
        return None

    pair_cmp = defaultdict(list)
    for i, a in enumerate(stmts):
        for b in stmts[i + 1:]:
            why = comparable(a, b)
            for concept in INCOME + EXPENSE + ["total_income"]:
                if concept in a["lines"] and concept in b["lines"]:
                    la, lb = a["lines"][concept], b["lines"][concept]
                    if why:
                        compare(concept, a["doc"], la.obs, la.value, b["doc"], lb.obs, lb.value, "not_comparable", why)
                    else:
                        c = compare(concept, a["doc"], la.obs, la.value, b["doc"], lb.obs, lb.value)
                        if c["status"] == "agreed" and (la.formula or lb.formula):
                            c["status"], c["transform"] = "equal_after_mapping", la.formula or lb.formula
                        pair_cmp[(a["doc"], b["doc"])].append(c)

    bridges = []
    for os_ in [s for s in stmts if s["type"] == "operating_statement"]:
        for tx in [s for s in stmts if s["type"] == "irs_8825"]:
            if "noi" not in os_["fields"] or "net_income" not in tx["fields"]:
                continue
            why = comparable(os_, tx)
            if why:
                compare("noi", os_["doc"], [os_["fields"]["noi"]], dec(os_["fields"]["noi"]), tx["doc"],
                        [tx["fields"]["net_income"]], dec(tx["fields"]["net_income"]), "not_comparable", why)
                continue
            bridges.append(bridge(os_, tx, policy, pair_cmp[(os_["doc"], tx["doc"])] + pair_cmp[(tx["doc"], os_["doc"])], stmts))

    rr = [by_doc[d] | {"_doc": d} for d in of_type("rent_roll")]
    rr_units = defaultdict(list)
    for subj, r in rows.items():
        if "#units[" in subj:
            rr_units[subj.split("#")[0]].append(r)
    occupancy_sources = []
    rent_rolls = []
    for r in rr:
        d = r["_doc"]
        units = rr_units[d]
        rents = [dec(u["rent"]) for u in units if "rent" in u]
        occupied = [u for u in units if "tenant" in u and "vacant" not in u["tenant"].value.lower()]
        rent_obs = [u["rent"] for u in units if "rent" in u]
        rent_rolls.append({"doc": d, "as_of": r["as_of"].value if "as_of" in r else None, "units": len(units),
                           "occupied": len(occupied), "sum_rent": str(sum(rents)), "rent_obs": [o.id for o in rent_obs],
                           "stated_total": r["stated_total_rent"].value if "stated_total_rent" in r else None,
                           "stated_obs": r["stated_total_rent"].id if "stated_total_rent" in r else None,
                           "collateral": me.get(f"collateral@{d}")})
        occupancy_sources.append({"doc": d, "as_of": rent_rolls[-1]["as_of"], "occupied": len(occupied), "total": len(units),
                                  "obs": [u["tenant"].id for u in units if "tenant" in u]})
        for s in stmts:
            if "gross_rents" in s["lines"] and s["collateral"] == rent_rolls[-1]["collateral"]:
                compare("gross_rents", d, rent_obs, sum(rents) * 12, s["doc"], s["lines"]["gross_rents"].obs,
                        s["lines"]["gross_rents"].value, "not_comparable", "point_in_time_vs_period", "annualised x12")
    appraisal = None
    for d in of_type("appraisal"):
        f = by_doc[d]
        appraisal = {"doc": d, "as_of": f["effective_date"].value if "effective_date" in f else None,
                     **{k: f[k].value for k in ("value", "noi", "cap_rate", "units", "occupied_units", "re_taxes") if k in f},
                     "obs": {k: f[k].id for k in f}}
        if "units" in f and "occupied_units" in f:
            occupancy_sources.append({"doc": d, "as_of": appraisal["as_of"], "occupied": int(dec(f["occupied_units"])),
                                      "total": int(dec(f["units"])), "obs": [f["occupied_units"].id, f["units"].id]})
        for s in stmts:
            if "re_taxes" in f and "re_taxes" in s["lines"]:
                compare("re_taxes", d, [f["re_taxes"]], dec(f["re_taxes"]), s["doc"], s["lines"]["re_taxes"].obs,
                        s["lines"]["re_taxes"].value, "not_comparable", "estimate_vs_actual")
            if "noi" in f and "noi" in s["fields"]:
                compare("noi", d, [f["noi"]], dec(f["noi"]), s["doc"], [s["fields"]["noi"]], dec(s["fields"]["noi"]),
                        "not_comparable", "stabilized_vs_actual")
    for i, a in enumerate(occupancy_sources):
        for b in occupancy_sources[i + 1:]:
            va, vb = D(a["occupied"]) / a["total"], D(b["occupied"]) / b["total"]
            if a["as_of"] != b["as_of"]:
                c = compare("occupancy", a["doc"], [], va.quantize(D("0.0001")), b["doc"], [], vb.quantize(D("0.0001")),
                            "not_comparable", "different_as_of")
            else:
                c = compare("occupancy", a["doc"], [], va, b["doc"], [], vb)
            c["a"]["obs"], c["b"]["obs"] = a["obs"], b["obs"]

    if "loan_amount" in lr and "loan_amount_narrative" in lr:
        a, b = lr["loan_amount"], lr["loan_amount_narrative"]
        st = "equal_after_transform" if dec(a) == dec(b) and b.transforms else None
        compare("loan_amount", a.doc_id, [a], dec(a), b.doc_id, [b], dec(b), st, None, ",".join(b.transforms) or None)

    owners = ownership(rows, ents, by_doc, docs, policy)
    for pid, o in owners.items():
        vals = o["values"]
        for i, a in enumerate(vals):
            for b in vals[i + 1:]:
                c = compare("ownership_pct", a["doc"], [a["o"]], D(a["value"]), b["doc"], [b["o"]], D(b["value"]))
                c["subject"] = pid
                if c["status"] == "difference":
                    c["material_integrity"] = True

    for o in owners.values():
        o["values"] = [{k: v for k, v in x.items() if k != "o"} for x in o["values"]]
    footing = foot_checks(stmts, rent_rolls)
    lr_date = lr["date"].value if "date" in lr else None
    loan = None
    if all(k in lr for k in ("loan_amount", "rate", "amortization")):
        loan = {"amount": lr["loan_amount"].value, "rate": str(D(lr["rate"].value) / 100), "amort_months": lr["amortization"].value,
                "obs": [lr[k].id for k in ("loan_amount", "rate", "amortization")]}
    working = {
        "loan": loan, "as_of": lr_date,
        "statements": [working_statement(s, stmts, policy) for s in stmts if s["type"] == "operating_statement"],
        "appraisal": appraisal, "occupancy_sources": occupancy_sources,
        "ownership": {pid: o["working"] for pid, o in owners.items() if o["working"] is not None},
        "cert_ownership": {pid: o["cert"] for pid, o in owners.items() if o["cert"] is not None},
        "docs_present": sorted({docs[d]["type"] for d in by_doc}),
        "pfs_persons": sorted({ents["mention_entity"][f"person@{d}"] for d in of_type("pfs") if f"person@{d}" in ents["mention_entity"]}),
        "borrower": borrower, "return_orgs": sorted({me.get(f"org@{d}") for d in of_type("irs_8825") + of_type("irs_4562")} - {None}),
        "footing": footing,
    }
    return {"borrower": borrower, "collateral": collateral, "statements": [stmt_out(s) for s in stmts],
            "comparisons": comparisons, "bridges": bridges, "ownership": owners, "rent_rolls": rent_rolls,
            "occupancy_sources": occupancy_sources, "footing": footing, "working": working}


def stmt_out(s):
    return {"doc": s["doc"], "type": s["type"], "role": s["role"], "period": s["period"], "period_note": s["period_note"],
            "collateral": s["collateral"], "basis": s["basis"], "lines": {k: v.to() for k, v in s["lines"].items()},
            "stated": {k: s["fields"][k].value for k in ("total_income", "total_opex", "noi", "net_income", "total_expenses")
                       if k in s["fields"]}}


def ownership(rows, ents, by_doc, docs, policy):
    me, rank = ents["mention_entity"], policy["authority"]["ownership"]
    out = {}
    for subj, r in rows.items():
        if ("#owners[" not in subj and "#members[" not in subj) or "pct" not in r:
            continue
        pid = me.get(f"person@{subj}")
        if pid is None:
            continue
        d = r["pct"].doc_id
        dt = by_doc[d]["date"].value if "date" in by_doc[d] else None
        out.setdefault(pid, {"values": []})["values"].append(
            {"doc": d, "type": docs[d]["type"], "value": r["pct"].value, "date": dt, "o": r["pct"], "obs": r["pct"].id})
    for o in out.values():
        o["values"].sort(key=lambda v: (rank.index(v["type"]) if v["type"] in rank else 99, -(date.fromisoformat(v["date"]).toordinal() if v["date"] else 0)))
        gov = o["values"][0]
        o["working"], o["working_obs"], o["working_doc"] = gov["value"], gov["obs"], gov["doc"]
        cert = next((v for v in o["values"] if v["type"] == "ownership_certification"), None)
        o["cert"] = cert["value"] if cert else None
    return out


def working_statement(s, stmts, policy):
    """A borrower statement's lines, with each line replaced by the filed return's value when one exists for the same period."""
    out = {"doc": s["doc"], "period": s["period"], "lines": {}, "sources": {}}
    for c in INCOME + EXPENSE:
        if c not in s["lines"]:
            continue
        val, src = s["lines"][c].value, s["lines"][c].obs
        for t in stmts:
            if t["type"] == "irs_8825" and t["period"] == s["period"] and t["collateral"] == s["collateral"] and s["period"] and c in t["lines"]:
                val, src = t["lines"][c].value, t["lines"][c].obs
        out["lines"][c] = str(val)
        out["sources"][c] = [o.id for o in src]
    return out


def bridge(os_, tx, policy, line_cmps, stmts):
    f, r = tx["fields"], tx["r4562"]
    comps, notes = [], []
    if "interest" in f:
        comps.append({"type": "interest", "value": f["interest"].value, "evidence": [f["interest"].id], "tie": None})
    if "depreciation" in f:
        tie = r[1].get("depreciation") if r else None
        ok = tie is not None and dec(tie) == dec(f["depreciation"])
        if ok:
            comps.append({"type": "depreciation", "value": f["depreciation"].value, "evidence": [f["depreciation"].id, tie.id],
                          "tie": f"8825 line 14 = 4562 line 22 = {tie.value}"})
        else:
            notes.append("depreciation not bridged: no Form 4562 total to tie it to" if tie is None else
                         f"depreciation not bridged: 8825 {f['depreciation'].value} does not tie to 4562 {tie.value}")
    amort = r[1].get("amortization") if r else None
    if amort is not None and "other_deductions" in f and dec(amort) <= dec(f["other_deductions"]):
        comps.append({"type": "amortization", "value": amort.value, "evidence": [amort.id, f["other_deductions"].id],
                      "tie": "inside 8825 line 17"})
    bridged = dec(f["net_income"]) + sum(D(c["value"]) for c in comps)
    stated = dec(os_["fields"]["noi"])
    residual = stated - bridged
    effects = []
    for c in line_cmps:
        if c["status"] in ("difference", "equal_after_transform") and c["concept"] != "total_income":
            a_is_os = c["a"]["doc"] == os_["doc"]
            delta = D(c["delta"]) if a_is_os else -D(c["delta"])
            sign = 1 if c["concept"] in INCOME else -1
            effects.append({"cmp": c["id"], "concept": c["concept"], "effect": str(sign * delta)})
    explained = sum(D(e["effect"]) for e in effects)
    remainder = residual - explained
    coincidences = []
    if abs(residual) >= 1:
        for c in line_cmps:
            if c["status"] in ("agreed", "equal_after_mapping") and abs(abs(D(c["a"]["value"])) - abs(residual)) < 1:
                coincidences.append({"cmp": c["id"], "concept": c["concept"], "value": c["a"]["value"],
                                     "why_rejected": "equal to the gap, but this line agrees on both documents, so it cannot be the cause"})
    status = "explained" if abs(residual) < 1 else ("residual_located" if abs(remainder) < 1 else "unexplained_remainder")
    return {"id": f"bridge:{os_['doc']}:{tx['doc']}", "os_doc": os_["doc"], "tax_doc": tx["doc"], "stated_noi": str(stated),
            "net_income": f["net_income"].value, "net_income_obs": f["net_income"].id, "noi_obs": os_["fields"]["noi"].id,
            "components": comps, "bridged": str(bridged), "residual": str(residual), "located_in": effects,
            "remainder": str(remainder), "coincidences": coincidences, "notes": notes, "status": status}


def foot_checks(stmts, rent_rolls):
    out = []

    def chk(doc, name, stated_o, parts, sign=None):
        if stated_o is None or any(p is None for p in parts):
            return
        computed = sum(dec(p) * (sign[i] if sign else 1) for i, p in enumerate(parts))
        out.append({"id": f"foot:{doc}:{name}", "doc": doc, "check": name, "stated": stated_o.value, "computed": str(computed),
                    "ok": abs(dec(stated_o) - computed) < D("0.01"), "obs": [stated_o.id] + [p.id for p in parts]})

    for s in stmts:
        f = s["fields"]
        inc = [f.get(c) for c in INCOME if c in f]
        if s["type"] == "operating_statement":
            exp = [f[c] for c in ("advertising", "cleaning_maintenance", "insurance", "legal_professional", "re_taxes", "repairs",
                                  "utilities", "management", "other_expenses", "wages") if c in f]
            chk(s["doc"], "total income", f.get("total_income"), inc)
            chk(s["doc"], "total operating expenses", f.get("total_opex"), exp)
            if all(k in f for k in ("noi", "total_income", "total_opex")):
                chk(s["doc"], "net operating income", f["noi"], [f["total_income"], f["total_opex"]], [1, -1])
        else:
            exp = [f[c] for c in ("advertising", "cleaning_maintenance", "insurance", "interest", "legal_professional", "re_taxes",
                                  "repairs", "utilities", "wages", "depreciation", "other_deductions") if c in f]
            chk(s["doc"], "line 2c", f.get("total_income"), inc)
            chk(s["doc"], "line 18", f.get("total_expenses"), exp)
            if all(k in f for k in ("net_income", "total_income", "total_expenses")):
                chk(s["doc"], "line 19", f["net_income"], [f["total_income"], f["total_expenses"]], [1, -1])
    for r in rent_rolls:
        if r["stated_total"] is not None:
            ok = D(r["stated_total"]) == D(r["sum_rent"])
            out.append({"id": f"foot:{r['doc']}:total rent", "doc": r["doc"], "check": "total monthly rent", "stated": r["stated_total"],
                        "computed": r["sum_rent"], "ok": ok, "obs": [r["stated_obs"]] + r["rent_obs"]})
    return out
