import { expect, test, type Page } from '@playwright/test'
import { expectWideFontRevealToFit } from './presentationGeometry'
import { arrangementQuiz } from '../../src/test/arrangementFixtures'

async function noOverflow(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
}
async function author(page: Page) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await page.getByRole('button', { name: '+ Create quiz', exact: true }).click()
  await page.getByLabel('Quiz title').fill('Ordering and Matching')
  await page.getByRole('button', { name: '+ Add', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Ordering/ }).click()
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Put the words in alphabetical order')
  await page.getByLabel('Timer', { exact: true }).fill('120')
  for (const [index, label] of ['Alpha', 'Bravo', 'Charlie'].entries()) await page.getByLabel(`Item ${index + 1}`, { exact: true }).fill(label)
  await page.getByText('Scoring', { exact: true }).click()
  await page.getByLabel('Faster answers score more').uncheck()
  await page.getByRole('button', { name: 'Add round', exact: true }).click()
  await page.getByRole('button', { name: 'Add question to Round 2', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Matching/ }).click()
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Match each film to its director')
  await page.getByLabel('Timer', { exact: true }).fill('120')
  for (const [index, [left, right]] of [['Jaws', 'Spielberg'], ['Alien', 'Scott'], ['Barbie', 'Gerwig']].entries()) {
    await page.getByLabel(`Left ${index + 1}`, { exact: true }).fill(left)
    await page.getByLabel(`Right ${index + 1}`, { exact: true }).fill(right)
  }
  await expect(page.getByLabel('Matching scoring')).toHaveValue('partial')
  if (!await page.getByLabel('Faster answers score more').isVisible()) await page.getByText('Scoring', { exact: true }).click()
  await page.getByLabel('Faster answers score more').uncheck()
  await page.getByRole('button', { name: 'Save quiz', exact: true }).first().click()
  await expect(page.getByText('Quiz saved.', { exact: true })).toBeVisible()
  await page.reload()
  await page.locator('.question-navigator').getByRole('button').filter({ hasText: 'Match each film' }).click()
  await expect(page.getByLabel('Left 1', { exact: true })).toHaveValue('Jaws')
  await expect(page.getByLabel('Matching scoring')).toHaveValue('partial')
  await page.locator('.question-navigator').getByRole('button').filter({ hasText: 'Put the words' }).click()
  await expect(page.getByLabel('Item 1', { exact: true })).toHaveValue('Alpha')
  await page.getByRole('link', { name: '← Quizzes', exact: true }).click()
}

