import { waitForDemoLobby } from './demoState'
import { expect, test, type Page } from '@playwright/test'
import { wagerQuiz, allWagerQuestions } from '../../src/test/wagerFixtures'
import { progressiveQuestion } from '../../src/test/progressiveFixtures'
import { connectionsFixture } from '../../src/test/connectionsFixtures'
import { progressiveRevealScore } from '../../src/features/scoring/progressiveReveal'
import type { GameSession, Quiz } from '../../src/types/domain'

async function setup(page: Page, quiz: Quiz) {
  await page.goto('/'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login'); await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate(quiz => { const key='katwed.demo.state.v2', state=JSON.parse(localStorage.getItem(key)!) as {quizzes:Quiz[]}; state.quizzes=[quiz]; localStorage.setItem(key,JSON.stringify(state)) },quiz)
  await page.reload()
}
async function currentSession(page: Page): Promise<GameSession> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as {sessions:GameSession[]}).sessions[0])
}
async function launch(page: Page, teams=false) {
  await page.setViewportSize({width:1440,height:1000})
  await page.getByRole('article',{name:'Wagers'}).getByRole('button',{name:'Launch game'}).click()
  if (teams) {
    await page.getByRole('button',{name:'Teams',exact:true}).click()
    await page.getByLabel('Team 1 name').fill('Blue'); await page.getByLabel('Team 2 name').fill('Red')
    await page.getByLabel('Team assignment').selectOption('host')
  }
  await page.getByRole('button',{name:/None/}).click()
  await page.getByRole('button',{name:'Start lobby',exact:true}).click()
  return (await waitForDemoLobby(page)).roomCode
}
async function join(page: Page, code: string, name: string) {
  await page.goto('/'); await page.evaluate(code=>localStorage.removeItem(`katwed.player.${code}`),code)
  await page.setViewportSize({width:320,height:740}); await page.goto(`/join?room=${code}`)
  await page.getByLabel('Nickname').fill(name); await page.getByRole('button',{name:'Join game',exact:true}).click()
  await expect(page.getByRole('heading',{name:`You’re in, ${name}!`})).toBeVisible()
}
async function submit(page: Page, value: string, percent: number) {
  await page.getByRole('textbox').fill(value)
  await page.getByRole('radio',{name:percent?new RegExp(`^${percent}%`):'No wager'}).check()
  await page.getByRole('button',{name:'Lock in',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Answer locked'})).toBeVisible()
}
async function noOverflow(page: Page) { expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true) }

test('author wager, preview exact 999-point stakes and save/reload', async ({page}) => {
  const quiz=wagerQuiz([allWagerQuestions()[0]]); quiz.questions[0].wagerEnabled=false
  await setup(page,quiz)
  await page.getByRole('article',{name:'Wagers'}).getByRole('link',{name:'Edit',exact:true}).click()
  await page.getByText('Scoring',{exact:true}).click()
  await page.getByLabel('Let players risk extra points').check()
  await page.getByLabel('Maximum points').fill('999')
  await expect(page.getByLabel('Wager preview')).toContainText('25% · 249 pts')
  await expect(page.getByLabel('Wager preview')).toContainText('50% · 499 pts')
  await page.getByRole('button',{name:'Save quiz',exact:true}).first().click()
  await expect(page.getByRole('status').filter({hasText:'Quiz saved.'})).toBeVisible()
  await page.reload(); await page.getByText('Scoring',{exact:true}).click()
  await expect(page.getByLabel('Let players risk extra points')).toBeChecked()
  await expect(page.getByLabel('Maximum points')).toHaveValue('999')
})

test('correct/lost wagers, negative leaderboard, refresh, round reset and 320px keyboard controls', async ({page,context},testInfo) => {
  test.setTimeout(90000)
  const q={...progressiveQuestion(),progressiveRevealEnabled:false,speedScoringEnabled:false,media:{type:'none' as const}}
  const quiz=wagerQuiz([q]); quiz.rounds.push({...quiz.rounds[0],id:'round-2',title:'Second round',displayOrder:1,introEnabled:true})
  quiz.questions.push({...quiz.questions[0],id:'second',roundId:'round-2',displayOrder:1,points:500})
  await setup(page,quiz); const code=await launch(page)
  const present=await context.newPage(); await present.setViewportSize({width:1280,height:720}); await present.goto(page.url().replace('/control','/present'))
  const carol=await context.newPage(),ross=await context.newPage()
  await join(carol,code,'Carol'); await join(ross,code,'Ross')
  await page.getByRole('button',{name:'Start game',exact:true}).click()
  await expect(carol.getByRole('radio',{name:'No wager'})).toBeChecked()
  const before=await currentSession(page)
  await carol.getByRole('textbox').fill('Alex')
  await carol.getByRole('radio',{name:'No wager'}).focus(); await carol.keyboard.press('ArrowRight'); await carol.keyboard.press('ArrowRight')
  await expect(carol.getByRole('radio',{name:/^50%/})).toBeChecked()
  expect((await currentSession(page)).answers).toEqual(before.answers)
  await expect(carol.getByRole('textbox')).toHaveValue('Alex')
  await expect(present.locator('.wager-indicator')).toContainText('Up to 1,000 pts at risk')
  await noOverflow(carol); await carol.screenshot({path:testInfo.outputPath('wager-player-320.png'),fullPage:true})
  await carol.getByRole('button',{name:'Lock in',exact:true}).click()
  await submit(ross,'Wrong',100)
  let state=await currentSession(page)
  expect(state.answers.map(a=>a.pointsAwarded).sort((a,b)=>a-b)).toEqual([-1000,1500])
  await expect(page.locator('.controller-response-list')).toContainText('500 points')
  await ross.reload(); await expect(ross.locator('.wager-summary')).toContainText('1,000 points')
  await expect(ross.getByRole('radio')).toHaveCount(0)
  await page.getByRole('button',{name:'Reveal answer',exact:true}).click()
  await expect(carol.locator('.wager-summary')).toContainText('500 points')
  await page.getByRole('button',{name:'Show leaderboard',exact:true}).click()
  await expect(present.getByRole('list',{name:'Leaderboard',exact:true})).toContainText('-1,000 points')
  await page.getByRole('button',{name:/Next round/}).click()
  await expect(ross.locator('.wager-control')).toHaveCount(0)
  await page.getByRole('button',{name:'Start round',exact:true}).click()
  await expect(ross.getByRole('radio',{name:'No wager'})).toBeChecked()
  await submit(carol,'Alex',0); await submit(ross,'Alex',0)
  await page.getByRole('button',{name:'Reveal answer',exact:true}).click()
  await page.getByRole('button',{name:'Reveal final results',exact:true}).click()
  state=await currentSession(page)
  expect(state.players.find(p=>p.nickname==='Ross')!.totalScore).toBe(-500)
  await expect(present.locator('.final-results')).toContainText('Carol')
  await expect(ross.locator('.final-results')).toContainText('-500')
  await noOverflow(ross)
})

test('Team Progressive and Connections score before wagers; shared and compact media remain usable', async ({page,context},testInfo) => {
  test.setTimeout(90000)
  const quiz=wagerQuiz([progressiveQuestion(),{...connectionsFixture(),doubleScore:true}])
  await setup(page,quiz); const code=await launch(page,true)
  const present=await context.newPage(); await present.setViewportSize({width:1280,height:720}); await present.goto(page.url().replace('/control','/present'))
  const carol=await context.newPage(),ross=await context.newPage()
  await join(carol,code,'Carol'); await join(ross,code,'Ross')
  for (const name of ['Carol','Ross']) await page.getByLabel(`Team for ${name}`).selectOption({label:'Blue'})
  await page.getByRole('button',{name:'Start game',exact:true}).click()
  await carol.getByRole('textbox').fill('Alex'); await carol.getByRole('radio',{name:/^50%/}).check()
  await expect.poll(async()=>Number(await present.locator('.question-media').getAttribute('data-reveal-progress')),{timeout:15000}).toBeGreaterThan(.25)
  await expect(carol.getByRole('textbox')).toHaveValue('Alex'); await expect(carol.getByRole('radio',{name:/^50%/})).toBeChecked()
  const preview=page.locator('.controller-preview'), bounds=(await preview.boundingBox())!, footer=(await preview.locator('.presentation-question__footer').boundingBox())!
  expect(footer.y+footer.height).toBeLessThanOrEqual(bounds.y+bounds.height)
  const largeFooter=(await present.locator('.presentation-question__footer').boundingBox())!; expect(largeFooter.y+largeFooter.height).toBeLessThanOrEqual(720)
  await present.screenshot({path:testInfo.outputPath('wager-progressive-present.png')}); await page.screenshot({path:testInfo.outputPath('wager-controller.png'),fullPage:true})
  await carol.getByRole('button',{name:'Lock in',exact:true}).click(); await submit(ross,'Wrong',100)
  let state=await currentSession(page), answers=state.answers.filter(a=>a.questionId===quiz.questions[0].id)
  for (const a of answers) expect(a.pointsAwarded).toBe(a.correct?progressiveRevealScore(1000,a.responseTimeMs,20000)+500:-1000)
  await page.getByRole('button',{name:'Reveal answer',exact:true}).click(); await page.getByRole('button',{name:'Show leaderboard',exact:true}).click()
  await expect(present.getByRole('list',{name:'Leaderboard',exact:true})).toContainText(answers.reduce((sum,a)=>sum+a.pointsAwarded,0).toLocaleString('en-GB'))
  await page.getByRole('button',{name:'Next question',exact:true}).click()
  await expect(carol.getByRole('textbox')).toBeVisible({timeout:15000})
  await carol.getByRole('textbox').fill('Pla'); await carol.getByRole('radio',{name:/^25%/}).check()
  await page.getByRole('button',{name:'Reveal next clue',exact:true}).click(); await page.getByRole('button',{name:'Reveal next clue',exact:true}).click()
  await expect(carol.getByText('Earth',{exact:true})).toBeVisible(); await expect(carol.getByRole('textbox')).toHaveValue('Pla')
  await expect(carol.getByRole('radio',{name:/^25%/})).toBeChecked()
  await submit(carol,'Planets',50); await submit(ross,'Wrong',100)
  state=await currentSession(page); answers=state.answers.filter(a=>a.questionId===quiz.questions[1].id)
  expect(answers.map(a=>a.pointsAwarded).sort((a,b)=>a-b)).toEqual([-1000,1500])
  await page.getByRole('button',{name:'Reveal answer',exact:true}).click(); await page.getByRole('button',{name:'Reveal final results',exact:true}).click()
  await expect(present.getByRole('heading',{name:'Blue',exact:true})).toBeVisible()
  await noOverflow(carol); await noOverflow(present)
})
