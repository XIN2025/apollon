"""Policy rules over the working facts. Pure functions of (working, policy); every number here is computed by code."""
import copy
from decimal import Decimal as D, ROUND_HALF_UP

from engine.reconcile import EXPENSE, INCOME

Q2, Q4 = D("0.01"), D("0.0001")


def annual_debt_service(loan):
    p, r, n = D(loan["amount"]), D(loan["rate"]) / 12, int(D(loan["amort_months"]))
    pmt = p * r / (1 - (1 + r) ** -n)
    return (pmt * 12).quantize(Q2, ROUND_HALF_UP)


def statement_noi(s):
    inc = sum(D(s["lines"][c]) for c in INCOME if c in s["lines"])
    exp = sum(D(s["lines"][c]) for c in EXPENSE if c in s["lines"])
    return inc - exp


def evaluate(w, policy):
    res = {}
    ads = annual_debt_service(w["loan"]) if w["loan"] else None
    cands = [{"source": s["doc"], "noi": statement_noi(s), "formula": "income lines - expense lines (tax-return values where filed)"}
             for s in w["statements"] if s["lines"]]
    if w["appraisal"] and "noi" in w["appraisal"]:
        cands.append({"source": w["appraisal"]["doc"], "noi": D(w["appraisal"]["noi"]), "formula": "appraisal stabilized NOI"})
    if ads and cands:
        uw = min(cands, key=lambda c: c["noi"])
        dscr = (uw["noi"] / ads).quantize(Q4)
        res["dscr"] = {"result": "pass" if dscr >= D(str(policy["dscr_min"])) else "fail", "value": str(dscr),
                       "threshold": f">= {policy['dscr_min']}x",
                       "derivation": {"underwritten_noi": str(uw["noi"]), "noi_source": uw["source"], "annual_debt_service": str(ads),
                                      "candidates": [{**c, "noi": str(c["noi"])} for c in cands], "method": policy["noi_method"]}}
    else:
        res["dscr"] = {"result": "unresolved", "value": None, "threshold": f">= {policy['dscr_min']}x",
                       "derivation": {"missing": [x for x, ok in (("loan terms", ads), ("an NOI source", cands)) if not ok]}}
    if w["loan"] and w["appraisal"] and "value" in w["appraisal"]:
        ltv = (D(w["loan"]["amount"]) / D(w["appraisal"]["value"])).quantize(Q4)
        res["ltv"] = {"result": "pass" if ltv <= D(str(policy["ltv_max"])) else "fail", "value": str(ltv),
                      "threshold": f"<= {policy['ltv_max']}", "derivation": {"loan": w["loan"]["amount"], "value": w["appraisal"]["value"]}}
    else:
        res["ltv"] = {"result": "unresolved", "value": None, "threshold": f"<= {policy['ltv_max']}",
                      "derivation": {"missing": ["appraised value"] if not (w["appraisal"] and "value" in w["appraisal"]) else ["loan terms"]}}
    occ = sorted([o for o in w["occupancy_sources"] if o["as_of"]], key=lambda o: o["as_of"])
    if occ:
        o = occ[-1]
        rate = (D(o["occupied"]) / o["total"]).quantize(Q4)
        res["occupancy"] = {"result": "pass" if rate >= D(str(policy["occupancy_min"])) else "fail", "value": str(rate),
                            "threshold": f">= {policy['occupancy_min']}",
                            "derivation": {"source": o["doc"], "as_of": o["as_of"], "occupied": o["occupied"], "total": o["total"]}}
    else:
        res["occupancy"] = {"result": "unresolved", "value": None, "threshold": f">= {policy['occupancy_min']}", "derivation": {}}
    a = w["appraisal"] or {}
    if all(k in a for k in ("noi", "cap_rate", "value")):
        implied = D(a["noi"]) / (D(a["cap_rate"]) / 100)
        gap = (abs(implied - D(a["value"])) / D(a["value"])).quantize(Q4)
        res["appraisal_tie"] = {"result": "pass" if gap <= D(str(policy["appraisal_tie_tolerance"])) else "fail", "value": str(gap),
                                "threshold": f"<= {policy['appraisal_tie_tolerance']}",
                                "derivation": {"implied_value": str(implied.quantize(Q2)), "stated_value": a["value"]}}
    else:
        res["appraisal_tie"] = {"result": "unresolved", "value": None, "threshold": "", "derivation": {}}
    bo_pct = D(str(policy["beneficial_owner_pct"]))
    bo = sorted(p for p, v in w["ownership"].items() if D(v) >= bo_pct)
    cert_bo = sorted(p for p, v in w["cert_ownership"].items() if D(v) >= bo_pct)
    if w["ownership"]:
        ok = bool(w["cert_ownership"]) and bo == cert_bo
        res["beneficial_owners"] = {"result": "pass" if ok else ("fail" if w["cert_ownership"] else "unresolved"), "value": bo,
                                    "threshold": f">= {policy['beneficial_owner_pct']}% (31 CFR 1010.230(d)(1))",
                                    "derivation": {"working": w["ownership"], "certified": w["cert_ownership"], "certified_set": cert_bo}}
        total = sum(D(v) for v in w["ownership"].values())
        res["ownership_total"] = {"result": "pass" if total == 100 else "fail", "value": str(total), "threshold": "= 100%",
                                  "derivation": {"working": w["ownership"]}}
    else:
        res["beneficial_owners"] = {"result": "unresolved", "value": [], "threshold": f">= {policy['beneficial_owner_pct']}%", "derivation": {}}
        res["ownership_total"] = {"result": "unresolved", "value": None, "threshold": "= 100%", "derivation": {}}
    missing = [t for t in policy["required_documents"] if t not in w["docs_present"]]
    if policy["pfs_required_for_beneficial_owners"]:
        missing += [f"pfs:{p}" for p in bo if p not in w["pfs_persons"]]
    res["required_documents"] = {"result": "pass" if not missing else "fail", "value": missing, "threshold": "all present",
                                 "derivation": {"present": w["docs_present"], "beneficial_owners": bo, "pfs_for": w["pfs_persons"]}}
    if w["return_orgs"] and w["borrower"]:
        ok = w["return_orgs"] == [w["borrower"]]
        res["tax_return_entity"] = {"result": "pass" if ok else "fail", "value": w["return_orgs"], "threshold": "return filed by borrower",
                                    "derivation": {"borrower": w["borrower"]}}
    else:
        res["tax_return_entity"] = {"result": "unresolved", "value": None, "threshold": "return filed by borrower", "derivation": {}}
    bad = [f for f in w["footing"] if not f["ok"]]
    res["documents_foot"] = {"result": "pass" if not bad else "fail", "value": [f["id"] for f in bad], "threshold": "totals add up",
                             "derivation": {"checked": len(w["footing"])}}
    return res


def outcome(r):
    return (r["result"], tuple(r["value"]) if isinstance(r["value"], list) else None)


def flips(w, policy, mutate):
    """Re-run every rule with one alternative value. Returns the rules whose outcome changes."""
    base = evaluate(w, policy)
    alt_w = copy.deepcopy(w)
    mutate(alt_w)
    alt = evaluate(alt_w, policy)
    return [{"rule": k, "working": {"result": base[k]["result"], "value": base[k]["value"]},
             "alternative": {"result": alt[k]["result"], "value": alt[k]["value"]}, "threshold": base[k]["threshold"]}
            for k in base if outcome(base[k]) != outcome(alt[k])]
