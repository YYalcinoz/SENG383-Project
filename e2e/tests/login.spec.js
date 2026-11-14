import { expect, test } from '@playwright/test'

// Seed hesapları (server/scripts/seed.js); hepsinin şifresi password123
const PASSWORD = 'password123'

async function logIn(page, email, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

test('a parent logs in, sees only their own child and logs out (FR-M1-01, FR-M1-08)', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  await logIn(page, 'ayse@example.com')

  await expect(page).toHaveURL(/\/parent$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Ayşe Yılmaz' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Zeynep Yılmaz'])
  await expect(page.getByText('Ali Şahin')).toHaveCount(0)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem('helix.token'))).toBeNull()

  // Çıkıştan sonra korumalı sayfa yine login'e gönderir
  await page.goto('/parent')
  await expect(page).toHaveURL(/\/login$/)
})

test('a wrong password shows an error and does not log in (FR-M1-02)', async ({ page }) => {
  await page.goto('/login')

  await logIn(page, 'ayse@example.com', 'wrong-password')

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem('helix.token'))).toBeNull()
})

test('each role lands on its own home page (FR-M1-04, FR-M1-05)', async ({ page }) => {
  const cases = [
    { email: 'mehmet@example.com', url: /\/specialist$/, heading: 'Specialist home', child: 'Zeynep Yılmaz (teacher)' },
    { email: 'zeynep@example.com', url: /\/child$/, heading: 'Child home' },
  ]

  for (const { email, url, heading, child } of cases) {
    await page.goto('/login')
    await logIn(page, email)
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    if (child) await expect(page.getByRole('heading', { level: 3 })).toHaveText([child])
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  }
})

test('a child cannot open the parent pages (FR-M1-05)', async ({ page }) => {
  await page.goto('/login')
  await logIn(page, 'zeynep@example.com')
  await expect(page).toHaveURL(/\/child$/)

  await page.goto('/parent')

  await expect(page).toHaveURL(/\/child$/)
  await expect(page.getByRole('heading', { name: 'Child home' })).toBeVisible()
})

test('the session survives a page reload', async ({ page }) => {
  await page.goto('/login')
  await logIn(page, 'mehmet@example.com')
  await expect(page).toHaveURL(/\/specialist$/)

  await page.reload()

  await expect(page).toHaveURL(/\/specialist$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Mehmet Demir' })).toBeVisible()
})
