# Route intelligence evaluation

A behavioural regression suite for the agent's LLM-facing contract: does a
natural-language trip request still produce the route the user actually asked
for?

It exists because this class of regression is **silent**. When the parser drops
a `через Румунію` transit stop, nothing errors — the API returns `success:
true`, a plausible two-stop route renders on the map, and the trace in Langfuse
looks perfectly healthy. Unit tests do not catch it either, because they mock
the model. Only a semantic check against a curated expectation catches it.

## What it measures

| Dimension | Question it answers |
|---|---|
| Supervisor intent accuracy | Did the request route to the right specialist path? |
| Route-request classification | Was an off-topic message correctly refused? |
| **Explicit waypoint retention** | Did the transit stops the user named survive, in order? |
| Ordered-stop correctness | Are origin / waypoints / destination in the requested sequence? |
| Settings extraction | Were passengers, fuel type, price, currency read correctly — and were unmentioned settings left alone? |
| Current-route preservation | Did a modification keep the stops the user did not touch? |
| Usable route / geocode success | Did enough locations resolve to produce a routable trip? |
| Unsafe accepted model coordinates | Did the agent ever trust a model-invented lat/lon on the first pass? **Must be zero.** |
| Departure-date correctness | Was a mentioned date extracted, and were past / out-of-window dates dropped? |
| Car fuel type / consumption / unknown | Are vehicle estimates right, and does the model admit ignorance instead of fabricating? |

The headline metric:

```
explicit waypoint retention rate =
    requested transit stops retained in the requested order
    ────────────────────────────────────────────────────────
    requested transit stops
```

It is measured per *stop*, not per case: keeping 1 of 2 stops in one case and
2 of 2 in another is 75%, not "half the cases passed".

## What it does not claim to measure

- **Route quality.** Whether the resulting road route is fast, cheap or sensible
  is Mapbox/OSRM's business, not this suite's.
- **Geocoding accuracy.** Nominatim's own correctness is out of scope: its
  responses are replayed from recorded fixtures so a red run means the *agent*
  changed. The replay is installed at the HTTP boundary, so `app/geocoding.py`'s
  own logic — result filtering, POI-vs-city parameter selection, the native-name
  fallback, the 418/429 backoff — does run for real. One residual gap:
  `_is_specific_place` misclassifying a name only makes the filter *more*
  permissive, and no fixture uses a POI stop, so a regression there stays green.
- **Fuel and weather output.** Both are deterministic, advisory, and covered by
  their own unit tests; the runner stubs them so no case depends on an external
  HTTP call.
- **Production quality.** Fixture scores describe the fixtures. They are a
  release gate, not a measurement of what real users are experiencing.
- **Anything in `mock` mode about the model.** See below.

## Running it

### Mock / contract mode — no API key, no network

```bash
cd agent
python -m evals.runner --mode mock
```

This is the CI gate. Canned model outputs from each fixture's `mock:` block are
fed through the **real** graph — supervisor, routing edges, geocoding node,
retry loop, composer — and the **real** scorers. It proves the wiring and the
scoring logic hold.

It deliberately proves nothing about model quality, because the model's answer
comes from the fixture. A green mock run with a badly regressed prompt is
expected and correct.

### Live mode — real model

```bash
cd agent
OPENAI_API_KEY=sk-... python -m evals.runner --mode live
```

This is the mode that detects a prompt or model regression. It refuses to start
without a real key rather than silently falling back to mocks, and a case that
records zero token usage is failed as inconclusive rather than passed. A full
run is 45 cases against `gpt-4o-mini`, takes ~75s and costs roughly **$0.01**.

The three `ambiguous-*` car cases encode a product stance — a bare make
(`"Toyota"`/`"Тойота"`) or an invented model must return `unknown` rather than a
confident guess. `_ESTIMATE_CAR_PROMPT` rule 5 now requires this explicitly, and
they pass live.

Useful flags:

```bash
--dataset route_parsing        # filter by dataset filename substring
--case-id uk-transit-country   # run a single case
--geocoder network             # hit real Nominatim instead of the recordings
--baseline evals/results/latest-live.json
--fail-under 0.9               # non-zero exit below this pass rate
--out /some/dir                # report destination
```

`--geocoder network` is the only path that touches OpenStreetMap. Use it as a
deliberate geocoding smoke check, not as the default — live OSM turns a red run
ambiguous, because a dropped stop and a rate-limited geocoder look identical in
the report.

The recordings are served by intercepting `httpx.AsyncClient.get`, not by
replacing `app.geocoding._query_nominatim`. That distinction matters: swapping
the function out would take its own filtering and retry logic off the execution
path, and a regression there would leave the suite green.

### Environment variables

| Variable | Needed for | Effect if absent |
|---|---|---|
| `OPENAI_API_KEY` | live mode only | Live mode exits 2. Mock mode is unaffected. |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | publishing scores | Publishing is skipped; reports and exit code are unchanged. |
| `LANGFUSE_HOST` | self-hosted Langfuse | Defaults to `https://cloud.langfuse.com`. |

## Reading the report

Each run writes to `evals/results/` (git-ignored):

- `eval-<mode>-<timestamp>.json` — machine-readable, and the baseline format
- `eval-<mode>-<timestamp>.md` — human summary
- `latest-<mode>.json` — stable filename for pinning a baseline

The Markdown leads with **failures**, not with green percentages. Each failing
case prints its fixture id, the input, what was observed (stops, intent,
settings, estimate, error) and every assertion that broke — enough to debug
without re-running.

