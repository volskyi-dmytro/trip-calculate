import { test, expect } from '@playwright/test'
import { getTranslation } from '../src/i18n/routePlanner'
import { mockPlaces } from './helpers'

const en = getTranslation('en')

// calculate -> save -> reload -> update -> conflict, as one user journey.
test('acceptance: calculate, save, reload, update, conflict (real local routing; conflict SIMULATED)', async ({ page, request }) => {
  await mockPlaces(page) // only geocoding is stubbed; routing and persistence are real
  const writes: string[] = []
  page.on('request', r => { if (/\/api\/routes(\/\d+)?$/.test(r.url()) && ['POST', 'PUT'].includes(r.method())) writes.push(`${r.method()} ${new URL(r.url()).pathname}`) })

  await page.goto('/en/route-planner')
  await page.getByRole('button', { name: /set it up manually/i }).click()
  for (const [name, q, val] of [['Start', 'kyiv', 'Kyiv'], ['Destination', 'lviv', 'Lviv']] as const) {
    await page.getByRole('combobox', { name }).fill(q); await page.getByRole('option').first().click()
    await expect(page.getByRole('combobox', { name })).toHaveValue(val)
  }
  // calculate: a real road estimate appears
  const savebtn = page.getByRole('button', { name: 'Save route' }).first()
  await expect(savebtn).toBeEnabled({ timeout: 30000 })
  await expect(page.locator('body')).toContainText(/\d{3} km/)

  // save (one deliberate click = one POST)
  const name = `QA-ACCEPT-${Date.now()}`
  await savebtn.click()
  await page.locator('#route-name').fill(name)
  await page.getByRole('button', { name: en.buttons.save, exact: true }).click()
  await expect.poll(() => writes.filter(w => w.startsWith('POST')).length, { timeout: 30000 }).toBe(1)
  // The request event fires on send; wait until the server has actually stored the record.
  const list = async () => (await (await request.get('/api/routes')).json()) as { id: number; name: string }[]
  await expect.poll(async () => (await list()).some(r => r.name === name), { timeout: 20000 }).toBe(true)
  const saved = (await list()).find(r => r.name === name)!

  // reload and open the saved record through the Load dialog
  await page.reload()
  await page.getByRole('button', { name: /set it up manually/i }).click()
  await page.getByRole('button', { name: 'Load route' }).click()
  const row = page.locator('div.justify-between', { has: page.locator('h3', { hasText: name }) })
  await row.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Update route' })).toBeVisible({ timeout: 20000 })

  // update (PUT to the same id, no second record)
  await page.getByRole('button', { name: 'Update route' }).click()
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled({ timeout: 30000 })
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  await expect.poll(() => writes.filter(w => w.startsWith('PUT')).length, { timeout: 30000 }).toBe(1)
  expect(writes.find(w => w.startsWith('PUT'))).toBe(`PUT /api/routes/${saved.id}`)
  await page.waitForTimeout(1000) // let the update land before checking for stray records
  expect((await list()).filter(r => r.name === name)).toHaveLength(1)

  // conflict: the next update is answered 409 ROUTE_CHANGED -> message, no retry, no extra record
  await page.route(/\/api\/routes\/\d+$/, r => r.request().method() === 'PUT' ? r.fulfill({ status: 409, contentType: 'text/plain', body: 'ROUTE_CHANGED' }) : r.fallback())
  await page.waitForTimeout(1500) // respect the per-user save limiter
  await page.getByRole('button', { name: 'Update route' }).click()
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled({ timeout: 30000 })
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(page.getByText(en.toasts.routeChanged).first()).toBeVisible()
  await page.waitForTimeout(1500)
  expect(writes.filter(w => w.startsWith('PUT'))).toHaveLength(2)
  expect(writes.filter(w => w.startsWith('POST'))).toHaveLength(1)
  console.log('ACCEPTANCE writes:', writes.join(' | '))
})
