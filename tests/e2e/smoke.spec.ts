import { expect, test, type BrowserContext, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
})

async function enterHost(page: Page) {
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible()
}

async function joinPlayer(context: BrowserContext, roomCode: string, nickname: string) {
  const player = await context.newPage()
  await player.goto(`/join?room=${roomCode}`)
  await player.getByLabel('Nickname').fill(nickname)
  await player.getByRole('button', { name: 'Join game' }).click()
  await expect(player.getByRole('heading', { name: new RegExp(`You’re in, ${nickname}`) })).toBeVisible()
  return player
}

async function launchQuiz(page: Page, title: string) {
  const card = page.getByRole('article').filter({ hasText: title })
  await card.getByRole('button', { name: 'Launch game' }).click()
  await expect(page).toHaveURL(/\/host\/game\/.+\/control$/)
  const text = await page.locator('.controller-bar').textContent()
  const roomCode = text?.match(/Room\s+(\d{6})/)?.[1]
  if (!roomCode) throw new Error('Room code was not displayed')
  return roomCode
}

test('landing, joining validation and host guards work', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /live team quiz/i })).toBeVisible()
  await page.goto('/join?room=999999')
  await page.getByLabel('Nickname').fill('Browser Player')
  await page.getByRole('button', { name: 'Join game' }).click()
  await expect(page.getByText('We could not find that room.')).toBeVisible()
  await page.goto('/host/game/not-a-session/present')
  await expect(page.getByRole('heading', { name: 'Sign in to host' })).toBeVisible()
})

test('editor has six formats and persists a changed title', async ({ page }) => {
  await enterHost(page)
  const card = page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await card.getByRole('link', { name: 'Edit' }).click()
  for (const name of ['Single choice', 'Multiple select', 'True or false', 'Slider', 'Pinpoint', 'Mash-up']) {
    await expect(page.locator('.question-type-picker').getByRole('button', { name: new RegExp(name) })).toBeVisible()
  }
  const title = page.getByLabel('Quiz title')
  await title.fill('A Persisted Curious Crew')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Quiz title')).toHaveValue('A Persisted Curious Crew')
})

