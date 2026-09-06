import { expect, test, type Page } from '@playwright/test'
import { progressiveQuiz } from '../../src/test/progressiveFixtures'
import { progressiveRevealScore } from '../../src/features/scoring/progressiveReveal'
import type { GameSession } from '../../src/types/domain'

async function setup(page: Page, enabled = true) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  const quiz = progressiveQuiz(); quiz.questions[0].progressiveRevealEnabled = enabled
  quiz.rounds.push({ ...quiz.rounds[0], id: 'second-round', title: 'Round 2', displayOrder: 1, introEnabled: true })
  quiz.questions.push({ ...structuredClone(quiz.questions[0]), id: 'second-question', roundId: 'second-round', displayOrder: 1 })
  await page.evaluate(quiz => { const key = 'katwed.demo.state.v2'; const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: typeof quiz[] }; state.quizzes = [quiz]; localStorage.setItem(key, JSON.stringify(state)) }, quiz)
  await page.reload()
  return quiz
}
async function noOverflow(page: Page) { expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true) }
async function session(page: Page): Promise<GameSession> {
  return page.evaluate(() => { const state = JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { sessions: GameSession[] }; return state.sessions[0] })
}
async function join(page: Page, code: string, nickname: string) {
  await page.goto('/')
  await page.evaluate(code => localStorage.removeItem(`katwed.player.${code}`), code)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto(`/join?room=${code}`)
  await page.getByLabel('Nickname').fill(nickname)
  await page.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(page.getByRole('heading', { name: `You’re in, ${nickname}!` })).toBeVisible()
}

test('author an image modifier, preview points and retain it after save/reload', async ({ page }) => {
  await setup(page, false)
  await page.getByRole('article', { name: 'Progressive Reveal' }).getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByText('Media & presentation', { exact: true }).click()
  await page.getByLabel('Score falls as the image becomes clearer').check()
  await expect(page.getByRole('list', { name: 'Progressive score preview' })).toContainText('625 pts')
  await page.getByText('Scoring', { exact: true }).click()
  await expect(page.getByLabel('Faster answers score more')).toHaveCount(0)
  await page.getByLabel('Double score', { exact: true }).check()
  await page.getByText('Media & presentation', { exact: true }).click()
  await expect(page.getByRole('list', { name: 'Progressive score preview' })).toContainText('1,250 pts')
  await page.getByLabel('Reveal effect').selectOption('tiles')
  await page.getByLabel('Tile grid', { exact: true }).selectOption('8')
  await page.getByRole('button', { name: 'Save quiz', exact: true }).first().click()
  await expect(page.getByRole('status').filter({ hasText: 'Quiz saved.' })).toBeVisible()
  await page.reload()
  await page.getByText('Media & presentation', { exact: true }).click()
  await expect(page.getByLabel('Score falls as the image becomes clearer')).toBeChecked()
  await expect(page.getByLabel('Reveal effect')).toHaveValue('tiles')
})

