import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { getTranslation } from '../src/i18n/routePlanner'
import { KYIV_LVIV, openPlannerManual, seedRoute } from './helpers'

const en = getTranslation('en')

test.describe('A: navigation, accessibility, gating (LOCAL)', () => {
  test('A05 back/forward across locales and pages', async ({ page }) => {
    await page.goto('/en')
    await page.goto('/uk')
    await page.goto('/en/route-planner')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.goBack()
    await expect(page).toHaveURL(/\/uk\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk')
    await page.goBack()
    await expect(page).toHaveURL(/\/en\/?$/)
    await page.goForward(); await page.goForward()
    await expect(page).toHaveURL(/\/en\/route-planner/)
    await page.reload()
    await expect(page.locator('h1').first()).toBeVisible()
  })

  for (const theme of ['light', 'dark']) {
    for (const path of ['/en', '/en/route-planner', '/en/dashboard']) {
      test(`A12 axe color-contrast ${path} (${theme})`, async ({ page }) => {
        await page.addInitScript(t => localStorage.setItem('theme', t), theme)
        await page.goto(path); await page.waitForTimeout(1500)
        const { violations, incomplete } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
        const nodes = violations.flatMap(v => v.nodes.map(n => `${n.target.join(' ')} :: ${(n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined)?.contrastRatio}`))
        console.log(`AXE ${path} ${theme}: violations=${nodes.length} incomplete(undecidable)=${incomplete.reduce((n, v) => n + v.nodes.length, 0)}\n  ${nodes.slice(0, 8).join('\n  ')}`)
        expect(nodes).toEqual([])
      })
    }
  }

  const guest = async (page: import('@playwright/test').Page) => {
    await page.route('**/api/user/me', r => r.fulfill({ json: { authenticated: false } }))
    await page.route('**/api/user/status', r => r.fulfill({ json: { authenticated: false } }))
  }
  const scrollLocked = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden')

  test('A15 signed-out home: sign-in sheet locks scroll, Escape closes, focus returns (SIMULATED signed-out)', async ({ page }) => {
    await guest(page)
    await page.goto('/en')
    const opener = page.getByRole('button', { name: 'Create a trip' })
    await opener.focus(); await opener.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(await scrollLocked(page)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(await scrollLocked(page)).toBe(false)
    await expect(opener).toBeFocused()
  })

  test('A15 signed-out planner: sample preview only, no AI composer, sign-in goes to Google (SIMULATED signed-out)', async ({ page }) => {
    await guest(page)
    await page.goto('/en/route-planner')
    await expect(page.getByText('Sample trip')).toBeVisible()
    await expect(page.locator('#ai-prompt')).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.results/A15-signed-out-planner.png' })
    const cta = page.getByRole('link', { name: /Sign in with Google/ }).first()
    await expect(cta).toHaveAttribute('href', '/oauth2/authorization/google')
  })

  test('A15 nested dialogs: Escape closes only the top one, scroll stays locked until the last closes, focus returns', async ({ page, request }) => {
    await seedRoute(request)
    await openPlannerManual(page)
    const opener = page.getByRole('button', { name: 'Load route' })
    await opener.click()
    const load = page.getByRole('dialog').first()
    await expect(load).toBeVisible()
    await page.getByRole('button', { name: /^Delete / }).first().click()
    const layers = page.locator('[role="dialog"], [role="alertdialog"]')
    await expect(layers).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(layers).toHaveCount(1)
    expect(await scrollLocked(page)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(layers).toHaveCount(0)
    expect(await scrollLocked(page)).toBe(false)
    await expect(opener).toBeFocused()
  })
})

test.describe('D: routing, saves, receipts (LOCAL)', () => {
  test('D07 /api/routing/calculate returns quality + provider (client model is trip-estimate/2)', async ({ request }) => {
    const res = await request.post('/api/routing/calculate', { data: { waypoints: KYIV_LVIV.waypoints.map(w => ({ lat: w.latitude, lng: w.longitude })) } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.quality).toBe('road')
    expect(typeof body.provider).toBe('string')
    expect(body.totalDistance).toBeGreaterThan(400)
    console.log('D07 keys:', Object.keys(body).join(','))
  })

  test('D08 live: stale snapshot -> 409 ROUTE_SNAPSHOT_STALE; concurrent saves -> 429 ROUTE_SAVE_BUSY', async ({ request }) => {
    const stale = await request.post('/api/routes', { data: { ...KYIV_LVIV, snapshot: { distanceKm: 1.23, quality: 'road' } } })
    expect(stale.status()).toBe(409)
    expect(await stale.text()).toContain('ROUTE_SNAPSHOT_STALE')
    const burst = await Promise.all([1, 2, 3, 4].map(i => request.post('/api/routes', { data: { ...KYIV_LVIV, name: `QA-LOCAL-BURST-${i}` } })))
    const codes = burst.map(r => r.status())
    console.log('D08 burst statuses:', codes.join(','))
    const busy = burst.find(r => r.status() === 429)
    expect(busy, `expected a 429 in ${codes}`).toBeTruthy()
    expect(await busy!.text()).toContain('ROUTE_SAVE_BUSY')
  })

  test('D08 UI: 409 ROUTE_CHANGED / ROUTE_SNAPSHOT_STALE and 429 show their message with exactly one PUT; stale refreshes the estimate once (SIMULATED responses)', async ({ page, request }) => {
    await seedRoute(request)
    let puts = 0
    let next: { status: number; body: string } = { status: 409, body: 'ROUTE_CHANGED' }
    await page.route(/\/api\/routes\/\d+$/, r => {
      if (r.request().method() !== 'PUT') return r.fallback()
      puts++; return r.fulfill({ status: next.status, contentType: 'text/plain', body: next.body })
    })
    await openPlannerManual(page)
    await page.getByRole('button', { name: 'Load route' }).click()
    await page.getByRole('button', { name: 'Load', exact: true }).first().click()
    let calcs = 0
    page.on('request', r => { if (r.url().endsWith('/api/routing/calculate')) calcs++ })
    for (const [status, body, text] of [[409, 'ROUTE_CHANGED', en.toasts.routeChanged], [429, 'ROUTE_SAVE_BUSY', en.toasts.routeSaveBusy], [409, 'ROUTE_SNAPSHOT_STALE', en.toasts.routeSnapshotStale]] as const) {
      next = { status, body }; puts = 0
      await page.getByRole('button', { name: 'Update route' }).click()
      await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled({ timeout: 20000 })
      const calcsBefore = calcs // the post-Load calculation has settled: Update is only enabled once the route is ready
      await page.getByRole('button', { name: 'Update', exact: true }).click()
      await expect(page.getByText(text).first()).toBeVisible()
      await page.waitForTimeout(1500) // an auto-retry would show up as a second PUT
      expect(puts, `${body}: no automatic retry`).toBe(1)
      // Only a stale snapshot invalidates the estimate, and then it refreshes exactly once.
      expect(calcs - calcsBefore, `${body}: routing refreshes`).toBe(body === 'ROUTE_SNAPSHOT_STALE' ? 1 : 0)
      if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape')
    }
  })

  test('D09 API: a PUT based on an older updatedAt gets 409 ROUTE_CHANGED and does not overwrite', async ({ request }) => {
    const r = await seedRoute(request)
    const put = (name: string, expectedUpdatedAt?: string) => request.put(`/api/routes/${r.id}`, { data: { ...KYIV_LVIV, name, expectedUpdatedAt } })
    await new Promise(res => setTimeout(res, 1500)) // per-user save limiter
    const a = await put('QA-LOCAL-TAB-A', r.updatedAt)
    expect(a.status()).toBe(200)
    const aBody = await a.json()
    await new Promise(res => setTimeout(res, 1500))
    const b = await put('QA-LOCAL-TAB-B', r.updatedAt) // tab B still holds the version before A's save
    expect(b.status()).toBe(409)
    expect(await b.text()).toContain('ROUTE_CHANGED')
    expect((await (await request.get(`/api/routes/${r.id}`)).json()).name).toBe('QA-LOCAL-TAB-A')
    await new Promise(res => setTimeout(res, 1500))
    expect((await put('QA-LOCAL-TAB-B2', aBody.updatedAt)).status()).toBe(200) // re-based on the newer version
    await new Promise(res => setTimeout(res, 1500))
    expect((await put('QA-LOCAL-LEGACY')).status()).toBe(200) // clients that send no version keep the old behaviour
  })

  test('D09 UI: two tabs on one record: the second tab to save gets the conflict message and keeps the first tab\'s edit', async ({ browser, request }) => {
    const r = await seedRoute(request)
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' })
    const open = async () => {
      const p = await ctx.newPage()
      await p.goto(`/en/route-planner?routeId=${r.id}`)
      await expect(p.getByRole('button', { name: 'Update route' })).toBeVisible({ timeout: 20000 })
      await p.getByRole('button', { name: 'Update route' }).click()
      await expect(p.getByRole('button', { name: 'Update', exact: true })).toBeEnabled({ timeout: 30000 })
      return p
    }
    const tabA = await open(), tabB = await open() // both loaded the same version
    await tabA.locator('#route-name').fill('QA-LOCAL-TABA')
    await tabA.getByRole('button', { name: 'Update', exact: true }).click()
    await expect.poll(async () => (await (await request.get(`/api/routes/${r.id}`)).json()).name, { timeout: 20000 }).toBe('QA-LOCAL-TABA')
    await new Promise(res => setTimeout(res, 1500))
    await tabB.locator('#route-name').fill('QA-LOCAL-TABB')
    await tabB.getByRole('button', { name: 'Update', exact: true }).click()
    await expect(tabB.getByText(en.toasts.routeChanged).first()).toBeVisible({ timeout: 20000 })
    expect((await (await request.get(`/api/routes/${r.id}`)).json()).name).toBe('QA-LOCAL-TABA')
    await ctx.close()
  })

  test('D10 public receipt exposes no identity, contact or auth data', async ({ request }) => {
    const created = await request.post('/api/receipts', { data: { originLabel: 'Kyiv', destinationLabel: 'Lviv', distanceKm: 540, fuelConsumption: 10, fuelPrice: 60, currency: 'UAH', people: 2, locale: 'en' } })
    expect(created.status()).toBe(200)
    const { slug } = await created.json()
    const pub = await (await request.get(`/api/receipts/${slug}`, { headers: { 'X-Dev-User': 'other' } })).json()
    console.log('D10 public keys:', Object.keys(pub).join(','))
    const dump = JSON.stringify(pub)
    expect(dump).not.toMatch(/userId|email|googleId|@localhost|token|csrf|session/i)
    expect(pub.totalCost).toBe(3240)
    expect(pub.costPerPerson).toBe(1620)
  })
})

test.describe('E: AI input and garage (LOCAL)', () => {
  test('E07 Cyrillic prompt submits with Enter and reaches the AI endpoint (agent SIMULATED)', async ({ page }) => {
    const bodies: string[] = []
    await page.route('**/api/ai/insights/stream', r => { bodies.push(r.request().postData() ?? ''); return r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: done\ndata: {}\n\n' }) })
    await page.goto('/uk/route-planner')
    const box = page.locator('#ai-prompt')
    await box.click()
    await page.keyboard.type('Київ — Львів, 2 пасажири, дизель')
    await page.keyboard.press('Enter')
    await expect.poll(() => bodies.length, { timeout: 10000 }).toBeGreaterThan(0)
    expect(bodies[0]).toMatch(/[Ѐ-ӿ]/)
    expect(bodies[0]).toContain('Київ')
  })

  test('E09 default garage car fills fuel settings in the planner', async ({ page, request }) => {
    const car = await request.post('/api/cars', { data: { name: 'QA Car', makeModel: 'QA Model', fuelType: 'diesel', fuelConsumption: 6.5, isDefault: true, source: 'manual' } })
    expect(car.status()).toBe(200)
    await openPlannerManual(page)
    await expect(page.locator('body')).toContainText('6.5', { timeout: 15000 })
    await expect(page.locator('body')).toContainText('QA Car')
    const cars = await (await request.get('/api/cars')).json() as { isDefault: boolean; name: string }[]
    expect(cars.filter(c => c.isDefault)).toHaveLength(1)
  })
})
