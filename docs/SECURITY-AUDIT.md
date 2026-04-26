# Security Audit — TripCalculate Pre-Client Review
Date: 2026-04-26
Auditor: Claude Sonnet 4.6 (automated read-only scan)
Scope: frontend/src/, .env*, .gitignore, application*.properties, .github/workflows/, vite.config.ts, Dockerfile, pom.xml

---

## CRITICAL — Must fix before client demo

### C-1: Gemini API key baked into JS bundle via VITE_GEMINI_API_KEY
**Files:** `frontend/src/services/geminiService.ts:5`, `.github/workflows/deploy-prod.yml:25`, `.github/workflows/deploy-staging.yml:24`

`geminiService.ts` reads `import.meta.env.VITE_GEMINI_API_KEY` at line 5 and passes it directly to the Google GenAI SDK constructor at line 31. Any `VITE_*` variable is inlined into the compiled JavaScript bundle at build time by Vite; it is trivially readable by any user who opens DevTools or inspects the deployed JS asset.

The production GitHub Actions workflow at line 25 injects `VITE_GEMINI_API_KEY: ${{ secrets.PROD_GEMINI_API_KEY }}` into the build environment, which means if that secret is set, a real API key is currently shipping in the bundle to all users.

The staging workflow (line 24) injects `VITE_GEMINI_API_KEY: ${{ secrets.STAGING_GEMINI_API_KEY }}` identically.

**STATUS: FIXED** — Removed `VITE_GEMINI_API_KEY` from both deploy-prod.yml and deploy-staging.yml env blocks. Set `API_KEY = ''` in geminiService.ts (service is dead code, not called anywhere). Added security comment explaining the change.

---

### C-2: VITE_N8N_WEBHOOK_URL injected into frontend build (dead variable, but still dangerous)
**Files:** `.github/workflows/deploy-prod.yml:24`, `.github/workflows/deploy-staging.yml:24`

Both workflows inject `VITE_N8N_WEBHOOK_URL: ${{ secrets.PROD_N8N_WEBHOOK_URL }}` (and `STAGING_N8N_WEBHOOK_URL`) into the Vite build. However, no file in `frontend/src/` references `import.meta.env.VITE_N8N_WEBHOOK_URL` — the frontend already correctly uses the `/api/ai/insights` backend proxy (`n8nService.ts:4`).

The env var is therefore a no-op at runtime, but it still gets embedded in the compiled bundle if Vite picks it up from the build environment. More critically: keeping this env var in the workflow is misleading and creates the risk that a future developer re-adds a direct reference assuming it is safe.

**STATUS: FIXED** — Removed `VITE_N8N_WEBHOOK_URL` from both deploy-prod.yml and deploy-staging.yml env blocks. Backend secret `PROD_N8N_WEBHOOK_URL` (passed as `N8N_WEBHOOK_URL` to container) remains unchanged and correct.

---

### C-3: Temporary DEBUG logging shipped in base application.properties
**File:** `src/main/resources/application.properties:70-75`

Five lines of Spring/Tomcat framework DEBUG logging are present with an explicit comment "TEMPORARY DEBUG LOGGING - Remove after fixing":

```
logging.level.org.springframework.boot.web.embedded=DEBUG
logging.level.org.springframework.web.servlet=DEBUG
logging.level.org.springframework.web.servlet.resource=DEBUG
logging.level.org.springframework.boot.autoconfigure.web=DEBUG
logging.level.com.tripplanner=DEBUG
```

Because `application.properties` is the base config, these settings apply to every profile that does not override them — including production, unless the prod profile explicitly overrides them. `application-prod.properties` sets `logging.level.root=WARN` and `logging.level.com.tripplanner=INFO`, which overrides the last entry, but does **not** override the four Spring framework DEBUG lines. In production, this causes verbose framework log output that may leak internal request paths, query parameters, and resource-loading details.

**STATUS: FIXED** — Deleted all five DEBUG logging lines and the temporary comment from application.properties.

---

### C-4: Actuator `/actuator/prometheus` exposed in production
**File:** `src/main/resources/application-prod.properties:39`

