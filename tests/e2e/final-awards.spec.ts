import { expect, test, type Page } from '@playwright/test'
import type { Quiz } from '../../src/types/domain'

async function answer(page: Page, correct: boolean) {
  await page.getByRole('button', { name: correct ? 'True' : 'False', exact: true }).click()
  await page.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Answer locked', exact: true })).toBeVisible()
}

test('Standard final awards retain truthful first ranks, fit screens and omit lost history after refresh', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  // Synthetic local quiz; answer/phase transitions below still use the ordinary UI.
  await page.evaluate(() => {
    const key = 'katwed.demo.state.v2'
    const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    const quiz = state.quizzes.find((candidate) => candidate.title === 'Katwed! Mixed Quiz')!
    const question = quiz.questions.find((candidate) => candidate.type === 'true-false')!
    quiz.questions = [1000, 2000, 2000, 2000].map((points, index) => ({ ...question,
      id: `awards-question-${index + 1}`, prompt: `Awards question ${index + 1}`, supportingText: '',
      media: { type: 'none' }, correctValue: true, points, displayOrder: index,
      timeLimitSeconds: 120, speedScoringEnabled: false, doubleScore: false,
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
  await presentation.setViewportSize({ width: 1280, height: 720 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const players: Page[] = []
  for (const nickname of ['Carol', 'Roger', 'Jaki']) {
    const player = await context.newPage()
    await player.setViewportSize({ width: 320, height: 740 })
    await player.goto(`/join?room=${code}`)
    await player.getByLabel('Nickname').fill(nickname)
    await player.getByRole('button', { name: 'Join game' }).click()
    await expect(player.getByRole('heading', { name: `You’re in, ${nickname}!` })).toBeVisible()
    players.push(player)
  }
  const [carol, roger, jaki] = players
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  for (let question = 0; question < 4; question++) {
    await expect(presentation.getByRole('heading', { name: `Awards question ${question + 1}`, exact: true })).toBeVisible()
    await answer(carol, question < 3)
    await answer(roger, question === 0)
    await answer(jaki, question > 0)
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expect(presentation.getByRole('region', { name: 'Tonight’s awards' })).toHaveCount(0)
    if (question < 3) {
      await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
      await expect(presentation.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible()
      await expect(jaki.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible()
      if (question === 0) await expect(presentation.getByRole('list', { name: 'Leaderboard' }).locator('li').filter({ hasText: 'Jaki' }).locator('.leaderboard__rank')).toHaveText('3')
      await page.getByRole('button', { name: 'Next question', exact: true }).click()
    }
  }
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  await expect(presentation.getByRole('heading', { name: 'Jaki wins!', exact: true })).toBeVisible()
  await expect(presentation.getByRole('list', { name: 'Top final positions' }).getByRole('listitem')).toHaveCount(3)
  const awards = presentation.getByRole('region', { name: 'Tonight’s awards' })
  await expect(awards.getByRole('article')).toHaveCount(3)
  await expect(awards.getByRole('article', { name: 'Most Correct' })).toContainText('Jaki & Carol')
  await expect(awards.getByRole('article', { name: 'Most Correct' })).toContainText('3 correct each')
  await expect(awards.getByRole('article', { name: 'Quickest Thinker' })).toContainText(/\d+\.\ds average/)
  await expect(awards.getByRole('article', { name: 'Biggest Climber' })).toContainText('3rd → 1st')
  await expect(awards.getByRole('article', { name: 'Biggest Climber' })).toContainText('↑ 2 places')
  await expect(jaki.getByRole('article', { name: 'Biggest Climber' })).toHaveClass(/is-current/)
  for (const surface of [presentation, jaki]) {
    expect(await surface.evaluate<boolean>('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
  }
  const awardBounds = (await awards.boundingBox())!
  expect(awardBounds.y + awardBounds.height).toBeLessThanOrEqual(720)
  await presentation.screenshot({ path: testInfo.outputPath('final-awards-presentation.png'), scale: 'css' })
  await jaki.screenshot({ path: testInfo.outputPath('final-awards-player.png'), fullPage: true, scale: 'css' })
  await page.screenshot({ path: testInfo.outputPath('final-awards-controller.png'), fullPage: true, scale: 'css' })
  await presentation.reload()
  await expect(presentation.getByRole('article', { name: 'Most Correct' })).toBeVisible()
  await expect(presentation.getByRole('article', { name: 'Quickest Thinker' })).toBeVisible()
  await expect(presentation.getByRole('article', { name: 'Biggest Climber' })).toHaveCount(0)
  await jaki.reload()
  await expect(jaki.getByRole('heading', { name: 'Jaki wins!', exact: true })).toBeVisible()
  await expect(jaki.getByRole('article', { name: 'Biggest Climber' })).toHaveCount(0)
})
