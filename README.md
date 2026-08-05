# The knowledge loop

A Next.js + Postgres dashboard that turns weekly RightAnswers CSV exports into a persistent,
comparable view of AI knowledge operations.

The thesis it exists to prove: **consumption and curation run on separate content sets.** Gen
Answers cites solutions, those solutions age, Solution Manager repairs solutions — and the two
sets barely overlap. The headline metric is therefore *loop closure*: of the solutions that
actually answered questions this week, how many did anyone edit?

## Requirements

- Node 20+ (developed on 22.17)
- PostgreSQL 14+

## Setup

```bash
cd dashboard
npm install
createdb knowledge_loop          # or point DATABASE_URL at an existing database
cp .env.example .env             # then edit DATABASE_URL, DASHBOARD_PASSWORD, AUTH_SECRET
npm run db:migrate
npm run db:seed                  # loads the CSVs sitting in the repository root
npm run dev
```

Sign in with whatever you set as `DASHBOARD_PASSWORD`.

### Behind a TLS-intercepting proxy

Prisma downloads engine binaries at install and generate time. If you see
`unable to get local issuer certificate`, your corporate CA is in the OS keychain but not in
Node's bundle. Prefix the command:

```bash
export NODE_OPTIONS=--use-system-ca
```

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Also read by `prisma.config.ts`. |
| `DASHBOARD_PASSWORD` | Single shared password for the whole dashboard. |
| `AUTH_SECRET` | HMAC key for the session cookie. Change it and everyone is signed out. |
| `INGEST_TOKEN` | Bearer token for `POST /api/ingest`. Leave blank to disable that route. |

## The weekly refresh

1. Export all 15 reports from the RightAnswers admin console for the new window.
2. Go to **Upload**, drop the files in, and read the preview: parsed window, which reports were
   recognised, row counts, and any coercion warnings. Nothing is written yet.
3. Press **Commit snapshot**.

Reports are identified by **line 1 of the CSV**, never by filename — the console prefixes exports
with `superadmin_` and appends `(1)` on re-download, and neither is stable. The reporting window
comes from line 2 rather than being assumed to be seven days, so a 14-day export computes
correctly.

If a snapshot already exists for that window the commit is refused, and you are offered
**Replace existing snapshot**, which supersedes the old one rather than deleting it.

Mixed windows are rejected outright: a batch where one file covers a different date range is an
export mistake, and silently merging it would corrupt every rate in the snapshot.

### Automating it

```bash
curl -X POST https://your-host/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -F workspace=northwind-traders \
  -F files=@gen-answers-gap-analysis.csv \
  -F files=@gen-answers-usage-by-solution.csv
  # ... all 15
```

Returns the new snapshot ID, or `409` with the conflicting snapshot ID. Add
`-F replaceExisting=true` to supersede. Omitting `workspace` targets the `default` workspace; a
slug that does not exist returns `404` rather than falling back, because filing one customer's
exports under another is worse than a failed job.

## Workspaces

One workspace per customer. `/` lists them with each one's latest headline figures, and everything
else lives under `/w/<slug>`:

```
/                              all workspaces, plus the create form
/w/<slug>                      redirects to that workspace's latest dashboard
/w/<slug>/dashboard/<id>       one snapshot
/w/<slug>/trends               that workspace's windows over time
/w/<slug>/upload               commits into that workspace only
/w/<slug>/snapshots            list, recompute, rewrite, delete
/w/<slug>/settings             that workspace's ROI assumptions
```

Snapshots, source files, metrics and ROI assumptions all hang off the workspace, so two customers
cannot be averaged into one figure. The slug is in the URL rather than in a cookie deliberately:
an upload page that says which customer it writes to cannot silently target the wrong one because
of a stale selection in another tab. Requesting a snapshot under a workspace that does not own it
returns 404, and the workspace name is stamped on the standalone HTML export and its filename.

The login password is global, so workspaces separate data, not people. Anyone who can sign in can
see every customer.

## Layout

```
src/lib/reports/     detection, parsing, coercion, mapping   (CSV -> typed rows)
src/lib/metrics/     every derived figure, pure and testable (rows -> DashboardData)
src/lib/ingest/      prepare (no writes) then commit (one transaction)
src/lib/export/      the standalone single-file HTML artifact
src/app/             pages and route handlers
```

Three storage layers: **provenance** (`Snapshot`, `SourceFile` with checksums), **facts** (five
typed tables for the reports that need joins, plus a generic JSONB `AggregateRow` for the ten
rollups), and **metrics** (`MetricSnapshot`, the computed payload with headline values promoted to
columns so the trends page can query them without deserialising). All of it hangs off `Workspace`.

