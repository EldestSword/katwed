import { expect, test, type Page } from '@playwright/test'
import { connectionsQuiz } from '../../src/test/connectionsFixtures'

async function noOverflow(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
}
async function login(page: Page) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
}
async function launch(page: Page, teams = false) {
  await page.getByRole('article', { name: 'Connections' }).getByRole('button', { name: 'Launch game' }).click()
  if (teams) {
    await page.getByRole('button', { name: 'Teams', exact: true }).click()
    await page.getByLabel('Team 1 name').fill('Blue'); await page.getByLabel('Team 2 name').fill('Red')
    await page.getByLabel('Team assignment').selectOption('balanced-random')
  }
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  const code = (await page.locator('.controller-bar').textContent())?.match(/Room\s+(\d{6})/)?.[1]
  if (!code) throw new Error('Room unavailable')
  return code
}
async function join(page: Page, code: string, nickname: string) {
  // Demo tabs share the room store; each mounted page keeps its own player identity.
  await page.goto('/')
  await page.evaluate(code => localStorage.removeItem(`katwed.player.${code}`), code)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto(`/join?room=${code}`)
  await page.getByLabel('Nickname').fill(nickname)
  await page.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(page.getByRole('heading', { name: `You’re in, ${nickname}!` })).toBeVisible()
}

