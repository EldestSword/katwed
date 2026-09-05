import { waitForDemoLobby } from './demoState'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { progressiveQuestion } from '../../src/test/progressiveFixtures'
import { wagerQuiz } from '../../src/test/wagerFixtures'
import type { GameSession, Quiz } from '../../src/types/domain'

function buzzQuestion(id: string, roundId?: string) {
  return {
    ...progressiveQuestion(),
    id,
    roundId: roundId ?? progressiveQuestion().roundId,
    prompt: `Buzz question ${id}`,
    media: { type: 'none' as const },
    progressiveRevealEnabled: false,
    buzzInEnabled: true,
    speedScoringEnabled: false,
    timeLimitSeconds: 60,
  }
}

async function setup(page: Page, quiz: Quiz) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate((value) => {
    const key = 'katwed.demo.state.v2'
    const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    state.quizzes = [value]
    localStorage.setItem(key, JSON.stringify(state))
  }, quiz)
  await page.reload()
}

async function currentSession(page: Page): Promise<GameSession> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { sessions: GameSession[] }).sessions[0])
}

async function launch(page: Page, title: string, teams = false) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('article', { name: title }).getByRole('button', { name: 'Launch game' }).click()
  if (teams) {
    await page.getByRole('button', { name: 'Teams', exact: true }).click()
    await page.getByLabel('Team 1 name').fill('Blue')
    await page.getByLabel('Team 2 name').fill('Red')
    await page.getByLabel('Team assignment').selectOption('host')
  }
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  return (await waitForDemoLobby(page)).roomCode
}

async function join(context: BrowserContext, code: string, name: string) {
  const page = await context.newPage()
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto(`/join?room=${code}`)
  await page.getByLabel('Nickname').fill(name)
  await page.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(page.getByRole('heading', { name: `You’re in, ${name}!` })).toBeVisible()
  return page
}

async function noOverflow(page: Page) {
  const fits = await page.locator('html').evaluate((root: unknown) => {
    const dimensions = root as { scrollWidth: number; clientWidth: number }
    return dimensions.scrollWidth <= dimensions.clientWidth
  })
  expect(fits).toBe(true)
}

