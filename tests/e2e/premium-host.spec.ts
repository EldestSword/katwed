import { expect, test } from '@playwright/test'

/**
 * Visual/interaction smoke coverage for the combined premium pass. Detailed
 * gameplay correctness stays in the existing host/player suites.
 */
test('premium homepage presents the whole platform and corrected branding', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Bring your A-game/i })).toBeVisible()
  await expect(page.getByText('10 question formats')).toBeVisible()
  await expect(page.locator('.brand-mark__kat').first()).toHaveText('Ka')
  await expect(page.locator('.brand-mark__wed').first()).toHaveText('twed')
})

test('premium editor keeps one question settings section focused', async ({ page }) => {
  await page.goto('/host')
  const demo = page.getByRole('button', { name: /Enter demo host area/i })
  if (await demo.isVisible().catch(() => false)) await demo.click()
  const edit = page.getByRole('link', { name: /Edit/i }).first()
  await edit.click()
  const sections = page.locator('details.question-settings-group')
  await expect(sections.first()).toHaveAttribute('open', '')
  if (await sections.count() > 1) {
    await sections.nth(1).locator('summary').click()
    await expect(sections.nth(1)).toHaveAttribute('open', '')
    await expect(sections.first()).not.toHaveAttribute('open', '')
  }
})
