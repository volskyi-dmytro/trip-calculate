import { test, expect } from '@playwright/test'
import { mockNominatim, openPlannerManual, seedRoute } from './helpers'

test.describe('F1-F6 in a real browser (LOCAL)', () => {
  test('F1 decimal comma is accepted in the quick calculator', async ({ page }) => {
    await page.goto('/en')
    const d = page.locator('#quick-distance')
    await d.fill('10,5'); await d.blur()
    await expect(d).toHaveValue('10.5')
    await d.fill('10,5ab')
    await expect(d).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert').filter({ hasText: /Enter a number/ }).first()).toBeVisible()
  })

  test('F2 suggestions: combobox roles, arrows, Enter selects highlighted', async ({ page }) => {
    await mockNominatim(page, [
      { lat: '49.0', lon: '25.0', name: 'Ternopil Oblast', addresstype: 'state', display_name: 'Ternopil Oblast, Ukraine' },
      { lat: '49.55', lon: '25.59', name: 'Ternopil', addresstype: 'city', display_name: 'Ternopil, Ukraine' },
    ])
    await openPlannerManual(page)
    const start = page.getByRole('combobox', { name: 'Start' })
    await start.fill('Ternopil')
    const list = page.getByRole('listbox')
    await expect(list.getByRole('option')).toHaveCount(2)
    await start.press('ArrowDown'); await start.press('ArrowDown')
    await expect(list.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    await start.press('Enter')
    await expect(list).toBeHidden()
    await expect(start).toHaveValue('Ternopil')
  })

  test('F3 load from dialog then save updates the same record', async ({ page, request }) => {
    const before = await seedRoute(request)
    const posts: string[] = [], puts: string[] = []
    page.on('request', r => { if (r.url().endsWith('/api/routes') && r.method() === 'POST') posts.push(r.url()); if (/\/api\/routes\/\d+$/.test(r.url()) && r.method() === 'PUT') puts.push(r.url()) })
    await openPlannerManual(page)
    await page.getByRole('button', { name: 'Load route' }).click()
    await page.getByRole('button', { name: 'Load', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Update route' })).toBeVisible()
    await page.getByRole('button', { name: 'Update route' }).click()
    await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled({ timeout: 20000 })
    await page.getByRole('button', { name: 'Update', exact: true }).click()
    await expect.poll(() => puts.length, { timeout: 20000 }).toBe(1)
    expect(posts).toHaveLength(0)
    const list = await (await request.get('/api/routes')).json() as { id: number }[]
    expect(list.filter(r => r.id === before.id)).toHaveLength(1)
  })

  test('F4 timestamps carry an offset and read "just now" in UTC+3', async ({ browser, request }) => {
    const r = await seedRoute(request)
    expect(r.createdAt).toMatch(/(Z|[+-]\d\d:\d\d)$/)
    const ctx = await browser.newContext({ timezoneId: 'Europe/Kyiv', baseURL: 'http://localhost:3000' })
    const page = await ctx.newPage()
    await page.goto('/en/dashboard')
    await expect(page.locator('body')).not.toContainText(/3 hours ago/)
    await ctx.close()
  })

  test('F5 admin API: 403 for signed-in non-admin, 404 for unknown', async ({ request }) => {
    expect((await request.get('/api/admin/users')).status()).toBe(403)
    expect((await request.get('/api/admin/stats')).status()).toBe(403)
    expect((await request.get('/api/qa-nonexistent-path')).status()).toBe(404)
  })

  test('F6 Ukrainian: litre unit is "л" on the planner summary', async ({ page, request }) => {
    await seedRoute(request)
    await openPlannerManual(page, '/uk/route-planner')
    await page.getByRole('button', { name: /Завантажити маршрут/ }).click()
    await page.getByRole('button', { name: 'Завантажити', exact: true }).first().click()
    await expect(page.locator('body')).toContainText('/\u043b', { timeout: 20000 })
    await expect(page.locator('body')).not.toContainText(/\/L\b/)
  })
})