Exit code is `0` only when every case passes. A non-zero
`unsafe_ai_coords` fails the run outright regardless of pass rate: that is a
safety invariant, not a quality score.

### Comparing against a baseline

```bash
python -m evals.runner --mode live --baseline evals/results/latest-live.json
```

The metrics table gains a delta column. If a dataset's content hash changed
since the baseline, the report says so — comparing scores across different
fixtures is meaningless, and the hash is what makes that detectable.

Do not pass `latest-<mode>.json` as the baseline for the same mode you are
running: it is rewritten by the run itself. Copy it aside first, or compare
against the committed manifest below.

### The committed baseline manifest

Full JSON/Markdown reports stay local and git-ignored — they carry per-case
prompts, stop names and observed settings, which is trace-shaped data that
should not accumulate in git history. What is committed is a sanitized
aggregate manifest at `evals/baselines/live.v1.yaml`:

```bash
python -m evals.make_baseline evals/results/latest-live.json \
    --out evals/baselines/live.v1.yaml \
    --notes "Reviewed live baseline" --git-sha "$(git rev-parse --short HEAD)"
```

It refuses to build from a mock run, and copies fields out by an explicit
allowlist — a new per-case diagnostic appearing upstream cannot leak into a
commit by default. `test_baseline_manifest_leaks_no_case_level_data` asserts
that no fixture input, case id or observed stop name reaches the manifest.
**Review the diff before committing it.**

## Adding a regression fixture after a production incident

Golden data is **curated and committed**. Nothing is ever auto-exported from
Langfuse into this repository.

1. **Reproduce and understand** the incident from the trace. Note the shape of
   the failure (dropped stop, wrong intent, leaked setting), not the content.
2. **Write a synthetic equivalent.** Do not paste the user's message. Invent a
   prompt with the same structure using the cities already in
   `geocode_recordings.v1.yaml`. Never commit a real user prompt, location set,
   route, user id, or session id.
3. **Add the case** to `route_parsing.v1.yaml` (or `supervisor.v1.yaml` /
   `car_estimates.v1.yaml`), with an `expect:` block asserting the behaviour
   that broke and a `mock:` block giving the output a *correct* model would
   produce.
4. **Add any new place** to `geocode_recordings.v1.yaml` if the route needs one.
5. **Prove the case fails against the bug.** Check out the broken revision, or
   temporarily mutate the node, and confirm the new case goes red. A case that
   has never failed is not yet a regression test.
6. **Run both suites**: `pytest -q -m "not integration and not db"` and
   `python -m evals.runner --mode mock`.
7. Bump the dataset `version:` when the change is not backwards-compatible with
   an existing baseline.

## Why exact model strings are not the oracle

An expectation like `name == "Nitra, Nitra Region, Slovakia"` fails when OSM
edits a display name, when the model answers `"Nitra"` instead of `"Nitra
Slovakia"`, or when a transliteration convention shifts — none of which are
regressions. A suite that cries wolf gets muted, and a muted suite catches
nothing.

So stops are matched by case-insensitive substring against several accepted
spellings (`["romania", "румун", "bucharest", "bucure"]`), and consumption is
checked against a band rather than a magic number. What the suite regresses on
is whether the constraint the user expressed survived — not how it was spelled.

The same reasoning rules out an LLM judge in v1: a non-deterministic scorer
means a red run is ambiguous between "the agent regressed" and "the judge had
an off day".

## Langfuse

When Langfuse is configured, each run publishes one `route_intelligence_eval`
trace tagged `evaluation`, `mode:<mock|live>`, `dataset:<version>`,
`model:<id>` and `git_sha:<sha>`, with deterministic numeric scores attached —
run-level aggregates plus per-case `eval_pass`, `intent_correct`,
`ordered_stops_correct`, `waypoint_retention` and the rest.

This is strictly additive and strictly best-effort. Publishing failures are
logged and swallowed; local reports, tests and exit codes never depend on
Langfuse being reachable.

Production user traffic is **not** scored by an LLM judge and is never copied
into a dataset. Production prompts can carry personal travel detail; the only
safe additions there are deterministic operational signals (supervisor timeout,
geocode retry count, requested-versus-retained stop count).

The installed SDK (`langfuse>=4.0`) does expose Dataset/Experiment APIs. This
version deliberately uses plain traces plus scores instead: it keeps the local
suite self-sufficient and avoids making a cloud-side dataset a prerequisite for
running evaluations. Moving to `create_dataset` / `run_experiment` is a
contained change inside `langfuse_adapter.py` if run-over-run comparison in the
Langfuse UI becomes worth the coupling.

## Known limitations

- **Mock mode cannot detect a prompt regression.** Only live mode can. Ordinary
  CI is therefore a wiring gate, not a quality gate.
- **Preservation is matched on coordinates, not names.** "Lviv" is a substring
  of "Lviv Oblast", so name matching would score a replaced endpoint as
  preserved. A stop counts as preserved when some distinct observed stop sits
  within ~5 km of the point the user pinned.
- **A live case that burned no tokens is failed, not passed.** `estimate_car()`
  and `supervise()` both swallow provider errors and degrade gracefully — right
  for the product, but it would let a provider outage score a clean pass on the
  `unknown: true` fixtures. Token usage is the evidence a call happened, so a
  live observation with none is treated as inconclusive.
- **Recorded geocoding is hand-authored**, Nominatim-*shaped* rather than
  captured verbatim. Coordinates are approximate and exist to make routes
  plausible.
- **`min_geocoded_waypoints` counts stops, not road distance.** A route that
  geocodes correctly but is absurd to drive still passes.
