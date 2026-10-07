"""loanfile: ingest a borrower package document by document, replay it, export the run."""
import hashlib
import json
import shutil
import sys
import time
from pathlib import Path

import typer
import yaml

from engine.extract import candidates, classify, extract, observations
from engine.llm import Port
from engine.parse import Parsed, parse
from engine.project import POLICY, RULE_LABEL, Store, fold

ROOT = Path(__file__).parent.parent
RUNS = ROOT / "runs"
app = typer.Typer(add_completion=False)
INVESTIGATE_V = "investigate-1"


def investigate(port, card, state):
    anchors = state["anchors"]
    ids = sorted({a for o in card["observations"] for a in o["anchors"]})
    short = {f"e{i}": a for i, a in enumerate(ids)}
    stmts = {s["doc"]: s for s in state["statements"]}
    ev = "\n".join(f"e{i} | {state['documents'][anchors[a]['doc']]['title']} | row: {anchors[a]['row_label']} | printed: {anchors[a]['text']}"
                   f" | prepared: {(stmts.get(anchors[a]['doc']) or {}).get('basis') or 'filed tax return'}" for i, a in enumerate(ids))
    user = (f"Two documents in a commercial loan file disagree.\nCard: {card['title']}. {card['summary']}\n\nEvidence:\n{ev}\n\n"
            "As a credit analyst's assistant, suggest the most likely benign or non-benign explanation, the steps to check it, and the one "
            "document or question that would confirm it. You cannot resolve or explain away the card; a person decides. Cite evidence ids. "
            'Return JSON only: {"hypothesis": "...", "steps": ["..."], "cite": ["e0"], "verify_with": "..."}')
    out = port.ask("investigate", INVESTIGATE_V, "You help credit analysts investigate document conflicts. You never decide. JSON only.", user,
                   lambda d: ([] if isinstance(d.get("hypothesis"), str) and d["hypothesis"] else ["hypothesis is required"])
                   + [f"unknown evidence id {c}" for c in d.get("cite", []) if c not in short])
    data = out["data"] | {"cite_anchors": [short[c] for c in out["data"].get("cite", []) if c in short]}
    return data, out["by"]


