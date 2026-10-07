"""PDF -> tokens -> visual rows -> cells (with row label + column header) and prose spans."""
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pymupdf
from pydantic import BaseModel

OCR_DPI = 200
ROW_TOL = 3.5        # points; tokens whose vertical centres differ less than this share a row
CELL_GAP = 9.0       # points; a horizontal gap wider than this starts a new cell
RUN_GAP = 11.0       # points; a vertical gap wider than this ends a table


class Token(BaseModel):
    id: int
    page: int
    text: str
    bbox: tuple[float, float, float, float]
    score: float | None = None        # OCR confidence; None for a digital text layer


class Cell(BaseModel):
    id: str
    page: int
    row: int
    col: int
    text: str
    bbox: tuple[float, float, float, float]
    tokens: list[int]
    value: str | None = None          # Decimal as string when the cell is a number
    unit: str | None = None           # "%", "MM", "K" when the printed number carries one
    row_label: str = ""
    col_header: str = ""


class Span(BaseModel):
    id: str
    page: int
    text: str
    bbox: tuple[float, float, float, float]
    tokens: list[int]


class Parsed(BaseModel):
    doc_id: str
    pages: list[tuple[float, float]]
    ocr_pages: list[int]
    tokens: list[Token]
    cells: list[Cell]
    spans: list[Span]


NUM = re.compile(r"^\(?-?\$?\(?([0-9]{1,3}(,[0-9]{3})+|[0-9]+)(\.[0-9]+)?\)?(%|MM|M|K)?\)?$")


def parse_number(text: str) -> tuple[Decimal, str | None] | None:
    t = text.strip().replace(" ", "")
    m = NUM.match(t)
    if not m:
        return None
    unit = m.group(4)
    core = re.sub(r"[^0-9.]", "", t.removesuffix(unit or ""))
    try:
        v = Decimal(core)
    except InvalidOperation:
        return None
    if t.startswith("(") and t.endswith(")") or t.startswith("-"):
        v = -v
    return v, unit


def union(boxes):
    xs0, ys0, xs1, ys1 = zip(*boxes)
    return (min(xs0), min(ys0), max(xs1), max(ys1))


def page_tokens(page, pno, start_id, ocr):
    words = [w for w in page.get_text("words") if not re.fullmatch(r"[.\s]+", w[4])]
    if len(words) >= 5:
        return [Token(id=start_id + i, page=pno, text=w[4], bbox=tuple(round(v, 2) for v in w[:4]))
                for i, w in enumerate(words)], False
    import numpy as np
    pix = page.get_pixmap(dpi=OCR_DPI)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    result, _ = ocr(img[:, :, :3] if pix.n >= 3 else img)
    s = 72 / OCR_DPI
    toks = []
    for box, text, score in result or []:
        xs, ys = [p[0] * s for p in box], [p[1] * s for p in box]
        toks.append(Token(id=start_id + len(toks), page=pno, text=text.strip(),
                          bbox=(round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)),
                          score=round(float(score), 3)))
    return toks, True


def rows_of(tokens):
    rows = []
    for t in sorted(tokens, key=lambda t: (t.bbox[1] + t.bbox[3]) / 2):
        cy = (t.bbox[1] + t.bbox[3]) / 2
        if rows and abs(rows[-1]["cy"] - cy) < ROW_TOL:
            rows[-1]["toks"].append(t)
        else:
            rows.append({"cy": cy, "toks": [t]})
    return [sorted(r["toks"], key=lambda t: t.bbox[0]) for r in rows]


def cells_of_row(toks):
    groups = [[toks[0]]]
    for t in toks[1:]:
        prev = groups[-1][-1]
        gap = t.bbox[0] - prev.bbox[2]
        is_num, prev_num = parse_number(t.text) is not None, parse_number(prev.text) is not None
        if gap > CELL_GAP or (gap > 3 and is_num != prev_num and (is_num or prev_num) and gap > 6):
            groups.append([t])
        else:
            groups[-1].append(t)
    return groups


def overlaps(a, b):
    return min(a[2], b[2]) - max(a[0], b[0]) > 0