```
management.endpoints.web.exposure.include=health,prometheus
```

The `prometheus` endpoint exposes internal metrics (JVM memory, thread pools, HTTP request counts by URI, DB pool stats). While this is common in monitored environments, the SecurityConfig (`SecurityConfig.java:190-191`) explicitly denies all actuator endpoints except `/actuator/health`:

```java
.requestMatchers("/actuator/health").permitAll()
.requestMatchers("/actuator/**").denyAll()
```

This creates a contradiction: the properties file enables `prometheus`, but the security filter denies all `actuator/**` except `health`. The endpoint is effectively inaccessible due to security rules, but the configuration contradiction is confusing and a future security config change could inadvertently expose it.

**STATUS: FIXED** — Removed `prometheus` from `management.endpoints.web.exposure.include` in `application-prod.properties`. Now only `health` is exposed.

---

## WARNING — Should fix soon

### W-1: H2 database dependency ships to production with scope `runtime`
**File:** `pom.xml:91-94`

```xml
<dependency>
    <groupId>com.h2database</groupId>
    <artifactId>h2</artifactId>
    <scope>runtime</scope>
</dependency>
```

H2 is present in the production JAR/Docker image. Spring Boot's auto-configuration will not activate H2 console in production as long as the `dev` profile is not active, but the H2 driver and servlet are available on the classpath. This unnecessarily increases attack surface and binary size.

**Fix:** Add `<scope>test</scope>` to the H2 dependency, or conditionally include it only for the dev profile via Maven profiles. Verify that no non-dev Spring profile depends on H2.

### W-2: spring-boot-devtools ships to production with scope `runtime`
**File:** `pom.xml:76-79`

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>
    <optional>true</optional>
