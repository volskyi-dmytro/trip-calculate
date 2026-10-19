import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { KYIV_LVIV, roadResult, seedRoute, openPlannerManual } from './helpers'

// Local stack only. Receipts are disposable H2 data; no production session or AI quota is used.
test.use({ channel: 'chrome' })
let receiptPath: string
test.beforeAll(async ({ request }) => {
  const response = await request.post('/api/receipts', { data: {
    distanceKm: 542.59, fuelConsumption: 6, fuelPrice: 100.43, currency: 'UAH', people: 2,
    totalCost: 3269.54, costPerPerson: 1634.77, locale: 'en',
    originLabel: 'Kyiv', destinationLabel: 'Lviv', routeGeometry: JSON.stringify([[50.45,30.52],[50.2,29],[50.1,27],[49.84,24.03]]),
  } })
  expect(response.ok()).toBe(true)
  receiptPath = `/r/${(await response.json()).slug}`
})

for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1280]) {
    test(`${theme} ${width}: layout, landmarks, contrast and receipt`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1024 })
      await page.addInitScript(t => localStorage.setItem('theme', t), theme)
      for (const path of ['/en', '/en/route/kyiv-lviv', '/en/dashboard', '/en/route-planner', receiptPath, '/en/missing-audit-page', '/uk', '/uk/route/kyiv-lviv']) {
        await page.goto(path)
        await expect(page.locator('main')).toHaveCount(1)
        await expect(page.locator('h1')).toBeVisible()
        // Wait for the app's theme transition before taking a contrast snapshot.
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(theme === 'dark' ? 'rgb(15, 20, 25)' : 'rgb(242, 244, 246)')
        await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const results = await new AxeBuilder({ page }).withRules(['color-contrast', 'landmark-one-main', 'button-name', 'link-name']).analyze()
        expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, data: n.any[0]?.data })) })), path).toEqual([])
        for (const link of await page.locator('footer a:not(.footer-about a), .breadcrumb a').all()) {
          expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        }
        if (path === receiptPath) {
          await expect(page.locator('main svg[role="img"]')).toHaveAttribute('aria-label', /Kyiv.*Lviv/)
          await expect(page.locator('main')).toContainText(/UAH\s1,634\.7/)
        }
        await page.screenshot({ path: `e2e/.results/reaudit-${theme}-${width}-${path === receiptPath ? 'receipt' : path.slice(1).replaceAll('/', '-')}.png`, fullPage: true })
      }
    })
  }
}

