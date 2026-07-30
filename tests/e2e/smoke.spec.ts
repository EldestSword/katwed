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

test('direct routes, host guards and editor persistence work', async ({ page }) => {
  await page.goto('/play/999999')
  await expect(page.getByRole('heading', { name: 'Room not found' })).toBeVisible()
  await page.goto('/host/quizzes/not-a-quiz/edit')
  await expect(page.getByRole('heading', { name: 'Sign in to host' })).toBeVisible()
  await page.goto('/not-a-route')
  await expect(page.getByRole('heading', { name: 'This face doesn’t ring a bell' })).toBeVisible()

  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await page.getByRole('link', { name: 'Edit' }).click()
  const title = page.getByLabel('Quiz title')
  await title.fill('A Persisted Curious Crew')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: 'All quizzes' }).click()
  await expect(title).toHaveValue('A Persisted Curious Crew')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Quiz title')).toHaveValue('A Persisted Curious Crew')
})

test('a complete demo game keeps exact-pair scoring and reconnect state across tabs', async ({ context, page }) => {
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible()
  await page.getByRole('button', { name: 'Launch game' }).click()
  const roomCode = (await page.locator('.join-panel h1').textContent())?.trim()
  expect(roomCode).toMatch(/^\d{6}$/)
  if (!roomCode) throw new Error('Room code was not displayed')

  async function joinPlayer(nickname: string) {
    const player = await context.newPage()
    await player.goto(`/join?room=${roomCode}`)
    await player.getByLabel('Nickname').fill(nickname)
    await player.getByRole('button', { name: 'Join game' }).click()
    await expect(player.getByRole('heading', { name: /You’re in/ })).toBeVisible()
    const savedSession = await player.evaluate(
      (code) => localStorage.getItem(`katwed.player.${code}`),
      roomCode,
    )
    expect(savedSession).toBeTruthy()
    if (!savedSession) throw new Error('Player reconnect session was not stored')
    return { player, savedSession }
  }

  const quinn = await joinPlayer('Quinn')
  const riley = await joinPlayer('Riley')
  const sam = await joinPlayer('Sam')
  await expect(page.getByText('3 players joined')).toBeVisible()

  const duplicate = await context.newPage()
  await duplicate.goto(`/join?room=${roomCode}`)
  await duplicate.getByLabel('Nickname').fill('qUiNn')
  await duplicate.getByRole('button', { name: 'Join game' }).click()
  await expect(duplicate.getByText('That nickname is already in this game.')).toBeVisible()
  await duplicate.close()

  await sam.player.close()
  await expect(
    page.locator('.player-chips li').filter({ hasText: 'Sam' }).getByLabel('disconnected'),
  ).toBeVisible()
  const reconnectedSam = await context.newPage()
  await reconnectedSam.goto('/')
  await reconnectedSam.evaluate(
    ([code, saved]) => localStorage.setItem(`katwed.player.${code}`, saved),
    [roomCode, sam.savedSession] as const,
  )
  await reconnectedSam.goto(`/play/${roomCode}`)
  await expect(reconnectedSam.getByRole('heading', { name: /You’re in, Sam/ })).toBeVisible()
  await expect(
    page.locator('.player-chips li').filter({ hasText: 'Sam' }).getByLabel('connected'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(quinn.player.getByRole('heading', { name: 'Select exactly 2 people' })).toBeVisible()
  const quinnLock = quinn.player.getByRole('button', { name: 'Lock in' })
  await expect(quinnLock).toBeDisabled()
  await quinn.player.getByRole('button', { name: 'Bailey' }).click()
  await expect(quinnLock).toBeDisabled()
  await quinn.player.getByRole('button', { name: 'Alex' }).click()
  await expect(quinnLock).toBeEnabled()
  await quinn.player.getByRole('button', { name: 'Casey' }).click()
  await expect(quinn.player.getByRole('button', { name: 'Casey' })).toHaveAttribute('aria-pressed', 'false')
  await expect(quinn.player.getByText(/Two selected already/)).toBeVisible()
  await quinn.player.getByRole('button', { name: 'Bailey' }).click()
  await expect(quinnLock).toBeDisabled()
  await quinn.player.getByRole('button', { name: 'Bailey' }).click()
  await quinnLock.click()
  await expect(quinn.player.getByRole('heading', { name: 'Answer locked in' })).toBeVisible()
  await expect(quinn.player.getByText(/Your choices are safely tucked away/)).toBeVisible()
  await expect(quinn.player.getByText(/The curious combination was/)).toHaveCount(0)

  await riley.player.getByRole('button', { name: 'Alex' }).click()
  await riley.player.getByRole('button', { name: 'Casey' }).click()
  await riley.player.getByRole('button', { name: 'Lock in' }).click()
  await expect(riley.player.getByRole('heading', { name: 'Answer locked in' })).toBeVisible()
  await expect(page.getByText('2 / 3')).toBeVisible()

  await quinn.player.evaluate(
    ([code, saved]) => localStorage.setItem(`katwed.player.${code}`, saved),
    [roomCode, quinn.savedSession] as const,
  )
  await quinn.player.reload()
  await expect(quinn.player.getByRole('heading', { name: 'Answer locked in' })).toBeVisible()
  await expect(quinn.player.locator('.locked-pair')).toContainText('Alex')
  await expect(quinn.player.locator('.locked-pair')).toContainText('Bailey')

  await page.getByRole('button', { name: 'Close answers early' }).click()
  await expect(reconnectedSam.getByRole('heading', { name: 'Answers locked' })).toBeVisible()
  await expect(reconnectedSam.getByRole('button', { name: 'Lock in' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reveal the pair' }).click()
  await expect(quinn.player.getByRole('heading', { name: /Alex.*Bailey/ })).toBeVisible()
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await expect(page.locator('.leaderboard li').filter({ hasText: 'Quinn' })).toContainText('1 point')
  await expect(page.locator('.leaderboard li').filter({ hasText: 'Riley' })).toContainText('0 points')

  const questions = [
    { correct: ['Casey', 'Ellis'], wrong: ['Casey', 'Drew'] },
    { correct: ['Morgan', 'Drew'], wrong: ['Alex', 'Bailey'] },
  ] as const
  for (const [index, choices] of questions.entries()) {
    await page.getByRole('button', { name: 'Next question' }).click()
    await expect(quinn.player.getByText(`Question ${index + 2} of 3`)).toBeVisible()
    for (const name of choices.correct) await quinn.player.getByRole('button', { name }).click()
    await quinn.player.getByRole('button', { name: 'Lock in' }).click()
    for (const name of choices.wrong) await riley.player.getByRole('button', { name }).click()
    await riley.player.getByRole('button', { name: 'Lock in' }).click()
    await expect(page.getByText('2 / 3')).toBeVisible()
    await page.getByRole('button', { name: 'Close answers early' }).click()
    await page.getByRole('button', { name: 'Reveal the pair' }).click()
    await page.getByRole('button', { name: 'Show leaderboard' }).click()
  }

  await page.getByRole('button', { name: 'Finish game' }).click()
  await expect(page.getByRole('heading', { name: 'Final leaderboard' })).toBeVisible()
  await expect(page.locator('.leaderboard li').filter({ hasText: 'Quinn' })).toContainText('3 points')
  const finalNames = await page.locator('.leaderboard li strong').allTextContents()
  expect(finalNames).toEqual(['Quinn', 'Riley', 'Sam'])

  await page.getByRole('button', { name: 'Restart quiz' }).click()
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close room' }).click()
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible()
  await quinn.player.reload()
  await expect(quinn.player.getByRole('heading', { name: 'This room has closed' })).toBeVisible()
})

test('the player question stays usable at representative mobile widths', async ({ context, page }) => {
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible()
  await page.evaluate(() => {
    const raw = localStorage.getItem('katwed.demo.state.v1')
    if (!raw) throw new Error('Demo state was not initialised')
    const state = JSON.parse(raw) as {
      quizzes: Array<{ roster: Array<{ id: string; displayName: string }> }>
    }
    const member = state.quizzes[0]?.roster.find((candidate) => candidate.id === 'member-morgan')
    if (member) member.displayName = 'Morgan With A Surprisingly Long Name'
    localStorage.setItem('katwed.demo.state.v1', JSON.stringify(state))
  })
  await page.getByRole('button', { name: 'Launch game' }).click()
  const roomCode = (await page.locator('.join-panel h1').textContent())?.trim()
  if (!roomCode) throw new Error('Room code was not displayed')

  const player = await context.newPage()
  await player.goto(`/join?room=${roomCode}`)
  await player.getByLabel('Nickname').fill('Mobile Player')
  await player.getByRole('button', { name: 'Join game' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(player.getByRole('heading', { name: 'Select exactly 2 people' })).toBeVisible()

  for (const width of [320, 375, 390, 430]) {
    await player.setViewportSize({ width, height: 760 })
    const bodyBox = await player.locator('body').boundingBox()
    const imageBox = await player.locator('.portrait-frame').boundingBox()
    const timerBox = await player.locator('.timer').boundingBox()
    const choiceBoxes = await Promise.all(
      (await player.locator('.roster-choice').all()).map((choice) => choice.boundingBox()),
    )
    expect(bodyBox?.width).toBeLessThanOrEqual(width)
    expect(imageBox?.height).toBeGreaterThan(150)
    expect(timerBox?.x).toBeGreaterThanOrEqual(0)
    expect((timerBox?.x ?? width) + (timerBox?.width ?? 0)).toBeLessThanOrEqual(width)
    expect(Math.min(...choiceBoxes.map((box) => box?.height ?? 0))).toBeGreaterThanOrEqual(48)
  }

  await expect(player.getByRole('button', { name: 'Morgan With A Surprisingly Long Name' })).toBeVisible()
  await player.getByRole('button', { name: 'Alex' }).click()
  await player.getByRole('button', { name: 'Bailey' }).click()
  const lock = player.getByRole('button', { name: 'Lock in' })
  await lock.scrollIntoViewIfNeeded()
  await expect(lock).toBeVisible()
  await expect(lock).toBeEnabled()
})
