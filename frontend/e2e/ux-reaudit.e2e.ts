import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { KYIV_LVIV, roadResult } from './helpers'

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
        for (const link of await page.locator('footer a, .breadcrumb a').all()) {
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
