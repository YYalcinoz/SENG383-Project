import { expect, test } from '@playwright/test'

// Seed accounts (server/scripts/seed.js); all of them use password123.
// This test changes shared data, so it uses accounts no other test relies on:
// Fatma (parent), her child Ali and the specialist Elif, who starts with no links.
// It removes the link again at the end, and afterEach removes it even if a step fails.
const PASSWORD = 'password123'
const PARENT = 'fatma@example.com'
const SPECIALIST = 'elif@example.com'

async function logIn(page, email) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

// The card of one child on a home page (the article is labelled by the child's heading)
const childCard = (page, name) => page.getByRole('article', { name })

// Calls the API with the token the app stored at login, like the app itself would
async function apiStatus(page, path) {
  return page.evaluate(async (url) => {
    const token = localStorage.getItem('helix.token')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    return res.status
  }, path)
}

let aliId

test.afterEach(async ({ request }) => {
  if (!aliId) return
  // Safety net for the shared database: unlink Elif if a failed step left her linked
  const login = await request.post('/api/auth/login', { data: { email: PARENT, password: PASSWORD } })
  const { token } = await login.json()
  const headers = { Authorization: `Bearer ${token}` }
  const list = await (await request.get(`/api/children/${aliId}/specialists`, { headers })).json()
  const elif = list.specialists.find((s) => s.name === 'Elif Arslan')
  if (elif) await request.delete(`/api/children/${aliId}/specialists/${elif.id}`, { headers })
})

test('Flow 1: a parent links a specialist, the specialist sees the child, and loses access after unlinking (FR-M2-01, FR-M2-03, FR-M2-04, FR-M2-06, FR-M2-07, FR-M2-08)', async ({
  browser,
}) => {
  // Two separate browser sessions, so Elif keeps her login (and her JWT) while Fatma unlinks her
  const parentContext = await browser.newContext()
  const specialistContext = await browser.newContext()
  const parent = await parentContext.newPage()
  const specialist = await specialistContext.newPage()

  try {
    await test.step('before the link, Elif has no children', async () => {
      await logIn(specialist, SPECIALIST)
      await expect(specialist).toHaveURL(/\/specialist$/)
      await expect(specialist.getByText('No children are linked to you yet.', { exact: false })).toBeVisible()
    })

    await test.step("Fatma opens Ali's specialists page", async () => {
      await logIn(parent, PARENT)
      await expect(parent).toHaveURL(/\/parent$/)
      await childCard(parent, 'Ali Şahin').getByRole('link', { name: 'Specialists' }).click()
      await expect(parent).toHaveURL(/\/parent\/children\/\d+\/specialists$/)
      aliId = parent.url().match(/children\/(\d+)\//)[1]
      await expect(parent.getByRole('heading', { name: 'Ali Şahin' })).toBeVisible()
      await expect(parent.getByText('No specialists are linked to Ali Şahin yet.')).toBeVisible()
    })

    await test.step('FR-M2-01, FR-M2-03: Fatma links Elif and sees her in the list with her type', async () => {
      await parent.getByLabel('Specialist email').fill(SPECIALIST)
      await parent.getByLabel('Specialist type').selectOption('coach')
      await parent.getByRole('button', { name: 'Link specialist' }).click()

      await expect(parent.getByRole('status')).toHaveText('Elif Arslan is now linked as coach.')
      await expect(parent.getByRole('listitem').filter({ hasText: 'Elif Arslan' })).toContainText('(coach)')
    })

    await test.step("FR-M2-06, FR-M2-07: Elif sees Ali on her home page and opens his records", async () => {
      await specialist.reload()
      await expect(childCard(specialist, 'Ali Şahin (coach)')).toBeVisible()

      await childCard(specialist, 'Ali Şahin (coach)').getByRole('link', { name: 'Tasks' }).click()
      await expect(specialist).toHaveURL(new RegExp(`/specialist/children/${aliId}/tasks$`))
      await expect(specialist.getByRole('heading', { name: 'Ali Şahin' })).toBeVisible()
      expect(await apiStatus(specialist, `/api/children/${aliId}/tasks`)).toBe(200)
    })

    await test.step('FR-M2-04: Fatma unlinks Elif after the confirmation step', async () => {
      await parent.getByRole('button', { name: 'Unlink Elif Arslan' }).click()
      await parent.getByRole('button', { name: 'Yes, unlink' }).click()
      await expect(parent.getByRole('status')).toHaveText('Elif Arslan is no longer linked.')
      await expect(parent.getByText('No specialists are linked to Ali Şahin yet.')).toBeVisible()
    })

    await test.step('FR-M2-08: with her still valid JWT, Elif is rejected by the API', async () => {
      expect(await apiStatus(specialist, `/api/children/${aliId}/tasks`)).toBe(403)
      expect(await apiStatus(specialist, `/api/children/${aliId}/schedule`)).toBe(403)
    })

    await test.step("the app no longer shows Elif Ali's records or lists Ali on her home page", async () => {
      await specialist.reload()
      await expect(specialist.getByRole('alert')).toHaveText('Child not found')
      await specialist.goto('/specialist')
      await expect(specialist.getByText('No children are linked to you yet.', { exact: false })).toBeVisible()
      await expect(childCard(specialist, 'Ali Şahin (coach)')).toHaveCount(0)
    })
  } finally {
    // Closed even when a step fails, so no browser session is left open
    await parentContext.close()
    await specialistContext.close()
  }
})
