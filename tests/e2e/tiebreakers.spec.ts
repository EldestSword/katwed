import { waitForDemoLobby } from './demoState'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { progressiveQuestion } from '../../src/test/progressiveFixtures'
import { wagerQuiz } from '../../src/test/wagerFixtures'
import type { GameSession, Quiz } from '../../src/types/domain'

interface DemoTieSession extends GameSession {
  tieBreakerQuestion: { id: string; answer: string; category: string }
  tieBreakerOpenedAt: string
}

async function currentSession(page: Page): Promise<DemoTieSession> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { sessions: DemoTieSession[] }).sessions[0])
}

async function setup(page: Page, title: string) {
  const quiz = wagerQuiz([{
    ...progressiveQuestion(), prompt: 'Final points question', progressiveRevealEnabled: false,
    speedScoringEnabled: false, wagerEnabled: true, media: { type: 'none' as const },
  }])
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
  await expect(page.getByText('Automatic · On')).toBeVisible()
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  return (await waitForDemoLobby(page)).roomCode
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

async function noOverflow(page: Page) {
  expect(await page.locator('html').evaluate((root: unknown) => {
    const dimensions = root as { scrollWidth: number; clientWidth: number }
    return dimensions.scrollWidth <= dimensions.clientWidth
  })).toBe(true)
}

async function reachTieBreaker(host: Page, phones: Page[], losingPhone?: Page) {
  await host.getByRole('button', { name: 'Start game', exact: true }).click()
  if (losingPhone) {
    await losingPhone.getByRole('radio', { name: /^100%/ }).check()
    await losingPhone.getByRole('textbox').fill('Wrong')
    await losingPhone.getByRole('button', { name: 'Lock in', exact: true }).click()
  }
  await host.getByRole('button', { name: 'Close answers now' }).click()
  await host.getByRole('button', { name: 'Reveal answer' }).click()
  await host.getByRole('button', { name: 'Reveal final results' }).click()
  await Promise.all(phones.map((phone) => expect(phone.getByText(/Tie-breaker · Round 1/)).toBeVisible()))
}

test('Points final tie resolves for finalists while a 320px spectator watches', async ({ page, context }) => {
  test.setTimeout(90_000)
  const code = await setup(page, 'Automatic Tie-Breaker')
  const presentation = await context.newPage()
  await presentation.setViewportSize({ width: 1280, height: 720 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const carol = await join(context, code, 'Carol')
  const roger = await join(context, code, 'Roger')
  const jaki = await join(context, code, 'Jaki')
  await reachTieBreaker(page, [carol, roger, jaki], jaki)

  await expect(carol.getByLabel(/Your estimate/)).toBeVisible()
  await expect(roger.getByLabel(/Your estimate/)).toBeVisible()
  await expect(jaki.getByRole('heading', { name: /Carol and Roger are playing for the win/ })).toBeVisible()
  await expect(jaki.getByLabel(/Your estimate/)).toHaveCount(0)
  await expect(presentation.getByText('playing for the win')).toBeVisible()
  await expect(page.locator('.controller-tiebreaker')).toContainText('0 / 2 locked in')
  const target = (await currentSession(page)).tieBreakerQuestion.answer
  await carol.getByLabel(/Your estimate/).fill(String(Number(target) + 10))
  await carol.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(page.locator('.controller-tiebreaker')).toContainText('1 / 2 locked in')
  await roger.getByLabel(/Your estimate/).fill(target)
  await roger.getByRole('button', { name: 'Lock in', exact: true }).click()

  await expect(presentation.getByRole('heading', { name: 'Roger wins the tie-breaker' })).toBeVisible()
  await expect(jaki.getByText('Roger wins the tie-breaker')).toBeVisible()
  await expect(page.locator('.controller-tiebreaker__source')).toContainText('Source:')
  await page.getByRole('button', { name: 'Reveal final results' }).click()
  await expect(presentation.locator('.final-podium [data-rank="1"]')).toContainText('Roger')
  await noOverflow(carol); await noOverflow(roger); await noOverflow(jaki); await noOverflow(presentation)
})

test('an exact distance and response-time tie opens an unused second round', async ({ page, context }) => {
  test.setTimeout(90_000)
  const code = await setup(page, 'Sudden Death Tie-Breaker')
  const carol = await join(context, code, 'Carol')
  const roger = await join(context, code, 'Roger')
  await reachTieBreaker(page, [carol, roger])
  const first = await currentSession(page)
  const fixedAnswerTime = new Date(Date.parse(first.tieBreakerOpenedAt) + 1000)
  await carol.clock.install({ time: fixedAnswerTime })
  await roger.clock.install({ time: fixedAnswerTime })
  await carol.clock.setFixedTime(fixedAnswerTime)
  await roger.clock.setFixedTime(fixedAnswerTime)
  await carol.getByLabel(/Your estimate/).fill(first.tieBreakerQuestion.answer)
  await carol.getByRole('button', { name: 'Lock in', exact: true }).click()
  await roger.getByLabel(/Your estimate/).fill(first.tieBreakerQuestion.answer)
  await roger.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(page.locator('.controller-tiebreaker').getByRole('heading', { name: 'Still tied' })).toBeVisible()
  await page.getByRole('button', { name: 'Next tie-breaker' }).click()
  await expect(carol.getByText(/Tie-breaker · Round 2/)).toBeVisible()
  const second = await currentSession(page)
  expect(second.tieBreakerQuestion.id).not.toBe(first.tieBreakerQuestion.id)
  expect(second.tieBreakerQuestion.category).not.toBe(first.tieBreakerQuestion.category)
  await noOverflow(carol); await noOverflow(roger)
})
