# TripCalculate SEO Diagnosis

Date: 2026-08-15  
Repository start: `86f6e9876bd59031553c76322ac3a2bbf1a7d85f`  
Branch: `master`  
Production: `https://trip-calculate.online`  
Search Console property: `sc-domain:trip-calculate.online`

## Executive conclusion

Search Console does **not** show an organic-traffic decline in the available history. Usable Web Search data begins on 2026-07-11. The latest completed 28-day window (2026-07-16 through 2026-08-12) grew to 1,488 impressions and 15 clicks from 138 impressions and 2 clicks in the preceding 28 days.

The confirmed symptoms are narrow index coverage and canonical consolidation: Google reports search performance only for `https://trip-calculate.online/`. URL Inspection says `/uk` is a duplicate whose Google-selected canonical is `/`, while `/en` and both localized route-planner URLs are unknown to Google. Production corroboration shows that all four localized URLs return byte-identical server HTML with `lang="uk"`, one shared English title and description, no canonical, no hreflang, and root-level `og:url`. The repository controller explicitly documented localized/per-route metadata as unfinished.

This creates objectively ambiguous language, page-purpose, and canonical signals. It is the highest-confidence technical SEO issue found and is addressed in the accompanying remediation. It is a strong explanation for Google selecting `/` instead of `/uk`; it does **not** prove why the three never-crawled URLs remained unknown.

## Property verification and data limitations

- Property: `sc-domain:trip-calculate.online`
- Permission: `siteOwner`
- OAuth scope: `webmasters.readonly`
- Longest requested history: approximately 16 months, through 2026-08-12 (three-day final-data buffer).
- First returned Web Search date: 2026-07-11.
- Last returned date: 2026-08-12.
- Only 33 daily rows exist; no valid long-term or year-over-year decline conclusion is possible.
- Search Analytics query rows are privacy-filtered. The query dimension returned no click-bearing rows even though aggregate clicks were 15, so query-level click attribution is incomplete.
- Search Appearance returned zero rows.
- Search Analytics can prioritize top rows and does not guarantee exhaustive query data.
- Search Console has no submitted sitemap entry for this property, even though a public sitemap exists.
- No GA4 or equivalent visitor analytics integration was found in the repository or available credentials. Search Console clicks cannot verify total visitors, engagement, or conversion changes.
- Browser automation was unavailable because Chrome could not be launched.
- PageSpeed Insights returned HTTP 429 because the available project has zero daily query quota. No lab or field Core Web Vitals conclusion is made.

## Date ranges analyzed

| Comparison | Recent | Previous |
|---|---|---|
| 28-day | 2026-07-16 to 2026-08-12 | 2026-06-18 to 2026-07-15 |
| 90-day | 2026-05-15 to 2026-08-12 | 2026-02-14 to 2026-05-14 |
| Daily history | 2026-07-11 to 2026-08-12 returned | Earlier requested dates returned no rows |

The 90-day comparison is not meaningful: the previous window contains no data and the recent window contains only the same 33-day history.

## Traffic-decline timeline

| Week beginning | Clicks | Impressions | CTR | Avg. position |
|---|---:|---:|---:|---:|
| 2026-07-06 (partial) | 1 | 42 | 2.38% | 5.62 |
| 2026-07-13 | 2 | 184 | 1.09% | 15.24 |
| 2026-07-20 | 4 | 176 | 2.27% | 9.02 |
| 2026-07-27 | 4 | 370 | 1.08% | 9.66 |
| 2026-08-03 | 5 | 578 | 0.87% | 8.30 |
| 2026-08-10 (partial through Aug 12) | 1 | 276 | 0.36% | 7.93 |

Facts:

- Recent 28 days: 15 clicks, 1,488 impressions, 1.01% CTR, average position 8.77.
- Previous 28 days: 2 clicks, 138 impressions, 1.45% CTR, average position 15.48.
- Impressions and clicks grew; CTR decreased by 0.44 percentage points as visibility expanded.
- Completed weekly clicks did not decline: 2 → 4 → 4 → 5.
- The final week is partial and must not be compared with a full week.

Conclusion: no Search Console evidence substantiates a recent organic decline. If total visitor volume declined, GA4/server/CDN analytics are required to distinguish organic, referral, direct, bot, and measurement changes.

## Query analysis

Top visible recent query rows were Ukrainian and aligned with the product’s intent:

| Query | Impressions | CTR | Avg. position |
|---|---:|---:|---:|
| `скільки їхати` | 16 | 0% | 7.31 |
| `калькулятор вартості поїздки` | 13 | 0% | 8.62 |
| `вартість поїздки` | 12 | 0% | 8.08 |
| `розрахувати вартість поїздки` | 10 | 0% | 8.50 |
| `розрахунок вартості поїздки` | 7 | 0% | 11.86 |
| `розрахунок вартості поїздки на авто` | 3 | 0% | 10.00 |

