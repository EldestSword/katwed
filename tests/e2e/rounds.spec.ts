import { expect, test, type Page } from '@playwright/test'
import type { Quiz } from '../../src/types/domain'

async function signIn(page: Page, intro: boolean, singleRound = false) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate(({ intro, singleRound }) => {
    const key = 'katwed.demo.state.v2'
    const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    const quiz = state.quizzes.find((q) => q.title === 'Katwed! Mixed Quiz')!
    quiz.rounds = [
      { id: quiz.id, quizId: quiz.id, title: 'Opening round', subtitle: 'A gentle beginning', displayOrder: 0, introEnabled: intro },
      { id: 'round-two', quizId: quiz.id, title: 'The finale', subtitle: 'One more to go', displayOrder: 1, introEnabled: intro },
    ]
    if (singleRound) quiz.rounds = quiz.rounds.slice(0, 1)
    const question = quiz.questions.find((q) => q.type === 'true-false')!
    quiz.questions = [0, 1].map((index) => ({ ...question, id: `round-question-${index}`, roundId: quiz.rounds[singleRound ? 0 : index].id,
      prompt: index ? 'The final question' : 'The opening question', displayOrder: index, timeLimitSeconds: 120 }))
    localStorage.setItem(key, JSON.stringify(state))
  }, { intro, singleRound })
  await page.reload()
}

async function startLobby(page: Page) {
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('button', { name: 'Launch game' }).click()
  await page.getByRole('button', { name: 'Start lobby' }).click()
  await expect(page).toHaveURL(/\/control$/)
  const code = (await page.locator('.controller-bar').textContent())?.match(/Room\s+(\d{6})/)?.[1]
  if (!code) throw new Error('Room code unavailable')
  return code
}

test('round editor adds, renames, moves, duplicates and reloads grouped questions', async ({ page }, testInfo) => {
  await signIn(page, false)
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Add round', exact: true }).click()
  await page.getByText('Edit round 3', { exact: true }).click()
  const round = page.getByRole('region', { name: 'Round 3: Round 3', exact: true })
  await round.getByLabel('Round title').fill('Picture round')
  const renamed = page.getByRole('region', { name: 'Round 3: Picture round', exact: true })
  await renamed.getByLabel('Round subtitle').fill('Look closely')
  await expect(renamed.getByLabel('Show round intro')).toBeChecked()
  await page.getByRole('combobox', { name: 'Round', exact: true }).selectOption({ label: 'Picture round' })
  await expect(renamed.getByRole('button', { name: /The opening question/ })).toBeVisible()
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(renamed.getByRole('button', { name: /The opening question/ })).toHaveCount(2)
  await page.getByRole('button', { name: 'Save quiz', exact: true }).first().click()
  await expect(page.getByText('Quiz saved.', { exact: true })).toBeVisible()
  await page.reload()
  const reloaded = page.getByRole('region', { name: 'Round 3: Picture round', exact: true })
  await expect(reloaded.getByRole('button', { name: /The opening question/ })).toHaveCount(2)
  await reloaded.getByText('Edit round 3', { exact: true }).click()
  await expect(reloaded.getByLabel('Round subtitle')).toHaveValue('Look closely')
  await expect(reloaded.getByRole('button', { name: 'Delete round', exact: true })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('round-editor.png'), fullPage: true, scale: 'css' })
})

test('host gates round intros on presentation and phones before the full question flow', async ({ page, context, isMobile }, testInfo) => {
  test.setTimeout(60_000)
  await signIn(page, true)
  const code = await startLobby(page)
  const presentation = await context.newPage()
  await presentation.setViewportSize({ width: 1280, height: 720 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const player = await context.newPage()
  if (isMobile) await player.setViewportSize({ width: 320, height: 740 })
  await player.goto(`/join?room=${code}`)
  await player.getByLabel('Nickname').fill('Round Player')
  await player.getByRole('button', { name: 'Join game' }).click()
  await expect(player.getByRole('heading', { name: 'You’re in, Round Player!' })).toBeVisible()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(presentation.getByRole('heading', { name: 'Opening round', exact: true })).toBeVisible()
  await expect(player.getByText('Waiting for the host to start the round…', { exact: true })).toBeVisible()
  await expect(player.getByRole('button', { name: 'Lock in', exact: true })).toHaveCount(0)
  await expect(player.getByText('The opening question', { exact: true })).toHaveCount(0)
  await expect(presentation.getByText('1 question', { exact: true })).toBeVisible()
  await presentation.screenshot({ path: testInfo.outputPath('round-intro-presentation.png'), scale: 'css' })
  await player.screenshot({ path: testInfo.outputPath('round-intro-player.png'), fullPage: true, scale: 'css' })
  await page.screenshot({ path: testInfo.outputPath('round-intro-controller.png'), fullPage: true, scale: 'css' })
  await player.reload()
  await expect(player.getByText('Waiting for the host to start the round…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start round', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'The opening question', exact: true })).toBeVisible()
  await player.getByRole('button', { name: 'True', exact: true }).click()
  await player.getByRole('button', { name: 'Lock in', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await page.getByRole('button', { name: 'Next round', exact: true }).click()
  await expect(presentation.getByRole('heading', { name: 'The finale', exact: true })).toBeVisible()
  await expect(player.getByRole('heading', { name: 'The finale', exact: true })).toBeVisible()
  await expect(player.getByRole('heading', { name: 'Leaderboard', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start round', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'The final question', exact: true })).toBeVisible()
})

test('a silent single-round quiz retains the direct start behaviour', async ({ page, context }) => {
  await signIn(page, false, true)
  const code = await startLobby(page)
  const player = await context.newPage()
  await player.goto(`/join?room=${code}`)
  await player.getByLabel('Nickname').fill('Legacy Player')
  await player.getByRole('button', { name: 'Join game' }).click()
  await expect(player.getByRole('heading', { name: 'You’re in, Legacy Player!' })).toBeVisible()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'The opening question', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toHaveCount(0)
})
