"""Grade recorded runs against the scenario truth. The engine never reads the planted list; only this grader does."""
import json
import sys
from decimal import Decimal as D
from pathlib import Path

import typer
import yaml
from rapidfuzz import fuzz
from scipy.stats import binomtest

from engine.entities import compact, street
from engine.extract import DOCTYPES, extract, months_of, observations
from engine.llm import Port
from engine.parse import Parsed, parse_number
from engine.project import Store

ROOT = Path(__file__).parent.parent
RUNS = ROOT / "runs"
app = typer.Typer(add_completion=False)
OS_CONCEPTS = ["gross_rents", "other_income", "total_income", "advertising", "cleaning_maintenance", "insurance", "legal_professional",
               "re_taxes", "repairs", "utilities", "management", "other_expenses", "total_opex", "noi"]
LINES_8825 = {"2a": "gross_rents", "2b": "other_income", "2c": "total_income", "3": "advertising", "5": "cleaning_maintenance",
              "7": "insurance", "8": "interest", "9": "legal_professional", "10": "re_taxes", "11": "repairs", "12": "utilities",
              "13": "wages", "14": "depreciation", "17": "other_deductions", "18": "total_expenses", "19": "net_income"}


def ci(k, n):
    if n == 0:
        return {"k": 0, "n": 0, "rate": None, "ci95": None}
    lo, hi = binomtest(k, n).proportion_ci(confidence_level=0.95, method="exact")
    return {"k": k, "n": n, "rate": round(k / n, 4), "ci95": [round(float(lo), 4), round(float(hi), 4)]}


