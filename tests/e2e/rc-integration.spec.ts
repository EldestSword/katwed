import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { allWagerQuestions, wagerQuiz } from '../../src/test/wagerFixtures'
import { connectionsFixture } from '../../src/test/connectionsFixtures'
import { progressiveQuestion } from '../../src/test/progressiveFixtures'
import { progressiveRevealScore } from '../../src/features/scoring/progressiveReveal'
import type { GameSession, PowerUpUse, Quiz } from '../../src/types/domain'

interface Session extends GameSession {
  powerUpUses: Array<PowerUpUse & { playerId: string }>
  tieBreakerQuestion: { answer: string }
}
const state = (page: Page): Promise<Session> => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { sessions: Session[] }).sessions[0])
const identities = new WeakMap<Page, { key: string; value: string }>()
async function reloadPlayer(phone: Page) {
  // Demo tabs share localStorage, unlike separate real player devices. Restore
  // this test player's saved token before exercising the real reconnect path.
  await phone.evaluate(({ key, value }) => localStorage.setItem(key, value), identities.get(phone)!)
  await phone.reload()
}
async function setup(page: Page, quiz: Quiz, survivor = false) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate((quiz: Quiz) => {
    const key = 'katwed.demo.state.v2', data = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    data.quizzes = [quiz]; localStorage.setItem(key, JSON.stringify(data))
  }, quiz)
  await page.reload()
  await page.getByRole('button', { name: 'Launch game' }).click()
  if (survivor) {
    await page.getByRole('button', { name: 'Survivor', exact: true }).click()
    await page.getByRole('button', { name: '1 life', exact: true }).click()
  }
  await page.getByRole('checkbox', { name: /Give every player three one-use Power-Ups/ }).check()
  await page.getByRole('checkbox', { name: /Auto-close answers/ }).uncheck()
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
  return (await state(page)).roomCode
}
async function join(context: BrowserContext, room: string, name: string) {
  const phone = await context.newPage()
  await phone.setViewportSize({ width: 320, height: 740 })
  await phone.goto(`/join?room=${room}`)
  await phone.getByLabel('Nickname').fill(name)
  await phone.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(phone.getByRole('heading', { name: `You’re in, ${name}!` })).toBeVisible()
  identities.set(phone, { key: `katwed.player.${room}`, value: (await phone.evaluate(room => localStorage.getItem(`katwed.player.${room}`), room))! })
  return phone
}
async function fit(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
}
async function lock(phone: Page) {
  await phone.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(phone.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
}
async function reveal(host: Page) {
  await host.getByRole('button', { name: 'Close answers now', exact: true }).click()
  await host.getByRole('button', { name: 'Reveal answer', exact: true }).click()
}

test('RC C/D: progressive choice, private 50/50, wagers and Double Up carry into Connections and finals', async ({ page, context }, info) => {
  test.setTimeout(120_000)
  const choice = allWagerQuestions().find(q => q.type === 'single-choice')!
  if (choice.type !== 'single-choice') throw new Error('Choice fixture missing')
  const quiz = wagerQuiz([{ ...choice, doubleScore: true, progressiveRevealEnabled: true,
    media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Portrait', revealEffect: 'blur', revealDurationSeconds: 20 } },
  { ...connectionsFixture(), doubleScore: true }])
  const room = await setup(page, quiz)
  const present = await context.newPage()
  await present.setViewportSize({ width: 1280, height: 720 })
  await present.goto(page.url().replace('/control', '/present'))
  const phones = []
  for (const name of ['Carol', 'Roger', 'Jaki']) phones.push(await join(context, room, name))
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await phones[0].getByRole('radio', { name: /^50%/ }).check()
  await expect(phones[0].getByRole('button', { name: /Fast Five/ })).toBeDisabled()
  await phones[0].getByRole('button', { name: /50\/50/ }).click()
  await expect(phones[0].getByRole('radio', { name: /^50%/ })).toBeChecked()
  const choices = phones[0].getByRole('group', { name: 'Choose one answer' }).getByRole('button')
  await expect(choices).toHaveCount(2)
  const retained = await choices.allTextContents()
  await reloadPlayer(phones[0])
  await expect(choices).toHaveCount(2)
  expect(await choices.allTextContents()).toEqual(retained)
  // Unsubmitted local wagers intentionally reset; the authoritative assist survives.
  await expect(phones[0].getByRole('radio', { name: 'No wager', exact: true })).toBeChecked()
  await phones[0].getByRole('radio', { name: /^50%/ }).check()
  await expect.poll(async () => Number(await present.locator('.question-media').getAttribute('data-reveal-progress'))).toBeGreaterThan(0)
  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i]
    if (i) {
      await phone.getByRole('radio', { name: /^100%/ }).check()
      await phone.getByRole('button', { name: /Double Up/ }).click()
    }
    await phone.getByRole('button', { name: choice.options[i === 2 ? 1 : 0].label, exact: true }).click()
    await fit(phone); await lock(phone)
  }
  const first = await state(page)
  for (const a of first.answers) {
    const expected = a.correct ? progressiveRevealScore(1000, a.responseTimeMs, 20000) * 2 + (a.playerId === first.players[0].id ? 500 : 1000) : -1000
    expect(a.pointsAwarded).toBe(a.correct && a.playerId === first.players[1].id ? expected * 2 : expected)
  }
  await reveal(page)
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await expect(present.getByRole('list', { name: 'Leaderboard', exact: true })).toContainText('-1,000')
  await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await phones[0].getByRole('textbox').fill('Pla')
  await phones[0].getByRole('radio', { name: /^100%/ }).check()
  await phones[0].getByRole('button', { name: /Double Up/ }).click()
  await expect(phones[0].getByRole('button', { name: /Fast Five/ })).toBeDisabled()
  await expect(phones[0].getByRole('button', { name: /50\/50/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Reveal next clue', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal next clue', exact: true }).click()
  await expect(phones[0].getByRole('textbox')).toHaveValue('Pla')
  await expect(phones[0].getByRole('radio', { name: /^100%/ })).toBeChecked()
  await expect(phones[0].getByRole('button', { name: /Double Up/ })).toHaveAttribute('aria-pressed', 'true')
  for (let i = 0; i < phones.length; i++) {
    await phones[i].getByRole('textbox').fill(i === 2 ? 'Wrong' : 'Planets')
    await lock(phones[i])
  }
  expect((await state(page)).answers.find(a => a.playerId === first.players[0].id && a.questionId === quiz.questions[1].id)?.pointsAwarded).toBe(4000)
  await reveal(page)
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  await expect(present.locator('.final-podium')).toBeVisible()
  await expect(present.getByRole('article', { name: 'Most Correct' })).toBeVisible()
  await expect(present.getByRole('article', { name: 'Quickest Thinker' })).toHaveCount(0)
  await expect(present.getByRole('region', { name: 'Power-Ups' })).toHaveCount(0)
  await fit(present); await fit(phones[0])
  await present.screenshot({ path: info.outputPath('rc-combined-final-169.png') })
  await phones[0].screenshot({ path: info.outputPath('rc-combined-final-320.png'), fullPage: true })
})

test('RC G/J: Survivor Typed correction restores a player, then a wipeout tie has a truthful final', async ({ page, context }, info) => {
  test.setTimeout(120_000)
  const q = { ...progressiveQuestion(), progressiveRevealEnabled: false, speedScoringEnabled: true, media: { type: 'none' as const } }
  const quiz = wagerQuiz([q, { ...q, id: 'rc-final-typed', displayOrder: 1 }])
  const room = await setup(page, quiz, true)
  const present = await context.newPage()
  await present.setViewportSize({ width: 1280, height: 720 })
  await present.goto(page.url().replace('/control', '/present'))
  const carol = await join(context, room, 'Carol'), roger = await join(context, room, 'Roger'), jaki = await join(context, room, 'Jaki')
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await carol.getByRole('radio', { name: /^100%/ }).check()
  await carol.getByRole('textbox').fill('Wrong')
  await carol.getByRole('button', { name: /Double Up/ }).click(); await lock(carol)
  await roger.getByRole('textbox').fill('Alex'); await lock(roger)
  await reveal(page)
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await expect(carol.getByText('YOU’RE OUT')).toBeVisible()
  const original = (await state(page)).answers[0]
  await page.getByRole('button', { name: 'Mark correct', exact: true }).click()
  await expect.poll(async () => (await state(page)).players[0].survivorLivesRemaining).toBe(1)
  await reloadPlayer(carol)
  await expect(carol.getByText('YOU’RE OUT')).toHaveCount(0)
  expect((await state(page)).players[0].survivorLivesRemaining).toBe(1)
  expect((await state(page)).answers[0].responseTimeMs).toBe(original.responseTimeMs)
  await page.getByRole('button', { name: 'Undo override', exact: true }).click()
  await expect.poll(async () => (await state(page)).players[0].survivorLivesRemaining).toBe(0)
  await page.getByRole('button', { name: 'Mark correct', exact: true }).click()
  await expect.poll(async () => (await state(page)).players[0].survivorLivesRemaining).toBe(1)
  expect((await state(page)).powerUpUses).toHaveLength(1)
  await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await expect(jaki.getByRole('heading', { name: 'Spectating this question' })).toBeVisible()
  await expect(jaki.getByRole('region', { name: 'Power-Ups' })).toHaveCount(0)
  for (const phone of [carol, roger]) { await phone.getByRole('textbox').fill('Wrong'); await lock(phone) }
  await reveal(page)
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  await expect(carol.getByLabel(/Your estimate/)).toBeVisible()
  await expect(jaki.getByLabel(/Your estimate/)).toHaveCount(0)
  for (const phone of [carol, roger, jaki]) { await expect(phone.getByRole('region', { name: 'Power-Ups' })).toHaveCount(0); await fit(phone) }
  const finalMetrics = (await state(page)).players.map(p => [p.survivorLivesRemaining, p.totalScore, p.correctAnswerCount, p.totalCorrectResponseMs])
  const target = (await state(page)).tieBreakerQuestion.answer
  await carol.getByLabel(/Your estimate/).fill(target)
  await carol.getByRole('button', { name: 'Lock in', exact: true }).click()
  await reloadPlayer(carol); await reloadPlayer(jaki)
  await expect(carol.getByLabel(/Your estimate/)).toHaveCount(0)
  await roger.getByLabel(/Your estimate/).fill(String(Number(target) + 10))
  await roger.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(present.getByRole('heading', { name: 'Carol wins the tie-breaker' })).toBeVisible()
  expect((await state(page)).players.map(p => [p.survivorLivesRemaining, p.totalScore, p.correctAnswerCount, p.totalCorrectResponseMs])).toEqual(finalMetrics)
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  for (const surface of [present, carol, jaki]) {
    await expect(surface.getByRole('heading', { name: 'TOTAL WIPEOUT' })).toBeVisible()
    await expect(surface.getByText('Nobody survived.', { exact: true })).toBeVisible()
    await expect(surface.getByText('Carol wins the tie-breaker.', { exact: true })).toBeVisible()
    await expect(surface.getByRole('article', { name: 'Biggest Climber' })).toHaveCount(0)
    await fit(surface)
    if (surface !== present) {
      const winner = surface.locator('.final-podium li[data-rank="1"] strong')
      expect(await winner.evaluate(node => {
        const element = node as unknown as { getBoundingClientRect(): { height: number } }
        const browser = globalThis as unknown as { getComputedStyle(node: unknown): { fontSize: string } }
        return element.getBoundingClientRect().height <= Number.parseFloat(browser.getComputedStyle(node).fontSize) * 1.6
      })).toBe(true)
    }
  }
  await expect.poll(() => present.locator('.final-awards').evaluate(node => {
    const element = node as unknown as { getBoundingClientRect(): { bottom: number } }
    return element.getBoundingClientRect().bottom <= (globalThis as unknown as { innerHeight: number }).innerHeight
  })).toBe(true)
  await present.screenshot({ path: info.outputPath('rc-wipeout-final-169.png') })
  await jaki.screenshot({ path: info.outputPath('rc-wipeout-spectator-320.png'), fullPage: true })
})
