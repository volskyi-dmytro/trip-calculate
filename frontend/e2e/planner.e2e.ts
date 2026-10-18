import { test, expect, type Page } from '@playwright/test'
import { mockPlaces, openPlannerManual, roadResult } from './helpers'

/** Places Kyiv -> Lviv through the real combobox flow (Nominatim stubbed). */
async function placeTwo(page: Page) {
  for (const [name, q] of [['Start', 'kyiv'], ['Destination', 'lviv']] as const) {
    await page.getByRole('combobox', { name }).fill(q)
    await page.getByRole('option').first().click()
    await expect(page.getByRole('combobox', { name })).toHaveValue(q === 'kyiv' ? 'Kyiv' : 'Lviv')
  }
}
const save = (page: Page) => page.getByRole('button', { name: 'Save route' }).first()
const share = (page: Page) => page.getByRole('button', { name: 'Share receipt' }).first()

test.describe('C: planner behaviour (LOCAL, routing responses SIMULATED)', () => {
  test.beforeEach(async ({ page }) => { await mockPlaces(page) })

  test('C02 multi-waypoint: add a stop, reorder with swap, delete a stop', async ({ page }) => {
    await page.route('**/api/routing/calculate', r => r.fulfill({ json: roadResult(700) }))
    await openPlannerManual(page)
    await placeTwo(page)
    await expect(page.getByText('Waypoints (2)')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Add manually' }).click()
    const manual = page.getByPlaceholder(/e\.g\., Lviv/)
    await manual.fill('zhytomyr'); await manual.press('Enter')
    await expect(page.getByText('Waypoints (3)')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /^Swap start and destination/ }).click()
    await expect(page.getByLabel(/^Waypoint 1:/)).toHaveAttribute('aria-label', /Waypoint 1: Zhytomyr/)
    await page.getByRole('button', { name: /^Delete waypoint 2/ }).click()
    await expect(page.getByText('Waypoints (2)')).toBeVisible()
  })

  test('C06 rapid edits: the latest request wins over a slower, older response', async ({ page }) => {
    let n = 0
    await page.route('**/api/routing/calculate', async r => {
      const mine = ++n
      if (mine === 1) { await new Promise(res => setTimeout(res, 4000)); return r.fulfill({ json: roadResult(111) }) }
      return r.fulfill({ json: roadResult(222) })
    })
    await openPlannerManual(page)
    await placeTwo(page)
    await page.getByRole('button', { name: /^Swap start and destination/ }).click()
    await page.waitForTimeout(6500) // let the slow first response arrive after the newer one
    await expect(page.locator('body')).toContainText('222 km')
    await expect(page.locator('body')).not.toContainText('111 km')
    console.log('C06 routing calls:', n)
  })

  test('C08 slow routing disables save/share until it resolves (8 s delay, SIMULATED)', async ({ page }) => {
    await page.route('**/api/routing/calculate', async r => { await new Promise(res => setTimeout(res, 8000)); return r.fulfill({ json: roadResult(540) }) })
    await openPlannerManual(page)
    await placeTwo(page)
    await expect(save(page)).toBeDisabled()
    await expect(share(page)).toBeDisabled()
    await expect(save(page)).toBeEnabled({ timeout: 20000 })
    await expect(share(page)).toBeEnabled()
  })

  test('C08 explicit no-route keeps save and share unavailable (SIMULATED)', async ({ page }) => {
    await page.route('**/api/routing/calculate', r => r.fulfill({ json: { quality: 'unavailable', noRoute: true, totalDistance: 0, totalDuration: 0, segments: [], geometry: [] } }))
    await openPlannerManual(page)
    await placeTwo(page)
    const notice = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: 'No driving route' })
    await expect(notice).toBeVisible({ timeout: 15000 })
    await expect(notice).toContainText('Kyiv')
    await page.screenshot({ path: 'e2e/.results/C08-no-route.png' })
    await notice.getByRole('button', { name: 'OK' }).click()
    // No receipt or save can be produced from a missing route: the controls are absent or disabled.
    for (const b of [save(page), share(page)]) {
      if (await b.count()) await expect(b).toBeDisabled()
    }
    await expect(page.locator('body')).not.toContainText(/UAH [\d,]+\.\d\d/)
  })

  test('C09 a pending edit blocks opening save and receipt (3 s delay on the second calculation, SIMULATED)', async ({ page }) => {
    let n = 0
    await page.route('**/api/routing/calculate', async r => {
      if (++n >= 2) await new Promise(res => setTimeout(res, 3000))
      return r.fulfill({ json: roadResult(540) })
    })
    await openPlannerManual(page)
    await placeTwo(page)
    await expect(save(page)).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /^Swap start and destination/ }).click() // pending edit
    await expect(save(page)).toBeDisabled()
    await expect(share(page)).toBeDisabled()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(save(page)).toBeEnabled({ timeout: 10000 })
  })
})
