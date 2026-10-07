# Apollon

A proof of concept for commercial real-estate underwriting. Apollon reads a borrower's documents, builds the loan file, explains the differences that don't matter, and shows the underwriter only the ones that change the credit decision.

Everything runs on synthetic borrowers. The tax forms are the real IRS Form 8825 and Form 4562, filled in by the generator.

## Results

Each borrower's scenario file plants the cases and records the right answer for each, written before the engine was built: four issues that must reach a person, and traps and harmless differences that must not. A trap is a difference with a tempting wrong explanation, such as a gap that equals another line by chance. The second borrower uses different layouts and was run once, after the engine was finished.

| | Cedar Row (built on) | Birchview (blind test) |
|---|---|---|
| Real issues found | 4 of 4 | 4 of 4 |
| Real conflicts wrongly explained away | 0 of 2 | 0 of 2 |
| Items raised for review | 4 | 6 as run, 5 after one fix |
| Field-by-field diff: alerts, real issues caught | 8 alerts, 2 of 4 | 13 alerts, 1 of 4 |
| Values read correctly | 141 of 141 | 175 of 179 |
| Numbers read: model pointing vs label matching | 51 vs 30 of 51 | 61 vs 26 of 63 |
| Traps and harmless differences handled | 11 of 11 | 9 of 9 |
| Same file for all 3 arrival orders | 3 of 3 | 3 of 3 |

- The blind test raised one duplicate item: a subtotal that differed only because a line inside it did. The engine was fixed afterwards. The recorded run is kept as it happened, and `runs/score_birchview_first_run.json` is its scorecard before a grader fix.
- The 4 values missed on Birchview are all on the scanned financial statement.
- On the same parsed documents, `gpt-oss-120b` and `nemotron-3-super-120b` both read 141 of 141 values. `qwen3.5:4b` on a 4 GB laptop GPU read 72 of 129 and left all 57 misses unresolved: no wrong values.
- With the cache off, 163 of 163 picks were identical across 3 runs.
- A Cedar Row file takes 21 model calls, about 26k tokens in and 7.5k out.

## How it works

```
 documents ──► parse ──► extract ──► event log ──► fold ──► loan file ──► review queue
               words,    model picks   append-only   reconcile,           only items that
               cells,    a cell id;    SQLite        then apply           need a person
               OCR for   code reads                  policy rules
               scans     the value
```

- **The model never writes a number.** The parser turns each page into cells with ids. The model is asked which cell holds each field, and code reads the value from that cell. A field the model can't place stays unresolved instead of being guessed.
- **Every change is an event.** Documents, model picks and reviewer decisions are appended to a log, and the loan file is `fold(events, policy)`. The file is rebuilt on every arrival, a recorded run replays with no model calls, and a decision whose facts change is marked stale.
- **Comparability comes first.** Two values are compared only when they cover the same period and the same property. Form 8825 doesn't print its tax year, so it is compared only once Form 4562 supplies it.
- **A closed catalog explains differences.** Rounding, name variants and as-of dates are handled as noise. A gap between documents can be closed only by an approved bridge (interest, depreciation, amortization), each with its own evidence. A gap that happens to equal another line is not taken as the cause.
- **Policy picks the working value and shows the impact.** An authority order chooses which document wins, rules compute NOI and DSCR, and each item shows whether it changes the decision. The disagreement stays visible either way.
- **The investigator only suggests.** For a gap nothing explains, a model proposes a cause and the document that would confirm it. Its output is labelled unverified and cannot close an item.

## Run it

Needs [uv](https://docs.astral.sh/uv/) and [pnpm](https://pnpm.io/). Model keys go in `.env` at the root: `GROQ_API_KEY`, and optionally `OPENROUTER_API_KEY`. [Ollama](https://ollama.com/) is used only for the local model.

```sh
uv sync
uv run python gen/render.py gen/scenarios/cedar_row.yaml   # synthetic PDFs into gen/out
uv run python -m engine.cli run cedar_row                  # build the loan file, recorded in runs/
uv run python -m engine.cli replay cedar_row               # rebuild it from the log, no model calls
uv run python -m eval.scorecard score cedar_row            # score against the answer key
uv run python -m engine.cli export-web                     # copy runs and page images into the site
```

The site is static and reads the recorded runs in `web/public/data`, so it needs no keys:

```sh
cd web
pnpm install
pnpm dev
```

## Layout

| Path | What's in it |
|---|---|
| `engine/` | Parser, extractor, model gateway, entity resolution, reconciler, rules, event log |
| `policy/` | The example bank policy and what to read from each document type |
| `gen/` | Scenario files with the answer key, and the PDF generator |
| `eval/` | Scorecard, consistency and provider comparisons |
| `runs/` | Recorded runs, scorecards and the generated PDFs |
| `web/` | Next.js site: the underwriter's workspace, decision log, evaluation and architecture |

## Limits

- Synthetic data, one loan type (investor commercial real estate) and an example policy.
- NOI is the lesser of the recomputed statement and the appraisal, with no vacancy, reserve or management-fee adjustments.
- Reviewer decisions in the site are saved in the browser only.
- Not built: the loan-system connector, borrower follow-ups, credit memo drafting, third-party verification, intake channels, a review service and deployment inside a bank's cloud. The site's Architecture page shows how each one would be built and where it attaches.