</dependency>
```

DevTools is `optional=true`, which means it is excluded from downstream dependencies when used as a library, but it is still included in the fat JAR built by `spring-boot:repackage`. Spring Boot does disable some devtools features in production-mode JARs, but the dependency still ships inside the container image. DevTools can enable automatic restart, remote debugging endpoints, and relaxed caching — none of which are desired in production.

**Fix:** Change `<scope>runtime</scope>` to `<scope>test</scope>`, or restrict to a Maven profile. This also reduces the image size.

### W-3: Internal IP address hardcoded in staging properties (leaked in JAR)
**File:** `src/main/resources/application-staging.properties:8`

```
spring.datasource.url=${DATABASE_URL:jdbc:postgresql://192.168.50.234:5432/tripplanner}
```

The private IP `192.168.50.234` is the fallback default if `DATABASE_URL` is not set. This properties file is committed to source control and shipped inside the production JAR. While the staging profile is not active in production, the IP reveals internal network topology and is visible to anyone who extracts the JAR (`jar tf` or `unzip`). The IP is also hardcoded in the `deploy-prod.yml` deployment summary at line 332 ("172.18.0.2").

**Fix:** Change the fallback to a localhost placeholder: `${DATABASE_URL:jdbc:postgresql://localhost:5432/tripplanner}`. Never use real infra IPs as defaults in committed files.

### W-4: Production deploy workflow uses `:latest` Docker tag in `docker run`
**File:** `.github/workflows/deploy-prod.yml:224, 252`

The deployment step pulls `:latest` and runs `:latest`, not the SHA-pinned `prod-${{ github.sha }}` tag that was pushed in the build step. This means if Docker Hub has a race condition (e.g., a concurrent push from another branch), the VPS may run a different image than the one tested in the build job.

```bash
docker pull "${DOCKER_USERNAME}/trip-calculate:latest"   # line 224
docker run ... "${DOCKER_USERNAME}/trip-calculate:latest"  # line 252
```

**Fix:** Use the SHA-pinned tag in the deploy step: `trip-calculate:prod-${{ github.sha }}`. Pass the SHA as an environment variable from the build job output.

### W-5: Staging deploy workflow uses `:staging` (mutable) tag in `docker run`
**File:** `.github/workflows/deploy-staging.yml:108, 128`

Same issue as W-4 but for staging: the SHA-pinned `staging-${{ github.sha }}` tag is pushed but `:staging` mutable tag is used in `docker run`.

**Fix:** Use `trip-calculate:staging-${{ github.sha }}` in the staging deploy step.

### W-6: `console.log("Raw AI Response:", rawData)` leaks full backend AI payload to browser console
**File:** `frontend/src/services/n8nService.ts:101`

The full JSON response from the AI/n8n backend is logged unconditionally in production builds. Depending on what the n8n workflow returns (user query echoed back, route metadata, potential PII), this data is visible in browser DevTools to any user of the application.

**Fix:** Remove this log line, or gate it behind a development-only flag (`import.meta.env.DEV && console.log(...)`).

### W-7: `console.log` statements expose internal access-check state
**File:** `frontend/src/services/routeService.ts:75, 80`

```
console.log('Access check response:', data, 'Type:', typeof data);
console.log('Access granted:', hasAccess);
```

These expose the raw backend access-check response and the resolved boolean to the browser console in production. An attacker can use this to understand feature-flag logic and probe access control decisions.

**Fix:** Remove both lines or gate behind `import.meta.env.DEV`.

---

## INFO — Hardening suggestions

### I-1: `frontend/.env` covered by root `.gitignore`, but coverage is indirect
**File:** `.gitignore:98`

The root `.gitignore` has a bare `.env` pattern, which is matched by git against all subdirectory paths, so `frontend/.env` is correctly excluded. Confirmed with `git check-ignore`. However, having an explicit `frontend/.env` entry would make intent clearer. Currently `frontend/.gitignore:13` covers `*.local` patterns — it could also cover `.env.production` and `.env.local` explicitly.

**Suggestion:** Add `frontend/.env` to the root `.gitignore` explicitly, and add `.env.production` to `frontend/.gitignore`.

### I-2: `application.properties` base config contains `logging.level.com.tripplanner=DEBUG` (overrides to INFO in prod, but not cleanly)
**File:** `src/main/resources/application.properties:75`

Partially addressed by prod properties, but the base file remains confusing. After removing the debug block (C-3), set the base level to `INFO` so it's the safe default.

### I-3: Verbose debug `console.log` in MapContainer and RoutePlanner shipped to production
**Files:** `frontend/src/components/MapContainer.tsx` (24 log lines), `frontend/src/components/RoutePlanner.tsx` (9 log lines), `frontend/src/services/routingService.ts` (6 log lines)

These log internal coordinates, geometry arrays, and marker positions. This is not a credential leak, but it increases the size of the JS bundle slightly and exposes implementation detail to users in production DevTools.

**Suggestion:** Wrap all these logs in `if (import.meta.env.DEV)` guards, or use a debug logging library that is stripped in production builds.

### I-4: `DevSecurityConfig` disables CSRF and permits all requests — profile guard confirmed correct, document explicitly
**File:** `src/main/java/com/tripplanner/TripPlanner/config/DevSecurityConfig.java`

The dev security config correctly uses `@Profile("dev")` and the prod SecurityConfig uses `@Profile("!dev")`. The mutual exclusion is correct. However, there is no automated test verifying that the `dev` profile is not accidentally active in production (e.g., if `SPRING_PROFILES_ACTIVE=dev` were mistakenly set in a secret). 

**Suggestion:** Add an integration test or CI step that verifies `SPRING_PROFILES_ACTIVE` is not `dev` in the production Docker run command. The current `deploy-prod.yml` correctly hard-codes `-e SPRING_PROFILES_ACTIVE=prod`.

### I-5: `application-staging.properties` exposes `management.endpoint.health.show-details=always`
**File:** `src/main/resources/application-staging.properties:35`

Health details (DB connection info, disk space, Redis ping) are shown to all unauthenticated callers in staging. Acceptable for internal staging, but worth noting if staging is internet-accessible.

### I-6: Two overlapping `WebMvcConfigurer` implementations
**Files:** `src/main/java/.../config/WebMvcConfig.java`, `src/main/java/.../config/WebConfig.java`

Both classes implement the same `addResourceHandlers("/**")` SPA fallback pattern. When both beans are active, the second registration may shadow the first or cause unpredictable behavior. Not a direct security issue, but a dead-code/confusion risk.

**Suggestion:** Remove `WebConfig.java` (the simpler one) and retain `WebMvcConfig.java` which has the more complete implementation.

### I-7: `server.tomcat.remoteip.internal-proxies=.*` trusts all proxy IPs
**File:** `src/main/resources/application.properties:15`

The wildcard `.*` means Tomcat will trust any `X-Forwarded-For` header from any IP as a legitimate proxy header. This is intentional for Cloudflare but means an attacker on the same network segment could forge client IP addresses. Acceptable if the VPS only accepts traffic from Cloudflare, but should be tightened to Cloudflare's published IP ranges.

---

## PASSED — Done correctly

- **n8n webhook URL correctly backend-only:** `n8nService.ts` calls `/api/ai/insights` only; no `VITE_N8N_WEBHOOK_URL` reference exists anywhere in `frontend/src/`. The n8n webhook URL is kept server-side as `N8N_WEBHOOK_URL` env var. Good.

- **Google OAuth Client Secret never in frontend:** Only `GOOGLE_CLIENT_ID` is used server-side in `application.properties`. The client secret is passed exclusively via `GOOGLE_CLIENT_SECRET` environment variable to the backend container. Frontend has no reference to either.

- **CSRF protection correctly implemented:** `SecurityConfig.java` enables CSRF with cookie-based tokens (`CookieCsrfTokenRepository.withHttpOnlyFalse()`). The frontend fetches the token via `fetchCsrfToken()` in `api.ts` and `getCsrfToken()` in `n8nService.ts`. CSRF exemptions are limited to `/calculate`, `/api/routing/**`, and `/api/ai/**` — the last two are authenticated-only endpoints so CSRF is less relevant.

- **Dockerfile: non-root user correctly set:** The Dockerfile creates a `spring` user/group, sets `USER spring:spring`, and runs the JAR as that user. No secrets are baked into image layers via `ENV` instructions (only `JAVA_OPTS` with JVM tuning flags).

- **SSH key cleanup with `if: always()`:** Both `deploy-prod.yml:346-348` and `deploy-staging.yml:138-140` use `if: always()` on the cleanup step, ensuring the key is removed even on job failure.

- **No hardcoded credentials found in frontend source:** Scan of all `frontend/src/**/*.ts` and `*.tsx` files found no hardcoded API keys, passwords, or tokens (excluding `VITE_GEMINI_API_KEY` which is via env var, flagged in C-1).

- **Security headers correctly configured:** `SecurityConfig.java` sets `X-Frame-Options: DENY`, `Strict-Transport-Security` with 1-year max-age + includeSubDomains, and `Referrer-Policy: strict-origin-when-cross-origin`.

- **Error responses hardened:** `server.error.include-message=never`, `include-stacktrace=never`, `include-exception=false` are set in both base and prod properties.

- **Actuator correctly locked down in SecurityConfig:** `SecurityConfig.java:190-191` permits only `/actuator/health` and denies all other `/actuator/**` paths at the security filter level (independent of what properties expose).

- **Database and Redis ports not exposed:** The deployment script in `deploy-prod.yml` actively fails the deployment if port 5432 or 6379 is exposed externally (lines 160-166, 211-217).

- **No wildcard CORS configuration found:** No `addCorsMappings`, `@CrossOrigin`, or `allowedOrigins("*")` found in any Java source file. The application uses the same-origin model (React served from the Spring Boot JAR).

- **`frontend/.env` gitignored:** Confirmed via `git check-ignore` — the root `.gitignore` `.env` pattern correctly excludes `frontend/.env`.

- **`DevSecurityConfig` and `DevAuthController` correctly profile-gated:** Both use `@Profile("dev")` and are therefore never active in production (`SPRING_PROFILES_ACTIVE=prod`).

- **Session security:** 24-hour timeout, session fixation protection via Spring Security defaults, `JSESSIONID` cookie deleted on logout.

- **Rate limiting:** `RateLimitingFilter` and `AiRateLimitingFilter` are wired into the security chain. AI endpoints require authentication and have per-minute/hourly/daily limits configured.
