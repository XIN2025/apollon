"""Entity resolution. Hard identifiers link; name + address links; a name alone never does."""
import re
from collections import defaultdict

from rapidfuzz import fuzz

from engine.extract import fold

ABBR = {"ln": "lane", "ter": "terrace", "st": "street", "ave": "avenue", "dr": "drive", "ct": "court", "rd": "road",
        "blvd": "boulevard", "pl": "place", "hwy": "highway"}
ORG_SUFFIX = re.compile(r"\b(l\s*\.?\s*l\s*\.?\s*c|inc|corp|co|ltd)\b\.?", re.I)

ORG_FIELDS = {"loan_request": ("borrower_name", "borrower_ein"), "ownership_certification": ("entity_name", "entity_ein"),
              "operating_agreement": ("entity_name", None), "irs_8825": ("name", "ein"), "irs_4562": ("name", "ein"),
              "appraisal": ("client", None)}
COLLATERAL_FIELDS = {"loan_request": ("property_name", "property_address", "apn"), "appraisal": (None, "property_address", "apn"),
                     "rent_roll": ("property_name", None, None), "operating_statement": ("property_name", None, None),
                     "irs_8825": (None, "property_address", None)}


def compact(s):
    return re.sub(r"[^a-z0-9]", "", fold(s or ""))


def org_key(name):
    return compact(ORG_SUFFIX.sub("", fold(name or "")))


def street(addr):
    first = fold(addr or "").split(",")[0]
    first = re.sub(r"(\d)([a-z])", r"\1 \2", first)          # OCR can drop the space after the house number
    words = [ABBR.get(w.strip("."), w.strip(".")) for w in first.split()]
    return compact(" ".join(words))


def ssn4(s):
    d = re.sub(r"\D", "", s or "")
    return d[-4:] if len(d) >= 4 else None


class UF:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        self.p[self.find(a)] = self.find(b)


def mentions(obs):
    by_doc = defaultdict(dict)
    rows = defaultdict(dict)
    for o in obs:
        if "." in o.field:
            rows[o.subject][o.field.split(".", 1)[1]] = o
        else:
            by_doc[o.doc_id][o.field] = o
    doc_type = {o.doc_id: o.doc_type for o in obs}
    orgs, colls, persons = [], [], []
    for d, f in by_doc.items():
        t = doc_type[d]
        if t in ORG_FIELDS:
            n, e = ORG_FIELDS[t]
            if n in f or (e and e in f):
                orgs.append({"key": f"org@{d}", "doc": d, "name": f.get(n), "ein": f.get(e) if e else None})
        if t in COLLATERAL_FIELDS:
            n, a, apn = COLLATERAL_FIELDS[t]
            if any(x and x in f for x in (n, a, apn)):
                colls.append({"key": f"collateral@{d}", "doc": d, "name": f.get(n) if n else None,
                              "address": f.get(a) if a else None, "apn": f.get(apn) if apn else None})
        if t == "pfs" and "name" in f:
            persons.append({"key": f"person@{d}", "doc": d, "name": f["name"], "ssn": f.get("ssn"), "dob": f.get("dob"),
                            "address": f.get("address"), "pct": None, "role": "pfs"})
    for subj, f in rows.items():
        if "name" in f and ("owners" in subj or "members" in subj):
            persons.append({"key": f"person@{subj}", "doc": f["name"].doc_id, "name": f["name"], "ssn": f.get("ssn"),
                            "dob": f.get("dob"), "address": f.get("address"), "pct": f.get("pct"),
                            "role": "owner" if "owners" in subj else "member"})
    return orgs, colls, persons


def v(o):
    return o.value if o is not None else None