> `Workspace` maps to a table still named `Tenant`. The model was renamed when workspaces became a
> user-facing idea; `@@map` kept the rename free of a data migration.

The metrics engine takes a plain `SnapshotDataset` and never touches the database, which is why
the regression suite runs against the raw CSVs in milliseconds.

```bash
npm test
```

`METRICS_VERSION` in `src/lib/metrics/types.ts` guards the cache. Bump it whenever a formula
changes and every stored snapshot recomputes on next view.

## Exports

Each snapshot offers **Download standalone HTML** — one self-contained file with the CSS, the SVG
and a few lines of vanilla JS inlined. No build step, no chart library, no CDN beyond an optional
font request with a system fallback. It opens from a local path on a projector with no wifi, which
is what the original artifact was for. There is also a flat CSV of every computed figure.

## Things that are deliberate

**Nulls are never zeros.** A field that failed to coerce stays null and the row is counted as
missing, because a zero silently becomes a real value in a mean.

**Missing inputs are named, not defaulted.** The ROI tab carries five views; one is computable
today and four are blocked. Each lists its inputs as live, partial or missing. Assumed constants
are visually separated from observed ones everywhere they appear, and are editable under
**Settings** so the model can be swept live rather than argued about.

**Loop closure counts any edit, by any method.** AI-assisted share sits underneath it, never
above. A metric that only counts AI repair is feature usage wearing an outcome metric's clothes.

**Decay is citation-weighted.** An old article nobody reads is not a problem.

**Ranking is reported as absolute position, and MRR is scored over ranked questions only.** A
per-query reciprocal rank is `1/position`, so the source column inverts back to the position the
agent actually had to scroll to; "the answer was third" is actionable in a way that "the
reciprocal rank fell between 0.25 and 0.5" is not. MRR is then shown against the conventional
interpretation scale, averaged over the questions that returned something to rank. Questions that
returned nothing are excluded rather than scored as zero, because a miss is a coverage problem and
folding it into the ranking figure blurs two problems with different owners into one number. The
count of those misses sits beside the chart so the coverage gap is never lost. The scale's
segments are sized by their numeric range rather than drawn evenly, because equal-width bands put
the marker in the wrong band for most values.

**QA noise is surfaced, not hidden.** The reference data contains smoke-test traffic. Those rows
are labelled in the demand view rather than quietly filtered, because filtering them without
saying so is the same class of error as inventing data.

**Trends plot only the days present.** A gap in the window stays a gap; nothing is interpolated.

## Generated copy

Seven passages on the dashboard are written by a model against that week's figures. They are the
ones that are **evaluations**: claims a different week could falsify. `src/lib/narrative/types.ts`
holds the list and the brief for each.

| Slot | Where |
| --- | --- |
| `thesis` | Headline above the loop diagram |
| `loopVerdict` | Callout under the headline |
| `consistency` | Under the repeated-questions chart |
| `searchMode` | Beside the rank distribution and MRR scale |
| `grounding` | Under the grounding split bar |
| `decay` | Under the staleness chart |
| `aiPublishing` | Under the AI-touched solutions table |

Everything else stays hardcoded, deliberately. "Bar colour encodes answer rate, length encodes
volume" is a chart legend. "Any edit counts, by any method" is a methodology note. "QA noise is
surfaced rather than hidden" discloses a design choice. All three are true of every dataset, so
sending them to a model would buy drift, latency and cost for copy that never needed to change.

A later sweep found four passages that read as static but were not: the AI-publishing verdict
(now `aiPublishing`), the deflection blocker, the ROI heading's hardcoded "Five" and verb
agreement, and a "roughly 15 minutes" constant that ignored the assumptions in Settings. The last
three are computed, not generated, because they are arithmetic rather than judgement.

Set `OPENAI_API_KEY` to enable it; the model is `gpt-5.6-terra` via the Responses API with strict
structured output, overridable with `OPENAI_MODEL`. **With no key the dashboard works exactly as
before** on the deterministic copy in `narrative/static.ts`.

Generation runs on demand, not only on upload: the dashboard and the snapshots list both carry a
**Write analysis with AI** button, which flips to **Rewrite analysis** once a model has written it.
A provenance line beside it names the model, the timestamp and any rejected passages. If the call
fails, that line says why rather than silently reverting, because a button that appears to do
nothing is the harder bug to find.

