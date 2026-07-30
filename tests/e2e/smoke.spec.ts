import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('landing and joining validation work', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /team portrait quiz/i })).toBeVisible()
  await page.getByRole('button', { name: 'Join game' }).click()
  await expect(page.getByText('Enter the six-digit room code.')).toBeVisible()
  await page.goto('/join?room=999999')
  await page.getByLabel('Nickname').fill('Browser Player')
  await page.getByRole('button', { name: 'Join game' }).click()
  await expect(page.getByText('We could not find that room.')).toBeVisible()
})

test('host and player can enter the first live question across tabs', async ({ context, page }) => {
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible()
  await page.getByRole('button', { name: 'Launch game' }).click()
  const roomCode = (await page.locator('.join-panel h1').textContent())?.trim()
  expect(roomCode).toMatch(/^\d{6}$/)

  const player = await context.newPage()
  await player.goto(`/join?room=${roomCode}`)
  await player.getByLabel('Nickname').fill('Browser Player')
  await player.getByRole('button', { name: 'Join game' }).click()
  await expect(player.getByRole('heading', { name: /You’re in/ })).toBeVisible()
  await expect(page.getByText('Browser Player')).toBeVisible()

  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(player.getByRole('heading', { name: 'Select exactly 2 people' })).toBeVisible()
  await player.getByRole('button', { name: 'Alex' }).click()
  await player.getByRole('button', { name: 'Bailey' }).click()
  await expect(player.getByRole('button', { name: 'Lock in' })).toBeEnabled()
  await player.getByRole('button', { name: 'Lock in' }).click()
  await expect(player.getByRole('heading', { name: 'Answer locked in' })).toBeVisible()
})
