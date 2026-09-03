import { expect, test, type Page } from '@playwright/test'
import type { Quiz } from '../../src/types/domain'

async function answer(player: Page, value: 'True' | 'False') {
  await player.getByRole('button', { name: value, exact: true }).click()
  await player.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
}

test('revealed standings visibly change on Presentation and personal movement stays on the player phone', async ({ page, context, isMobile }, testInfo) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  // Three synthetic questions allow two ordinary, host-revealed leaderboards before the final question.
  await page.evaluate(() => {
    const key = 'katwed.demo.state.v2'
    const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    const quiz = state.quizzes.find((candidate) => candidate.title === 'Katwed! Mixed Quiz')!
    const question = quiz.questions.find((candidate) => candidate.type === 'true-false')!
    quiz.questions = [1000, 2000, 1000].map((points, index) => ({
      ...question, id: `standings-question-${index + 1}`, prompt: `Standings question ${index + 1}`, supportingText: '',
      media: { type: 'none' }, correctValue: true, displayOrder: index, timeLimitSeconds: 120,
      speedScoringEnabled: false, doubleScore: false, points,
    }))
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('button', { name: 'Launch game' }).click()
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby' }).click()
  await expect(page).toHaveURL(/\/control$/)
  const code = (await page.locator('.controller-bar').textContent())?.match(/Room\s+(\d{6})/)?.[1]
  if (!code) throw new Error('Room code missing')
  const presentation = await context.newPage()
  await presentation.setViewportSize({ width: 1440, height: 1000 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const players: Page[] = []
  for (const nickname of ['Roger', 'Carol', 'Jaki']) {
    const player = await context.newPage()
    await player.setViewportSize(isMobile ? { width: 320, height: 740 } : { width: 440, height: 820 })
    await player.goto(`/join?room=${code}`)
    await player.getByLabel('Nickname').fill(nickname)
    await player.getByRole('button', { name: 'Join game' }).click()
    await expect(player.getByRole('heading', { name: `You’re in, ${nickname}!` })).toBeVisible()
    players.push(player)
  }
  const [roger, carol, jaki] = players
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await answer(roger, 'True')
  await answer(carol, 'False')
  await answer(jaki, 'False')
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  const leaderboard = presentation.getByRole('list', { name: 'Leaderboard' })
  await expect(leaderboard.locator('.leaderboard__name')).toHaveText(['Roger', 'Carol', 'Jaki'])
  await expect(presentation.locator('.leaderboard-commentary')).toBeEmpty()
  await expect(jaki.locator('.player-rank-movement')).toHaveCount(0)
  const oldY = (await leaderboard.locator('li').filter({ hasText: 'Jaki' }).boundingBox())!.y

  await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await expect(presentation.getByRole('heading', { name: 'Standings question 2' })).toBeVisible()
  await expect(leaderboard).toHaveCount(0)
  await answer(roger, 'False')
  await answer(carol, 'False')
  await answer(jaki, 'True')
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  const sequence = presentation.locator('.animated-leaderboard')
  const jakiRow = leaderboard.locator('li').filter({ hasText: 'Jaki' })
  await expect(sequence).toHaveAttribute('data-reveal-stage', /holding|counting/)
  await expect(leaderboard.locator('.leaderboard__name')).toHaveText(['Roger', 'Carol', 'Jaki'])
  await expect(jakiRow.locator('.leaderboard__movement')).toContainText('↑ 2')
  await expect(sequence).toHaveAttribute('data-reveal-stage', 'counting')
  await expect.poll(async () => Number((await jakiRow.locator('.leaderboard__points > [aria-hidden]').textContent())!.replace(/\D/g, ''))).toBeGreaterThan(0)
  await expect(sequence).toHaveAttribute('data-reveal-stage', 'moving')
  await expect.poll(() => jakiRow.evaluate((element) => {
    const browser = globalThis as unknown as { getComputedStyle(element: unknown): { transform: string } }
    return browser.getComputedStyle(element).transform
  }), { intervals: [20] }).not.toBe('none')
  await expect.poll(async () => (await jakiRow.boundingBox())!.y, { intervals: [20] }).toBeLessThan(oldY - 8)
  await presentation.screenshot({ path: testInfo.outputPath('standings-moving.png'), scale: 'css' })
  await expect(sequence).toHaveAttribute('data-reveal-stage', 'settled')
  await expect(leaderboard.locator('.leaderboard__name')).toHaveText(['Jaki', 'Roger', 'Carol'])
  await expect(jakiRow.locator('.leaderboard__rank')).toHaveText('1')
  await expect(jakiRow.locator('.leaderboard__points')).toContainText('2,000 points')
  await expect(sequence.getByRole('status')).toHaveText('Jaki takes the lead!')
  await expect(jaki.locator('.player-rank-movement')).toContainText('↑ 2')
  await expect(jaki.locator('.player-rank-movement')).toContainText('You’re now 1st')
  await expect(roger.locator('.player-rank-movement')).toContainText('↓ 1')
  await expect(jaki.locator('.leaderboard-commentary')).toHaveCount(0)
  expect(await jaki.evaluate<boolean>('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
  await expect(leaderboard.locator('.leaderboard__movement')).toHaveCount(0)
  await presentation.screenshot({ path: testInfo.outputPath('standings-settled.png'), scale: 'css' })
  await jaki.screenshot({ path: testInfo.outputPath('personal-movement.png'), scale: 'css', fullPage: true })

  await presentation.reload()
  await expect(presentation.getByRole('list', { name: 'Leaderboard' }).locator('.leaderboard__name')).toHaveText(['Jaki', 'Roger', 'Carol'])
  await expect(presentation.locator('.leaderboard-commentary')).toBeEmpty()
  await expect(presentation.locator('.leaderboard__movement')).toHaveCount(0)
  await jaki.reload()
  await expect(jaki.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await expect(jaki.locator('.player-rank-movement')).toHaveCount(0)
})