Observed query gains are small but directionally consistent with improved discovery. No substantive declining query exists: disappearing rows each had one prior impression and no click, which is statistically meaningless. Some low-volume irrelevant/non-target-language queries appear at poor positions; they are not evidence for content expansion and were not targeted.

Because query rows are privacy-filtered, aggregate clicks cannot be assigned reliably to the listed queries.

### Top declining queries

None met a meaningful evidence threshold. Rows that disappeared versus the preceding period had only one prior impression and zero clicks; ranking them as declines would overstate noise.

## Page analysis

Search Console returned exactly one page in both 28-day windows:

| Page | Recent clicks | Recent impressions | Recent CTR | Recent position |
|---|---:|---:|---:|---:|
| `https://trip-calculate.online/` | 15 | 1,488 | 1.01% | 8.77 |

No localized URL or route-planner URL has a performance row. There is no declining page; the observed conditions are limited page coverage and `/uk`-to-root canonical consolidation. The cause of the three unknown URLs is not established.

### Top declining pages

None. The only page row, `/`, gained clicks and impressions in the recent period.

## Segment analysis

### Device analysis

| Device | Clicks | Impressions | CTR | Avg. position |
|---|---:|---:|---:|---:|
| Mobile | 8 | 1,198 | 0.67% | 7.19 |
| Desktop | 7 | 281 | 2.49% | 15.58 |
| Tablet | 0 | 9 | 0% | 6.78 |

Facts:

- Mobile produced 80.5% of impressions but had substantially lower CTR than desktop.
- Mobile position is better, so rank alone does not explain the CTR gap.

Ranked hypotheses:

1. Generic, language-mismatched snippets and canonical consolidation reduce mobile result relevance (medium-high confidence; directly corroborated by HTML).
2. Mobile SERP layout/competition suppresses CTR (medium confidence; no SERP capture available).
3. Runtime performance affects post-click visitors but not Search Console CTR directly (low confidence as a cause; build size is confirmed but field metrics are unavailable).

### Country analysis

| Country | Clicks | Impressions | CTR | Avg. position |
|---|---:|---:|---:|---:|
| Ukraine | 10 | 1,198 | 0.83% | 8.01 |
| Poland | 2 | 68 | 2.94% | 8.25 |
| Italy | 1 | 19 | 5.26% | 10.21 |
| United Kingdom | 1 | 14 | 7.14% | 22.21 |
| Estonia | 1 | 3 | 33.33% | 2.33 |

Ukraine accounts for most visibility. Small-country percentages are too sparse for strategy decisions. The result strengthens the need for a correct Ukrainian title, description, canonical, and language annotation.

### Search type and appearance

- Web: 15 clicks / 1,488 impressions in the recent 28 days.
- Image: 0 clicks / 2 impressions.
- Video, News, Discover, and Google News: no meaningful data.
- Search Appearance dimension: no rows.
- No structured data exists in the shared HTML. This is not classified as a confirmed ranking defect; no deceptive or unsupported schema was added.

## Sitemap findings

Search Console `sitemaps.list` returned no submitted sitemap entries.

Production findings:

- `https://trip-calculate.online/sitemap.xml`: HTTP 200, `application/xml`.
- Contains `/en`, `/uk`, `/en/route-planner`, `/uk/route-planner`.
- `https://trip-calculate.online/robots.txt`: HTTP 200 and references the sitemap.
- Robots disallows `/dashboard`, `/admin`, and `/api/`; it does not block the four public URLs.

Repository finding:

- The sitemap had correct URL entries but no hreflang annotations.
- Remediation adds reciprocal `en`, `uk`, and `x-default` alternates.
- Sitemap submission was not performed because it changes Search Console state and requires explicit approval.

## URL Inspection findings

| URL | Coverage | Google canonical | Last crawl | Fetch / robots |
|---|---|---|---|---|
| `/` | Submitted and indexed | `/` | 2026-08-14 16:43:40Z | Successful / allowed |
| `/uk` | Duplicate without user-selected canonical | `/` | 2026-08-14 16:43:40Z | Successful / allowed |
| `/en` | Unknown to Google | none | none | Not inspected by Google |
| `/uk/route-planner` | Unknown to Google | none | none | Not inspected by Google |
| `/en/route-planner` | Unknown to Google | none | none | Not inspected by Google |

All five inspections were targeted and read-only. No indexing request was made.

## Production and repository evidence

Production HTTP/HTML:

- `/` responds 302 and redirects to a locale according to `Accept-Language`; it is not blocked.
- All four localized public URLs respond 200.
- Their initial HTML bodies had the same SHA-256 digest.
- Every localized response had `lang="uk"`, the same English title/description, no canonical, no hreflang, no JSON-LD, and root `og:url`.
- The `www` host and trailing-slash variants of localized public routes returned duplicate HTTP 200 responses.
- A root-level unknown URL redirected to Google OAuth instead of returning 404; unknown locale-prefixed paths received the generic SPA shell with HTTP 200.
- Production robots and sitemap are fetchable.

