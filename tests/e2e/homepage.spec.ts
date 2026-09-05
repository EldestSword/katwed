import { expect, test } from '@playwright/test'

test('homepage is contained at phone and desktop widths and its example preserves the join draft', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--landing/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bring your')
  const code = page.getByRole('textbox', { name: 'Room code' })
  await code.fill('654321')
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => {
      const view = globalThis as unknown as { innerWidth: number; document: { documentElement: { scrollWidth: number } } }
      return view.document.documentElement.scrollWidth <= view.innerWidth
    })).toBe(true)
    for (const selector of ['.kw-join input', '.kw-join button', '.kw-preview-button', '.kw-stage', '.kw-mode']) {
      const nodes = page.locator(selector)
      for (let i = 0; i < await nodes.count(); i++) {
        const box = await nodes.nth(i).boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
      }
    }
  }
  await page.getByRole('button', { name: 'Reveal next clue' }).click()
  await expect(page.getByText('Earth', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal next clue' }).click()
  await page.getByRole('button', { name: 'Show connection' }).click()
  await expect(page.getByText('Planets', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Earth', { exact: true })).toHaveCount(0)
  await expect(code).toHaveValue('654321')
})

test('homepage validates codes and does not carry its dark shell into the join page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter the six-digit room code.')
  await expect(page.getByRole('textbox', { name: 'Room code' })).toBeFocused()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(/\/join$/)
  await expect(page.locator('.app-shell')).not.toHaveClass(/app-shell--landing/)
  await expect(page.locator('.kw-home')).toHaveCount(0)
})