def resolve(obs):
    orgs, colls, persons = mentions(obs)
    uf, links, near = UF(), [], []

    def link(a, b, basis):
        if uf.find(a["key"]) != uf.find(b["key"]):
            uf.union(a["key"], b["key"])
        links.append({"a": a["key"], "b": b["key"], "basis": basis})

    for i, a in enumerate(orgs):
        for b in orgs[i + 1:]:
            if a["ein"] and b["ein"]:
                if compact(v(a["ein"])) == compact(v(b["ein"])):
                    link(a, b, "ein")
            elif a["name"] and b["name"] and org_key(v(a["name"])) == org_key(v(b["name"])):
                link(a, b, "legal_name")
    for i, a in enumerate(colls):
        for b in colls[i + 1:]:
            if a["apn"] and b["apn"]:
                if compact(v(a["apn"])) == compact(v(b["apn"])):
                    link(a, b, "apn")
            elif a["address"] and b["address"] and street(v(a["address"])) == street(v(b["address"])):
                link(a, b, "address")
            elif a["name"] and b["name"]:
                na, nb = compact(v(a["name"])), compact(v(b["name"]))
                if na and nb and (na in nb or nb in na) and min(len(na), len(nb)) >= 8:
                    link(a, b, "property_name")
    for i, a in enumerate(persons):
        for b in persons[i + 1:]:
            sa, sb = ssn4(v(a["ssn"])), ssn4(v(b["ssn"]))
            same_name = compact(v(a["name"])) == compact(v(b["name"]))
            similar = fuzz.token_sort_ratio(fold(v(a["name"])), fold(v(b["name"]))) >= 80 or same_name
            if sa and sb:
                if sa == sb:
                    link(a, b, "ssn4")
                elif similar:
                    near.append({"a": a["key"], "b": b["key"], "why": f"names alike but SSN ...{sa} vs ...{sb}"})
                continue
            if same_name and a["address"] and b["address"] and street(v(a["address"])) == street(v(b["address"])):
                link(a, b, "name+address")
            elif same_name and v(a["dob"]) and v(a["dob"]) == v(b["dob"]):
                link(a, b, "name+dob")
            elif similar:
                near.append({"a": a["key"], "b": b["key"], "why": "names alike, no shared identifier"})

    entities = []
    for kind, ms in (("org", orgs), ("collateral", colls), ("person", persons)):
        groups = defaultdict(list)
        for m in ms:
            groups[uf.find(m["key"])].append(m)
        for g in groups.values():
            if kind == "person":
                hard = sorted({ssn4(v(m["ssn"])) for m in g if ssn4(v(m["ssn"]))})
                name = min((v(m["name"]) for m in g), key=lambda n: (" " not in n, len(n)))
                eid = f"person:{compact(name)}" + (f"-{hard[0]}" if hard else "")
            elif kind == "org":
                names = [v(m["name"]) for m in g if m["name"]]
                name = min(names, key=lambda n: (n.isupper(), sum(n.count(c) for c in ",.-"), len(n))) if names else None
                eins = sorted({v(m["ein"]) for m in g if m["ein"]})
                eid = f"org:{eins[0] if eins else org_key(name)}"
            else:
                name = next((v(m["name"]) for m in g if m["name"]), None) or next(v(m["address"]) for m in g if m["address"])
                apns = sorted({v(m["apn"]) for m in g if m["apn"]})
                eid = f"collateral:{apns[0] if apns else street(name)}"
            entities.append({"id": eid, "kind": kind, "name": name, "mentions": sorted(m["key"] for m in g),
                             "docs": sorted({m["doc"] for m in g}),
                             "roles": sorted({m.get("role") for m in g if m.get("role")})})
    key_to_entity = {m: e["id"] for e in entities for m in e["mentions"]}
    for l in links:
        l["entity"] = key_to_entity[l["a"]]
    for n in near:
        n["a_entity"], n["b_entity"] = key_to_entity[n["a"]], key_to_entity[n["b"]]
    near = [n for n in near if n["a_entity"] != n["b_entity"]]
    return {"entities": sorted(entities, key=lambda e: e["id"]), "links": links, "near_misses": near,
            "mention_entity": key_to_entity, "persons": persons}
