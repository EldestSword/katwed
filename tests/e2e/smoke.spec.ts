import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

interface BrowserComputedStyle {
  touchAction: string
  overscrollBehaviorX: string
  paddingLeft: string
  paddingRight: string
  backgroundColor: string
  color: string
}

interface BrowserEvaluationElement {
  closest(selector: string): unknown
  getAttribute(name: string): string | null
  getBoundingClientRect(): BrowserEvaluationRect
}

interface BrowserEvaluationRect {
  x: number
  y: number
  width: number
  height: number
}

interface BrowserEvaluationGlobal {
  getComputedStyle(element: unknown): BrowserComputedStyle
  document: { documentElement: { clientWidth: number; scrollWidth: number } }
  innerWidth: number
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
})

async function enterHost(page: Page) {
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('heading', { name: 'Quizzes', exact: true })).toBeVisible()
}

type QuizSettingsSection = 'Game' | 'Appearance' | 'Answer colours' | 'Audio'

async function openQuizSettings(page: Page, section: QuizSettingsSection = 'Game') {
  await page.getByRole('button', { name: 'Quiz settings' }).click()
  const dialog = page.getByRole('dialog', { name: 'Quiz settings' })
  await expect(dialog).toBeVisible()
  if (section !== 'Game') {
    await dialog.getByRole('button', { name: new RegExp(`^${section}`) }).click()
    const regionName = section === 'Appearance'
      ? 'Define the quiz identity'
      : section === 'Answer colours'
        ? 'Choose the contestant palette'
        : 'Choose the game-show sound'
    await expect(dialog.getByRole('region', { name: regionName })).toBeVisible()
  }
  return dialog
}

