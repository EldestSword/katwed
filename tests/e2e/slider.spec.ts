import { expect, test } from '@playwright/test'
import type { PlayerAnswerPayload, Quiz } from '../../src/types/domain'

test('Slider selects continuously, fits a narrow phone, nudges precisely and locks the chosen payload', async ({ page, context, isMobile }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  // An isolated, single-question demo fixture keeps this check strictly about the Slider player flow.
  await page.evaluate(() => {
    const key = 'katwed.demo.state.v2'
    const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    const quiz = state.quizzes.find((candidate) => candidate.title === 'Katwed! Mixed Quiz')!
    const slider = quiz.questions.find((question) => question.type === 'slider')!
    quiz.questions = [{ ...slider, prompt: 'Choose a weight', minimum: 0, maximum: 10, step: .1,
      correctValue: 3, tolerance: 0, prefix: '', suffix: '', unitLabel: 'kg', timeLimitSeconds: 120, displayOrder: 0 }]
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('button', { name: 'Launch game' }).click()
  await page.getByRole('button', { name: 'Start lobby' }).click()
  await expect(page).toHaveURL(/\/control$/)
  const roomCode = (await page.locator('.controller-bar').textContent())?.match(/Room\s+(\d{6})/)?.[1]
  if (!roomCode) throw new Error('Room code unavailable')
  const player = await context.newPage()
  await player.setViewportSize(isMobile ? { width: 320, height: 740 } : { width: 1280, height: 900 })
  if (isMobile) await player.emulateMedia({ reducedMotion: 'reduce' })
  await player.goto(`/join?room=${roomCode}`)
  await player.getByLabel('Nickname').fill('Slider Player')
  await player.getByRole('button', { name: 'Join game' }).click()
  await expect(player.getByRole('heading', { name: 'You’re in, Slider Player' })).toBeVisible()
  await page.getByRole('button', { name: 'Start game' }).click()

  const slider = player.getByRole('slider', { name: 'kg' })
  const bubble = player.locator('.slider-answer output')
  const lock = player.getByRole('button', { name: 'Lock in', exact: true })
  await expect(slider).toHaveValue('5')
  await expect(lock).toBeDisabled()
  await expect(player.getByText(/No value chosen. Tap or drag/)).toBeVisible()
  await slider.focus()
  await expect(lock).toBeDisabled()
  await expect(slider).toHaveCSS('touch-action', 'none')
  await expect(player.locator('.slider-answer__interaction')).toHaveCSS('touch-action', 'auto')
  await slider.scrollIntoViewIfNeeded()
  const box = (await slider.boundingBox())!
  const controlBox = (await player.locator('.slider-answer').boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  const y = box.y + box.height / 2
  const xAt = (fraction: number) => box.x + 20 + fraction * (box.width - 40)
  const scrollBefore = await player.evaluate<number>('window.scrollY')
  const touch = isMobile ? await context.newCDPSession(player) : null
  if (touch) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: xAt(.2), y }] })
  } else {
    await player.mouse.move(xAt(.2), y)
    await player.mouse.down()
  }
  await expect(slider).toHaveValue('2')
  await expect(bubble).toHaveText('2 kg')
  await expect(lock).toBeEnabled()
  for (const fraction of [.4, .7, 1, 0]) {
    if (touch) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: xAt(fraction), y: y + 14 }] })
    } else {
      // Move outside the vertical hit area too: capture must keep the active drag attached.
      await player.mouse.move(xAt(fraction), y + 36, { steps: 4 })
    }
    // These assertions run while the pointer is still held, not after release.
    await expect(slider).toHaveValue(String(fraction * 10))
    await expect(bubble).toHaveText(`${fraction * 10} kg`)
    if (fraction === 1) await expect(player.getByRole('button', { name: 'Increase answer' })).toBeDisabled()
    const bubbleBox = (await bubble.boundingBox())!
    expect(bubbleBox.x).toBeGreaterThanOrEqual(controlBox.x)
    expect(bubbleBox.x + bubbleBox.width).toBeLessThanOrEqual(controlBox.x + controlBox.width)
    expect(await player.evaluate<boolean>('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
  }
  expect(await player.evaluate<number>('window.scrollY')).toBe(scrollBefore)
  if (touch) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await touch.detach()
  } else {
    await player.mouse.up()
    await player.keyboard.press('Tab')
    await player.keyboard.press('Shift+Tab')
    await expect(slider).toBeFocused()
    await expect(slider).toHaveCSS('outline-style', 'solid')
    for (const [key, expected] of [['ArrowRight', '0.1'], ['ArrowUp', '0.2'], ['ArrowLeft', '0.1'], ['ArrowDown', '0'], ['End', '10'], ['Home', '0']]) {
      await slider.press(key)
      await expect(slider).toHaveValue(expected)
    }
  }

  const decrease = player.getByRole('button', { name: 'Decrease answer' })
  const increase = player.getByRole('button', { name: 'Increase answer' })
  await expect(decrease).toBeDisabled()
  for (const button of [decrease, increase]) {
    const buttonBox = (await button.boundingBox())!
    expect(buttonBox.width).toBeGreaterThanOrEqual(44)
    expect(buttonBox.height).toBeGreaterThanOrEqual(44)
  }
  for (const value of ['0.1', '0.2', '0.3']) {
    if (isMobile) await increase.tap()
    else await increase.click()
    await expect(slider).toHaveValue(value)
    await expect(bubble).toHaveText(`${value} kg`)
  }
  await decrease.click()
  await expect(slider).toHaveValue('0.2')
  await increase.click()
  await expect(slider).toHaveValue('0.3')
  await expect(lock).toBeInViewport()
  await player.screenshot({ path: testInfo.outputPath('slider-player.png'), fullPage: true })
  await lock.click()
  await expect(player.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  const payloads = await player.evaluate((code) => {
    const state = JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as {
      sessions: Array<{ roomCode: string; answers: Array<{ payload: PlayerAnswerPayload }> }>
    }
    return state.sessions.find((session) => session.roomCode === code)!.answers.map((answer) => answer.payload)
  }, roomCode)
  expect(payloads).toEqual([{ type: 'slider', value: .3 }])
})
