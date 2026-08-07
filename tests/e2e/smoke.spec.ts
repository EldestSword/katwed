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

test('quiz covers persist across the library lifecycle and remain independent after duplication', async ({ page }) => {
  test.setTimeout(60_000)
  await enterHost(page)
  await page.getByRole('button', { name: '+ Create quiz' }).click()
  await page.getByLabel('Quiz title').fill('Cover lifecycle quiz')

  const coverSection = page.getByRole('region', { name: 'Quiz cover' })
  await expect(coverSection.getByText('No cover selected')).toBeVisible()
  await coverSection.getByLabel('Choose cover').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(coverSection.locator('img')).toBeVisible()
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')

  const card = (title: string) => page.getByRole('article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
  await expect(card('Cover lifecycle quiz').locator('.quiz-card__cover')).toBeVisible()

  await card('Cover lifecycle quiz').getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByRole('region', { name: 'Quiz cover' }).locator('img')).toBeVisible()
  await page.goto('/host')
  await card('Cover lifecycle quiz').getByRole('button', { name: 'Duplicate' }).click()

  await expect(page.getByLabel('Quiz title')).toHaveValue('Cover lifecycle quiz (Copy)')
  await expect(page.getByRole('region', { name: 'Quiz cover' }).locator('img')).toBeVisible()
  await page.getByRole('region', { name: 'Quiz cover' }).getByRole('button', { name: 'Remove cover' }).click()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')

  await expect(card('Cover lifecycle quiz').locator('.quiz-card__cover')).toBeVisible()
  await expect(card('Cover lifecycle quiz (Copy)').locator('.quiz-card__cover')).toHaveCount(0)
  await expect(card('Cover lifecycle quiz (Copy)').locator('.quiz-card__art')).toContainText('0')

  await card('Cover lifecycle quiz').getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('tab', { name: /Archived quizzes/ }).click()
  await expect(card('Cover lifecycle quiz').locator('.quiz-card__cover')).toBeVisible()
  await card('Cover lifecycle quiz').getByRole('button', { name: 'Restore' }).click()
  await page.getByRole('tab', { name: /Active quizzes/ }).click()
  await expect(card('Cover lifecycle quiz').locator('.quiz-card__cover')).toBeVisible()
})

test('Storage Manager reviews and cleans a replaced Demo cover without removing the current cover', async ({ page }) => {
  test.setTimeout(60_000)
  const image = {
    name: 'storage-cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  }
  await enterHost(page)
  await page.getByRole('button', { name: '+ Create quiz' }).click()
  await page.getByLabel('Quiz title').fill('Storage lifecycle quiz')
  const cover = page.getByRole('region', { name: 'Quiz cover' })
  await cover.getByLabel('Choose cover').setInputFiles({ ...image, name: 'cover-a.png' })
  await expect(cover.locator('img')).toBeVisible()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()

  await cover.getByLabel('Replace cover').setInputFiles({ ...image, name: 'cover-b.png' })
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')
  const quizCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Storage lifecycle quiz', exact: true }),
  })
  await expect(quizCard.locator('.quiz-card__cover')).toBeVisible()
  await page.getByRole('link', { name: 'Storage' }).click()
  await expect(page).toHaveURL(/\/host\/storage$/)

  const summary = (label: string) => page.locator('.storage-summary-card').filter({
    has: page.getByRole('heading', { name: label, exact: true }),
  })
  await expect(summary('Total')).toContainText('2 images')
  await expect(summary('In use')).toContainText('1 image')
  await expect(summary('Unused')).toContainText('1 image')
  await expect(page.getByRole('heading', { name: 'Unused image', exact: true })).toHaveCount(0)
  await expect(page.getByText('Unused image', { exact: true })).toBeVisible()
  expect(await page.evaluate<boolean>(
    'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
  )).toBe(true)

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Katwed will re-check that these files are still unused before deleting them.')
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Clean up 1 unused image' }).click()
  await expect(page.getByText('1 image was removed.')).toBeVisible()
  await expect(summary('Unused')).toContainText('0 images')
  await expect(page.getByRole('heading', { name: 'No unused images' })).toBeVisible()

  await page.getByRole('link', { name: 'Your quizzes' }).click()
  await expect(quizCard.locator('.quiz-card__cover')).toBeVisible()
  await quizCard.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByRole('region', { name: 'Quiz cover' }).locator('img')).toBeVisible()
})