test('two-player race has one winner, host reset reopens Buzz, and the winner keeps their Wager', async ({ page, context }) => {
  test.setTimeout(90_000)
  const first = buzzQuestion('one')
  const second = { ...buzzQuestion('two'), displayOrder: 1 }
  const quiz = wagerQuiz([first, second])
  quiz.title = 'Buzz Race'
  await setup(page, quiz)
  const code = await launch(page, quiz.title)
  const presentation = await context.newPage()
  await presentation.setViewportSize({ width: 1280, height: 720 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const carol = await join(context, code, 'Carol')
  const ross = await join(context, code, 'Ross')

  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  for (const player of [carol, ross]) {
    await expect(player.getByRole('button', { name: 'BUZZ' })).toBeVisible()
    await expect(player.getByRole('textbox')).toHaveCount(0)
  }
  await expect(presentation.getByText('Buzzers open', { exact: true })).toBeVisible()
  await carol.getByRole('radio', { name: /^50%/ }).check()
  await ross.getByRole('radio', { name: /^100%/ }).check()
  await Promise.all([
    carol.getByRole('button', { name: 'BUZZ' }).click(),
    ross.getByRole('button', { name: 'BUZZ' }).click(),
  ])

  await expect.poll(async () => (await currentSession(page)).buzz?.winnerPlayerId).toBeTruthy()
  let state = await currentSession(page)
  const firstWinner = state.players.find((player) => player.id === state.buzz?.winnerPlayerId)!
  const firstWinnerPage = firstWinner.nickname === 'Carol' ? carol : ross
  const nextWinnerPage = firstWinner.nickname === 'Carol' ? ross : carol
  const nextWinnerName = firstWinner.nickname === 'Carol' ? 'Ross' : 'Carol'
  const nextWager = nextWinnerName === 'Carol' ? 50 : 100
  await expect(firstWinnerPage.getByText('You got the buzz!')).toBeVisible()
  await expect(nextWinnerPage.getByText(new RegExp(`${firstWinner.nickname} buzzed first`, 'i'))).toBeVisible()
  await expect(nextWinnerPage.getByRole('textbox')).toHaveCount(0)
  await expect(page.locator('.controller-buzz').getByText(new RegExp(`${firstWinner.nickname} buzzed first`, 'i'))).toBeVisible()
  expect(state.answers).toHaveLength(0)

  await page.getByRole('button', { name: 'Reset buzz' }).click()
  await expect(carol.getByRole('button', { name: 'BUZZ' })).toBeVisible()
  await expect(ross.getByRole('button', { name: 'BUZZ' })).toBeVisible()
  expect((await currentSession(page)).answers).toHaveLength(0)
  await nextWinnerPage.getByRole('button', { name: 'BUZZ' }).click()
  await expect(nextWinnerPage.getByText('You got the buzz!')).toBeVisible()
  await expect(nextWinnerPage.getByRole('radio', { name: new RegExp(`^${nextWager}%`) })).toBeChecked()
  await nextWinnerPage.getByRole('textbox').fill('Alex')
  await nextWinnerPage.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(nextWinnerPage.getByRole('heading', { name: 'Answer locked' })).toBeVisible()

  state = await currentSession(page)
  expect(state.buzz?.winnerPlayerId).toBe(state.players.find((player) => player.nickname === nextWinnerName)?.id)
  expect(state.answers).toHaveLength(1)
  expect(state.answers[0]).toMatchObject({ wagerPercent: nextWager, pointsAwarded: 1000 + (1000 * nextWager / 100) })
  await expect(page.getByRole('button', { name: 'Reset buzz' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await expect(presentation.getByRole('list', { name: 'Leaderboard', exact: true })).toContainText(nextWinnerName)
  await noOverflow(carol)
  await noOverflow(ross)
  await noOverflow(presentation)
})

test('Team Buzz after Round Intro closes at ten seconds, resets safely, and scores only the new winner', async ({ page, context }) => {
  test.setTimeout(120_000)
  const ordinary = { ...buzzQuestion('ordinary'), buzzInEnabled: false, wagerEnabled: false }
  const quiz = wagerQuiz([ordinary])
  quiz.title = 'Team Buzz Round'
  quiz.rounds.push({ ...quiz.rounds[0], id: 'buzz-round', title: 'Buzz Round', displayOrder: 1, introEnabled: true })
  quiz.questions.push({ ...buzzQuestion('final', 'buzz-round'), wagerEnabled: false, displayOrder: 1 })
  await setup(page, quiz)
  const code = await launch(page, quiz.title, true)
  const presentation = await context.newPage()
  await presentation.setViewportSize({ width: 1280, height: 720 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const carol = await join(context, code, 'Carol')
  const ross = await join(context, code, 'Ross')
  await page.getByLabel('Team for Carol').selectOption({ label: 'Blue' })
  await page.getByLabel('Team for Ross').selectOption({ label: 'Red' })

  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  for (const player of [carol, ross]) {
    await player.getByRole('textbox').fill('Alex')
    await player.getByRole('button', { name: 'Lock in', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await page.getByRole('button', { name: /Next round/ }).click()
  await expect(carol.getByRole('heading', { name: 'Buzz Round', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start round', exact: true }).click()

  await carol.getByRole('button', { name: 'BUZZ' }).click()
  await expect(presentation.getByText(/Carol · Blue buzzed first!/i)).toBeVisible()
  await expect(ross.getByText(/Carol · Blue buzzed first/i)).toBeVisible()
  await expect(carol.getByText('Answer window closed', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(carol.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reset buzz' })).toBeVisible()

  await page.getByRole('button', { name: 'Reset buzz' }).click()
  await expect(ross.getByRole('button', { name: 'BUZZ' })).toBeVisible()
  await ross.getByRole('button', { name: 'BUZZ' }).click()
  await expect(presentation.getByText(/Ross · Red buzzed first!/i)).toBeVisible()
  await ross.getByRole('textbox').fill('Alex')
  await ross.getByRole('button', { name: 'Lock in', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()

  const state = await currentSession(page)
  expect(state.answers.filter((answer) => answer.questionId === quiz.questions[1].id)).toHaveLength(1)
  expect(state.players.find((player) => player.nickname === 'Carol')?.totalScore).toBe(1000)
  expect(state.players.find((player) => player.nickname === 'Ross')?.totalScore).toBe(2000)
  await expect(presentation.locator('.final-results')).toContainText('Red')
  const preview = page.locator('.controller-preview')
  const bounds = (await preview.boundingBox())!
  const finalBounds = (await preview.locator('.presentation-stage').boundingBox())!
  expect(finalBounds.y + finalBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1)
  await noOverflow(carol)
  await noOverflow(ross)
  await noOverflow(presentation)
})