for (const teams of [false, true]) test(`author and play Ordering + partial Matching across rounds, teams=${teams}, with 320px controls`, async ({ page, context, isMobile }, testInfo) => {
  test.setTimeout(150_000)
  page.setDefaultTimeout(15_000)
  await author(page)
  await page.getByRole('article', { name: 'Ordering and Matching' }).getByRole('button', { name: 'Launch game' }).click()
  if (teams) {
    await page.getByRole('button', { name: 'Teams', exact: true }).click()
    await page.getByLabel('Team 1 name').fill('Blue Team'); await page.getByLabel('Team 2 name').fill('Red Team')
    await page.getByLabel('Team assignment').selectOption('balanced-random')
  }
  await page.getByRole('button', { name: /None/ }).click()
  await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  const code = (await page.locator('.controller-bar').textContent())?.match(/Room\s+(\d{6})/)?.[1]
  if (!code) throw new Error('Room code unavailable')
  const presentation = await context.newPage()
  await presentation.setViewportSize({ width: 1280, height: 720 })
  await presentation.goto(page.url().replace('/control', '/present'))
  const player = await context.newPage()
  await player.setViewportSize({ width: 320, height: 740 })
  await player.goto(`/join?room=${code}`)
  await player.getByLabel('Nickname').fill('Carol')
  await player.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'You’re in, Carol!' })).toBeVisible()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  const cards = player.locator('.ordering-cards li')
  await expect(cards).toHaveCount(3)
  await expect(player.getByRole('button', { name: 'Lock in', exact: true })).toBeDisabled()
  const before = await cards.locator('strong').allTextContents()
  await player.reload()
  await expect(cards.locator('strong')).toHaveText(before)
  await expect(presentation.locator('.arrangement-prompt li')).toHaveText(before)
  await expect(presentation.getByRole('region', { name: 'Correct order' })).toHaveCount(0)
  await noOverflow(player)
  const handle = cards.first().getByRole('button', { name: /Drag/ })
  await handle.scrollIntoViewIfNeeded()
  const start = (await handle.boundingBox())!, end = (await cards.nth(1).boundingBox())!
  const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 }, to = { x: end.x + 20, y: end.y + 20 }
  if (isMobile) {
    const cdp = await context.newCDPSession(player)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach()
  } else {
    await player.mouse.move(from.x, from.y); await player.mouse.down(); await player.mouse.move(to.x, to.y, { steps: 5 }); await player.mouse.up()
  }
  await expect(cards.locator('strong')).toHaveText([before[1], before[0], before[2]])
  // Complete with visible keyboard controls; drag is never mandatory.
  for (const [index, label] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
    for (let attempt = 0; attempt < 3 && (await cards.locator('strong').allTextContents()).indexOf(label) > index; attempt++) {
      await player.getByRole('button', { name: `Move ${label} up` }).focus(); await player.keyboard.press('Enter')
    }
  }
  await expect(cards.locator('strong')).toHaveText(['Alpha', 'Bravo', 'Charlie'])
  await player.screenshot({ path: testInfo.outputPath('ordering-player-320.png'), fullPage: true })
  await player.getByRole('button', { name: 'Lock in', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  await player.reload()
  await expect(player.getByRole('region', { name: 'Your answer' })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'You got it right!' })).toBeVisible()
  await expect(presentation.getByRole('region', { name: 'Correct order' }).locator('strong')).toHaveText(['Alpha', 'Bravo', 'Charlie'])
  await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click()
  await expect(presentation.getByRole('list', { name: 'Leaderboard', exact: true })).toContainText('1,000')
  await page.getByRole('button', { name: 'Next round', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'Round 2', exact: true })).toBeVisible()
  await expect(player.getByRole('button', { name: 'Lock in', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start round', exact: true }).click()
  await expect(player.getByRole('button', { name: /Jaws/ })).toBeVisible()
  const lock = player.getByRole('button', { name: 'Lock in', exact: true })
  for (const [left, right] of [['Jaws', 'Spielberg'], ['Alien', 'Gerwig'], ['Barbie', 'Scott']]) {
    await expect(lock).toBeDisabled()
    await player.getByRole('button', { name: new RegExp(left) }).click()
    await player.getByRole('button', { name: new RegExp(right) }).focus(); await player.keyboard.press('Space')
  }
  await expect(player.getByRole('status').filter({ hasText: '3 of 3 pairs made' })).toBeVisible()
  await noOverflow(player)
  await player.screenshot({ path: testInfo.outputPath('matching-player-320.png'), fullPage: true })
  await presentation.screenshot({ path: testInfo.outputPath('matching-presentation.png') })
  await lock.click(); await expect(player.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(player.getByRole('heading', { name: 'Not this time' })).toBeVisible()
  await expect(presentation.getByRole('region', { name: 'Correct pairs' })).toContainText('Alien → Scott')
  await expect(page.getByRole('region', { name: 'Presentation preview', exact: true }).getByRole('region', { name: 'Correct pairs' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('arrangement-controller.png'), fullPage: true })
  await page.getByRole('button', { name: 'Reveal final results', exact: true }).click()
  await expect(presentation.getByRole('list', { name: 'Top final positions' })).toContainText('1,333')
  if (teams) await expect(presentation.getByText('Team winners', { exact: true })).toBeVisible()
  await noOverflow(player)
})

test('eight long items fit presentation, compact preview and 320px player screens', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000); page.setDefaultTimeout(15_000)
  const quiz = arrangementQuiz()
  for (const q of quiz.questions) {
    q.timeLimitSeconds = 120
    const items = (side: string) => Array.from({ length: 8 }, (_, i) => ({ id: `${side}-${i}`, label: `${i + 1} ${side} ${'A long readable item description '.repeat(4)}`.slice(0, 120) }))
    if (q.type === 'ordering') { q.items = items('Item'); q.correctItemIds = q.items.map(item => item.id) }
    if (q.type === 'matching') { q.leftItems = items('Left'); q.rightItems = items('Right'); q.correctPairs = q.leftItems.map((item, i) => ({ leftId: item.id, rightId: q.rightItems[i].id })) }
  }
  await page.goto('/'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login'); await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate((quiz) => { const key = 'katwed.demo.state.v2'; const state = JSON.parse(localStorage.getItem(key)!) as { quizzes: typeof quiz[] }; state.quizzes = [quiz]; localStorage.setItem(key, JSON.stringify(state)) }, quiz)
  await page.reload(); await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Launch game', exact: true }).click()
  await page.getByRole('button', { name: /None/ }).click(); await page.getByRole('button', { name: 'Start lobby', exact: true }).click()
  const code = (await page.locator('.controller-bar').textContent())!.match(/Room\s+(\d{6})/)![1]
  const present = await context.newPage(); await present.setViewportSize({ width: 1280, height: 720 }); await present.goto(page.url().replace('/control', '/present'))
  const phone = await context.newPage(); await phone.setViewportSize({ width: 320, height: 740 }); await phone.goto(`/join?room=${code}`)
  await phone.getByLabel('Nickname').fill('Long items'); await phone.getByRole('button', { name: 'Join game', exact: true }).click()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  for (const [i, label] of ['Correct order', 'Correct pairs'].entries()) {
    await expect(present.locator('.arrangement-prompt li')).toHaveCount(i ? 16 : 8)
    for (const surface of [present, phone]) await noOverflow(surface)
    const last = (await present.locator('.arrangement-prompt li').last().boundingBox())!
    expect(last.y + last.height).toBeLessThanOrEqual(720)
    await present.screenshot({ path: testInfo.outputPath(`eight-${i}-question.png`) })
    await phone.screenshot({ path: testInfo.outputPath(`eight-${i}-phone.png`), fullPage: true })
    await page.getByRole('button', { name: 'Close answers now', exact: true }).click()
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expect(present.getByRole('region', { name: label }).getByRole('listitem')).toHaveCount(8)
    const final = (await present.getByRole('region', { name: label }).getByRole('listitem').last().boundingBox())!
    expect(final.y + final.height).toBeLessThanOrEqual(720)
    await expectWideFontRevealToFit(present, present.getByRole('region', { name: label }).getByRole('listitem').last())
    const preview = page.getByRole('region', { name: 'Presentation preview', exact: true })
    const area = (await preview.boundingBox())!, lastPreview = (await preview.getByRole('region', { name: label }).getByRole('listitem').last().boundingBox())!
    expect(lastPreview.y + lastPreview.height).toBeLessThanOrEqual(area.y + area.height)
    await present.screenshot({ path: testInfo.outputPath(`eight-${i}-reveal.png`) })
    if (!i) { await page.getByRole('button', { name: 'Show leaderboard', exact: true }).click(); await page.getByRole('button', { name: 'Next question', exact: true }).click() }
  }
})