Repository:

- `SpaShellController.java` lines 14–19 explicitly said route/localized metadata was a future task.
- `SpaShellController` returned one cached static HTML template for all `/en/**` and `/uk/**` routes.
- `frontend/index.html` hard-coded `lang="uk"` and shared English metadata.
- Locale navigation and the public route-planner internal link exist client-side, but initial crawler signals were ambiguous.
- Locale routing and sitemap changes were introduced on 2026-07-12 (`22a097d`, `25215d5`, `cdbfe56`, `6861783`), which closely matches the first Search Console data on 2026-07-11. This supports a recent discovery/growth phase, not a proven decline.
- No GA4/Google Analytics tag was found.
- Current frontend production build reports a 2.27 MB main JavaScript chunk (639 KB gzip), a performance risk requiring measurement before remediation.

## Findings matrix

| Severity | Finding | Status | Confidence | Affected routes/files | Validation |
|---|---|---|---|---|---|
| High | Localized routes lacked self-canonical and hreflang; separately, Google consolidated `/uk` to `/` and had not crawled the other three URLs | Confirmed conditions, fixed in repo; causality limited to hypothesis | High for observations; medium-high for contribution | Four public routes; `SpaShellController.java` | URL Inspection + byte-identical production HTML + regression tests |
| High | Initial HTML used `lang="uk"` for English and one English snippet for every route | Confirmed, fixed in repo | High | Four public routes; `SpaShellController.java` | Production HTML + unit tests |
| Medium | Search Console has no submitted sitemap | Confirmed, external action pending | High | GSC property | `sitemaps.list` returned empty |
| Medium | Mobile CTR is 0.67% despite average position 7.19 | Confirmed observation; relevance hypothesis addressed | Medium | Search snippets/mobile SERP | Search Analytics device dimension |
| Medium | Total visitor decline cannot be measured with current data access | Confirmed measurement gap | High | Analytics stack | No GA integration/credential; only 33 GSC days |
| Medium | Duplicate host/trailing-slash responses and unknown-path status handling | Confirmed, fixed in repo | High | Public routes; `CanonicalUrlFilter`, `SecurityConfig`, `SpaShellController` | Production HTTP audit + filter/security/controller tests |
| Low/Medium | Main frontend bundle is 639 KB gzip | Confirmed build risk, impact unmeasured | Medium | Frontend bundle | Vite build; PageSpeed unavailable |
| Low | No Search Appearance/structured data results | Confirmed absence, not established as a fault | High | Public pages | GSC + HTML inspection |

## Confirmed facts and ranked hypotheses

Confirmed facts addressed:

1. The four intended public URLs served ambiguous initial metadata with no user-declared canonical or hreflang.
2. Google selected `/` as canonical for `/uk`.
3. Google had not crawled `/en` or either localized route-planner URL at inspection time.

Ranked causal hypotheses:

1. Missing user canonical plus byte-identical initial metadata contributed to Google consolidating `/uk` to `/` (high confidence, but Search Console does not prove exclusive causation).
2. Recent launch history and lack of a submitted sitemap delayed discovery of the three unknown URLs (medium confidence).
3. Missing hreflang and generic initial metadata would impair locale/route differentiation after discovery (medium confidence); they cannot explain a URL Google has never crawled.

Not confirmed as causes of a decline:

1. Seasonality: insufficient history.
2. Competition/SERP changes: no rank-tracker or historical SERP data.
3. Performance: oversized bundle is a risk, but PageSpeed/Core Web Vitals data is unavailable.
4. Content/search intent: Ukrainian queries match the calculator, but query samples are too sparse for broad content changes.
5. Analytics attribution: plausible if “visitors” came from another source, but GA4/server analytics are unavailable.

## Prioritized remaining recommendations

1. After review and deployment approval, verify all four live pages expose the expected canonical, hreflang, locale, title, description, and OG URL.
2. Separately approve submitting `https://trip-calculate.online/sitemap.xml` in Search Console. Do not request bulk indexing.
3. Re-run targeted URL Inspection after Google recrawls; confirm self-canonical selection and discovery.
4. Add privacy-conscious GA4 or a self-hosted analytics platform only through a separate attribution/privacy decision.
5. Obtain PageSpeed/Core Web Vitals data, then address bundle splitting only if measured performance justifies it.
6. Monitor Ukrainian high-impression/zero-click terms and mobile CTR for 28 days before changing visible content.
7. After deployment, verify apex-host/trailing-slash normalization and real 404 responses for both root-level and locale-prefixed unknown paths.
