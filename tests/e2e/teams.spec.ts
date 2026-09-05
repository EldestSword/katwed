import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { Quiz, TeamAssignmentMode } from '../../src/types/domain'

async function launch(page: Page, assignment: TeamAssignmentMode, rounds = false) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate((multiRound) => {
    const key = 'katwed.demo.state.v2'
    const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    const quiz = state.quizzes.find((candidate) => candidate.title === 'Katwed! Mixed Quiz')!
    const question = quiz.questions.find((candidate) => candidate.type === 'true-false')!
    quiz.rounds = [{ id: quiz.id, quizId: quiz.id, title: 'Opening round', subtitle: '', displayOrder: 0, introEnabled: false }]
    if (multiRound) quiz.rounds.push({ id: 'team-round-two', quizId: quiz.id, title: 'Team comeback', subtitle: '', displayOrder: 1, introEnabled: true })
    quiz.questions = Array.from({ length: multiRound ? 3 : 1 }, (_, index) => ({ ...question,
      id: `team-question-${index}`, prompt: `Team question ${index + 1}`, supportingText: '',
      roundId: quiz.rounds[multiRound && index > 0 ? 1 : 0].id,
      media: { type: 'none' }, correctValue: true, points: index === 0 ? 1000 : 2000, displayOrder: index,
      timeLimitSeconds: 120, speedScoringEnabled: false, doubleScore: false,
    }))
    localStorage.setItem(key, JSON.stringify(state))
  }, rounds)
  await page.reload()
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('button', { name: 'Launch game' }).click()
  await expect(page.getByRole('button', { name: 'Individuals', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Teams', exact: true }).click()
  await page.getByLabel('Team 1 name').fill('Blue Team')
  await page.getByLabel('Team 2 name').fill('Red Team')
  await page.getByLabel('Team assignment').selectOption(assignment)
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  await expect(page).toHaveURL(/\/control$/)
  const code = (await page.locator('.controller-bar').textContent())?.match(/Room\s+(\d{6})/)?.[1]
  if (!code) throw new Error('Room code unavailable')
  return code
}

async function join(context: BrowserContext, code: string, nickname: string, choice?: string) {
  const player = await context.newPage()
  await player.setViewportSize({ width: 320, height: 740 })
  await player.goto(`/join?room=${code}`)
  await player.getByLabel('Nickname').fill(nickname)
  if (choice) {
    const button = player.getByRole('button', { name: new RegExp(choice) })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
  } else {
    await expect(player.getByRole('button', { name: /Blue Team/ })).toHaveCount(0)
  }
  await noOverflow(player)
  await player.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(player.getByRole('heading', { name: `You’re in, ${nickname}!` })).toBeVisible()
  await noOverflow(player)
  return player
}

async function answer(player: Page, correct = true) {
  await player.getByRole('button', { name: correct ? 'True' : 'False', exact: true }).click()
  await player.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'Answer locked', exact: true })).toBeVisible()
}

async function noOverflow(page: Page) {
  expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
}