for (const teams of [false, true]) test(`author Connections and score early, late and wrong guesses, teams=${teams}`, async ({ page, context }, testInfo) => {
  test.setTimeout(120_000); page.setDefaultTimeout(15_000)
  await login(page)
  await page.getByRole('button', { name: '+ Create quiz', exact: true }).click()
  await page.getByLabel('Quiz title').fill('Connections')
  await page.getByRole('button', { name: '+ Add', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Connections/ }).click()
  await page.getByLabel('Timer', { exact: true }).fill('120')
  for (const [index, clue] of ['Mercury', 'Venus', 'Earth', 'Mars'].entries()) await page.getByRole('textbox', { name: `Clue ${index + 1}`, exact: true }).fill(clue)
  await page.getByLabel('Correct connection').fill('Planets')
  await page.getByLabel('Also accept').fill('Solar worlds')
  await page.getByText('Scoring', { exact: true }).click()
  await expect(page.getByText('Connections score by clue stage.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Faster answers score more')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Points by clue stage' })).toContainText('750 pts')
  await page.getByRole('button', { name: 'Save quiz', exact: true }).first().click()
  await expect(page.getByText('Quiz saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Clue 3', exact: true })).toHaveValue('Earth')
  await expect(page.getByLabel('Also accept')).toHaveValue('Solar worlds')
  await page.getByRole('link', { name: '← Quizzes', exact: true }).click()
  const code = await launch(page, teams)
  const present = await context.newPage(); await present.setViewportSize({ width: 1280, height: 720 })
  await present.goto(page.url().replace('/control', '/present'))
  const early = await context.newPage(), late = await context.newPage(), wrong = await context.newPage()
  await join(early, code, 'Carol'); await join(late, code, 'Roger'); await join(wrong, code, 'Jaki')
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(present.getByRole('region', { name: 'Connection clues' }).getByRole('listitem')).toHaveCount(1)
  await expect(present.getByText('Venus', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Connections controls' })).toContainText('Venus')
  const answer = late.getByRole('textbox', { name: 'Your connection' })
  await answer.fill('Solar'); await answer.focus()
  await early.getByRole('textbox', { name: 'Your connection' }).fill('Planets')
  await early.getByRole('button', { name: 'Lock in', exact: true }).click()
  await wrong.getByRole('textbox', { name: 'Your connection' }).fill('Stars')
  await wrong.getByRole('button', { name: 'Lock in', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal next clue', exact: true }).click()
  await expect(answer).toHaveValue('Solar'); await expect(answer).toBeFocused()
  await expect(late.getByText('750 points available', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal next clue', exact: true }).click()
  await expect(late.getByText('500 points available', { exact: true })).toBeVisible()
  await expect(present.getByText('Mars', { exact: true })).toHaveCount(0)
  await expect(wrong.getByRole('textbox', { name: 'Your connection' })).toHaveCount(0)
  await wrong.reload()
  await expect(wrong.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  await expect(wrong.getByRole('button', { name: 'Lock in', exact: true })).toHaveCount(0)
  await answer.fill('Solar worlds')
  await noOverflow(late)
  await late.screenshot({ path: testInfo.outputPath('connections-player-320.png'), fullPage: true })
  await present.screenshot({ path: testInfo.outputPath('connections-presentation.png') })
  await late.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(late.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(late.getByRole('heading', { name: 'You got it right!' })).toBeVisible()
  await expect(wrong.getByRole('heading', { name: 'Not this time' })).toBeVisible()
  await expect(present.getByRole('heading', { name: 'Planets', exact: true })).toBeVisible()
  await expect(present.getByText('Mars', { exact: true })).toBeVisible()
  await expect(present.getByText('Solar worlds', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Presentation preview', exact: true }).getByRole('heading', { name: 'Planets', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  await expect(present.getByRole('list', { name: 'Top final positions' })).toContainText('1,000')
  await expect(present.getByRole('list', { name: 'Top final positions' })).toContainText('500')
  if (teams) await expect(present.getByText('Team winners', { exact: true })).toBeVisible()
  await noOverflow(wrong)
})

test('six 200-character clues fit 16:9, compact preview and a 320px player', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000); page.setDefaultTimeout(15_000)
  const quiz = connectionsQuiz(), q = quiz.questions[0]
  if (q.type !== 'connections') throw new Error('Fixture')
  q.timeLimitSeconds = 120
  q.clues = Array.from({ length: 6 }, (_, index) => ({ id: `clue-${index}`, text: `${index + 1} ${'A long readable clue with enough detail for the whole room. '.repeat(4)}`.slice(0, 200) }))
  await login(page)
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate(quiz => { const key = 'katwed.demo.state.v2'; const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: typeof quiz[] }; state.quizzes = [quiz]; localStorage.setItem(key, JSON.stringify(state)) }, quiz)
  await page.reload(); await page.setViewportSize({ width: 1280, height: 900 })
  const code = await launch(page)
  const present = await context.newPage(); await present.setViewportSize({ width: 1280, height: 720 }); await present.goto(page.url().replace('/control', '/present'))
  const player = await context.newPage(); await join(player, code, 'Long clues')
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  for (let count = 2; count <= 6; count++) {
    await page.getByRole('button', { name: 'Reveal next clue', exact: true }).click()
    await expect(present.locator('.connection-clues li')).toHaveCount(count)
  }
  await expect(page.getByRole('button', { name: 'Reveal next clue', exact: true })).toBeDisabled()
  for (const surface of [present, player]) await noOverflow(surface)
  const bottom = (await present.locator('.connection-stage').boundingBox())!
  expect(bottom.y + bottom.height).toBeLessThanOrEqual(720)
  await present.screenshot({ path: testInfo.outputPath('six-clues-question.png') })
  await player.screenshot({ path: testInfo.outputPath('six-clues-player-320.png'), fullPage: true })
  await page.getByRole('button', { name: 'Close answers now', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  const result = (await present.getByRole('heading', { name: 'Planets' }).boundingBox())!
  expect(result.y + result.height).toBeLessThanOrEqual(720)
  const preview = page.getByRole('region', { name: 'Presentation preview', exact: true })
  const area = (await preview.boundingBox())!, last = (await preview.getByRole('heading', { name: 'Planets' }).boundingBox())!
  expect(last.y + last.height).toBeLessThanOrEqual(area.y + area.height)
  await present.screenshot({ path: testInfo.outputPath('six-clues-reveal.png') })
  await page.screenshot({ path: testInfo.outputPath('six-clues-controller.png'), fullPage: true })
})