> On machines behind a TLS-intercepting proxy, Node rejects the OpenAI certificate with
> `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. `dev` and `start` therefore run with
> `NODE_OPTIONS=--use-system-ca` so Node trusts the same certificate store `curl` does. The same
> flag is needed for Prisma's binary downloads.

### It cannot print a number that is not in the data

This is the part that matters. Everything the model may cite is assembled into a fact sheet
(`narrative/facts.ts`), and the set of permitted numbers is harvested from that same sheet, so the
two cannot drift. Generated prose is then checked digit by digit: any figure outside the set,
along with em dashes, markdown, line breaks and runaway length, **rejects that passage** and the
deterministic sentence ships instead. Verification is per slot, so one bad figure in the decay
line does not cost the other five. Rejections are recorded on `narratives.rejected` and logged.

The deterministic fallbacks are themselves data-driven now. The old copy asserted "neural
outperforms keyword", which was true of the reference data and nothing else; it now reads the
best and busiest mode off the figures, and the loop verdict flips when closure passes 25%.

### When it runs

Only on new evidence. Ingest triggers a rewrite, outside the DB transaction and non-fatal, so a
failed API call cannot cost you the upload. Recomputes trigger nothing: changing an ROI assumption
is a formula change, not new evidence, so existing copy is carried across rather than re-billed.
**Snapshots → Rewrite** regenerates on demand.

## Theming

The UI follows **Upland UI 2.0** (RightAnswers is an Upland product). Tokens live in one place per
target and must be edited together:

- `src/app/globals.css` — the app.
- `src/lib/export/styles.ts` — the standalone HTML export, which cannot share a stylesheet because
  it ships as a single file with no build step.

Both carry the same `:root` block, tracking `upland-tokens.json` v1.1.0:

| Role | Token | Upland name |
| --- | --- | --- |
| Page / surface | `--ground` `#F1F3F3`, `--surface` `#fff` | gray-05, white |
| Text | `--ink` `#252B31`, `--slate` `#6B7786` | gray-80 (Primary-100), gray-50 |
| Rules | `--hair` `#BFC6CE`, `--hair-soft` `#E0E3E6` | gray-20 (Neutral-quaternary), gray-10 |
| Interactive | `--accent` `#2574DB` + hover/active/focus | blue-50 / 55 / 60 / 70 |
| Good | `--signal` `#599900` + soft/ink | green-70 / 10 / 80 |
| Warn | `--ochre` `#BB8000` + soft/ink | yellow-70 / 10 / 80 |
| Bad | `--garnet` `#E60C51` + soft/ink | red-50 / 10 / 80 |

Notes on the mapping, worth knowing before anyone "fixes" them:

- **Open Sans is the only family in the DS.** `--cond` and `--mono` therefore alias `--sans`; the
  editorial contrast comes from weight, size and letter-spacing rather than from a second face.
  The one exception is `--code`, a system monospace used *only* for the ROI formula blocks, where
  column alignment carries meaning.
- **`--accent-focus` (`#0049A9`, blue-70) is unconfirmed** against the DS focus specification — see
  design flags 1 and 2 in the Upland project state. It is applied via a single global
  `:focus-visible` rule, so correcting it is a one-line change.
- Gap-log items this build touches: **G-001** (scrim, `--scrim`), **G-004 / G-005** (surface
  aliases), **G-008** (radius scale, `--r-xs/sm/md`).
- Shadows use the DS three-layer black elevation (`--elev-1`, `--elev-3`).

### The logo is a placeholder

`src/components/logo.tsx` and its inline twin `EXPORT_LOGO` in `src/lib/export/styles.ts` are
**hand-drawn stand-ins, not official RightAnswers artwork.** No brand asset was available in the
repo. Replace both with the real mark from the Upland Figma *Logos* set (24 products × 2 colours)
before this goes anywhere external. They are deliberately two copies because the export must
inline its own SVG.

## Known divergences from the build spec

Three figures in the spec are internally inconsistent. Each is resolved in favour of the spec's
stated *rule* over its quoted *value*, and asserted in the test suite:

1. **Distinct questions: 53, not 56.** The spec's normalisation rule strips a trailing `?`, and its
   own consistency table depends on that strip ("How to connect to VPN — 30 asks"). Its quoted 56
   does not. Applying the stated rule gives 53.
2. **Citation spread bands.** The spec's four bands sum to 78 against 77 cited solutions.
   Implemented as 1 / 2–3 / 4–6 / 7+.
3. **Decay band 180–365.** The spec shows 0 solutions but 11 citations, which cannot happen. The
   band is computed from the data.

## Deployment

Set the four environment variables, point `DATABASE_URL` at managed Postgres (Neon or Supabase),
and run `npm run db:migrate` once against it. `npm run build` runs `prisma generate` first.

The middleware requires the Node runtime because it verifies an HMAC with `node:crypto`; it will
not run on an edge-only host without that setting.
