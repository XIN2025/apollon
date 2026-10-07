"""Render a scenario YAML into the borrower's document package."""
import io
import random
import sys
from datetime import date
from pathlib import Path

import pymupdf
import typer
import yaml
from PIL import Image, ImageFilter
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).parent
FORMS = ROOT / "irs_forms"

# Field positions on the real irs.gov PDFs, keyed by form line. 8825 values go in property column A.
F8825 = {
    "name": "f1_1", "ein": "f1_2", "addr": "f1_3", "type": "f1_4", "days": "f1_6", "personal": "f1_7",
    "2a": "f1_23", "2b": "f1_27", "2c": "f1_31", "3": "f1_35", "4": "f1_39", "5": "f1_43", "6": "f1_47",
    "7": "f1_51", "8": "f1_55", "9": "f1_59", "10": "f1_63", "11": "f1_67", "12": "f1_71", "13": "f1_75",
    "14": "Line14[0].f1_99", "17": "f1_91", "18": "f1_95", "19": "Line19[0].f1_99",
    "20a": "f1_103", "20b": "f1_104", "23": "f1_113",
}
F4562 = {
    "name": "f1_1", "activity": "f1_2", "ein": "f1_3", "17": "f1_25",
    "19b_month": "f1_32", "19b_basis": "f1_33", "19b_period": "f1_34", "19b_conv": "f1_35",
    "19b_method": "f1_36", "19b": "f1_37", "22": "f2_2", "43": "f3_13", "44": "f3_14",
}

STYLES = {
    "v1": dict(font="Helvetica", bold="Helvetica-Bold", accent=colors.HexColor("#1f3a5f"), grid=colors.HexColor("#c8ced6"),
               cents=True, dollar=False, neg="minus"),
    "v2": dict(font="Times-Roman", bold="Times-Bold", accent=colors.HexColor("#3b3b3b"), grid=colors.HexColor("#9a9a9a"),
               cents=False, dollar=True, neg="parens"),
}


def money(v, st, cents=None, dec=None):
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    dec = dec if dec is not None else (2 if (st["cents"] if cents is None else cents) else 0)
    s = f"{abs(v):,.{dec}f}"
    s = ("$" + s) if st["dollar"] else s
    if v < 0:
        s = f"({s})" if st["neg"] == "parens" else f"-{s}"
    return s


def fmt_date(d, st):
    if not isinstance(d, date):
        return "" if d is None else str(d)
    return d.strftime("%m/%d/%Y") if st["font"] == "Helvetica" else d.strftime("%B %d, %Y").replace(" 0", " ")