test('quiz library search, sorting and last-edited details work across views', async ({ page }) => {
  await enterHost(page)

  const activeTab = page.getByRole('tab', { name: /Active quizzes/ })
  const archivedTab = page.getByRole('tab', { name: /Archived quizzes/ })
  const search = page.getByRole('searchbox', { name: 'Search quizzes' })
  const sort = page.getByRole('combobox', { name: 'Sort quizzes' })

  await expect(activeTab).toHaveAttribute('aria-selected', 'true')
  await expect(search).toBeVisible()
  await expect(sort).toHaveValue('updated-desc')
  await expect(page.locator('.quiz-card__metadata')).toHaveCount(2)
  await expect(page.locator('.quiz-card__metadata').first()).toContainText(/^Last edited /)

  await search.fill('curious')
  await expect(page.getByRole('article', { name: 'The Curious Crew' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Clear search' }).click()
  await sort.selectOption({ label: 'Name A–Z' })
  await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toHaveText([
    'Katwed! Mixed Quiz',
    'The Curious Crew',
  ])

  await search.fill('curious')
  await page.getByRole('article', { name: 'The Curious Crew' }).getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByRole('heading', { name: 'No active quizzes match “curious”.' })).toBeVisible()
  await expect(search).toHaveValue('curious')
  await expect(sort).toHaveValue('title-asc')

  await archivedTab.click()
  await expect(page.getByRole('article', { name: 'The Curious Crew' })).toBeVisible()

  await search.fill('missing')
  await expect(page.getByRole('heading', { name: 'No archived quizzes match “missing”.' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).last().click()

  await activeTab.click()
  await expect(sort).toHaveValue('title-asc')
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
})

test('an active quiz duplicates into an independent new editor', async ({ page }) => {
  await enterHost(page)
  const sourceCard = page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await expect(sourceCard).toContainText('3 questions')
  await sourceCard.getByRole('button', { name: 'Duplicate' }).click()

  await expect(page).toHaveURL(/\/host\/quizzes\/(?!quiz-demo\/edit)[^/]+\/edit$/)
  await expect(page.getByLabel('Quiz title')).toHaveValue('The Curious Crew (Copy)')
  await expect(page.locator('.question-navigator ol > li')).toHaveCount(3)

  await page.getByLabel('Quiz title').fill('Independent Curious Copy')
  await page.getByLabel('Prompt').fill('A changed copy-only prompt')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')

  await expect(page.getByRole('heading', { name: 'The Curious Crew', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Independent Curious Copy', exact: true })).toBeVisible()
  const originalCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'The Curious Crew', exact: true }),
  })
  await expect(originalCard).toContainText('3 questions')
  await originalCard.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByLabel('Quiz title')).toHaveValue('The Curious Crew')
  await expect(page.getByLabel('Prompt')).toHaveValue('Who is in this mash-up?')
  await expect(page.locator('.question-navigator ol > li')).toHaveCount(3)
})

test('active and archived libraries preserve quiz content through archive and restore', async ({ page }) => {
  await enterHost(page)
  const activeTab = page.getByRole('tab', { name: /Active quizzes/ })
  const archivedTab = page.getByRole('tab', { name: /Archived quizzes/ })
  const activeCard = () => page.getByRole('article').filter({ hasText: 'The Curious Crew' })

  await expect(activeTab).toHaveAttribute('aria-selected', 'true')
  await expect(archivedTab).toHaveAttribute('aria-selected', 'false')
  await expect(activeCard()).toContainText('3 questions')
  await expect(activeCard().getByRole('button', { name: 'Launch game' })).toBeVisible()
  await expect(activeCard().getByRole('link', { name: 'Edit' })).toBeVisible()
  await expect(activeCard().getByRole('button', { name: 'Archive' })).toBeEnabled()
  await expect(activeCard().getByRole('button', { name: 'Permanently delete' })).toHaveCount(0)
  await activeCard().getByRole('button', { name: 'Archive' }).click()
  await expect(activeCard()).toHaveCount(0)

  await archivedTab.click()
  const archivedCard = () => page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await expect(archivedCard()).toBeVisible()
  await expect(archivedCard()).toContainText('3 questions')
  await expect(archivedCard().getByRole('button', { name: 'Restore' })).toBeVisible()
  await expect(archivedCard().getByRole('button', { name: 'Permanently delete' })).toBeVisible()
  await expect(archivedCard().getByRole('button', { name: /Launch game|Resume game/ })).toHaveCount(0)
  await expect(archivedCard().getByRole('link', { name: 'Edit' })).toHaveCount(0)
  await expect(archivedCard().getByRole('button', { name: /Duplicate/ })).toHaveCount(0)
  await archivedCard().getByRole('button', { name: 'Restore' }).click()
  await expect(archivedCard()).toHaveCount(0)

  await activeTab.click()
  await expect(activeCard()).toBeVisible()
  await expect(activeCard()).toContainText('3 questions')
  await activeCard().getByRole('button', { name: 'Launch game' }).click()
  await expect(page).toHaveURL(/\/host\/game\/.+\/control$/)
})

test('active room blocks archive until the host closes it', async ({ page }) => {
  await enterHost(page)
  await launchQuiz(page, 'The Curious Crew')
  const controllerUrl = page.url()

  await page.goto('/host')
  const card = page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await expect(card.getByRole('button', { name: 'Resume game' })).toBeVisible()
  const archive = card.getByRole('button', { name: 'Archive' })
  await expect(archive).toBeDisabled()
  await expect(archive).toHaveAttribute('title', 'Close the active game before archiving this quiz.')

  await page.goto(controllerUrl)
  page.once('dialog', async (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close room' }).click()
  await expect(page).toHaveURL(/\/host$/)
  await expect(card.getByRole('button', { name: 'Launch game' })).toBeVisible()
  await expect(archive).toBeEnabled()
  await archive.click()
  await page.getByRole('tab', { name: /Archived quizzes/ }).click()
  await expect(page.getByRole('article').filter({ hasText: 'The Curious Crew' })).toBeVisible()
})

test('permanent deletion uses a disposable archived quiz and survives reload', async ({ page }) => {
  await enterHost(page)
  await page.getByRole('button', { name: '+ Create quiz' }).click()
  await page.getByLabel('Quiz title').fill('Disposable release quiz')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')

  const activeCard = page.getByRole('article').filter({ hasText: 'Disposable release quiz' })
  await expect(activeCard).toBeVisible()
  await expect(activeCard.getByRole('button', { name: 'Permanently delete' })).toHaveCount(0)
  await activeCard.getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('tab', { name: /Archived quizzes/ }).click()

  const archivedCard = page.getByRole('article').filter({ hasText: 'Disposable release quiz' })
  await expect(archivedCard).toBeVisible()
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      'Permanently delete “Disposable release quiz”? This will remove the quiz, its questions and its game history. This cannot be undone.',
    )
    await dialog.accept()
  })
  await archivedCard.getByRole('button', { name: 'Permanently delete' }).click()
  await expect(archivedCard).toHaveCount(0)
  await expect(page.getByText('“Disposable release quiz” was permanently deleted.')).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: /Archived quizzes/ }).click()
  await expect(page.getByRole('article').filter({ hasText: 'Disposable release quiz' })).toHaveCount(0)
  await page.getByRole('tab', { name: /Active quizzes/ }).click()
  await expect(page.getByRole('article').filter({ hasText: 'The Curious Crew' })).toBeVisible()
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
