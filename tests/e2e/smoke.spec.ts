import { expect, test, type BrowserContext, type Page } from '@playwright/test'

interface BrowserComputedStyle {
  touchAction: string
  overscrollBehaviorX: string
  paddingLeft: string
  paddingRight: string
}

interface BrowserEvaluationElement {
  closest(selector: string): unknown
}

interface BrowserEvaluationGlobal {
  getComputedStyle(element: unknown): BrowserComputedStyle
  document: { documentElement: { scrollWidth: number } }
  innerWidth: number
}

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

async function expectHeadToHeadResult(
  page: Page,
  competitor: string,
  role: 'Official question' | 'Playing along',
  status: '✓ Correct' | '✕ Incorrect' | 'Skipped',
  consequence: '+1 point' | '0 points' | 'No point — play-along' | 'Play-along',
) {
  const card = page.getByRole('article', { name: `${competitor} result` })
  await expect(card.getByText(role)).toBeVisible()
  await expect(card.getByText(status)).toBeVisible()
  await expect(card.getByText(consequence)).toBeVisible()
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

test('editor has seven formats and persists a changed title', async ({ page }) => {
  await enterHost(page)
  const card = page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await card.getByRole('link', { name: 'Edit' }).click()
  for (const name of ['Single choice', 'Multiple select', 'True or false', 'Slider', 'Pinpoint', 'Typed answer', 'Mash-up']) {
    await expect(page.locator('.question-type-picker').getByRole('button', { name: new RegExp(name) })).toBeVisible()
  }
  const title = page.getByLabel('Quiz title')
  await title.fill('A Persisted Curious Crew')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Quiz title')).toHaveValue('A Persisted Curious Crew')
})

test('Head-to-Head authoring and a true two-player untimed game work end to end', async ({ context, page }) => {
  test.setTimeout(120_000)
  await enterHost(page)
  await page.getByRole('button', { name: '+ Create quiz' }).click()
  await page.getByLabel('Quiz title').fill('Head-to-Head foundation test')

  const typePicker = page.getByRole('group', { name: 'Quiz type' })
  await expect(typePicker.getByRole('button', { name: /Standard/ })).toHaveAttribute('aria-pressed', 'true')
  await typePicker.getByRole('button', { name: /Head to Head/ }).click()
  const setup = page.getByRole('region', { name: 'Head-to-Head competitors' })
  await setup.getByLabel('Competitor 1').fill('Ross')
  await setup.getByLabel('Competitor 2').fill('Jess')

  const addQuestion = page.locator('.question-type-picker').getByRole('button', { name: /True or false/ })
  await addQuestion.click()
  await page.getByRole('group', { name: 'Question for' }).getByRole('button', { name: 'Ross' }).click()
  await addQuestion.click()
  await expect(page.getByRole('group', { name: 'Question for' }).getByRole('button', { name: 'Jess' }))
    .toHaveAttribute('aria-pressed', 'true')
  await page.locator('.question-type-picker').getByRole('button', { name: /Slider/ }).click()
  await expect(page.getByRole('group', { name: 'Question for' }).getByRole('button', { name: 'Ross' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Points')).toHaveCount(0)
  await expect(page.getByText(/Head-to-Head uses 1 point/)).toBeVisible()

  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await expect(setup.getByLabel('Competitor 1')).toHaveValue('Ross')
  await expect(setup.getByLabel('Competitor 2')).toHaveValue('Jess')
  await expect(page.locator('.question-navigator')).toContainText('Ross')
  await expect(page.locator('.question-navigator')).toContainText('Jess')

  await page.goto('/host')
  const card = page.getByRole('article', { name: 'Head-to-Head foundation test' })
  await expect(card.getByText('Head to Head')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Launch game' })).toBeEnabled()
  const roomCode = await launchQuiz(page, 'Head-to-Head foundation test')
  await expect(page.getByText(/controlled by the two competitors/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start game' })).toHaveCount(0)

  const presentation = await context.newPage()
  await presentation.goto(page.url().replace('/control', '/present'))
  await expect(presentation.getByText('Ross')).toBeVisible()
  await expect(presentation.getByText('Jess')).toBeVisible()

  const ross = await context.newPage()
  await ross.goto(`/join?room=${roomCode}`)
  await expect(ross.getByRole('group', { name: 'Who are you?' })).toBeVisible()
  await expect(ross.getByLabel('Nickname')).toHaveCount(0)
  await ross.getByRole('button', { name: 'Ross' }).click()
  await expect(ross.getByText('You are playing as Ross.')).toBeVisible()
  await expect(ross.getByRole('button', { name: 'Start game' })).toBeDisabled()

  const jess = await context.newPage()
  await jess.goto(`/join?room=${roomCode}`)
  await expect(jess.getByRole('button', { name: /Ross — joined/ })).toBeDisabled()
  await jess.getByRole('button', { name: 'Jess' }).click()
  await jess.reload()
  await expect(jess.getByText(/You are playing as/)).toContainText('Jess')
  await expect(ross.getByRole('button', { name: 'Start game' })).toBeEnabled()
  await ross.getByRole('button', { name: 'Start game' }).click()

  await expect(ross.getByText('Your question')).toBeVisible()
  await expect(ross.getByText(/Untimed/)).toBeVisible()
  await expect(ross.locator('.timer')).toHaveCount(0)
  await expect(jess.getByText(/Ross’s question/)).toBeVisible()
  await expect(jess.getByRole('button', { name: 'Skip play-along' })).toBeVisible()
  await ross.getByRole('button', { name: 'True' }).click()
  await ross.getByRole('button', { name: 'Lock in' }).click()
  await expect(ross.getByText('Answer locked in')).toBeVisible()
  await jess.getByRole('button', { name: 'False' }).click()
  await jess.getByRole('button', { name: 'Lock in' }).click()
  await expectHeadToHeadResult(ross, 'Ross', 'Official question', '✓ Correct', '+1 point')
  await expectHeadToHeadResult(jess, 'Jess', 'Playing along', '✕ Incorrect', 'No point — play-along')
  await expect(ross.getByText(/Also got it right/i)).toHaveCount(0)
  await jess.getByRole('button', { name: 'Continue' }).click()

  await expect(jess.getByText('Your question')).toBeVisible()
  await expect(ross.getByText(/Jess’s question/)).toBeVisible()
  await jess.getByRole('button', { name: 'True' }).click()
  await jess.getByRole('button', { name: 'Lock in' }).click()
  await ross.getByRole('button', { name: 'Skip play-along' }).click()
  await expectHeadToHeadResult(jess, 'Jess', 'Official question', '✓ Correct', '+1 point')
  await expectHeadToHeadResult(ross, 'Ross', 'Playing along', 'Skipped', 'Play-along')
  await ross.getByRole('button', { name: 'Continue' }).click()

  await expect(ross.getByText('Your question')).toBeVisible()
  await expect(jess.getByText(/Ross’s question/)).toBeVisible()
  const slider = ross.getByRole('slider')
  const sliderInteraction = ross.locator('.slider-answer__interaction')
  const sliderStyle = await slider.evaluate((element) => {
    const browser = globalThis as unknown as BrowserEvaluationGlobal
    const inputStyle = browser.getComputedStyle(element)
    const interaction = (element as unknown as BrowserEvaluationElement).closest('.slider-answer__interaction')
    if (!interaction) throw new Error('Slider interaction area is missing')
    const interactionStyle = browser.getComputedStyle(interaction)
    return {
      inputTouchAction: inputStyle.touchAction,
      interactionTouchAction: interactionStyle.touchAction,
      overscrollBehaviorX: interactionStyle.overscrollBehaviorX,
      paddingLeft: Number.parseFloat(interactionStyle.paddingLeft),
      paddingRight: Number.parseFloat(interactionStyle.paddingRight),
    }
  })
  expect(sliderStyle).toMatchObject({
    inputTouchAction: 'pan-y',
    interactionTouchAction: 'pan-y',
    overscrollBehaviorX: 'contain',
  })
  expect(sliderStyle.paddingLeft).toBeGreaterThanOrEqual(24)
  expect(sliderStyle.paddingRight).toBeGreaterThanOrEqual(24)
  await expect(sliderInteraction).toBeVisible()
  const sliderBox = await slider.boundingBox()
  if (!sliderBox) throw new Error('Slider was not visible')
  const viewport = ross.viewportSize()
  if (!viewport) throw new Error('Player viewport was unavailable')
  expect(sliderBox.height).toBeGreaterThanOrEqual(48)
  expect(sliderBox.x).toBeGreaterThanOrEqual(24)
  expect(viewport.width - sliderBox.x - sliderBox.width).toBeGreaterThanOrEqual(24)
  await slider.focus()
  await slider.press('ArrowRight')
  await expect(slider).toHaveValue('1')
  await slider.fill('0')
  await ross.mouse.move(sliderBox.x + 8, sliderBox.y + sliderBox.height / 2)
  await ross.mouse.down()
  await ross.mouse.move(sliderBox.x + sliderBox.width * .6, sliderBox.y + sliderBox.height / 2, { steps: 8 })
  await ross.mouse.up()
  await expect.poll(() => slider.inputValue()).not.toBe('0')
  const horizontalOverflow = await ross.evaluate(() => {
    const browser = globalThis as unknown as BrowserEvaluationGlobal
    return browser.document.documentElement.scrollWidth > browser.innerWidth
  })
  expect(horizontalOverflow).toBe(false)

  await slider.fill('50')
  await jess.getByRole('slider').fill('50')
  await ross.getByRole('button', { name: 'Lock in' }).click()
  await jess.getByRole('button', { name: 'Lock in' }).click()
  await expectHeadToHeadResult(ross, 'Ross', 'Official question', '✓ Correct', '+1 point')
  await expectHeadToHeadResult(jess, 'Jess', 'Playing along', '✓ Correct', 'No point — play-along')
  await ross.getByRole('button', { name: 'Show final result' }).click()
  await expect(ross.getByRole('heading', { name: 'Ross wins!' })).toBeVisible()
  await expect(presentation.getByRole('heading', { name: 'Ross wins!' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close room' }).click()
  await expect(page).toHaveURL('/host')
  await ross.close()
  await jess.close()
  await presentation.close()

  const finishedCard = page.getByRole('article', { name: 'Head-to-Head foundation test' })
  await finishedCard.getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.getByLabel('Quiz title')).toHaveValue('Head-to-Head foundation test (Copy)')
  await expect(page.getByRole('region', { name: 'Head-to-Head competitors' }).getByLabel('Competitor 1')).toHaveValue('Ross')
  await expect(page.locator('.question-navigator')).toContainText('Ross')
  await expect(page.locator('.question-navigator')).toContainText('Jess')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('group', { name: 'Quiz type' }).getByRole('button', { name: /Standard/ }).click()
  await expect(page.getByRole('region', { name: 'Head-to-Head competitors' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Question for' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: 'Quiz type' }).getByRole('button', { name: /Standard/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Head-to-Head competitors' })).toHaveCount(0)
})

test('a blind Head-to-Head file imports, plays with remapped answers and exports again', async ({ context, page }) => {
  test.setTimeout(120_000)
  const portableQuiz = {
    format: 'katwed-quiz',
    formatVersion: 2,
    quiz: {
      title: 'Blind Import Duel',
      quizType: 'head-to-head',
      themeId: 'katwed',
      backgroundId: null,
      coverImagePath: null,
      competitors: [
        { key: 'ross', displayName: 'Ross' },
        { key: 'jess', displayName: 'Jess' },
      ],
      roster: [],
      questions: [
        {
          key: 'q1',
          type: 'true-false',
          assignedTo: 'ross',
          prompt: 'SECRET IMPORT QUESTION ONE',
          revealCaption: 'SECRET IMPORT REVEAL ONE',
          correctValue: true,
        },
        {
          key: 'q2',
          type: 'typed-answer',
          assignedTo: 'jess',
          prompt: 'SECRET IMPORT QUESTION TWO',
          correctAnswer: 'Red Dwarf',
          acceptedAnswers: ['The Red Dwarf'],
        },
      ],
    },
  }

  await enterHost(page)
  await expect(page.getByRole('button', { name: 'Import quiz' })).toBeVisible()
  await page.getByLabel('Choose Katwed quiz file').setInputFiles({
    name: 'blind-import-duel.katwed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(portableQuiz), 'utf8'),
  })

  const preview = page.getByRole('region', { name: 'Quiz import preview' })
  await expect(preview.getByRole('heading', { name: 'Blind Import Duel' })).toBeVisible()
  await expect(preview.getByText('Head to Head')).toBeVisible()
  await expect(preview.getByText('Ross vs Jess')).toBeVisible()
  await expect(preview.getByText('2')).toBeVisible()
  await expect(page.getByText('SECRET IMPORT QUESTION ONE')).toHaveCount(0)
  await expect(page.getByText('SECRET IMPORT REVEAL ONE')).toHaveCount(0)
  await preview.getByRole('button', { name: 'Import' }).click()

  await expect(page).toHaveURL(/\/host$/)
  await expect(page.getByText('Imported Blind Import Duel: 2 questions.')).toBeVisible()
  const importedCard = page.getByRole('article', { name: 'Blind Import Duel' })
  await expect(importedCard).toBeVisible()
  await expect(importedCard).toContainText('2 questions')

  const roomCode = await launchQuiz(page, 'Blind Import Duel')
  const ross = await context.newPage()
  await ross.goto(`/join?room=${roomCode}`)
  await ross.getByRole('button', { name: 'Ross' }).click()
  const jess = await context.newPage()
  await jess.goto(`/join?room=${roomCode}`)
  await jess.getByRole('button', { name: 'Jess' }).click()
  await ross.getByRole('button', { name: 'Start game' }).click()

  await expect(ross.getByText('Your question')).toBeVisible()
  await expect(jess.getByText(/Ross’s question/)).toBeVisible()
  await ross.getByRole('button', { name: 'True' }).click()
  await ross.getByRole('button', { name: 'Lock in' }).click()
  await jess.getByRole('button', { name: 'Skip play-along' }).click()
  await expectHeadToHeadResult(ross, 'Ross', 'Official question', '✓ Correct', '+1 point')
  await jess.getByRole('button', { name: 'Continue' }).click()

  await expect(jess.getByText('Your question')).toBeVisible()
  await expect(ross.getByText(/Jess’s question/)).toBeVisible()
  await jess.getByRole('textbox', { name: 'Type your answer' }).fill('red-dwarf')
  await jess.getByRole('textbox', { name: 'Type your answer' }).press('Enter')
  await ross.getByRole('textbox', { name: 'Type your answer' }).fill('The Red Dwarf')
  await ross.getByRole('textbox', { name: 'Type your answer' }).press('Enter')
  await expect(jess.getByRole('heading', { name: 'Red Dwarf' })).toBeVisible()
  await expect(ross.getByRole('article', { name: 'Ross result' })).toContainText('Correct')
  await expect(ross.getByRole('article', { name: 'Ross result' })).toContainText('No point')
  await expectHeadToHeadResult(jess, 'Jess', 'Official question', '✓ Correct', '+1 point')
  await ross.getByRole('button', { name: 'Show final result' }).click()
  await expect(ross.getByRole('heading', { name: 'It’s a draw!' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close room' }).click()
  await expect(page).toHaveURL(/\/host$/)
  await ross.close()
  await jess.close()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('article', { name: 'Blind Import Duel' }).getByRole('button', { name: 'Export' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('blind-import-duel.katwed.json')
  const exportedPath = await download.path()
  if (!exportedPath) throw new Error('Exported quiz file was unavailable')
  const { readFile } = await import('node:fs/promises')
  const exported = JSON.parse(await readFile(exportedPath, 'utf8')) as { formatVersion: number }
  expect(exported.formatVersion).toBe(3)
})

test('quiz themes persist through duplication and audience game phases', async ({ context, page }) => {
  test.setTimeout(120_000)
  await enterHost(page)
  await expect(page.locator('[data-quiz-theme]')).toHaveCount(0)

  const sourceCard = page.getByRole('article', { name: 'The Curious Crew' })
  await sourceCard.getByRole('link', { name: 'Edit' }).click()
  const themePicker = page.getByRole('group', { name: 'Quiz theme' })
  let backgroundPicker = page.getByRole('group', { name: 'Quiz background' })
  await expect(themePicker.getByRole('button')).toHaveCount(6)
  await expect(backgroundPicker.getByRole('button')).toHaveCount(4)
  await expect(backgroundPicker.getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Katwed! theme preview')).not.toHaveAttribute('data-quiz-background')
  const themeGrid = themePicker.locator('.quiz-theme-grid')
  const themeGridBox = await themeGrid.boundingBox()
  if (!themeGridBox) throw new Error('Theme grid was not visible')
  for (const option of await themeGrid.getByRole('button').all()) {
    const optionBox = await option.boundingBox()
    if (!optionBox) throw new Error('Theme option was not visible')
    expect(optionBox.x).toBeGreaterThanOrEqual(themeGridBox.x - 1)
    expect(optionBox.x + optionBox.width).toBeLessThanOrEqual(themeGridBox.x + themeGridBox.width + 1)
  }
  await themePicker.getByRole('button', { name: /Arcade/ }).click()
  backgroundPicker = page.getByRole('group', { name: 'Quiz background' })
  await expect(backgroundPicker.getByRole('button', { name: /Circuit/ })).toBeVisible()
  await expect(backgroundPicker.getByRole('button', { name: /Grid/ })).toBeVisible()
  await expect(backgroundPicker.getByRole('button', { name: /Neon/ })).toBeVisible()
  await backgroundPicker.getByRole('button', { name: /Grid/ }).click()
  const preview = page.getByLabel('Arcade theme preview')
  await expect(preview).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(preview).toHaveAttribute('data-quiz-background', 'arcade-grid')
  await expect(preview).toHaveCSS('background-image', /arcade-grid\.webp/)
  await themePicker.getByRole('button', { name: /Paper/ }).click()
  backgroundPicker = page.getByRole('group', { name: 'Quiz background' })
  await expect(backgroundPicker.getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Paper theme preview')).not.toHaveAttribute('data-quiz-background')
  await themePicker.getByRole('button', { name: /Arcade/ }).click()
  backgroundPicker = page.getByRole('group', { name: 'Quiz background' })
  await expect(backgroundPicker.getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
  await backgroundPicker.getByRole('button', { name: /Grid/ }).click()
  const previewBackground = await preview.evaluate<string, void>(
    "element => window.getComputedStyle(element).getPropertyValue('--quiz-bg').trim()",
  )
  expect(previewBackground).not.toBe('')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: 'Quiz theme' }).getByRole('button', { name: /Arcade/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('group', { name: 'Quiz background' }).getByRole('button', { name: /Grid/ }))
    .toHaveAttribute('aria-pressed', 'true')

  await page.goto('/host')
  await page.getByRole('article', { name: 'The Curious Crew' }).getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.getByLabel('Quiz title')).toHaveValue('The Curious Crew (Copy)')
  await expect(page.getByRole('group', { name: 'Quiz theme' }).getByRole('button', { name: /Arcade/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('group', { name: 'Quiz background' }).getByRole('button', { name: /Grid/ }))
    .toHaveAttribute('aria-pressed', 'true')

  await page.goto('/host')
  const roomCode = await launchQuiz(page, 'The Curious Crew (Copy)')
  await expect(page.locator('.controller-page[data-quiz-theme]')).toHaveCount(0)
  await expect(page.locator('.controller-page[data-quiz-background]')).toHaveCount(0)
  await expect(page.locator('.presentation-stage')).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(page.locator('.presentation-stage')).toHaveAttribute('data-quiz-background', 'arcade-grid')

  const presentation = await context.newPage()
  await presentation.goto(page.url().replace('/control', '/present'))
  await expect(presentation.locator('.presentation-stage')).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(presentation.locator('.presentation-stage')).toHaveAttribute('data-quiz-background', 'arcade-grid')
  const player = await joinPlayer(context, roomCode, 'Theme Player')
  await expect(player.locator('.player-game')).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(player.locator('.player-game')).toHaveAttribute('data-quiz-background', 'arcade-grid')

  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(player.getByRole('heading', { name: 'Select exactly 2 people' })).toBeVisible()
  await expect(player.locator('.player-game')).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(player.locator('.player-game')).toHaveAttribute('data-quiz-background', 'arcade-grid')
  await player.getByRole('button', { name: 'Alex' }).click()
  await player.getByRole('button', { name: 'Bailey' }).click()
  await player.getByRole('button', { name: 'Lock in' }).click()
  await page.getByRole('button', { name: 'Close answers early' }).click()
  await expect(player.getByRole('heading', { name: 'Answers locked' })).toBeVisible()
  await expect(presentation.getByRole('heading', { name: 'Answers locked' })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await expect(player.locator('.reveal-state')).toBeVisible()
  await expect(player.locator('.player-game')).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(player.locator('.player-game')).toHaveAttribute('data-quiz-background', 'arcade-grid')
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await expect(presentation.locator('.leaderboard--presentation')).toBeVisible()
  await expect(presentation.locator('.presentation-stage')).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(presentation.locator('.presentation-stage')).toHaveAttribute('data-quiz-background', 'arcade-grid')
  expect(await player.evaluate<boolean>(
    'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
  )).toBe(true)

  await page.goto('/host')
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('group', { name: 'Quiz theme' }).getByRole('button', { name: /Paper/ }).click()
  const paperBackgrounds = page.getByRole('group', { name: 'Quiz background' })
  await paperBackgrounds.getByRole('button', { name: /Collage/ }).click()
  await expect(page.getByLabel('Paper theme preview')).toHaveAttribute('data-quiz-background', 'paper-collage')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')
  const paperRoomCode = await launchQuiz(page, 'Katwed! Mixed Quiz')
  await expect(page.locator('.presentation-stage')).toHaveAttribute('data-quiz-background', 'paper-collage')
  const paperPresentation = await context.newPage()
  await paperPresentation.goto(page.url().replace('/control', '/present'))
  await expect(paperPresentation.locator('.presentation-stage')).toHaveAttribute('data-quiz-background', 'paper-collage')
  const paperPlayer = await joinPlayer(context, paperRoomCode, 'Paper Player')
  await expect(paperPlayer.locator('.player-game')).toHaveAttribute('data-quiz-background', 'paper-collage')
  expect(await paperPlayer.evaluate<boolean>(
    'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
  )).toBe(true)
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

test('Standard scoring controls, configured tiles and the Double Score intro work in Demo mode', async ({ context, page }) => {
  test.setTimeout(90_000)
  await enterHost(page)

  const existing = page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await existing.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Reveal effect').selectOption('tiles')
  const grid = page.getByLabel('Tile grid')
  await expect(grid).toBeVisible()
  await grid.selectOption('8')
  await page.getByLabel('Reveal duration').fill('60')
  await expect(page.locator('.editor-preview .tile-cover span')).toHaveCount(64)
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()

  await page.getByRole('link', { name: 'All quizzes' }).click()
  await page.getByRole('button', { name: '+ Create quiz' }).click()
  await page.getByLabel('Quiz title').fill('Double Score browser test')
  await page.locator('.question-type-picker').getByRole('button', { name: /True or false/ }).click()
  await page.getByLabel('Prompt').fill('Double Score browser question')
  await expect(page.getByLabel('Maximum points')).toHaveValue('1000')
  await expect(page.getByLabel('Faster answers score more')).toBeChecked()
  const doubleScore = page.getByRole('checkbox', { name: 'Double score', exact: true })
  await expect(doubleScore).not.toBeChecked()
  await doubleScore.check()
  await expect(page.getByText('Worth up to 2,000 points.')).toBeVisible()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.getByRole('link', { name: 'All quizzes' }).click()

  const roomCode = await launchQuiz(page, 'Double Score browser test')
  const presentation = await context.newPage()
  await presentation.goto(page.url().replace('/control', '/present'))
  const player = await joinPlayer(context, roomCode, 'Double Player')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByRole('button', { name: 'Close answers early' })).toBeDisabled()
  await expect(presentation.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
  await expect(player.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
  await expect(presentation.getByText('Double Score browser question')).toHaveCount(0)
  await expect(player.getByText('Double Score browser question')).toHaveCount(0)

  await expect(player.getByText('Double Score browser question')).toBeVisible()
  await expect(presentation.getByText('Double Score browser question')).toBeVisible()
  await expect(player.getByText('2x points')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close answers early' })).toBeEnabled()
  await player.getByRole('button', { name: 'True' }).click()
  await player.getByRole('button', { name: 'Lock in' }).click()
  await page.getByRole('button', { name: 'Close answers early' }).click()
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page.getByRole('button', { name: 'Reveal final results' }).click()
  await expect(player.getByRole('heading', { name: 'Final scores' })).toBeVisible()

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Close room' }).click()
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
    await expect(presentation.getByRole('group', { name: 'Correct answer' })).toBeVisible()
    await expect(page.locator('.controller-preview').getByRole('group', { name: 'Correct answer' })).toBeVisible()
    await expect(playerOne.getByRole('group', { name: 'Correct answer' })).toBeVisible()
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

  const typedAnswer = playerOne.getByRole('textbox', { name: 'Type your answer' })
  await typedAnswer.fill('red-dwarf')
  await typedAnswer.press('Enter')
  await playerTwo.getByRole('textbox', { name: 'Type your answer' }).fill('Star Trek')
  await playerTwo.getByRole('button', { name: 'Lock in' }).click()
  await revealRound(/Red Dwarf/i)
  await expect(playerOne.getByRole('heading', { name: 'Red Dwarf' })).toBeVisible()
  await expect(playerOne.getByText(/Capitalisation, spaces and punctuation/)).toBeVisible()
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await page.getByRole('button', { name: 'Next question' }).click()

  const presentationTiles = presentation.locator('.tile-cover span')
  const playerTiles = playerOne.locator('.tile-cover span')
  const presentationRanks = await Promise.all(Array.from({ length: 24 }, (_, index) => (
    presentationTiles.nth(index).getAttribute('data-reveal-rank')
  )))
  const playerRanks = await Promise.all(Array.from({ length: 24 }, (_, index) => (
    playerTiles.nth(index).getAttribute('data-reveal-rank')
  )))
  expect(presentationRanks).toHaveLength(24)
  expect(playerRanks).toEqual(presentationRanks)
  expect(new Set(presentationRanks).size).toBe(24)

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
  await expect(presentation.locator('.leaderboard li').filter({ hasText: 'Quinn' })).toContainText('7,001')
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