def parse(pdf_path: Path, doc_id: str, ocr=None) -> Parsed:
    pdf = pymupdf.open(pdf_path)
    tokens, cells, spans, ocr_pages, pages = [], [], [], [], []
    for pno, page in enumerate(pdf):
        pages.append((round(page.rect.width, 2), round(page.rect.height, 2)))
        if ocr is None and len(page.get_text("words")) < 5:
            from rapidocr_onnxruntime import RapidOCR
            ocr = RapidOCR()
        toks, used_ocr = page_tokens(page, pno, len(tokens), ocr)
        if used_ocr:
            ocr_pages.append(pno)
        tokens += toks
        page_cells, prose_rows, last_row = [], [], None
        for r, row in enumerate(rows_of(toks)):
            groups = cells_of_row(row)
            width = page.rect.width
            line_text = " ".join(t.text for t in row)
            wide = len(line_text) > 60 and (row[-1].bbox[2] - row[0].bbox[0]) > 0.5 * width
            follows = prose_rows and prose_rows[-1] is last_row and row[0].bbox[1] - last_row[-1].bbox[3] < 6                 and abs(row[0].bbox[0] - last_row[0].bbox[0]) < 2
            if len(groups) == 1 and (wide or follows):
                prose_rows.append(row)
            last_row = row
            for c, g in enumerate(groups):
                text = " ".join(t.text for t in g)
                num = parse_number(text)
                page_cells.append(Cell(id=f"{doc_id}:p{pno}:r{r}:c{c}", page=pno, row=r, col=c, text=text,
                                       bbox=union([t.bbox for t in g]), tokens=[t.id for t in g],
                                       value=str(num[0]) if num else None, unit=num[1] if num else None))
        label_cells(page_cells)
        cells += page_cells
        spans += spans_of(prose_rows, doc_id, pno)
    return Parsed(doc_id=doc_id, pages=pages, ocr_pages=ocr_pages, tokens=tokens, cells=cells, spans=spans)


def label_cells(cells):
    by_row = {}
    for c in cells:
        by_row.setdefault(c.row, []).append(c)
    rows = sorted(by_row)
    top = {r: min(c.bbox[1] for c in by_row[r]) for r in rows}
    bottom = {r: max(c.bbox[3] for c in by_row[r]) for r in rows}
    run_start, start = {}, None
    for i, r in enumerate(rows):
        multi = len(by_row[r]) > 1
        if not multi:
            start = None
        elif start is None or top[r] - bottom[rows[i - 1]] > RUN_GAP:
            start = r
        run_start[r] = start
    for c in cells:
        if c.value is None:
            continue
        c.row_label = " ".join(x.text for x in by_row[c.row] if x.bbox[2] <= c.bbox[0] + 1)
        h = run_start.get(c.row)
        if h is not None and h != c.row and all(x.value is None for x in by_row[h]):
            hits = [x for x in by_row[h] if overlaps(x.bbox, c.bbox)]
            c.col_header = hits[0].text if hits else ""


SENT = re.compile(r"(?<=[.;])\s+(?=[A-Z])")


def spans_of(prose_rows, doc_id, pno):
    paras, cur = [], []
    for row in prose_rows:
        if cur and row[0].bbox[1] - cur[-1][-1].bbox[3] > 8:
            paras.append(cur)
            cur = []
        cur.append(row)
    if cur:
        paras.append(cur)
    spans = []
    for para in paras:
        toks = [t for row in para for t in row]
        text = " ".join(t.text for t in toks)
        pos, parts = 0, SENT.split(text)
        for part in parts:
            n = len(part.split())
            sel = toks[pos:pos + n]
            pos += n
            if sel:
                spans.append(Span(id=f"{doc_id}:p{pno}:s{len(spans)}", page=pno, text=part,
                                  bbox=union([t.bbox for t in sel]), tokens=[t.id for t in sel]))
    return spans


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    path = Path(sys.argv[1])
    p = parse(path, path.stem)
    print(f"{p.doc_id}: {len(p.tokens)} tokens, {len(p.cells)} cells, {len(p.spans)} spans, ocr pages {p.ocr_pages}")
    for c in p.cells:
        if c.value is not None or "--all" in sys.argv:
            print(f"{c.id:<26} {c.text:<16} {str(c.value):>12} {c.unit or '':<3} | {c.row_label[:46]:<46} | {c.col_header[:20]}")
    for s in p.spans:
        print(f"{s.id:<26} {s.text[:110]}")
