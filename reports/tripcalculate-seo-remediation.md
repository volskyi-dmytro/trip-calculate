# TripCalculate SEO Remediation

Date: 2026-08-15  
Branch: `master`  
Starting commit: `86f6e9876bd59031553c76322ac3a2bbf1a7d85f`  
Ending commit: `86f6e9876bd59031553c76322ac3a2bbf1a7d85f` (working tree is uncommitted)  
Deployment status: **not deployed**  
Push/commit status: **not committed and not pushed**

## Root causes addressed

No root cause for an organic or total-visitor decline was established in the available data. The remediation addresses the following high-confidence technical defects that plausibly contributed to canonical consolidation and weak route/language differentiation.

The repository served the same cached HTML shell for every localized public route. It did not expose a self-canonical, language alternates, localized document language, route-specific title/description, or route-specific Open Graph URL before JavaScript execution.

These defects co-occurred with Search Console evidence:

- `/uk` was classified as a duplicate canonicalized to `/`.
- `/en` and both localized route-planner pages were unknown to Google. Because Google had not crawled them, the metadata defects cannot be claimed as the cause of their unknown status.
- All performance was assigned to `/`.

The remediation makes each intended public URL self-describing in the server response and strengthens the existing sitemap’s language-alternate signals.

## Files and routes changed

### `src/main/java/com/tripplanner/TripPlanner/controller/SpaShellController.java`

Changed server HTML generation for:

- `/en`
- `/uk`
- `/en/route-planner`
- `/uk/route-planner`

Each response now receives:

- Correct `<html lang>` (`en` or `uk`).
- Localized, route-specific `<title>`.
- Localized, route-specific meta description.
- Route-specific Open Graph title, description, and URL.
- Self-referencing canonical URL.
- Reciprocal `en` and `uk` hreflang links.
- `x-default` alternate pointing to the corresponding locale-resolving bare route.

Other `/en/**` and `/uk/**` shell routes now receive `X-Robots-Tag: noindex, nofollow`, preserve the correct document language, and do not claim a public-page canonical or hreflang set.

No redirect behavior, content access, authentication, analytics attribution, DNS, hosting, or Search Console setting changed.

### `frontend/public/sitemap.xml`

Added the XHTML namespace and reciprocal alternates for both route groups:

- Home: `/en` ↔ `/uk`, x-default `/`.
- Route planner: `/en/route-planner` ↔ `/uk/route-planner`, x-default `/route-planner`.

The four sitemap `<loc>` values are unchanged. No sitemap was submitted or deleted.

### `src/test/java/com/tripplanner/TripPlanner/controller/SpaShellControllerTest.java`

Added regression coverage for:

- English home language, title, canonical, alternate links, and OG URL.
- Ukrainian route-planner language, title, canonical, alternate links, and OG URL.
- Non-public locale routes receive `noindex, nofollow` and no false home canonical/hreflang.

The controller work used three RED→GREEN checks: request-aware metadata initially failed at compilation; non-public-route indexing protection then failed on a missing header; route-planner `x-default` then failed on the wrong bare URL. All three behaviors now pass.

## Before and after behavior

| Signal | Before | Repository after remediation |
|---|---|---|
| `/en` document language | `uk` | `en` |
| `/uk` document language | `uk` | `uk` |
| Home/route-planner title | One shared English title | Distinct route- and locale-specific titles |
| Description | One shared English description | Distinct localized descriptions |
| Canonical | Missing | Self-referencing canonical |
| Hreflang | Missing | Reciprocal `en`, `uk`, and `x-default` |
| `og:url` | Root domain for all pages | Exact route URL |
| Sitemap language alternates | Missing | Reciprocal alternates for both route groups |
| Non-public/unknown locale shell paths | Shared generic metadata | `X-Robots-Tag: noindex, nofollow`; no public canonical/hreflang |

Production still exhibits the “Before” behavior because deployment was explicitly prohibited without approval.

## Tests and checks actually run

### Passed

- TDD RED check:
  - `SpaShellControllerTest` initially failed at test compilation because request-aware metadata generation did not exist.
- Focused Java regression:
  - `SpaShellControllerTest`: 3 passed.
- Full Java suite in an isolated Docker Maven/Java 17 environment with H2 and dummy local email placeholders:
  - 128 tests passed, 0 failures, 0 errors.
- Backend Maven package build:
  - Completed successfully with tests skipped after the full suite had passed.
- Frontend tests:
  - 17 test files passed.
  - 80 tests passed.
- Frontend TypeScript/Vite production build:
  - 2,134 modules transformed.
  - Build completed successfully.
- Agent tests:
  - 142 passed.
  - 1 declared integration test skipped.
- Sitemap parse:
  - Valid XML.
  - Four URL entries.
  - Each entry has `en`, `uk`, and `x-default` alternates.
- `git diff --check`: passed.
- Production HTTP checks before remediation:
  - Root redirect, four localized route status checks, robots, and sitemap verified.
