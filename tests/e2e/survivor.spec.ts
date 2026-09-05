import { waitForDemoLobby } from './demoState'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { progressiveQuestion } from '../../src/test/progressiveFixtures'
import { wagerQuiz } from '../../src/test/wagerFixtures'
import type { GameSession, Quiz } from '../../src/types/domain'

const typed = (id: string, order: number) => ({
  ...progressiveQuestion(), id, displayOrder: order, prompt: `Survivor question ${order + 1}`,
  progressiveRevealEnabled: false, speedScoringEnabled: false, media: { type: 'none' as const },
})
const currentSession = (page: Page): Promise<GameSession> => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { sessions: GameSession[] }).sessions[0])

async function setup(page: Page, title: string, startingLives: 1 | 3) {
  const quiz = wagerQuiz([typed('survivor-1', 0), typed('survivor-2', 1)])
  quiz.title = title
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate((value: Quiz) => {
    const key = 'katwed.demo.state.v2'
    const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    state.quizzes = [value]
    localStorage.setItem(key, JSON.stringify(state))
  }, quiz)
  await page.reload()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('article', { name: title }).getByRole('button', { name: 'Launch game' }).click()
  await page.getByRole('button', { name: 'Survivor' }).click()
  await page.getByRole('button', { name: `${startingLives} ${startingLives === 1 ? 'life' : 'lives'}` }).click()
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  return { quiz, code: (await waitForDemoLobby(page)).roomCode }
}

async function join(context: BrowserContext, code: string, nickname: string) {
  const phone = await context.newPage()
  await phone.setViewportSize({ width: 320, height: 740 })
  await phone.goto(`/join?room=${code}`)
  await phone.getByLabel('Nickname').fill(nickname)
  await phone.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(phone.getByRole('heading', { name: `You’re in, ${nickname}!` })).toBeVisible()
  return phone
}

async function answer(phone: Page, value: string) {
  await phone.getByRole('textbox').fill(value)
  await phone.getByRole('button', { name: 'Lock in', exact: true }).click()
}

async function noOverflow(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
}

test('three-life Survivor loses one life only when the first Leaderboard is shown', async ({ page, context }) => {
  test.setTimeout(90_000)
  const { code } = await setup(page, 'Three Life Survivor', 3)
  const phone = await join(context, code, 'Carol')
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(phone.getByText('3 lives', { exact: true })).toBeVisible()
  await answer(phone, 'Wrong')
  expect((await currentSession(page)).players[0].survivorLivesRemaining).toBe(3)
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  expect((await currentSession(page)).players[0].survivorLivesRemaining).toBe(3)
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await expect(phone.locator('.player-survivor-result strong')).toHaveText('2 LIVES')
  expect((await currentSession(page)).players[0]).toMatchObject({ survivorLivesRemaining: 2, survivorEliminatedAtQuestion: null })
  await noOverflow(phone)
})

test('eliminated player spectates while the last survivor reaches Final Results', async ({ page, context }) => {
  test.setTimeout(120_000)
  const { code } = await setup(page, 'Last Survivor', 1)
  const carol = await join(context, code, 'Carol')
  const roger = await join(context, code, 'Roger')
  const jaki = await join(context, code, 'Jaki')
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await answer(carol, 'Alex'); await answer(roger, 'Wrong'); await answer(jaki, 'Alex')
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await expect(roger.getByText('YOU’RE OUT')).toBeVisible()
  await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await expect(roger.getByRole('heading', { name: 'Spectating this question' })).toBeVisible()
  await expect(roger.getByRole('textbox')).toHaveCount(0)
  await answer(carol, 'Alex'); await answer(jaki, 'Wrong')
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  await expect(carol.getByRole('heading', { name: 'LAST PLAYER STANDING' })).toBeVisible()
  await expect(carol.locator('.survivor-final__winner')).toHaveText('Carol')
  await expect(roger.getByRole('heading', { name: 'LAST PLAYER STANDING' })).toBeVisible()
  await noOverflow(carol); await noOverflow(roger); await noOverflow(jaki)
})