def doc_title(p, doc_id):
    """The largest type on page one, which is how a person would name the document."""
    toks = [t for t in p.tokens if t.page == 0]
    if not toks:
        return doc_id
    heights = sorted(t.bbox[3] - t.bbox[1] for t in toks)
    big = [t for t in toks if t.bbox[3] - t.bbox[1] >= heights[len(heights) // 2] * 1.25 and t.bbox[1] < 200]
    return " ".join(t.text for t in sorted(big, key=lambda t: (round(t.bbox[1] / 6), t.bbox[0]))) or p.cells[0].text


def reviewer_decision(step, state, n):
    own = state["ownership"]
    return {"id": f"decision:{n}", "target": step["target"], "action": step["action"], "reason_code": step["reason_code"],
            "reviewer": "underwriter (scripted)", "card_id": None,
            "snapshot": {"ownership": {p: {"value": o["working"], "obs": o["working_obs"]} for p, o in own.items()},
                         "beneficial_owners": state["rules"]["beneficial_owners"]["value"]}}


@app.command()
def run(scenario: str, order: str = "A", providers: str = "groq,groq-qwen,openrouter-nemotron", cache: bool = True,
        out: Path = RUNS, investigate_cards: bool = True):
    spec = yaml.safe_load((ROOT / "gen" / "scenarios" / f"{scenario}.yaml").read_text(encoding="utf-8"))
    out.mkdir(parents=True, exist_ok=True)
    name = f"{scenario}__{order}"
    store = Store(out / f"{name}.sqlite", fresh=True)
    port = Port(only=providers.split(","), cache=cache)
    script = spec.get("reviewer_script", []) if order == "A" else []
    t0 = time.time()
    for doc_id in spec["arrival_orders"][order]:
        pdf = ROOT / "gen" / "out" / scenario / f"{doc_id}.pdf"
        p = parse(pdf, doc_id)
        title = doc_title(p, doc_id)
        store.append("doc_received", {"doc_id": doc_id, "file": pdf.name, "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
                                      "pages": p.pages, "title": title})
        store.append("doc_parsed", {"doc_id": doc_id, "parsed": p.model_dump()})
        c = classify(port, p)
        doc_type = c["data"]["type"]
        label = {"irs_8825": "Form 8825 (rental real estate, tax return)", "irs_4562": "Form 4562 (depreciation, tax return)"}.get(doc_type)
        store.append("doc_classified", {"doc_id": doc_id, "type": doc_type, "by": c["by"], "title": label})
        if doc_type == "other":
            continue
        pick, short = extract(port, p, doc_id, p.cells[0].text if p.cells else doc_id, doc_type)
        store.append("picks_recorded", {"doc_id": doc_id, "doc_type": doc_type, "out": pick})
        obs, unresolved, absent = observations(pick, short, p, doc_id, doc_type)
        store.append("observations_recorded", {"doc_id": doc_id, "obs": [o.model_dump() for o in obs], "unresolved": unresolved, "absent": absent})
        state = fold(store.all())
        print(f"+ {doc_id:<22} {doc_type:<24} obs={len(obs):<3} unresolved={unresolved} cards={[c['id'] for c in state['cards']]}")
        if investigate_cards:
            done = {e["payload"]["card_id"] for e in store.all() if e["type"] == "hypothesis_recorded"}
            for card in state["cards"]:
                if card["investigate"] and card["id"] not in done:
                    data, by = investigate(port, card, state)
                    store.append("hypothesis_recorded", {"card_id": card["id"], "data": data, "by": by})
        for n, step in enumerate(script):
            if step["after"] == doc_id:
                store.append("decision_recorded", reviewer_decision(step, state, n + 1))
    events = store.all()
    result = export(scenario, order, events, port, time.time() - t0)
    (out / f"{name}.json").write_text(json.dumps(result, indent=1, default=str), encoding="utf-8")
    dest = out / "pdfs" / scenario
    dest.mkdir(parents=True, exist_ok=True)
    for d in spec["arrival_orders"][order]:
        shutil.copy(ROOT / "gen" / "out" / scenario / f"{d}.pdf", dest / f"{d}.pdf")
    summary(result)


def export(scenario, order, events, port, wall):
    final = fold(events)
    timeline = []
    boundaries = [i for i, e in enumerate(events) if e["type"] in ("observations_recorded", "decision_recorded")]
    for i in boundaries:
        e = events[i]
        s = fold(events[: i + 1]) if i != len(events) - 1 else final
        while i + 1 < len(events) and events[i + 1]["type"] == "hypothesis_recorded":
            i += 1
            s = fold(events[: i + 1])
        timeline.append({"seq": e["seq"], "event": e["type"], "doc": e["payload"].get("doc_id"),
                         "cards": s["cards"],
                         "rules": {k: {"result": r["result"], "value": r["value"]} for k, r in s["rules"].items()},
                         "decisions": [{"id": d["id"], "status": d["status"]} for d in s["decisions"]]})
    used = {a for o in final["observations"] for a in o["anchors"]} | {a for c in final["cards"] for s in c["steps"] for a in s["anchors"]}
    calls = []
    for e in events:
        p = e["payload"]
        if e["type"] in ("doc_classified", "picks_recorded", "hypothesis_recorded"):
            by = p.get("by") or p["out"]["by"]
            calls.append({"seq": e["seq"], "task": e["type"].split("_")[0], "doc": p.get("doc_id") or p.get("card_id"), **by})
    real = [c for c in port.calls]
    return {"scenario": scenario, "order": order, "recorded_at": events[-1]["at"], "policy": {"version": POLICY["version"], "label": POLICY["label"]},
            "rule_labels": RULE_LABEL,
            "documents": [{"id": d["id"], "type": d["type"], "title": d["title"], "pages": d["pages"], "seq": d["seq"],
                           "pdf": f"pdfs/{scenario}/{d['id']}.pdf"} for d in final["documents"].values()],
            "anchors": {a: final["anchors"][a] for a in sorted(used) if a in final["anchors"]},
            "events": [{"seq": e["seq"], "type": e["type"], "at": e["at"], "doc": e["payload"].get("doc_id") or e["payload"].get("card_id")}
                       for e in events],
            "loan_file": {k: v for k, v in final.items() if k not in ("anchors", "anchors_index")},
            "anchors_index": {a: v for a, v in final["anchors_index"].items() if a in used},
            "cards": final["cards"], "rules": final["rules"], "decisions": final["decisions"], "timeline": timeline,
            "cost": {"model_calls_recorded": calls, "live_calls_this_run": len(real),
                     "tokens_in": sum(c.get("tokens_in") or 0 for c in real), "tokens_out": sum(c.get("tokens_out") or 0 for c in real),
                     "wall_seconds": round(wall, 1)}}


def summary(r):
    print(f"\n{r['scenario']} order {r['order']}: {len(r['cards'])} cards")
    for c in r["cards"]:
        print(f"  [{c['severity']:<6}] {c['id']:<44} axes={c['axes']} {c['summary'][:110]}")
    for k, v in r["rules"].items():
        print(f"  rule {k:<20} {v['result']:<10} {v['value']}")
    for d in r["decisions"]:
        print(f"  decision {d['id']} {d['status']} {d.get('stale') and d['stale']['changed']}")


@app.command()
def replay(scenario: str, order: str = "A", out: Path = RUNS):
    """Rebuild the loan file from the event log alone: re-derive observations from stored model output, then fold. No model calls."""
    store = Store(out / f"{scenario}__{order}.sqlite")
    events = store.all()
    parsed = {e["payload"]["doc_id"]: Parsed(**e["payload"]["parsed"]) for e in events if e["type"] == "doc_parsed"}
    mismatches = 0
    recorded = {e["payload"]["doc_id"]: e["payload"]["obs"] for e in events if e["type"] == "observations_recorded"}
    for e in events:
        if e["type"] == "picks_recorded":
            p = parsed[e["payload"]["doc_id"]]
            short, _ = candidates(p)
            obs, _, _ = observations(e["payload"]["out"], short, p, p.doc_id, e["payload"]["doc_type"])
            if [o.model_dump() for o in obs] != recorded[p.doc_id]:
                mismatches += 1
    exported = json.loads((out / f"{scenario}__{order}.json").read_text(encoding="utf-8"))
    final = fold(events)
    same = json.loads(json.dumps(final["cards"], default=str)) == exported["cards"] and \
        json.loads(json.dumps(final["rules"], default=str)) == exported["rules"]
    (out / f"replay_{scenario}__{order}.json").write_text(json.dumps({"events": len(events), "observations_identical": len(recorded) - mismatches,
        "documents": len(recorded), "cards_and_rules_identical": same, "model_calls": 0}), encoding="utf-8")
    print(f"replayed {len(events)} events, observations re-derived from stored model output: {len(recorded) - mismatches}/{len(recorded)} identical; "
          f"cards and rules identical to the recorded run: {same}; model calls made: 0")


@app.command("export-web")
def export_web(dest: Path = ROOT / "web" / "public" / "data", zoom: float = 1.6):
    """Copy recorded runs and scores into the static site, with page images for the evidence viewer."""
    import pymupdf
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(RUNS.glob("*.json")):
        shutil.copy(f, dest / f.name)
    for pdf in sorted((RUNS / "pdfs").glob("*/*.pdf")):
        out = dest / "pages" / pdf.parent.name
        out.mkdir(parents=True, exist_ok=True)
        shutil.copy(pdf, out / pdf.name)
        for n, page in enumerate(pymupdf.open(pdf)):
            page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(out / f"{pdf.stem}-p{n}.png")
    print(f"exported {len(list(dest.glob('*.json')))} json files and page images to {dest}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    app()