- Search Console read-only checks:
  - property, performance, sitemap list, and five targeted URL inspections completed.

### Baseline issue, not introduced

- Frontend `npm run lint` failed with 13 errors and 12 warnings in untouched files, including `MapContainer.tsx`, `TripDetailsForm.tsx`, UI primitives, and context/provider modules.
- The SEO changes do not touch frontend TypeScript/TSX source, so these are existing lint debt rather than regressions from this remediation.

### Blocked or unavailable

- Browser rendering check: Chrome could not be launched by the browser backend.
- PageSpeed Insights: HTTP 429 because the available Google project has zero daily quota.
- Live post-change checks: not possible until an approved deployment.

## Remaining risks

1. Google may continue selecting `/` until it recrawls the localized URLs; repository changes cannot guarantee canonical selection.
2. The sitemap is not registered in Search Console. Submission is a separate external-state action requiring approval.
3. Root and `/route-planner` use locale-dependent 302 redirects. This remediation intentionally does not alter redirects because broad redirect changes require a separate checkpoint.
4. `SpaShellController` still returns HTTP 200 for unknown locale-prefixed paths, although they are now `noindex, nofollow`. A separate status/soft-404 audit is still warranted.
5. No GA4 or equivalent visitor analytics is available, so total visitor changes and conversions remain unmeasured.
6. The frontend main bundle is approximately 639 KB gzip. Impact is unmeasured because PageSpeed/Core Web Vitals data is unavailable.
7. Search Console’s history is only 33 days, so seasonality and year-over-year effects cannot be evaluated.
8. Search query rows are privacy-filtered; aggregate clicks cannot be fully attributed to query rows.

## Rollback instructions

Before commit, restore only these scoped files if the remediation is rejected:

```bash
git restore -- frontend/public/sitemap.xml \
  src/main/java/com/tripplanner/TripPlanner/controller/SpaShellController.java
rm src/test/java/com/tripplanner/TripPlanner/controller/SpaShellControllerTest.java
rm reports/tripcalculate-seo-diagnosis.md reports/tripcalculate-seo-remediation.md
```

After a future commit, prefer a normal revert rather than rewriting history:

```bash
git revert <seo-remediation-commit>
```

No database, Search Console, sitemap submission, DNS, CDN, or production rollback is currently necessary because no external deployment occurred.

## Production verification checklist

After explicit deployment approval:

- [ ] Verify deployed commit/container corresponds to the reviewed revision.
- [ ] Confirm `/` and `/route-planner` redirect behavior is unchanged.
- [ ] Confirm all four localized public routes return HTTP 200.
- [ ] Confirm exact self-canonical on each localized public route.
- [ ] Confirm `lang="en"` on English routes and `lang="uk"` on Ukrainian routes.
- [ ] Confirm reciprocal `en`/`uk` and matching `x-default` alternates.
- [ ] Confirm title and description are distinct by route and locale.
- [ ] Confirm `og:url` equals the exact current route.
- [ ] Fetch and XML-parse production `sitemap.xml`; verify all 12 alternate annotations.
- [ ] Confirm `robots.txt` still references the sitemap and does not block public routes.
- [ ] Load all four routes in a real browser; verify rendered language, H1, navigation, console, and no metadata duplication.
- [ ] If separately approved, submit the sitemap once in Search Console.
- [ ] Do not request bulk indexing; inspect only representative URLs after recrawl.

## Monitoring plan

### Day 7

- Query daily Web Search data since deployment.
- Compare impressions/clicks/CTR for the same weekday mix.
- Inspect `/en`, `/uk`, and one route-planner locale.
- Check whether Google has discovered each URL and whether user canonical is visible.
- Verify sitemap fetch status if submission was approved.
- Treat absence of movement as normal; seven days is an early signal only.

### Day 14

- Compare post-deploy 14 days with the preceding 14 days by page, device, country, and query.
- Check whether performance begins splitting from `/` to localized URLs.
- Reinspect all four public URLs, staying within URL Inspection quotas.
- Review mobile CTR for Ukraine and the top Ukrainian intent queries.
- Confirm no new duplicate/canonical regressions.

### Day 28

- Compare full 28-day post-deploy period with the immediately preceding 28 days.
- Evaluate clicks, impressions, CTR, and average position by page, device, country, and query.
- Confirm all intended pages are known/indexed or document Google’s chosen canonical and reasons.
- Decide whether snippet copy needs a controlled second iteration.
- Decide separately whether measured performance justifies bundle splitting.
- If total visitors remain a concern, prioritize approved analytics instrumentation rather than inferring visitor behavior from Search Console alone.

## Review readiness

The scoped SEO implementation is ready for independent code review. It is not ready for production release until:

1. The exact diff receives independent review.
2. Dmytro explicitly approves commit/push/deployment actions as applicable.
3. Post-deployment verification can be performed against the live HTML.