test('player choice, team movement across rounds and individual honours fit all three screens', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000)
  const code = await launch(page, 'player-choice', true)
  const presentation = await context.newPage()
  await presentation.setViewportSize({ width: 1280, height: 720 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const carol = await join(context, code, 'Carol', 'Blue Team')
  const jaki = await join(context, code, 'Jaki', 'Red Team')
  const roger = await join(context, code, 'Roger', 'Red Team')
  await expect(presentation.getByRole('region', { name: 'Red Team members' })).toContainText('Jaki')
  await expect(presentation.getByRole('region', { name: 'Red Team members' })).toContainText('Roger')
  await expect(presentation.getByRole('combobox')).toHaveCount(0)
  await expect(jaki.getByText('Playing for Red Team', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  for (let question = 0; question < 3; question++) {
    await expect(presentation.getByRole('heading', { name: `Team question ${question + 1}`, exact: true })).toBeVisible()
    await answer(carol)
    await answer(jaki, question > 0)
    await answer(roger, question > 0)
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expect(presentation.getByRole('list', { name: 'Leaderboard', exact: true })).toHaveCount(0)
    if (question < 2) {
      await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
      const board = presentation.getByRole('list', { name: 'Leaderboard', exact: true })
      await expect(board.getByRole('listitem')).toHaveCount(2)
      await expect(board).not.toContainText('Carol')
      await expect(jaki.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible()
      await noOverflow(jaki)
      if (question === 0) {
        await expect(board.getByRole('listitem').first()).toContainText('Blue Team')
        await page.getByRole('button', { name: 'Next round', exact: true }).click()
        for (const surface of [presentation, jaki, page.getByRole('region', { name: 'Presentation preview', exact: true })]) {
          await expect(surface.getByRole('heading', { name: 'Team comeback', exact: true })).toBeVisible()
          await expect(surface.getByRole('list', { name: 'Leaderboard', exact: true })).toHaveCount(0)
        }
        await expect(jaki.getByRole('button', { name: 'Lock in', exact: true })).toHaveCount(0)
        await page.getByRole('button', { name: 'Start round', exact: true }).click()
      } else {
        await expect(board.getByRole('listitem').first()).toContainText('Red Team')
        await expect(board.getByRole('listitem').first().locator('.leaderboard__movement')).toContainText('↑ 1')
        await expect(jaki.getByRole('main').getByRole('status')).toContainText('Red Team is now 1st')
        await expect(presentation.locator('.leaderboard-commentary')).toContainText('Red Team')
        await page.getByRole('button', { name: 'Next question', exact: true }).click()
      }
    }
  }
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  for (const surface of [presentation, jaki]) {
    await expect(surface.getByText('Team winners', { exact: true })).toBeVisible()
    await expect(surface.getByRole('heading', { name: 'Red Team', exact: true })).toBeVisible()
    await expect(surface.getByRole('list', { name: 'Top final positions' }).getByRole('listitem')).toHaveCount(2)
    await expect(surface.getByRole('region', { name: 'Individual honours' }).getByRole('article', { name: 'Most Correct' })).toContainText('Carol')
    await expect(surface.getByRole('article', { name: 'Quickest Thinker' })).toBeVisible()
    await expect(surface.getByRole('article', { name: 'Biggest Climber' })).toHaveCount(0)
    await noOverflow(surface)
  }
  await expect(jaki.locator('.final-podium .is-current')).toContainText('Red Team')
  const honours = (await presentation.getByRole('region', { name: 'Individual honours' }).boundingBox())!
  expect(honours.y + honours.height).toBeLessThanOrEqual(720)
  await presentation.screenshot({ path: testInfo.outputPath('team-final-presentation.png'), scale: 'css' })
  await jaki.screenshot({ path: testInfo.outputPath('team-final-player-320.png'), fullPage: true, scale: 'css' })
  await page.screenshot({ path: testInfo.outputPath('team-final-controller.png'), fullPage: true, scale: 'css' })
  await jaki.reload()
  await expect(jaki.locator('.final-podium .is-current')).toContainText('Red Team')
  await expect(jaki.getByRole('article', { name: 'Biggest Climber' })).toHaveCount(0)
})

test('host assignment blocks start, supports moves and balance, and uses existing phone refresh', async ({ page, context }) => {
  test.setTimeout(90_000)
  const code = await launch(page, 'host')
  const carol = await join(context, code, 'Carol')
  await join(context, code, 'Jaki')
  await join(context, code, 'Roger')
  await expect(carol.getByText('Waiting for the host to put you on a team…', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Team for Carol')).toBeVisible()
  await page.getByLabel('Team for Carol').selectOption({ label: 'Blue Team' })
  await expect(page.getByLabel('Team for Carol')).toBeEnabled()
  // The existing Player focus recovery performs the safe refresh; no new membership event is sent.
  await carol.evaluate("window.dispatchEvent(new Event('focus'))")
  await expect(carol.getByText('Playing for Blue Team', { exact: true })).toBeVisible()
  await page.getByLabel('Team for Carol').selectOption({ label: 'Red Team' })
  await expect(page.getByLabel('Team for Carol')).toBeEnabled()
  await carol.evaluate("window.dispatchEvent(new Event('focus'))")
  await expect(carol.getByText('Playing for Red Team', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Balance teams', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled()
  const controls = page.locator('.controller-panel .team-lobby')
  const sizes = await Promise.all((await controls.locator('.team-group').all()).map((group) => group.locator('li').count()))
  expect(sizes.sort()).toEqual([1, 2])
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(carol.getByRole('heading', { name: 'Team question 1', exact: true })).toBeVisible()
  await expect(page.getByLabel('Team for Carol')).toHaveCount(0)
})

test('balanced random joins keep sizes within one and crown the combined-score team', async ({ page, context }) => {
  test.setTimeout(90_000)
  const code = await launch(page, 'balanced-random')
  const players: Page[] = []
  for (const name of ['Asha', 'Ben', 'Carol', 'Dan', 'Eve']) players.push(await join(context, code, name))
  const groups = page.locator('.controller-panel .team-lobby .team-group')
  await expect(groups.locator('li')).toHaveCount(5)
  const sizes = await Promise.all((await groups.all()).map(async (group) => ({ name: (await group.getAttribute('aria-label'))!.replace(' members', ''), count: await group.locator('li').count() })))
  expect(sizes.map((group) => group.count).sort()).toEqual([2, 3])
  const winner = sizes.find((group) => group.count === 3)!.name
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  for (const player of players) await answer(player)
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  await expect(players[0].getByRole('heading', { name: winner, exact: true })).toBeVisible()
  await expect(players[0].getByRole('list', { name: 'Top final positions' })).toContainText('3,000')
  await expect(players[0].getByRole('article', { name: 'Quickest Thinker' })).toHaveCount(0)
})