async function openAddQuestion(page: Page) {
  await page.getByRole('button', { name: '+ Add', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add question' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function addQuestion(page: Page, typeName: string | RegExp) {
  const dialog = await openAddQuestion(page)
  await dialog.getByRole('button', { name: typeName }).click()
  await expect(dialog).toHaveCount(0)
}

async function openQuizCardActions(card: Locator) {
  const menu = card.getByLabel(/^More actions for /)
  await menu.click()
  return card
}

async function clickQuizCardAction(card: Locator, action: 'Archive' | 'Duplicate' | 'Export') {
  await openQuizCardActions(card)
  await card.getByRole('button', { name: action, exact: true }).click()
}

async function joinPlayer(context: BrowserContext, roomCode: string, nickname: string) {
  const player = await context.newPage()
  await player.goto(`/join?room=${roomCode}`)
  await player.getByLabel('Nickname').fill(nickname)
  await player.getByRole('button', { name: 'Join game' }).click()
  await expect(player.getByRole('heading', { name: new RegExp(`You’re in, ${nickname}`) })).toBeVisible()
  return player
}

async function launchQuiz(page: Page, title: string, configure?: (page: Page) => Promise<void>) {
  const card = page.getByRole('article').filter({ hasText: title })
  await card.getByRole('button', { name: 'Launch game' }).click()
  await expect(page).toHaveURL(/\/host\/quizzes\/.+\/setup$/)
  if (configure) await configure(page)
  await page.getByRole('button', { name: 'Start lobby' }).click()
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

async function mockPresentationAudio(page: Page, rejectPlayback = false) {
  await page.addInitScript(({ reject }) => {
    const browser = globalThis as typeof globalThis & {
      __katwedAudioPlays?: string[]
      document: { createElement(name: string): { src: string } }
    }
    browser.__katwedAudioPlays = []
    const audioPrototype = Object.getPrototypeOf(browser.document.createElement('audio')) as object
    Object.defineProperty(audioPrototype, 'play', {
      configurable: true,
      value(this: { src: string }) {
        browser.__katwedAudioPlays?.push(this.src)
        if (reject) return Promise.reject(new Error('Simulated audio playback rejection'))
        return Promise.resolve()
      },
    })
  }, { reject: rejectPlayback })
}

async function presentationAudioPlayCount(page: Page) {
  return page.evaluate(() => (
    (globalThis as typeof globalThis & { __katwedAudioPlays?: string[] }).__katwedAudioPlays?.length ?? 0
  ))
}

test('landing, joining validation and host guards work', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /live team quiz/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Host', exact: true })).toHaveAttribute('href', '/host')
  await page.getByRole('button', { name: 'Join game' }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter the six-digit room code.')
  await expect(page.getByLabel('Room code')).toHaveAttribute('aria-invalid', 'true')
  await page.goto('/join?room=999999')
  await expect(page.getByText(/We could not find an open room with that code/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Join game' })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Join' })).toHaveAttribute('aria-current', 'page')
  await page.goto('/not-a-katwed-route')
  await expect(page.getByRole('heading', { name: 'This page does not ring a bell' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Join a game' })).toHaveAttribute('href', '/join')
  await page.goto('/host/game/not-a-session/present')
  await expect(page.getByRole('heading', { name: 'Host your quiz' })).toBeVisible()
})

test('public entry and recovery routes remain usable at phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const landingGeometry = await page.evaluate(() => {
      const browser = globalThis as unknown as BrowserEvaluationGlobal
      return {
        clientWidth: browser.document.documentElement.clientWidth,
        scrollWidth: browser.document.documentElement.scrollWidth,
      }
    })
    expect(landingGeometry.scrollWidth).toBeLessThanOrEqual(landingGeometry.clientWidth)

    const roomCode = page.getByLabel('Room code')
    const joinButton = page.getByRole('button', { name: 'Join game' })
    await expect(roomCode).toBeVisible()
    await expect(joinButton).toBeVisible()
    const joinButtonBox = await joinButton.boundingBox()
    if (!joinButtonBox) throw new Error('Landing join action was not visible')
    expect(joinButtonBox.height).toBeGreaterThanOrEqual(44)

    await page.goto('/join')
    await expect(page.getByRole('heading', { name: 'Enter your game' })).toBeVisible()
    const joinGeometry = await page.evaluate(() => {
      const browser = globalThis as unknown as BrowserEvaluationGlobal
      return {
        clientWidth: browser.document.documentElement.clientWidth,
        scrollWidth: browser.document.documentElement.scrollWidth,
      }
    })
    expect(joinGeometry.scrollWidth).toBeLessThanOrEqual(joinGeometry.clientWidth)

    await page.goto('/not-a-katwed-route')
    await expect(page.getByRole('link', { name: 'Back home' })).toBeVisible()
    const recoveryGeometry = await page.evaluate(() => {
      const browser = globalThis as unknown as BrowserEvaluationGlobal
      return {
        clientWidth: browser.document.documentElement.clientWidth,
        scrollWidth: browser.document.documentElement.scrollWidth,
      }
    })
    expect(recoveryGeometry.scrollWidth).toBeLessThanOrEqual(recoveryGeometry.clientWidth)
  }
})

test('editor has seven formats and persists a changed title', async ({ page }) => {
  await enterHost(page)
  const card = page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await card.getByRole('link', { name: 'Edit' }).click()
  const questionPicker = await openAddQuestion(page)
  for (const name of ['Single choice', 'Multiple select', 'True or false', 'Slider', 'Pinpoint', 'Typed answer', 'Mash-up']) {
    await expect(questionPicker.getByRole('button', { name: new RegExp(name) })).toBeVisible()
  }
  await questionPicker.getByRole('button', { name: 'Close add question' }).click()
  const title = page.getByLabel('Quiz title')
  await title.fill('A Persisted Curious Crew')
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Quiz title')).toHaveValue('A Persisted Curious Crew')
})

test('editor media and narrow Player previews preserve useful proportions', async ({ page }) => {
  await enterHost(page)
  await page.getByRole('article', { name: 'The Curious Crew' }).getByRole('link', { name: 'Edit' }).click()

  const preview = page.getByLabel('Katwed! theme preview')
  await expect(preview).toHaveAttribute('data-preview-audience', 'presentation')
  const previewImage = preview.locator('.editor-preview__media img')
  await expect(previewImage).toHaveCSS('object-fit', 'contain')
  const presentationMedia = await preview.locator('.editor-preview__media').boundingBox()
  if (!presentationMedia) throw new Error('Presentation preview media was not visible')
  expect(presentationMedia.height).toBeGreaterThanOrEqual(120)

  await page.getByRole('tab', { name: 'Player' }).click()
  await expect(preview).toHaveAttribute('data-preview-audience', 'player')
  await expect(preview.locator('.editor-answer-preview')).toHaveCount(0)
  const playerMedia = await preview.locator('.editor-preview__media').boundingBox()
  if (!playerMedia) throw new Error('Player preview media was not visible')
  expect(playerMedia.height).toBeGreaterThanOrEqual(160)

  await page.goto('/host')
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('tab', { name: 'Player' }).click()
  const previewAnswers = page.getByLabel('Answer colour preview')
  await expect(previewAnswers).toHaveAttribute('data-option-count', '4')
  const positions = await previewAnswers.locator(':scope > span').evaluateAll((elements) => elements.map((element) => {
    const rect = (element as unknown as BrowserEvaluationElement).getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }))
  expect(positions).toHaveLength(4)
  expect(Math.abs(positions[0].y - positions[1].y)).toBeLessThan(2)
  expect(Math.abs(positions[0].x - positions[2].x)).toBeLessThan(2)
  expect(positions.every((position) => position.width >= 120 && position.height >= 72)).toBe(true)
})

test('custom answer colours stay aligned and Standard locks only after all four players submit', async ({ context, page }) => {
  test.setTimeout(90_000)
  await enterHost(page)
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('link', { name: 'Edit' }).click()
  let settings = await openQuizSettings(page, 'Answer colours')
  const palette = settings.getByRole('group', { name: 'Answer palette' })
  await palette.getByRole('button', { name: /^Custom/ }).click()
  await settings.getByLabel('Colour 1 hex').fill('#FDFDFD')
  await settings.getByLabel('Colour 2 hex').fill('#101010')
  await settings.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()

  await page.reload()
  settings = await openQuizSettings(page, 'Answer colours')
  await expect(settings.getByRole('group', { name: 'Answer palette' }).getByRole('button', { name: /^Custom/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(settings.getByLabel('Colour 1 hex')).toHaveValue('#FDFDFD')
  await expect(settings.getByLabel('Colour 2 hex')).toHaveValue('#101010')
  await settings.getByRole('button', { name: 'Done' }).click()

  await page.goto('/host')
  const roomCode = await launchQuiz(page, 'Katwed! Mixed Quiz')
  const presentation = await context.newPage()
  await presentation.goto(page.url().replace('/control', '/present'))
  const players = []
  for (const nickname of ['Palette One', 'Palette Two', 'Palette Three', 'Palette Four']) {
    players.push(await joinPlayer(context, roomCode, nickname))
  }
  await page.getByRole('button', { name: 'Start game' }).click()

  await players[0].setViewportSize({ width: 390, height: 844 })

  const optionSnapshot = (surface: Page, selector: string) => surface.locator(selector).evaluateAll((elements) => (
    elements.map((element) => {
      const style = (globalThis as unknown as BrowserEvaluationGlobal).getComputedStyle(element)
      const browserElement = element as unknown as BrowserEvaluationElement
      return {
        id: browserElement.getAttribute('data-option-id'),
        background: style.backgroundColor,
        colour: style.color,
      }
    })
  ))
  const playerOptions = '.answer-choice[data-option-id]'
  const presentationOptions = '.presentation-options [data-option-id]'
  const controllerOptions = '.controller-preview .presentation-options [data-option-id]'
  await expect(players[0].locator(playerOptions)).toHaveCount(4)
  await expect(presentation.locator(presentationOptions)).toHaveCount(4)
  await expect(page.locator(controllerOptions)).toHaveCount(4)
  const playerSnapshot = await optionSnapshot(players[0], playerOptions)
  const presentationSnapshot = await optionSnapshot(presentation, presentationOptions)
  const controllerSnapshot = await optionSnapshot(page, controllerOptions)
  expect(playerSnapshot).toEqual(presentationSnapshot)
  expect(playerSnapshot).toEqual(controllerSnapshot)
  expect(playerSnapshot[0]).toMatchObject({ background: 'rgb(253, 253, 253)', colour: 'rgb(17, 24, 39)' })
  expect(playerSnapshot[1]).toMatchObject({ background: 'rgb(16, 16, 16)', colour: 'rgb(255, 255, 255)' })
  const playerTilePositions = await players[0].locator(playerOptions).evaluateAll((elements) => elements.map((element) => {
    const rect = (element as unknown as BrowserEvaluationElement).getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }))
  expect(Math.abs(playerTilePositions[0].y - playerTilePositions[1].y)).toBeLessThan(2)
  expect(Math.abs(playerTilePositions[0].x - playerTilePositions[2].x)).toBeLessThan(2)
  expect(playerTilePositions.every((position) => position.width >= 150 && position.height >= 88)).toBe(true)

  for (const player of players.slice(0, 3)) {
    await player.locator('.answer-choice[data-option-id]').first().click()
    await player.getByRole('button', { name: 'Lock in' }).click()
  }
  await expect(page.getByRole('button', { name: 'Close answers now' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toHaveCount(0)

  await players[3].locator('.answer-choice[data-option-id]').first().click()
  await players[3].getByRole('button', { name: 'Lock in' }).click()
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close answers now' })).toHaveCount(0)
})

test('Head-to-Head authoring and a true two-player untimed game work end to end', async ({ context, page }) => {
  test.setTimeout(120_000)
  await enterHost(page)
  await page.getByRole('button', { name: '+ Create quiz' }).click()
  await page.getByLabel('Quiz title').fill('Head-to-Head foundation test')

  let settings = await openQuizSettings(page)
  const typePicker = settings.getByRole('group', { name: 'Quiz type' })
  await expect(typePicker.getByRole('button', { name: /Standard/ })).toHaveAttribute('aria-pressed', 'true')
  await typePicker.getByRole('button', { name: /Head to Head/ }).click()
  let setup = settings.getByRole('region', { name: 'Head-to-Head competitors' })
  await setup.getByLabel('Competitor 1').fill('Ross')
  await setup.getByLabel('Competitor 2').fill('Jess')
  await settings.getByRole('button', { name: 'Done' }).click()

  await addQuestion(page, /True or false/)
  await page.getByRole('group', { name: 'Question for' }).getByRole('button', { name: 'Ross' }).click()
  await addQuestion(page, /True or false/)
  await expect(page.getByRole('group', { name: 'Question for' }).getByRole('button', { name: 'Jess' }))
    .toHaveAttribute('aria-pressed', 'true')
  await addQuestion(page, /Slider/)
  await expect(page.getByRole('group', { name: 'Question for' }).getByRole('button', { name: 'Ross' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Points')).toHaveCount(0)
  await page.getByText('Scoring', { exact: true }).click()
  await expect(page.getByText(/Head-to-Head uses 1 point/)).toBeVisible()

  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  settings = await openQuizSettings(page)
  setup = settings.getByRole('region', { name: 'Head-to-Head competitors' })
  await expect(setup.getByLabel('Competitor 1')).toHaveValue('Ross')
  await expect(setup.getByLabel('Competitor 2')).toHaveValue('Jess')
  await settings.getByRole('button', { name: 'Done' }).click()
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
  await expect(jess).toHaveURL(new RegExp(`/play/${roomCode}$`))
  await expect(jess.getByText('You are playing as Jess.')).toBeVisible()
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
  await expect(ross.getByText('Answer locked')).toBeVisible()
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
  await clickQuizCardAction(finishedCard, 'Duplicate')
  await expect(page.getByLabel('Quiz title')).toHaveValue('Head-to-Head foundation test (Copy)')
  settings = await openQuizSettings(page)
  await expect(settings.getByRole('region', { name: 'Head-to-Head competitors' }).getByLabel('Competitor 1')).toHaveValue('Ross')
  await expect(page.locator('.question-navigator')).toContainText('Ross')
  await expect(page.locator('.question-navigator')).toContainText('Jess')

  page.once('dialog', (dialog) => dialog.accept())
  await settings.getByRole('group', { name: 'Quiz type' }).getByRole('button', { name: /Standard/ }).click()
  await expect(settings.getByRole('region', { name: 'Head-to-Head competitors' })).toHaveCount(0)
  await settings.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('group', { name: 'Question for' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  settings = await openQuizSettings(page)
  await expect(settings.getByRole('group', { name: 'Quiz type' }).getByRole('button', { name: /Standard/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(settings.getByRole('region', { name: 'Head-to-Head competitors' })).toHaveCount(0)
  await settings.getByRole('button', { name: 'Done' }).click()
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
  await clickQuizCardAction(page.getByRole('article', { name: 'Blind Import Duel' }), 'Export')
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('blind-import-duel.katwed.json')
  const exportedPath = await download.path()
  if (!exportedPath) throw new Error('Exported quiz file was unavailable')
  const { readFile } = await import('node:fs/promises')
  const exported = JSON.parse(await readFile(exportedPath, 'utf8')) as { formatVersion: number }
  expect(exported.formatVersion).toBe(5)
})

test('quiz themes persist through duplication and audience game phases', async ({ context, page }) => {
  test.setTimeout(120_000)
  await enterHost(page)
  await expect(page.locator('[data-quiz-theme]')).toHaveCount(0)

  const sourceCard = page.getByRole('article', { name: 'The Curious Crew' })
  await sourceCard.getByRole('link', { name: 'Edit' }).click()
  let settings = await openQuizSettings(page, 'Appearance')
  const themePicker = settings.getByRole('group', { name: 'Quiz theme' })
  let backgroundPicker = settings.getByRole('group', { name: 'Quiz background' })
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
  backgroundPicker = settings.getByRole('group', { name: 'Quiz background' })
  await expect(backgroundPicker.getByRole('button', { name: /Circuit/ })).toBeVisible()
  await expect(backgroundPicker.getByRole('button', { name: /Grid/ })).toBeVisible()
  await expect(backgroundPicker.getByRole('button', { name: /Neon/ })).toBeVisible()
  await backgroundPicker.getByRole('button', { name: /Grid/ }).click()
  const preview = page.getByLabel('Arcade theme preview')
  await expect(preview).toHaveAttribute('data-quiz-theme', 'arcade')
  await expect(preview).toHaveAttribute('data-quiz-background', 'arcade-grid')
  await expect(preview).toHaveCSS('background-image', /arcade-grid\.webp/)
  await themePicker.getByRole('button', { name: /Paper/ }).click()
  backgroundPicker = settings.getByRole('group', { name: 'Quiz background' })
  await expect(backgroundPicker.getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Paper theme preview')).not.toHaveAttribute('data-quiz-background')
  await themePicker.getByRole('button', { name: /Arcade/ }).click()
  backgroundPicker = settings.getByRole('group', { name: 'Quiz background' })
  await expect(backgroundPicker.getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
  await backgroundPicker.getByRole('button', { name: /Grid/ }).click()
  const previewBackground = await preview.evaluate<string, void>(
    "element => window.getComputedStyle(element).getPropertyValue('--quiz-bg').trim()",
  )
  expect(previewBackground).not.toBe('')
  await settings.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  settings = await openQuizSettings(page, 'Appearance')
  await expect(settings.getByRole('group', { name: 'Quiz theme' }).getByRole('button', { name: /Arcade/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(settings.getByRole('group', { name: 'Quiz background' }).getByRole('button', { name: /Grid/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await settings.getByRole('button', { name: 'Done' }).click()

  await page.goto('/host')
  await clickQuizCardAction(page.getByRole('article', { name: 'The Curious Crew' }), 'Duplicate')
  await expect(page.getByLabel('Quiz title')).toHaveValue('The Curious Crew (Copy)')
  settings = await openQuizSettings(page, 'Appearance')
  await expect(settings.getByRole('group', { name: 'Quiz theme' }).getByRole('button', { name: /Arcade/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(settings.getByRole('group', { name: 'Quiz background' }).getByRole('button', { name: /Grid/ }))
    .toHaveAttribute('aria-pressed', 'true')
  await settings.getByRole('button', { name: 'Done' }).click()

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
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
  await expect(player.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
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
  settings = await openQuizSettings(page, 'Appearance')
  await settings.getByRole('group', { name: 'Quiz theme' }).getByRole('button', { name: /Paper/ }).click()
  const paperBackgrounds = settings.getByRole('group', { name: 'Quiz background' })
  await paperBackgrounds.getByRole('button', { name: /Collage/ }).click()
  await expect(page.getByLabel('Paper theme preview')).toHaveAttribute('data-quiz-background', 'paper-collage')
  await settings.getByRole('button', { name: 'Done' }).click()
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

  let settings = await openQuizSettings(page, 'Appearance')
  let coverSection = settings.getByRole('region', { name: 'Quiz cover' })
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
  await expect(page.locator('.save-state')).toHaveText('Unsaved changes')
  await expect(page.getByRole('button', { name: 'Save quiz' }).first()).toBeEnabled()
  await settings.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')

  const card = (title: string) => page.getByRole('article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
  await expect(card('Cover lifecycle quiz').locator('.quiz-card__cover')).toBeVisible()

  await card('Cover lifecycle quiz').getByRole('link', { name: 'Edit' }).click()
  settings = await openQuizSettings(page, 'Appearance')
  await expect(settings.getByRole('region', { name: 'Quiz cover' }).locator('img')).toBeVisible()
  await settings.getByRole('button', { name: 'Done' }).click()
  await page.goto('/host')
  await clickQuizCardAction(card('Cover lifecycle quiz'), 'Duplicate')

  await expect(page.getByLabel('Quiz title')).toHaveValue('Cover lifecycle quiz (Copy)')
  settings = await openQuizSettings(page, 'Appearance')
  coverSection = settings.getByRole('region', { name: 'Quiz cover' })
  await expect(coverSection.locator('img')).toBeVisible()
  await coverSection.getByRole('button', { name: 'Remove cover' }).click()
  await settings.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')

  await expect(card('Cover lifecycle quiz').locator('.quiz-card__cover')).toBeVisible()
  await expect(card('Cover lifecycle quiz (Copy)').locator('.quiz-card__cover')).toHaveCount(0)
  await expect(card('Cover lifecycle quiz (Copy)').locator('.quiz-card__art')).toContainText('0')

  await clickQuizCardAction(card('Cover lifecycle quiz'), 'Archive')
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
  let settings = await openQuizSettings(page, 'Appearance')
  let cover = settings.getByRole('region', { name: 'Quiz cover' })
  await cover.getByLabel('Choose cover').setInputFiles({ ...image, name: 'cover-a.png' })
  await expect(cover.locator('img')).toBeVisible()
  await settings.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()

  settings = await openQuizSettings(page, 'Appearance')
  cover = settings.getByRole('region', { name: 'Quiz cover' })
  await cover.getByLabel('Replace cover').setInputFiles({ ...image, name: 'cover-b.png' })
  await settings.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.goto('/host')
  const quizCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Storage lifecycle quiz', exact: true }),
  })
  await expect(quizCard.locator('.quiz-card__cover')).toBeVisible()
  await page.getByRole('navigation', { name: 'Host navigation' }).getByRole('link', { name: 'Storage' }).click()
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

  await page.getByRole('link', { name: 'Back to quizzes' }).click()
  await expect(quizCard.locator('.quiz-card__cover')).toBeVisible()
  await quizCard.getByRole('link', { name: 'Edit' }).click()
  settings = await openQuizSettings(page, 'Appearance')
  await expect(settings.getByRole('region', { name: 'Quiz cover' }).locator('img')).toBeVisible()
  await settings.getByRole('button', { name: 'Done' }).click()
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
  await clickQuizCardAction(page.getByRole('article', { name: 'The Curious Crew' }), 'Archive')
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
  await clickQuizCardAction(sourceCard, 'Duplicate')

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
  await openQuizCardActions(activeCard())
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
  await expect(page).toHaveURL(/\/host\/quizzes\/.+\/setup$/)
  await expect(page.getByRole('heading', { name: 'Set up tonight’s game' })).toBeVisible()
})

test('active room blocks archive until the host closes it', async ({ page }) => {
  await enterHost(page)
  await launchQuiz(page, 'The Curious Crew')
  const controllerUrl = page.url()

  await page.goto('/host')
  const card = page.getByRole('article').filter({ hasText: 'The Curious Crew' })
  await expect(card.getByRole('button', { name: 'Resume game' })).toBeVisible()
  await openQuizCardActions(card)
  const archive = card.getByRole('button', { name: 'Archive' })
  await expect(archive).toBeDisabled()
  await expect(archive).toHaveAttribute('title', 'Close the active game before archiving this quiz.')

  await page.goto(controllerUrl)
  page.once('dialog', async (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close room' }).click()
  await expect(page).toHaveURL(/\/host$/)
  await expect(card.getByRole('button', { name: 'Launch game' })).toBeVisible()
  await openQuizCardActions(card)
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
  await clickQuizCardAction(activeCard, 'Archive')
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
  await page.getByText('Media & presentation').click()
  await page.getByLabel('Reveal effect').selectOption('tiles')
  const grid = page.getByLabel('Tile grid')
  await expect(grid).toBeVisible()
  await grid.selectOption('8')
  await page.getByLabel('Reveal duration').fill('60')
  await expect(page.locator('.editor-preview .tile-cover span')).toHaveCount(64)
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()

  await page.locator('.editor-toolbar').getByRole('link', { name: '← Quizzes' }).click()
  await page.getByRole('button', { name: '+ Create quiz' }).click()
  await page.getByLabel('Quiz title').fill('Double Score browser test')
  await addQuestion(page, /True or false/)
  await page.getByLabel('Prompt').fill('Double Score browser question')
  await page.getByText('Scoring', { exact: true }).click()
  await expect(page.getByLabel('Maximum points')).toHaveValue('1000')
  await expect(page.getByLabel('Faster answers score more')).toBeChecked()
  const doubleScore = page.getByRole('checkbox', { name: 'Double score', exact: true })
  await expect(doubleScore).not.toBeChecked()
  await doubleScore.check()
  await expect(page.getByText('Worth up to 2,000 points.')).toBeVisible()
  await page.getByRole('button', { name: 'Save quiz' }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.locator('.editor-toolbar').getByRole('link', { name: '← Quizzes' }).click()

  const roomCode = await launchQuiz(page, 'Double Score browser test')
  const presentation = await context.newPage()
  await presentation.goto(page.url().replace('/control', '/present'))
  const player = await joinPlayer(context, roomCode, 'Double Player')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByRole('button', { name: 'Close answers now' })).toBeDisabled()
  await expect(presentation.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
  await expect(player.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
  await expect(presentation.getByText('Double Score browser question')).toHaveCount(0)
  await expect(player.getByText('Double Score browser question')).toHaveCount(0)

  await expect(player.getByText('Double Score browser question')).toBeVisible({ timeout: 10_000 })
  await expect(presentation.getByText('Double Score browser question')).toBeVisible({ timeout: 10_000 })
  await expect(player.getByText('2x points')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close answers now' })).toBeEnabled()
  await player.getByRole('button', { name: 'True' }).click()
  await player.getByRole('button', { name: 'Lock in' }).click()
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page.getByRole('button', { name: 'Reveal final results' }).click()
  await expect(player.locator('.final-results')).toBeVisible()

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
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
    await presentation.setViewportSize(viewport)
    expect(await presentation.evaluate<boolean>('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
  }
  await playerOne.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(playerOne.getByRole('button', { name: 'Mars' })).toBeVisible()

  async function revealRound(expectedReveal: RegExp) {
    const closeAnswers = page.getByRole('button', { name: 'Close answers now' })
    if (await closeAnswers.isVisible()) await closeAnswers.click()
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
    await expect(presentation.getByRole('heading', { name: 'Answers locked' })).toBeVisible()
    await page.getByRole('button', { name: 'Reveal answer' }).click()
    await expect(presentation.locator('.presentation-reveal')).toContainText(expectedReveal)
    await expect(presentation.locator('.presentation-reveal-grid, .reveal-answer-card, .presentation-pinpoint-reveal').first()).toBeVisible()
    await expect(page.locator('.controller-preview').locator('.presentation-reveal-grid, .reveal-answer-card, .presentation-pinpoint-reveal').first()).toBeVisible()
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
  const correctSet = playerOne.getByRole('group', { name: 'Correct answer' })
  await expect(correctSet.getByText('Red', { exact: true })).toBeVisible()
  await expect(correctSet.getByText('Green', { exact: true })).toBeVisible()
  await expect(correctSet.getByText('Blue', { exact: true })).toBeVisible()
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
  await expect(presentation.locator('.final-results')).toBeVisible()
  await expect(presentation.getByRole('list', { name: 'Top final positions' })).toBeVisible()
  await expect(playerOne.locator('.final-results')).toBeVisible()
  await expect(zeroScorePlayer.locator('.final-results')).toBeVisible()
  await expect(presentation.locator('.final-podium li').filter({ hasText: 'Quinn' })).toContainText('7,001')
})

test('mash-up remains usable at representative mobile widths', async ({ context, page }) => {
  await enterHost(page)
  const roomCode = await launchQuiz(page, 'The Curious Crew')
  const player = await joinPlayer(context, roomCode, 'Mobile Player')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(player.getByRole('heading', { name: 'Select exactly 2 people' })).toBeVisible()
  for (const width of [320, 360, 375, 390, 430]) {
    await player.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    const bodyBox = await player.locator('body').boundingBox()
    expect(bodyBox?.width).toBeLessThanOrEqual(width)
    await expect(player.getByRole('button', { name: 'Lock in' })).toBeVisible()
  }
  await player.getByRole('button', { name: 'Alex' }).click()
  await player.getByRole('button', { name: 'Bailey' }).click()
  await expect(player.getByRole('button', { name: 'Lock in' })).toBeEnabled()
})

test('Presentation owns idempotent phase audio while Controller preferences stay local', async ({ context, page }) => {
  test.setTimeout(90_000)
  await enterHost(page)
  const roomCode = await launchQuiz(page, 'Katwed! Mixed Quiz')
  const presentation = await context.newPage()
  await mockPresentationAudio(presentation)
  const browserErrors: string[] = []
  presentation.on('pageerror', (error) => browserErrors.push(error.message))
  presentation.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await presentation.goto(page.url().replace('/control', '/present'))
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-pack', 'katwed')
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-cue', 'lobby')
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(1)

  await page.getByRole('slider', { name: 'Music volume' }).fill('35')
  await page.getByRole('slider', { name: 'Effects volume' }).fill('90')
  await expect(page.getByText('35%')).toBeVisible()
  await expect(page.getByText('90%')).toBeVisible()
  await page.getByRole('button', { name: 'Mute' }).click()
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-muted', 'true')
  await page.getByRole('button', { name: 'Unmute' }).click()
  await expect(presentation.locator('.presentation-page')).not.toHaveAttribute('data-audio-muted')

  const player = await joinPlayer(context, roomCode, 'Audio Player')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-cue', 'question')
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(2)
  await player.getByRole('button', { name: 'Mars' }).click()
  await player.getByRole('button', { name: 'Lock in' }).click()
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-cue', 'lock')
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(3)
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-cue', 'reveal')
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(4)
  await page.getByRole('button', { name: 'Show leaderboard' }).click()
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-cue', 'leaderboard')
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(5)
  await presentation.waitForTimeout(5_200)
  expect(await presentationAudioPlayCount(presentation)).toBe(5)
  expect(await presentation.locator('audio').count()).toBe(0)
  expect(browserErrors).toEqual([])
})

test('session Music theme None persists and keeps the Presentation silent', async ({ context, page }) => {
  await enterHost(page)
  await launchQuiz(page, 'The Curious Crew', async (setup) => {
    await setup.getByRole('button', { name: /None/ }).click()
    await expect(setup.getByRole('button', { name: /None/ })).toHaveAttribute('aria-pressed', 'true')
  })
  const presentation = await context.newPage()
  await mockPresentationAudio(presentation)
  await presentation.goto(page.url().replace('/control', '/present'))
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-pack', 'none')
  await expect(presentation.locator('.presentation-page')).toHaveAttribute('data-audio-cue', 'silent')
  expect(await presentationAudioPlayCount(presentation)).toBe(0)
})

test('blocked Presentation audio stays recoverable and never blocks gameplay', async ({ context, page }) => {
  await enterHost(page)
  const roomCode = await launchQuiz(page, 'Katwed! Mixed Quiz')
  const presentation = await context.newPage()
  await mockPresentationAudio(presentation, true)
  await presentation.goto(page.url().replace('/control', '/present'))
  await expect(presentation.getByRole('button', { name: 'Enable sound' })).toBeVisible()
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(1)
  await presentation.getByRole('button', { name: 'Enable sound' }).click()
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(2)
  const player = await joinPlayer(context, roomCode, 'Silent Player')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(player.getByRole('heading', { name: 'Which planet is known as the Red Planet?' })).toBeVisible()
  await expect(presentation.getByRole('heading', { name: 'Which planet is known as the Red Planet?' })).toBeVisible()
  await expect(presentation.getByRole('button', { name: 'Enable sound' })).toBeVisible()
  await presentation.getByRole('button', { name: 'Enable sound' }).click()
  await expect.poll(() => presentationAudioPlayCount(presentation)).toBe(4)
})