test('mobile share Cancel, focus restoration and keyboard exit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/en')
  const trigger = page.getByRole('button', { name: 'Share receipt', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancel).toBeVisible()
  expect((await cancel.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'e2e/.results/reaudit-share-mobile.png' })
  await cancel.click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

for (const theme of ['light', 'dark']) {
  test(`${theme}: saved price, departure date and forecast date (external responses simulated)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 })
    await page.addInitScript(t => localStorage.setItem('theme', t), theme)
    const route = { ...KYIV_LVIV, id: 991, fuelCostPerLiter: 86, totalDistance: 542.59,
      departureDate: '2026-10-24', distanceQuality: 'road', createdAt: '2026-10-18T12:00:00Z', updatedAt: '2026-10-18T12:00:00Z' }
    await page.route('**/api/routes', r => r.fulfill({ json: [route] }))
    await page.route('**/api/routes/991', r => r.fulfill({ json: route }))
    await page.route('**/api/routing/calculate', r => r.fulfill({ json: roadResult(542.59) }))
    await page.route('**/nominatim.openstreetmap.org/**', r => r.fulfill({ json: { address: { country_code: 'ua' } } }))
    await page.route('**/api/fuel-prices?**', r => r.fulfill({ json: { currency: 'UAH', prices: [{ code: 'UA', pricePerLiter: 100.43, stale: false, source: 'test', fetchedAt: '2026-10-19' }] } }))
    await page.route('**/api/weather/corridor', r => r.fulfill({ json: { weather_data: {
      date: '2026-10-24', samples: [{ lat: 50.45, lon: 30.52, label: 'Kyiv', temp_max_c: 13, weather_code: 0 }], risk_flags: [], source: 'test', fetched_at: '2026-10-19',
    } } }))
    await page.goto('/en/route-planner?routeId=991')
    const summary = page.locator('.trip-summary')
    await expect(summary.locator('.trip-summary-chip time')).toHaveText('Sat, Oct 24, 2026')
    await expect(summary.locator('.trip-summary-saved-price')).toContainText('Saved price')
    await expect(summary.locator('.weather-strip time')).toHaveText('Sat, Oct 24, 2026')
    const live = summary.getByRole('button', { name: 'Use live price', exact: true })
    await expect(live).toBeVisible()
    expect((await live.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(theme === 'dark' ? 'rgb(15, 20, 25)' : 'rgb(242, 244, 246)')
    const results = await new AxeBuilder({ page }).include('.trip-summary').withRules(['color-contrast', 'button-name']).analyze()
    expect(results.violations).toEqual([])
    await page.screenshot({ path: `e2e/.results/reaudit-${theme}-saved-route.png` })
    await live.click()
    await expect(summary.locator('.trip-summary-saved-price')).toHaveCount(0)
    await expect(summary).toContainText('live price')
  })
}

test('guest manual planner and sample sign-in sheet (auth response simulated)', async ({ page }) => {
  await page.route('**/api/user/me', r => r.fulfill({ json: { authenticated: false } }))
  await page.route('**/api/user/status', r => r.fulfill({ json: { authenticated: false } }))
  await page.goto('/en/route-planner')
  await expect(page.getByRole('combobox', { name: 'Start', exact: true })).toBeVisible()
  await expect(page.locator('#ai-prompt')).toHaveCount(0)
  await page.goto('/en/route-planner?sample=1')
  await expect(page.getByText('Sample trip', { exact: true })).toBeVisible()
  const save = page.getByRole('button', { name: 'Save trip', exact: true })
  await save.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('link')).toHaveAttribute('href', /oauth2\/authorization\/google/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(save).toBeFocused()
})

// ── 2026-10-19 re-test fixes ────────────────────────────────────────────────

/** WCAG contrast of `fg` over the stack of `bgs` (outermost first), resolved through a canvas so
 *  modern CSS colour syntax (oklab, color-mix, alpha) is composited the way the browser paints it. */
async function contrast(page: import('@playwright/test').Page, fg: string, bgs: string[]) {
  return page.evaluate(([fgSel, bgSels]) => {
    const px = (css: string, under: Uint8ClampedArray) => {
      const c = document.createElement('canvas'); c.width = c.height = 1
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.fillStyle = `rgb(${under[0]},${under[1]},${under[2]})`; g.fillRect(0, 0, 1, 1)
      g.fillStyle = css; g.fillRect(0, 0, 1, 1)
      return g.getImageData(0, 0, 1, 1).data
    }
    const lum = (d: Uint8ClampedArray) => {
      const [r, g, b] = [d[0], d[1], d[2]].map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    let under: Uint8ClampedArray = new Uint8ClampedArray([255, 255, 255, 255])
    for (const sel of bgSels) under = px(getComputedStyle(document.querySelector(sel)!).backgroundColor, under)
    const fgEl = document.querySelector(fgSel)!
    const fgCss = fgEl instanceof SVGElement ? getComputedStyle(fgEl).color : getComputedStyle(fgEl).color
    const top = px(fgCss, under)
    const [a, b] = [lum(top), lum(under)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  }, [fg, bgs] as const)
}

for (const theme of ['light', 'dark']) {
  test(`${theme}: destructive confirm button is readable (>= 4.5:1)`, async ({ page, request }) => {
    await seedRoute(request)
    await page.addInitScript(t => localStorage.setItem('theme', t), theme)
    await openPlannerManual(page)
    await page.getByRole('button', { name: 'Load route' }).click()
    await page.getByRole('button', { name: /^Delete / }).first().click()
    const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true })
    await expect(confirm).toBeVisible()
    await confirm.evaluate(el => el.setAttribute('data-qa', 'confirm'))
    expect(await contrast(page, '[data-qa=confirm]', ['body', '[data-qa=confirm]'])).toBeGreaterThanOrEqual(4.5)
    await page.screenshot({ path: `e2e/.results/reaudit-${theme}-destructive.png` })
  })

  test(`${theme}: planner header logo icon has >= 3:1 contrast`, async ({ page }) => {
    await page.addInitScript(t => localStorage.setItem('theme', t), theme)
    await page.goto('/en/route-planner')
    await expect(page.locator('header.app-bar .brand svg')).toBeVisible()
    expect(await contrast(page, '.app-bar .brand svg', ['body', '.app-bar'])).toBeGreaterThanOrEqual(3)
  })

  test(`${theme}: sample page uses AppHeader and passes contrast (auth simulated)`, async ({ page }) => {
    await page.addInitScript(t => localStorage.setItem('theme', t), theme)
    await page.route('**/api/user/me', r => r.fulfill({ json: { authenticated: false } }))
    await page.route('**/api/user/status', r => r.fulfill({ json: { authenticated: false } }))
    await page.goto('/en/route-planner?sample=1')
    await expect(page.getByText('Sample trip', { exact: true })).toBeVisible()
    await expect(page.locator('header.app-bar')).toHaveCount(1)
    await expect(page.locator('header.hero')).toHaveCount(0)
    await expect(page.locator('main')).toHaveCount(1)
    expect(await page.locator('header').count()).toBe(1)
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(theme === 'dark' ? 'rgb(15, 20, 25)' : 'rgb(242, 244, 246)')
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(results.violations.map(v => v.nodes.map(n => n.target))).toEqual([])
    expect(await contrast(page, 'main span.rounded-full', ['body', 'main span.rounded-full'])).toBeGreaterThanOrEqual(4.5)
  })
}

test('Load route dialog: focus moves in, is trapped, Close/Escape work, focus returns', async ({ page, request }) => {
  await seedRoute(request)
  await openPlannerManual(page)
  const trigger = page.getByRole('button', { name: 'Load route' })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true)
  const close = dialog.getByRole('button', { name: 'Close', exact: true })
  const box = (await close.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true)
  }
  await close.click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.mouse.click(5, 5) // backdrop
  await expect(dialog).toBeHidden()
})

test('sign-in sheet title and text match the action (sample page)', async ({ page }) => {
  await page.route('**/api/user/me', r => r.fulfill({ json: { authenticated: false } }))
  await page.route('**/api/user/status', r => r.fulfill({ json: { authenticated: false } }))
  await page.goto('/en/route-planner?sample=1')
  await page.getByRole('button', { name: 'Save trip', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('Save this trip to your account')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Share receipt', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('Sign in to share a receipt')
})

test('footer contact paragraph stays within two lines at 375px; touch targets >= 44', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/en')
  const para = page.locator('.footer-about p').nth(1)
  const { height, lineHeight } = await para.evaluate(el => ({ height: el.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(el).lineHeight) }))
  expect(height).toBeLessThanOrEqual(lineHeight * 2 + 1)
  const brand = (await page.locator('.topbar .brand').boundingBox())!
  expect(brand.width).toBeGreaterThanOrEqual(44)
  expect(brand.height).toBeGreaterThanOrEqual(44)

  const route = await seedRoute(request)
  await page.goto('/en/dashboard')
  const targets = [
    page.getByRole('button', { name: /edit profile/i }),
    page.getByRole('button', { name: /^Delete /i }).first(),
    page.locator('#route-sort'),
  ]
  for (const t of targets) {
    const b = (await t.boundingBox())!
    expect(b.width).toBeGreaterThanOrEqual(44)
    expect(b.height).toBeGreaterThanOrEqual(44)
  }
  // The trip title opens the route in the planner
  await page.getByRole('link', { name: route.name }).first().click()
  await expect(page).toHaveURL(/\/route-planner\?routeId=\d+/)
})

test('saved route with coordinate waypoint names shows place names; no phantom departure chip', async ({ page }) => {
  const route = { ...KYIV_LVIV, id: 992, name: 'Kyiv → Lviv', totalDistance: 542.59, distanceQuality: 'road',
    waypoints: [
      { positionOrder: 0, name: '50.450, 30.524', latitude: 50.45, longitude: 30.524 },
      { positionOrder: 1, name: '49.842, 24.032', latitude: 49.842, longitude: 24.032 },
    ], createdAt: '2026-10-18T12:00:00Z', updatedAt: '2026-10-18T12:00:00Z' }
  await page.route('**/api/routes/992', r => r.fulfill({ json: route }))
  await page.route('**/api/routing/calculate', r => r.fulfill({ json: roadResult(542.59) }))
  await page.route('**/nominatim.openstreetmap.org/**', r => r.fulfill({ json: { address: { city: 'Mock City' } } }))
  await page.goto('/en/route-planner?routeId=992')
  await expect(page.getByRole('textbox', { name: /Waypoint 1: Mock City/ })).toBeVisible()
  await expect(page.locator('.trip-summary-chip time')).toHaveCount(0)
})
