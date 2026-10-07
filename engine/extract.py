"""Document -> observations. The model points at anchors; this code reads, parses and checks every value."""
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import yaml
from pydantic import BaseModel

from engine.parse import Cell, Parsed, Span, overlaps, parse_number

ROOT = Path(__file__).parent.parent
DOCTYPES = yaml.safe_load((ROOT / "policy" / "doctypes.yaml").read_text(encoding="utf-8"))
PICK_V = "pick-3"
CLASSIFY_V = "classify-1"
SCALES = {"MM": Decimal(1_000_000), "M": Decimal(1_000_000), "K": Decimal(1000)}


class Obs(BaseModel):
    id: str
    doc_id: str
    doc_type: str
    field: str
    kind: str
    value: str | None
    raw: str
    anchors: list[str]
    quote: str | None = None
    transforms: list[str] = []
    subject: str = ""                  # mention key, resolved to an entity later
    period: dict | None = None
    by: dict = {}


def norm_ws(s):
    return " ".join(str(s).split())


def fold(s):
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


DATE_RES = [(re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b"), "mdy"),
            (re.compile(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b"), "Mdy"),
            (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), "ymd")]


def find_dates(text):
    out = []
    for rx, f in DATE_RES:
        for m in rx.finditer(text):
            if f == "mdy":
                d = date(int(m[3]), int(m[1]), int(m[2]))
            elif f == "Mdy":
                d = datetime.strptime(f"{m[1]} {m[2]} {m[3]}", "%B %d %Y").date()
            else:
                d = date(int(m[1]), int(m[2]), int(m[3]))
            out.append((m.start(), d))
    return [d for _, d in sorted(out)]


def months_of(text):
    m = re.search(r"(\d+)\s*(years?|yrs?|months?|mos?)", text, re.I)
    if not m:
        return None
    n = int(m[1])
    return n * 12 if m[2].lower().startswith("y") else n


def candidates(p: Parsed):
    """Short ids for the prompt: c0.. for cells, s0.. for spans."""
    short = {}
    lines = []
    for i, c in enumerate(p.cells):
        short[f"c{i}"] = c
        extra = f" | row: {c.row_label[:70]}" if c.row_label else ""
        extra += f" | col: {c.col_header[:30]}" if c.col_header else ""
        lines.append(f"c{i} p{c.page} r{c.row} | {c.text[:80]}{extra}")
    for i, s in enumerate(p.spans):
        short[f"s{i}"] = s
        lines.append(f"s{i} p{s.page} | {s.text[:300]}")
    return short, "\n".join(lines)


SYSTEM = """You map the fields of one loan document to evidence anchors. You never write or compute numbers.
Each candidate is a table cell (id c..) or a prose sentence (id s..).
For each field return the id(s) of the anchor(s) that hold its value, or [] if the document does not contain it.
- Use a cell id when the value sits in a table cell. If the cell holds more than the value (e.g. "Period: 01/01/2025 to 12/31/2025"), still give the cell.
- Use a sentence id only when the value appears only in prose; then also give "quote": the exact substring of that sentence that states the value.
- Money fields point at the number cell, never at a label or a line-number box.
- "several allowed" fields may list more than one cell; they will be added up by code.
- Table fields: give the header cell id for each requested column in "columns".
Return JSON only: {"picks": [{"field": "...", "anchors": ["c12"], "quote": null}], "tables": [{"field": "...", "columns": {"col": "c3"}}]}"""


def pick_prompt(doc_type, title, fields, listing):
    fl = []
    for name, f in fields.items():
        cols = f" columns: {', '.join(f['columns'])}" if f["kind"] == "table" else ""
        fl.append(f"- {name} ({f['kind']}): {f['hint']}{cols}")
    return f"Document type: {doc_type}\nTitle: {title}\n\nFields:\n" + "\n".join(fl) + f"\n\nCandidates:\n{listing}"


def classify(port, p: Parsed):
    text = norm_ws(" ".join(c.text for c in p.cells[:60]))[:1500]
    types = {k: v["about"] for k, v in DOCTYPES.items()}
    user = "Which type is this document?\n" + "\n".join(f"- {k}: {v}" for k, v in types.items()) + \
        f"\n- other: none of the above\n\nFirst page text:\n{text}\n\nReturn JSON only: {{\"type\": \"...\"}}"
    out = port.ask("classify", CLASSIFY_V, "You classify loan documents. JSON only.", user,
                   lambda d: [] if d.get("type") in [*types, "other"] else [f"type must be one of {[*types, 'other']}"])
    return out


def read_value(kind, anchors, quote, scale_note=None):
    """Turn picked anchors into (value, raw, transforms, problem). Pure code; the model's text is never trusted."""
    texts = [a.text for a in anchors]
    raw = quote if quote else " + ".join(texts)
    transforms = []
    if kind in ("money", "int", "pct"):
        if quote:
            nums = [parse_number(t) for t in re.findall(r"\(?\$?[\d,]+(?:\.\d+)?\)?(?:%|MM|M|K)?", quote)]
            nums = [n for n in nums if n]
        else:
            nums = []
            for a in anchors:
                if isinstance(a, Span) or a.value is None:
                    return None, raw, [], f"anchor '{a.text[:40]}' is not a number cell"
                nums.append((Decimal(a.value), a.unit))
        if not nums:
            return None, raw, [], "no number found in the quote"
        total = Decimal(0)
        for v, unit in (nums if not quote else nums[:1]):
            if unit in SCALES:
                v *= SCALES[unit]
                transforms.append(f"unit_suffix:{unit}")
            total += v
        if kind == "pct" and not any(u == "%" for _, u in nums) and not raw.strip().endswith("%"):
            return None, raw, [], "a percentage field must point at a value printed with %"
        if kind == "money" and scale_note and not quote:
            total *= 1000
            transforms.append(f"scale:thousands@{scale_note}")
        if kind == "money" and not quote and all(isinstance(a, Cell) and a.row_label.split()[:1] == [a.text.strip()] for a in anchors):
            return None, raw, [], "that looks like a form line number, not the amount"
        return (str(total) if kind == "money" else format(total.normalize(), "f")), raw, transforms, None
    if kind == "date":
        ds = find_dates(raw)
        return (ds[0].isoformat(), raw, [], None) if ds else (None, raw, [], "no date found")
    if kind == "period":
        ds = find_dates(raw)
        return (f"{ds[0].isoformat()}/{ds[1].isoformat()}", raw, [], None) if len(ds) >= 2 else (None, raw, [], "need a start and end date")
    if kind == "months":
        m = months_of(raw)
        return (str(m), raw, [], None) if m else (None, raw, [], "no duration found")
    if kind == "scale":
        return ("thousands" if re.search(r"000s|thousands", raw, re.I) else None), raw, [], None
    value = re.sub(r"^[A-Za-z][A-Za-z ()/.-]{1,40}:\s+", "", norm_ws(raw))   # drop a printed label such as "Client: "
    return value, raw, [], None


def table_rows(p: Parsed, header_cells: dict[str, Cell]):
    """Rows under a header row, read column by column using the header cells' x-ranges."""
    hrow = next(iter(header_cells.values()))
    page_cells = [c for c in p.cells if c.page == hrow.page]
    rows = sorted({c.row for c in page_cells if c.row > hrow.row})
    out, last_bottom = [], max(c.bbox[3] for c in page_cells if c.row == hrow.row)
    for r in rows:
        cells = [c for c in page_cells if c.row == r]
        if len(cells) < 2 or min(c.bbox[1] for c in cells) - last_bottom > 11:
            break
        last_bottom = max(c.bbox[3] for c in cells)
        if cells[0].text.lower().startswith("total"):
            continue
        row = {}
        for col, h in header_cells.items():
            hits = [c for c in cells if overlaps(c.bbox, h.bbox)]
            if hits:
                row[col] = hits[0]
        out.append((r, row))
    return out


TABLE_KIND = {"rent": "money", "pct": "pct", "dob": "date", "unit": "text", "tenant": "text", "name": "text",
              "address": "text", "ssn": "text"}


def validate_picks(fields, short):
    def check(d):
        problems = []
        for pk in d.get("picks", []):
            name = pk.get("field")
            if name not in fields:
                problems.append(f"unknown field {name}")
                continue
            ids = pk.get("anchors") or []
            for a in ids:
                if a not in short:
                    problems.append(f"{name}: anchor {a} does not exist")
            if not ids or any(a not in short for a in ids):
                continue
            anchors = [short[a] for a in ids]
            q = pk.get("quote")
            if any(isinstance(a, Span) for a in anchors):
                if not q or norm_ws(q) not in norm_ws(" ".join(a.text for a in anchors)):
                    problems.append(f"{name}: a sentence anchor needs a quote copied exactly from that sentence")
                    continue
            elif q and norm_ws(q) not in norm_ws(" ".join(a.text for a in anchors)):
                q = None
            kind = fields[name]["kind"]
            if kind != "table":
                _, _, _, prob = read_value(kind, anchors, q)
                if prob:
                    problems.append(f"{name}: {prob}")
        for t in d.get("tables", []):
            name = t.get("field")
            if name not in fields or fields[name]["kind"] != "table":
                problems.append(f"{name} is not a table field")
                continue
            for col, a in (t.get("columns") or {}).items():
                if a not in short or isinstance(short[a], Span) or short[a].value is not None:
                    problems.append(f"{name}.{col}: {a} must be a header cell (text, not a number)")
        return problems
    return check


def extract(port, p: Parsed, doc_id: str, title: str, doc_type: str):
    fields = DOCTYPES[doc_type]["fields"]
    short, listing = candidates(p)
    out = port.ask(f"pick:{doc_type}", PICK_V, SYSTEM, pick_prompt(doc_type, title, fields, listing), validate_picks(fields, short))
    return out, short


def observations(pick_out, short, p: Parsed, doc_id: str, doc_type: str) -> tuple[list[Obs], list[str], list[str]]:
    """Code-only step: stored model output -> observations. Replay runs this without any model call."""
    fields = DOCTYPES[doc_type]["fields"]
    data, by = pick_out["data"] or {}, pick_out["by"]
    picks = {pk["field"]: pk for pk in data.get("picks", []) if pk.get("field") in fields}
    obs, unresolved, absent = [], [], []
    full = lambda a: a.id
    scale_pk = picks.get("scale")
    scale_note = None
    if scale_pk and all(a in short for a in scale_pk.get("anchors") or []) and scale_pk.get("anchors"):
        v, *_ = read_value("scale", [short[a] for a in scale_pk["anchors"]], scale_pk.get("quote"))
        scale_note = short[scale_pk["anchors"][0]].id if v == "thousands" else None
    for name, f in fields.items():
        if f["kind"] in ("table", "scale"):
            continue
        pk = picks.get(name)
        ids = [a for a in (pk or {}).get("anchors") or [] if a in short]
        if not ids:
            (absent if pk is not None and not pk.get("anchors") else unresolved).append(name)
            continue
        anchors = [short[a] for a in ids]
        q = pk.get("quote")
        if q and norm_ws(q) not in norm_ws(" ".join(a.text for a in anchors)):
            q = None
        value, raw, transforms, prob = read_value(f["kind"], anchors, q, scale_note)
        if prob or value is None:
            unresolved.append(name)
            continue
        obs.append(Obs(id=f"{doc_id}:{name}", doc_id=doc_id, doc_type=doc_type, field=name, kind=f["kind"], value=value,
                       raw=norm_ws(raw), anchors=[full(a) for a in anchors], quote=q, transforms=transforms, by=by))
    for t in data.get("tables", []):
        name = t.get("field")
        if name not in fields or fields[name]["kind"] != "table":
            continue
        cols = {c: short[a] for c, a in (t.get("columns") or {}).items() if a in short and isinstance(short[a], Cell)}
        if not cols:
            unresolved.append(name)
            continue
        for i, (_, row) in enumerate(table_rows(p, cols)):
            for col, cell in row.items():
                kind = TABLE_KIND.get(col, "text")
                value, raw, transforms, prob = read_value(kind, [cell], None)
                if prob or value is None:
                    continue
                obs.append(Obs(id=f"{doc_id}:{name}[{i}].{col}", doc_id=doc_id, doc_type=doc_type, field=f"{name}.{col}",
                               kind=kind, value=value, raw=cell.text, anchors=[cell.id], transforms=transforms,
                               subject=f"{doc_id}#{name}[{i}]", by=by))
    return obs, unresolved, absent