def num(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return D(str(x))
    p = parse_number(str(x))
    return p[0] * ({"MM": 1000000, "M": 1000000, "K": 1000}.get(p[1], 1)) if p else None


def table_get(t, *keys, exact=False):
    for k, v in t.items():
        if any((k.lower() == key.lower()) if exact else (key.lower() in k.lower()) for key in keys):
            return v
    return None


def expected(spec):
    """(doc_id, field) -> (kind, value) as each document actually prints it."""
    out = {}
    truth = spec["truth"]
    for d in spec["documents"]:
        i, t = d["id"], d["type"]
        put = lambda f, kind, v, i=i: out.__setitem__((i, f), (kind, v))
        if t == "loan_request":
            tb = d["content"]["table"]
            put("date", "date", d["date"])
            put("borrower_name", "text", table_get(tb, "Borrower", "Applicant", exact=True))
            put("borrower_ein", "text", table_get(tb, "EIN"))
            put("property_name", "text", table_get(tb, "Property", "Collateral", exact=True))
            put("property_address", "address", table_get(tb, "address"))
            put("apn", "text", table_get(tb, "parcel"))
            put("loan_amount", "money", num(table_get(tb, "amount")))
            put("loan_amount_narrative", "money", D(truth["loan"]["amount"]))
            put("rate", "pct", num(table_get(tb, "rate")))
            put("amortization", "int", D(months_of(str(table_get(tb, "Amortization")))))
            put("term", "int", D(months_of(str(table_get(tb, "term")))))
        elif t == "rent_roll":
            put("as_of", "date", d["as_of"])
            put("stated_total_rent", "money", D(d["totals"]["monthly_rent"]))
            for n, r in enumerate(d["rows"]):
                put(f"units[{n}].unit", "text", str(r[0]))
                put(f"units[{n}].tenant", "text", r[2])
                put(f"units[{n}].rent", "money", D(r[5]))
        elif t == "operating_statement":
            put("period", "text", f"{d['period']['start']}/{d['period']['end']}")
            k = 1000 if d.get("units") == "thousands" else 1
            for (_, v), c in zip(d["lines"], OS_CONCEPTS):
                put(c, "money", D(str(v)) * k)
        elif t == "appraisal":
            tb = d["content"]["table"]
            put("effective_date", "date", d["effective_date"])
            for f, key, kind in (("apn", "parcel", "text"), ("units", "Units", "int"), ("occupied_units", "Occupied", "int"),
                                 ("pgi", "Potential gross", "money"), ("re_taxes", "Real estate taxes", "money"), ("noi", "Net operating", "money"),
                                 ("cap_rate", "Capitalization", "pct"), ("value", "market value", "money")):
                v = table_get(tb, key, exact=(f == "units"))
                put(f, kind, v if kind == "text" else num(v))
        elif t == "ownership_certification":
            put("entity_name", "text", d["entity"]["name"]); put("entity_ein", "text", d["entity"]["ein"]); put("date", "date", d["date"])
            for n, o in enumerate(d["owners"]):
                put(f"owners[{n}].name", "text", o["name"]); put(f"owners[{n}].pct", "pct", D(o["pct"])); put(f"owners[{n}].ssn", "text", o["ssn"])
        elif t == "operating_agreement":
            put("date", "date", d["date"])
            for n, m in enumerate(d["content"]["members"]):
                put(f"members[{n}].name", "text", m[0]); put(f"members[{n}].pct", "pct", num(m[2]))
        elif t == "pfs":
            put("date", "date", d["date"]); put("name", "text", d["person"]["name"]); put("ssn", "text", d["person"]["ssn"])
            put("dob", "date", d["person"]["dob"])
            for k, v in d["values"].items():
                put(k, "money", D(v))
        elif t == "irs_8825":
            put("ein", "text", d["header"]["ein"])
            for line, c in LINES_8825.items():
                v = d["lines"].get(line if not line.isdigit() else int(line))
                put(c, "money", D(v) if v is not None else None)
        elif t == "irs_4562":
            put("form_year", "int", D(d["tax_year"])); put("ein", "text", d["header"]["ein"])
            put("depreciation", "money", D(d["lines"][22])); put("amortization", "money", D(d["lines"][44]) if 44 in d["lines"] else None)
    return out


def matches(kind, exp, got):
    if exp is None:
        return got is None
    if got is None:
        return False
    if kind in ("money", "pct", "int"):
        return D(str(got)) == D(str(exp))
    if kind == "date":
        return str(got) == str(exp)
    if kind == "address":
        return street(str(got)) == street(str(exp))
    a, b = compact(str(got)), compact(str(exp))
    return a == b or (len(b) >= 6 and b in a)


def observed(events):
    got = {}
    for e in events:
        if e["type"] == "observations_recorded":
            for o in e["payload"]["obs"]:
                f = o["field"]
                if "." in f:
                    f = o["id"].split(":", 1)[1].replace("units[", "units[").replace("owners[", "owners[")
                got[(o["doc_id"], f)] = o["value"]
    return got


def baseline(events, exp):
    """Naive picker: for each numeric field, the number cell whose row label is most similar to the field's hint."""
    types = {e["payload"]["doc_id"]: e["payload"]["type"] for e in events if e["type"] == "doc_classified"}
    parsed = {e["payload"]["doc_id"]: Parsed(**e["payload"]["parsed"]) for e in events if e["type"] == "doc_parsed"}
    out = {}
    for (doc, f), (kind, v) in exp.items():
        if kind not in ("money", "pct", "int") or "[" in f or doc not in parsed or v is None:
            continue
        field = DOCTYPES[types[doc]]["fields"].get(f)
        if not field or "narrative" in f:
            continue
        cells = [c for c in parsed[doc].cells if c.value is not None]
        best = max(cells, key=lambda c: fuzz.token_set_ratio(field["hint"].lower(), (c.row_label + " " + c.col_header).lower()), default=None)
        out[(doc, f)] = best.value if best else None
    return out


def load(scenario, order):
    return Store(RUNS / f"{scenario}__{order}.sqlite").all(), json.loads((RUNS / f"{scenario}__{order}.json").read_text(encoding="utf-8"))


def check_planted(p, run):
    m, lf, cards = p.get("match", {}), run["loan_file"], {c["id"]: c for c in run["cards"]}
    ok, why = True, []
    if "card" in m:
        c = cards.get(m["card"])
        ok &= c is not None
        if c and "axes" in m:
            ok &= sorted(c["axes"]) == sorted(m["axes"])
            why.append(f"axes {c['axes']}")
        if c and m.get("hypothesis"):
            ok &= bool(c.get("hypothesis"))
        why.append(f"card {m['card']} {'present' if c else 'MISSING'}")
    for cid in m.get("cards", []):
        ok &= cid in cards
        why.append(f"card {cid} {'present' if cid in cards else 'MISSING'}")
    if "comparison" in m:
        concept, status, *reason = m["comparison"]
        hits = [c for c in lf["comparisons"] if c["concept"] == concept and c["status"] == status and (not reason or c["reason"] == reason[0])]
        ok &= bool(hits)
        why.append(f"{concept} {status} {reason[0] if reason else ''}: {len(hits)} found")
        hit_ids = {c["id"] for c in hits}
        ok &= not any(set(c.get("comparison") if isinstance(c.get("comparison"), list) else [c.get("comparison")]) & hit_ids
                      for c in cards.values()) or status == "difference"
    if "bridge" in m:
        b = next((b for b in lf["bridges"]), None)
        ok &= b is not None and b["status"] == m["bridge"] and any(e["concept"] == m["located"] for e in b["located_in"])
        why.append(f"bridge {b and b['status']}, located {[e['concept'] for e in b['located_in']] if b else None}")
    if "coincidence" in m:
        b = next((b for b in lf["bridges"]), None)
        ok &= bool(b) and any(c["concept"] == m["coincidence"] for c in b["coincidences"]) and \
            not any(c["concept"] == m["coincidence"] for c in cards.values())
        why.append("coincidence rejected" if ok else "coincidence not handled")
    if "merged" in m:
        kind, docs = m["merged"]
        ents = [e for e in lf["entities"] if e["kind"] == kind and set(docs) <= set(e["docs"])]
        ok &= len(ents) == 1
        why.append(f"{kind} merged across {len(docs)} docs: {bool(ents)}")
    if "not_merged" in m:
        a, b = m["not_merged"]
        ok &= not any(e["kind"] == "person" and {a, b} <= set(e["docs"]) and any(a in x for x in e["mentions"]) and
                      any(f"person@{a}" == x for x in e["mentions"]) and any(b in x for x in e["mentions"] if x != f"person@{a}") for e in lf["entities"])
    if "rule" in m:
        r, res = m["rule"]
        ok &= run["rules"][r]["result"] == res
        why.append(f"rule {r} = {run['rules'][r]['result']}")
    if "beneficial_owner" in m:
        bo = run["rules"]["beneficial_owners"]["value"]
        ok &= any(m["beneficial_owner"] in x for x in bo)
        why.append(f"beneficial owners {bo}")
    if "scaled" in m:
        hits = [o for o in lf["observations"] if o["doc_id"] == m["scaled"] and any(t.startswith("scale:thousands") for t in o["transforms"])]
        ok &= len(hits) >= 10
        why.append(f"{len(hits)} values scaled x1000")
    return bool(ok), "; ".join(why)


NAIVE_ALIAS = {"borrower_ein": "ein", "entity_ein": "ein", "borrower_name": "org_name", "entity_name": "org_name", "client": "org_name",
               "loan_amount_narrative": "loan_amount"}
NAIVE_FIELDS = {"gross_rents", "other_income", "total_income", "advertising", "cleaning_maintenance", "insurance", "legal_professional",
                "re_taxes", "repairs", "utilities", "noi", "apn", "property_address", "ein", "org_name", "units", "loan_amount"}


def naive_alerts(lf):
    """What a field-by-field diff would flag: same field name, different printed value. No periods, entities or transforms."""
    groups = {}
    for o in lf["observations"]:
        f = NAIVE_ALIAS.get(o["field"], o["field"])
        if o["doc_type"] == "irs_8825" and f == "name":
            f = "org_name"
        if f in NAIVE_FIELDS:
            groups.setdefault(f, set()).add(str(D(o["value"]).normalize()) if o["kind"] in ("money", "int", "pct") else o["value"])
    alerts = [f for f, vals in groups.items() if len(vals) > 1]
    people = {}
    for o in lf["observations"]:
        if o["field"] in ("owners.pct", "members.pct"):
            name = next(x["value"] for x in lf["observations"] if x["id"] == o["id"].replace(".pct", ".name"))
            people.setdefault(compact(name), set()).add(o["value"])
    alerts += [f"pct:{n}" for n, v in people.items() if len(v) > 1]
    return sorted(alerts)


@app.command()
def score(scenario: str, orders: str = "A,B,C"):
    spec = yaml.safe_load((ROOT / "gen" / "scenarios" / f"{scenario}.yaml").read_text(encoding="utf-8"))
    events, run = load(scenario, "A")
    exp, got = expected(spec), observed(events)
    rows = [(k, kind, v, got.get(k)) for k, (kind, v) in exp.items()]
    correct = [r for r in rows if matches(r[1], r[2], r[3])]
    wrong = [r for r in rows if not matches(r[1], r[2], r[3])]
    base = baseline(events, exp)
    llm_sub = sum(matches(exp[k][0], exp[k][1], got.get(k)) for k in base)
    base_ok = sum(matches(exp[k][0], exp[k][1], v) for k, v in base.items())
    planted = [(p["id"], p["kind"], p["what"], *check_planted(p, run)) for p in spec["planted"]]
    must_surface = [p for p in spec["planted"] if p["kind"] in ("real_conflict", "missing", "trap_entity")]
    surfaced = [p for p in must_surface if check_planted(p, run)[0]]
    real = [p for p in spec["planted"] if p["kind"] == "real_conflict"]
    explained_away = [p for p in real if not check_planted(p, run)[0]]
    traps = [p for p in spec["planted"] if p["kind"].startswith("trap") or p["kind"].startswith("noise") or p["kind"] in ("bridge", "tie_out", "rule_boundary")]
    traps_ok = [p for p in traps if check_planted(p, run)[0]]
    runs = {o: load(scenario, o)[1] for o in orders.split(",") if (RUNS / f"{scenario}__{o}.json").exists()}
    sig = lambda r: json.dumps([[c["id"], c["axes"], c["severity"], c.get("working")] for c in r["cards"]] +
                               [[k, v["result"], v["value"]] for k, v in r["rules"].items()], sort_keys=True, default=str)
    base_sig = sig(runs["A"])
    invariant = [o for o, r in runs.items() if sig(r) == base_sig]
    decisions = run["decisions"]
    stale_ok = [d for d in decisions if d["status"] == "stale" and d["stale"]["trigger_doc"] == "operating_agreement"] if spec["reviewer_script"] else []
    naive = naive_alerts(run["loan_file"])

    def naive_catches(p):
        card = p.get("match", {}).get("card", "")
        if card == "conflict:ownership":
            return any(a.startswith("pct:") for a in naive)
        return card.startswith("conflict:") and card.split(":")[1] in naive
    naive_real = [p["id"] for p in must_surface if naive_catches(p)]
    calls = run["cost"]["model_calls_recorded"]
    ents = run["loan_file"]["entities"]
    wrong_merges = [e for e in ents if e["kind"] == "person" and len({x.split("@")[1].split("#")[0] for x in e["mentions"]
                                                                       if x.startswith("person@pfs")}) > 1]
    result = {
        "scenario": scenario, "split": spec["split"],
        "headline": {"real_issue_recall": ci(len(surfaced), len(must_surface)),
                     "false_explained_rate": ci(len(explained_away), len(real)),
                     "alert_load": {"engine_cards": len(run["cards"]), "naive_diff_alerts": len(naive), "naive_fields": naive},
                     "naive_diff_recall": ci(len(naive_real), len(must_surface)), "naive_caught": naive_real},
        "extraction": {"all_fields": ci(len(correct), len(rows)),
                       "numeric_llm": ci(llm_sub, len(base)), "numeric_fuzzy_baseline": ci(base_ok, len(base)),
                       "wrong": [{"field": f"{k[0]}.{k[1]}", "expected": str(v), "got": g} for k, kind, v, g in wrong]},
        "planted": [{"id": i, "kind": k, "what": what, "pass": ok, "evidence": why} for i, k, what, ok, why in planted],
        "traps_and_noise_handled": ci(len(traps_ok), len(traps)),
        "order_invariance": {"orders": list(runs), "identical_to_A": invariant, **ci(len(invariant), len(runs))},
        "stale_decisions": ci(len(stale_ok), len(decisions)) if spec["reviewer_script"] else None,
        "wrong_merges": len(wrong_merges),
        "cost_per_file": {"model_calls": len(calls), "tokens_in": sum(c.get("tokens_in") or 0 for c in calls),
                          "tokens_out": sum(c.get("tokens_out") or 0 for c in calls),
                          "providers": sorted({f"{c['provider']}:{c['model']}" for c in calls})},
    }
    (RUNS / f"score_{scenario}.json").write_text(json.dumps(result, indent=1, default=str), encoding="utf-8")
    h = result["headline"]
    print(f"{scenario} ({spec['split']}) real-issue recall {h['real_issue_recall']}  false-explained {h['false_explained_rate']}")
    print(f"  alert load: {h['alert_load']['engine_cards']} cards vs {h['alert_load']['naive_diff_alerts']} naive alerts {naive}")
    print(f"  extraction all {result['extraction']['all_fields']}; numeric LLM {result['extraction']['numeric_llm']} vs fuzzy {result['extraction']['numeric_fuzzy_baseline']}")
    for w in result["extraction"]["wrong"]:
        print(f"    wrong {w}")
    for p in result["planted"]:
        print(f"  {p['id']:<4} {p['kind']:<20} {'PASS' if p['pass'] else 'FAIL'}  {p['evidence']}")
    print(f"  traps/noise {result['traps_and_noise_handled']}  order invariance {result['order_invariance']['identical_to_A']}  "
          f"stale {result['stale_decisions']}  wrong merges {result['wrong_merges']}  cost {result['cost_per_file']}")


@app.command()
def consistency(scenario: str = "cedar_row", runs: int = 3, providers: str = "groq"):
    """Re-run every pick with the cache off and count fields whose value agrees across all runs."""
    events, _ = load(scenario, "A")
    parsed = {e["payload"]["doc_id"]: Parsed(**e["payload"]["parsed"]) for e in events if e["type"] == "doc_parsed"}
    types = {e["payload"]["doc_id"]: e["payload"]["type"] for e in events if e["type"] == "doc_classified"}
    values = {}
    port = Port(only=providers.split(","), cache=False)
    for n in range(runs):
        for doc, p in parsed.items():
            out, short = extract(port, p, doc, doc, types[doc])
            obs, _, _ = observations(out, short, p, doc, types[doc])
            for o in obs:
                values.setdefault(o.id, []).append(o.value)
        print(f"run {n + 1} done, {len(port.calls)} calls so far")
    agree = [k for k, v in values.items() if len(v) == runs and len(set(v)) == 1]
    res = {"scenario": scenario, "runs": runs, "providers": sorted({f"{c['provider']}:{c['model']}" for c in port.calls}),
           "agreement": ci(len(agree), len(values)), "disagree": {k: v for k, v in values.items() if k not in agree}}
    (RUNS / f"consistency_{scenario}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(json.dumps({k: res[k] for k in ("providers", "agreement")}), res["disagree"])


@app.command()
def providers(scenario: str = "cedar_row", names: str = "groq,groq-qwen,openrouter-nemotron"):
    """Same parsed documents, each provider alone: extraction accuracy per provider."""
    events, _ = load(scenario, "A")
    spec = yaml.safe_load((ROOT / "gen" / "scenarios" / f"{scenario}.yaml").read_text(encoding="utf-8"))
    exp = expected(spec)
    parsed = {e["payload"]["doc_id"]: Parsed(**e["payload"]["parsed"]) for e in events if e["type"] == "doc_parsed"}
    types = {e["payload"]["doc_id"]: e["payload"]["type"] for e in events if e["type"] == "doc_classified"}
    res = {}
    for name in names.split(","):
        port = Port(only=[name], cache=True)
        got, failed, lat = {}, [], []
        for doc, p in parsed.items():
            try:
                out, short = extract(port, p, doc, p.cells[0].text if p.cells else doc, types[doc])
            except Exception:
                failed.append(doc)
                continue
            lat.append(out["by"].get("latency_ms"))
            obs, _, _ = observations(out, short, p, doc, types[doc])
            for o in obs:
                f = o.id.split(":", 1)[1] if "[" in o.id else o.field
                got[(doc, f)] = o.value
        attempted = {k: x for k, x in exp.items() if k[0] not in failed}
        ok = sum(matches(kind, v, got.get(k)) for k, (kind, v) in attempted.items())
        lat = sorted(x for x in lat if x)
        wrong_cell = sum(1 for k, (kind, v) in attempted.items() if got.get(k) is not None and not matches(kind, v, got.get(k)))
        unresolved = sum(1 for k, (kind, v) in attempted.items() if got.get(k) is None and v is not None)
        res[name] = {"model": port.providers[0]["model"], "accuracy": ci(ok, len(attempted)), "failed_docs": failed,
                     "misses": {"left_unresolved": unresolved, "wrong_value": wrong_cell},
                     "median_latency_ms": sorted(lat)[len(lat) // 2] if lat else None}
        print(name, res[name])
    (RUNS / f"providers_{scenario}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    app()