test('controller, presentation and three players complete every mixed format', async ({ context, page }) => {
  test.setTimeout(120_000)
  await enterHost(page)
  const roomCode = await launchQuiz(page, 'Katwed! Mixed Quiz')
  const presentation = await context.newPage()
  await presentation.goto(page.url().replace('/control', '/present'))
  await expect(presentation.getByText(roomCode)).toBeVisible()
  await expect(presentation.getByRole('button', { name: /Start game|Close answers|Reveal answer|Next question|Close room/ })).toHaveCount(0)

  const playerOne = await joinPlayer(context, roomCode, 'Quinn')
  const playerTwo = await joinPlayer(context, roomCode, 'Riley')
  const zeroScorePlayer = await joinPlayer(context, roomCode, 'A Long Zero Score Player')
  await expect(page.getByText('3 / 3').first()).toBeVisible()
  await page.getByRole('button', { name: 'Start game' }).click()

  async function revealRound(expectedReveal: RegExp) {
    const closeAnswers = page.getByRole('button', { name: 'Close answers early' })
    if (await closeAnswers.isVisible()) await closeAnswers.click()
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
    await expect(presentation.getByRole('heading', { name: 'Answers locked' })).toBeVisible()
    await page.getByRole('button', { name: 'Reveal answer' }).click()
    await expect(presentation.getByText(expectedReveal).first()).toBeVisible()
  }

  await playerOne.getByRole('button', { name: 'Mars' }).click()
  await playerOne.getByRole('button', { name: 'Lock in' }).click()
  await playerTwo.getByRole('button', { name: 'Venus' }).click()
  await playerTwo.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/Mars/)
  await expect(playerOne.getByRole('heading', { name: 'Mars' })).toBeVisible()
  await expect(playerOne.getByText('Iron minerals in the soil give Mars its rusty colour.')).toBeVisible()
  await expect(playerOne.getByText('The correct option is on the shared presentation.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await expect(presentation.locator('.leaderboard--presentation')).toBeVisible()
  await expect(presentation.locator('.leaderboard--presentation li').filter({ hasText: 'Quinn' })).toContainText('1,000 points')
  await expect(presentation.locator('.leaderboard--presentation li').filter({ hasText: 'A Long Zero Score Player' })).toContainText('0 points')
  await page.getByRole('button', { name: 'Next question' }).click()

  for (const option of ['Red', 'Green', 'Blue']) await playerOne.getByRole('button', { name: option }).click()
  await playerOne.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/Red.*Green.*Blue/)
  await expect(playerOne.getByText('Red', { exact: true })).toBeVisible()
  await expect(playerOne.getByText('Green', { exact: true })).toBeVisible()
  await expect(playerOne.getByText('Blue', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await page.getByRole('button', { name: 'Next question' }).click()

  await playerOne.getByRole('button', { name: 'True' }).click()
  await playerOne.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/True/)
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await page.getByRole('button', { name: 'Next question' }).click()

  const slider = playerOne.getByRole('slider')
  await slider.fill('1440')
  await playerOne.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/1,?440/)
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await page.getByRole('button', { name: 'Next question' }).click()

  await expect(presentation.getByTestId('pinpoint-correct-target')).toHaveCount(0)
  const target = playerOne.getByTestId('pinpoint-coordinate-layer')
  const box = await target.boundingBox()
  if (!box) throw new Error('Pinpoint image was not visible')
  await playerOne.mouse.click(box.x + box.width * .5, box.y + box.height * .43)
  await playerOne.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/target area|Correct answer/i)
  await expect(playerOne.getByTestId('pinpoint-player-marker')).toBeVisible()
  await expect(playerOne.getByTestId('pinpoint-correct-target')).toBeVisible()
  await expect(presentation.getByTestId('pinpoint-correct-target')).toBeVisible()
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await page.getByRole('button', { name: 'Next question' }).click()

  await playerOne.getByRole('button', { name: 'Alex' }).click()
  await playerOne.getByRole('button', { name: 'Bailey' }).click()
  await playerOne.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/Alex.*Bailey/)
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await page.getByRole('button', { name: 'Next question' }).click()

  await playerOne.getByRole('button', { name: 'A portrait' }).click()
  await playerOne.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/portrait/i)
  await expect(playerOne.getByRole('heading', { name: 'A portrait' })).toBeVisible()
  await expect(playerOne.getByText(/Your score:/)).toHaveCount(0)
  await expect(playerOne.getByText('Waiting for the next question…')).toHaveCount(0)
  await expect(playerOne.locator('.leaderboard')).toHaveCount(0)
  await expect(playerOne.getByText('Waiting for the host to reveal the final results.')).toBeVisible()
  await expect(presentation.locator('.leaderboard')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reveal final results' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show leaderboard' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish game' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reveal final results' }).click()
  await expect(presentation.getByRole('heading', { name: 'Final leaderboard' })).toBeVisible()
  await expect(playerOne.getByRole('heading', { name: 'Final scores' })).toBeVisible()
  await expect(zeroScorePlayer.getByRole('heading', { name: 'Final scores' })).toBeVisible()
  await expect(presentation.locator('.leaderboard li').filter({ hasText: 'Quinn' })).toContainText('6,001')
})

test('mash-up remains usable at representative mobile widths', async ({ context, page }) => {
  await enterHost(page)
  const roomCode = await launchQuiz(page, 'The Curious Crew')
  const player = await joinPlayer(context, roomCode, 'Mobile Player')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(player.getByRole('heading', { name: 'Select exactly 2 people' })).toBeVisible()
  for (const width of [320, 375, 390, 430]) {
    await player.setViewportSize({ width, height: 760 })
    const bodyBox = await player.locator('body').boundingBox()
    expect(bodyBox?.width).toBeLessThanOrEqual(width)
    await expect(player.getByRole('button', { name: 'Lock in' })).toBeVisible()
  }
  await player.getByRole('button', { name: 'Alex' }).click()
  await player.getByRole('button', { name: 'Bailey' }).click()
  await expect(player.getByRole('button', { name: 'Lock in' })).toBeEnabled()
})