class Doc:
    def __init__(self, st):
        self.st = st
        self.flow = []
        self.p = ParagraphStyle("p", fontName=st["font"], fontSize=9.5, leading=13.5)
        self.h = ParagraphStyle("h", fontName=st["bold"], fontSize=14, leading=18, textColor=st["accent"])
        self.meta = ParagraphStyle("m", fontName=st["font"], fontSize=8.5, leading=11, textColor=colors.HexColor("#555555"))

    def title(self, text, *meta):
        self.flow += [Paragraph(text, self.h), Spacer(1, 4)]
        self.flow += [Paragraph(m, self.meta) for m in meta if m]
        self.flow.append(Spacer(1, 10))

    def para(self, text):
        self.flow += [Paragraph(" ".join(str(text).split()), self.p), Spacer(1, 10)]

    def table(self, rows, header=True, widths=None, right_cols=(), bold_rows=()):
        t = Table([[str(c) for c in r] for r in rows], colWidths=widths, hAlign="LEFT")
        st = self.st
        cmds = [("FONT", (0, 0), (-1, -1), st["font"], 8.5), ("GRID", (0, 0), (-1, -1), 0.4, st["grid"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        if header:
            cmds += [("FONT", (0, 0), (-1, 0), st["bold"], 8.5), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef1f5"))]
        cmds += [("ALIGN", (c, 0), (c, -1), "RIGHT") for c in right_cols]
        cmds += [("FONT", (0, r), (-1, r), st["bold"], 8.5) for r in bold_rows]
        t.setStyle(TableStyle(cmds))
        self.flow += [t, Spacer(1, 12)]

    def save(self, path):
        SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=0.8 * inch, rightMargin=0.8 * inch,
                          topMargin=0.8 * inch, bottomMargin=0.8 * inch).build(self.flow)


def r_loan_request(d, doc, st):
    doc.title(d["title"], f"Date: {fmt_date(d['date'], st)}")
    doc.para(d["content"]["narrative"])
    doc.table([["Item", "Detail"]] + [[k, v] for k, v in d["content"]["table"].items()], widths=[2.4 * inch, 4.2 * inch])


def r_rent_roll(d, doc, st):
    doc.title(d["title"], f"As of {fmt_date(d['as_of'], st)}")
    rows = [d["columns"]]
    for r in d["rows"]:
        rows.append([r[0], r[1], r[2], fmt_date(r[3], st), fmt_date(r[4], st), money(r[5], st, False), money(r[6], st, False)])
    t = d["totals"]
    rows.append(["Total", "", f"{t['occupied_units']} of {t['total_units']} occupied", "", "", money(t["monthly_rent"], st, False), ""])
    doc.table(rows, right_cols=(5, 6), bold_rows=(len(rows) - 1,))


def r_operating_statement(d, doc, st):
    p = d["period"]
    unit = "Amounts in $000s" if d.get("units") == "thousands" else ""
    doc.title(d["title"], f"Period: {fmt_date(p['start'], st)} to {fmt_date(p['end'], st)}", f"Prepared by: {d['prepared_by']}", unit)
    rows = [["Account", "Amount"]] + [[label, money(v, st, dec=os_dec(d))] for label, v in d["lines"]]
    bold = tuple(i for i, r in enumerate(rows) if r[0].lower().startswith(("total", "net")))
    doc.table(rows, widths=[3.6 * inch, 1.6 * inch], right_cols=(1,), bold_rows=bold)


def os_dec(d):
    return 1 if d.get("units") == "thousands" else None


def r_appraisal(d, doc, st):
    doc.title(d["title"], f"Effective date of value: {fmt_date(d['effective_date'], st)}", f"Client: {d['client']}")
    doc.para(d["content"]["narrative"])
    doc.table([["Item", "Value"]] + [[k, v] for k, v in d["content"]["table"].items()], widths=[3.2 * inch, 2.0 * inch], right_cols=(1,))


def r_ownership_certification(d, doc, st):
    e = d["entity"]
    doc.title(d["title"], f"Legal entity: {e['name']}", f"Employer identification number: {e['ein']}")
    doc.para("The undersigned certifies, to the best of their knowledge, that the following individuals directly or indirectly "
             "own 25 percent or more of the equity interests of the legal entity listed above, and that the individual named "
             "as control person has significant responsibility to control, manage or direct the legal entity.")
    rows = [["Name", "Date of birth", "Address", "SSN", "Ownership"]]
    rows += [[o["name"], fmt_date(o["dob"], st), o["address"], o["ssn"], f"{o['pct']}%"] for o in d["owners"]]
    doc.table(rows, right_cols=(4,))
    doc.para(f"Control person: {d['control_person']}")
    doc.para(f"Signed: {d['signed_by']} &nbsp;&nbsp; Date: {fmt_date(d['date'], st)}")


def r_pfs(d, doc, st):
    p = d["person"]
    doc.title(d["title"], f"Statement date: {fmt_date(d['date'], st)}")
    doc.table([["Name", p["name"]], ["Social security number", p["ssn"]], ["Date of birth", fmt_date(p["dob"], st)],
               ["Residence address", p["address"]]], header=False, widths=[2.2 * inch, 4.0 * inch])
    labels = {"total_assets": "Total assets", "total_liabilities": "Total liabilities", "net_worth": "Net worth",
              "liquid_assets": "Cash and marketable securities"}
    doc.table([["Summary", "Amount"]] + [[labels[k], money(v, st, False)] for k, v in d["values"].items()],
              widths=[3.0 * inch, 1.6 * inch], right_cols=(1,))
    doc.para("I certify that the information above is true and complete as of the statement date.")


def r_operating_agreement(d, doc, st):
    doc.title(d["title"], f"Dated: {fmt_date(d['date'], st)}")
    doc.para(d["content"]["narrative"])
    doc.table([["Member", "Address", "Membership Interest"]] + d["content"]["members"], right_cols=(2,))


def fill_form(src, values, fields, out):
    pdf = pymupdf.open(src)
    want = {fields[k] + "[0]": v for k, v in values.items()}
    filled = set()
    for page in pdf:
        for w in page.widgets():
            for suffix, val in want.items():
                if w.field_name.endswith("." + suffix):
                    w.field_value = f"{val:,}" if isinstance(val, int) else str(val)
                    w.update()
                    filled.add(suffix)
    if missing := set(want) - filled:
        raise SystemExit(f"{src.name}: fields not found {sorted(missing)}")
    pdf.bake()
    pdf.save(out, garbage=3, deflate=True)


def r_irs_8825(d, out):
    vals = {"name": d["header"]["name"], "ein": d["header"]["ein"], "addr": d["property_a"]["address"],
            "type": d["property_a"]["type_code"], "days": d["property_a"]["fair_rental_days"],
            "personal": d["property_a"]["personal_use_days"]}
    vals |= {str(k): v for k, v in d["lines"].items()}
    fill_form(FORMS / "f8825.pdf", vals, F8825, out)


def r_irs_4562(d, out):
    vals = {"name": d["header"]["name"], "activity": d["header"]["activity"], "ein": d["header"]["ein"]}
    vals |= {str(k): v for k, v in d["lines"].items()}
    vals |= d.get("detail", {})
    fill_form(FORMS / "f4562.pdf", vals, F4562, out)


def scan(pdf_path, seed):
    rng = random.Random(seed)
    src = pymupdf.open(pdf_path)
    out = pymupdf.open()
    for page in src:
        pix = page.get_pixmap(dpi=150, colorspace=pymupdf.csGRAY)
        img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
        img = img.rotate(rng.uniform(-1.2, 1.2), resample=Image.BICUBIC, expand=False, fillcolor=255)
        img = img.filter(ImageFilter.GaussianBlur(0.6))
        px = img.load()
        for _ in range(img.width * img.height // 120):
            x, y = rng.randrange(img.width), rng.randrange(img.height)
            px[x, y] = rng.choice((0, 90, 200))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=55)
        p = out.new_page(width=page.rect.width, height=page.rect.height)
        p.insert_image(p.rect, stream=buf.getvalue())
    src.close()
    out.save(pdf_path, garbage=3, deflate=True)


RENDER = {k[2:]: v for k, v in globals().items() if k.startswith("r_") and k not in ("r_irs_8825", "r_irs_4562")}


def expected_tokens(d, st):
    t = d["type"]
    if t == "operating_statement":
        return [money(v, st, dec=os_dec(d)) for _, v in d["lines"]] + [label for label, _ in d["lines"]]
    if t == "rent_roll":
        return [money(r[5], st, False) for r in d["rows"] if r[5]] + [money(d["totals"]["monthly_rent"], st, False)]
    if t in ("irs_8825", "irs_4562"):
        return [f"{v:,}" for v in d["lines"].values()] + [d["header"]["ein"]]
    if t == "pfs":
        return [money(v, st, False) for v in d["values"].values()] + [d["person"]["ssn"]]
    if t == "ownership_certification":
        return [f"{o['pct']}%" for o in d["owners"]] + [o["ssn"] for o in d["owners"]]
    if t == "operating_agreement":
        return [m[-1] for m in d["content"]["members"]] + [m[0] for m in d["content"]["members"]]
    return [str(v) for v in d["content"]["table"].values()]


def main(scenario: Path, out: Path = ROOT / "out"):
    s = yaml.safe_load(scenario.read_text(encoding="utf-8"))
    st = STYLES[s["template"]]
    dest = out / s["id"]
    dest.mkdir(parents=True, exist_ok=True)
    for i, d in enumerate(s["documents"]):
        path = dest / f"{d['id']}.pdf"
        if d["type"] == "irs_8825":
            r_irs_8825(d, path)
        elif d["type"] == "irs_4562":
            r_irs_4562(d, path)
        else:
            doc = Doc(st)
            RENDER[d["type"]](d, doc, st)
            doc.save(path)
        text = " ".join(pg.get_text() for pg in pymupdf.open(path)).replace("\n", " ")
        text = " ".join(text.split())
        missing = [tok for tok in expected_tokens(d, st) if " ".join(str(tok).split()) not in text]
        if missing:
            raise SystemExit(f"{d['id']}: values not visible in the PDF: {missing}")
        if d.get("render") == "scan":
            scan(path, seed=f"{s['id']}:{i}")
        pages = len(pymupdf.open(path))
        print(f"{d['id']:<22} {d['type']:<24} {pages}p  {'scan' if d.get('render') == 'scan' else 'digital'}  values ok")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    typer.run(main)