for (const teams of [false, true]) test(`early and late answers, Round Intro, reduced motion and 320px, teams=${teams}`, async ({ page, context }, testInfo) => {
  test.setTimeout(120000); page.setDefaultTimeout(15000)
  await setup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('article', { name: 'Progressive Reveal' }).getByRole('button', { name: 'Launch game' }).click()
  if (teams) {
    await page.getByRole('button', { name: 'Teams', exact: true }).click()
    await page.getByLabel('Team 1 name').fill('Blue'); await page.getByLabel('Team 2 name').fill('Red')
    await page.getByLabel('Team assignment').selectOption('host')
  }
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  const code = (await page.locator('.controller-bar').textContent())?.match(/Room\s+(\d{6})/)?.[1]
  if (!code) throw new Error('Room unavailable')
  const present = await context.newPage(); await present.setViewportSize({ width: 1280, height: 720 }); await present.goto(page.url().replace('/control', '/present'))
  const early = await context.newPage(), late = await context.newPage()
  await late.emulateMedia({ reducedMotion: 'reduce' })
  await join(early, code, 'Early'); await join(late, code, 'Late')
  if (teams) for (const name of ['Early', 'Late']) await page.getByLabel(`Team for ${name}`).selectOption({ label: 'Blue' })
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(early.locator('.progressive-points')).toBeVisible()
  await expect(late.locator('.question-media')).toHaveAttribute('data-reveal-progress', '0')
  await expect(late.getByRole('button', { name: 'Enlarge image' })).toHaveCount(0)
  await expect(late.getByRole('img', { name: 'Alex is the answer' })).toHaveCount(0)
  await early.getByLabel('Type your answer').fill('Alex')
  await early.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(early.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  const input = late.getByLabel('Type your answer'); await input.fill('Al'); await input.focus()
  await expect(late.locator('.progressive-points')).toContainText('250 points available', { timeout: 25000 })
  await expect(input).toHaveValue('Al'); await expect(input).toBeFocused()
  await expect(late.getByRole('button', { name: 'Enlarge image' })).toBeVisible()
  await late.getByRole('button', { name: 'Enlarge image' }).click(); await expect(late.getByRole('dialog')).toBeVisible(); await late.keyboard.press('Escape')
  await input.fill('Alex'); await late.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(late.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  const current = await session(page), answers = current.answers.filter(a => a.questionId === 'progressive-question')
  expect(answers).toHaveLength(2)
  for (const answer of answers) expect(answer.pointsAwarded).toBe(progressiveRevealScore(1000, answer.responseTimeMs, 20000))
  expect(answers[0].pointsAwarded).toBeGreaterThan(answers[1].pointsAwarded); expect(answers[1].pointsAwarded).toBe(250)
  if (teams) expect(new Set(current.players.map(p => p.teamId)).size).toBe(1)
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(present.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  if (teams) await expect(present.getByRole('list', { name: 'Leaderboard', exact: true })).toContainText(answers.reduce((sum, a) => sum + a.pointsAwarded, 0).toLocaleString('en-GB'))
  await page.getByRole('button', { name: /Next round/ }).click()
  await expect(present.getByRole('heading', { name: 'Round 2', exact: true })).toBeVisible()
  expect((await session(page)).questionOpenedAt).toBeNull()
  for (const surface of [present, late]) { await expect(surface.locator('.progressive-points')).toHaveCount(0); await expect(surface.locator('.question-media')).toHaveCount(0) }
  await page.getByRole('button', { name: 'Start round', exact: true }).click()
  await expect(present.locator('.progressive-points')).toBeVisible()
  expect(Number(await present.locator('.question-media').getAttribute('data-reveal-progress'))).toBeLessThan(.2)
  const preview = page.getByRole('region', { name: 'Presentation preview', exact: true })
  const footer = (await present.locator('.presentation-question__footer').boundingBox())!
  expect(footer.y + footer.height).toBeLessThanOrEqual(720)
  const previewBounds = (await preview.locator('.controller-preview').boundingBox())!, previewFooter = (await preview.locator('.presentation-question__footer').boundingBox())!
  expect(previewFooter.y + previewFooter.height).toBeLessThanOrEqual(previewBounds.y + previewBounds.height)
  await present.screenshot({ path: testInfo.outputPath('progressive-question.png') })
  await late.screenshot({ path: testInfo.outputPath('progressive-question-player-320.png'), fullPage: true })
  await page.screenshot({ path: testInfo.outputPath('progressive-question-controller.png'), fullPage: true })
  await page.getByRole('button', { name: 'Close answers now', exact: true }).click()
  await expect(present.locator('.question-media')).toBeVisible()
  await expect(present.locator('.progressive-points')).toHaveCount(0)
  const lockedImage = (await present.locator('.question-media').boundingBox())!, compactLocked = (await preview.locator('.question-media').boundingBox())!
  expect(lockedImage.y + lockedImage.height).toBeLessThanOrEqual(720)
  expect(compactLocked.y + compactLocked.height).toBeLessThanOrEqual(previewBounds.y + previewBounds.height)
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(present.locator('.question-media')).toHaveAttribute('data-reveal-progress', '1')
  for (const surface of [present, late]) await noOverflow(surface)
  const imageBox = (await present.locator('.question-media').boundingBox())!
  expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(720)
  const box = (await preview.locator('.controller-preview').boundingBox())!, previewImage = (await preview.locator('.question-media').boundingBox())!
  expect(previewImage.y + previewImage.height).toBeLessThanOrEqual(box.y + box.height)
  await present.screenshot({ path: testInfo.outputPath('progressive-presentation.png') })
  await late.screenshot({ path: testInfo.outputPath('progressive-player-320.png'), fullPage: true })
  await page.screenshot({ path: testInfo.outputPath('progressive-controller.png'), fullPage: true })
})
