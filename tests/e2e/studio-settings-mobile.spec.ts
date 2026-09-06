import { expect, test } from '@playwright/test'

test('Quiz Settings stays fully reachable on a short phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('heading', { name: 'Quizzes', exact: true })).toBeVisible()

  await page.getByRole('article', { name: 'The Curious Crew' }).getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Quiz settings' }).click()

  const dialog = page.getByRole('dialog', { name: 'Quiz settings' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /^People bank/ }).click()
  await expect(dialog.getByRole('region', { name: 'Manage the mash-up cast' })).toBeVisible()

  const geometry = await dialog.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: style.overflowY,
    }
  })

  expect(geometry.overflowY).toBe('auto')
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight)

  const done = dialog.getByRole('button', { name: 'Done' })
  await done.scrollIntoViewIfNeeded()
  await expect(done).toBeVisible()
  await done.click()
  await expect(dialog).toHaveCount(0)
})
