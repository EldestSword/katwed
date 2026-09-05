import {expect,test,type Page} from '@playwright/test'
import {wagerQuiz} from '../../src/test/wagerFixtures'
import {progressiveQuestion} from '../../src/test/progressiveFixtures'
import type {GameSession,Quiz} from '../../src/types/domain'

const session=(page:Page):Promise<GameSession>=>page.evaluate(()=>(JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as {sessions:GameSession[]}).sessions[0])
const noOverflow=async(page:Page)=>expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)

for(const teams of [false,true])test(`${teams?'Team':'Individual'} streaks, missing/wrong answers, early/late review and Round Intro`,async({page,context},testInfo)=>{
  test.setTimeout(120000)
  const typed={...progressiveQuestion(),progressiveRevealEnabled:false,speedScoringEnabled:false,media:{type:'none' as const}}
  const quiz=wagerQuiz(Array.from({length:6},(_,i)=>({...typed,id:`streak-q${i+1}`,prompt:`Streak question ${i+1}`})))
  quiz.title='Streaks';quiz.rounds.push({...quiz.rounds[0],id:'second-round',title:'Round Two',displayOrder:1,introEnabled:true})
  quiz.questions.forEach((q,i)=>{if(i>=2)q.roundId='second-round'})
  await page.goto('/');await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()})
  await page.goto('/host/login');await page.getByRole('button',{name:'Enter demo host area'}).click()
  await expect(page.getByRole('article',{name:'Katwed! Mixed Quiz'})).toBeVisible()
  await page.evaluate(quiz=>{const key='katwed.demo.state.v2',state=JSON.parse(localStorage.getItem(key)!) as {quizzes:Quiz[]};state.quizzes=[quiz];localStorage.setItem(key,JSON.stringify(state))},quiz)
  await page.reload();await page.setViewportSize({width:1440,height:1000})
  await page.getByRole('article',{name:'Streaks'}).getByRole('button',{name:'Launch game'}).click()
  if(teams){await page.getByRole('button',{name:'Teams',exact:true}).click();await page.getByLabel('Team 1 name').fill('Blue');await page.getByLabel('Team 2 name').fill('Red');await page.getByLabel('Team assignment').selectOption('host')}
  await page.getByRole('button',{name:/None/}).click();await page.getByRole('button',{name:'Start lobby',exact:true}).click()
  await expect(page).toHaveURL(/\/control$/)
  const code=(await session(page)).roomCode
  const present=await context.newPage();await present.setViewportSize({width:1280,height:720});await present.goto(page.url().replace('/control','/present'))
  const phone=await context.newPage();await phone.setViewportSize({width:320,height:740});await phone.goto(`/join?room=${code}`)
  await phone.getByLabel('Nickname').fill('Carol');await phone.getByRole('button',{name:'Join game',exact:true}).click()
  await expect(phone.getByRole('heading',{name:'You’re in, Carol!'})).toBeVisible()
  if(teams)await page.getByLabel('Team for Carol').selectOption({label:'Blue'})
  await page.getByRole('button',{name:'Start game',exact:true}).click()
  for(let n=1;n<=6;n++){
    await expect(present.getByRole('heading',{name:`Streak question ${n}`,exact:true})).toBeVisible()
    await expect(phone.getByRole('textbox')).toBeVisible()
    if(n!==5){
      await phone.getByRole('textbox').fill(n===2||n===4?'Nearly':'Alex')
      if(n===4)await phone.getByRole('radio',{name:/^100%/}).check()
      await phone.getByRole('button',{name:'Lock in',exact:true}).click()
      await expect(phone.getByRole('heading',{name:'Answer locked'})).toBeVisible()
    }else await page.getByRole('button',{name:'Close answers now',exact:true}).click()
    if(n===2)await page.getByRole('button',{name:'Mark correct',exact:true}).click()
    await page.getByRole('button',{name:'Reveal answer',exact:true}).click()
    await page.getByRole('button',{name:n===6?'Reveal final results':'Show leaderboard',exact:true}).click()
    if(n===6)break
    await expect(phone.getByRole('heading',{name:'Leaderboard',exact:true})).toBeVisible()
    if(n===1||n===4||n===5)await expect(phone.locator('.player-streak')).toHaveCount(0)
    else await expect(phone.locator('.player-streak')).toContainText(`${n} correct in a row`)
    if(teams){await expect(phone.getByText('Team standings',{exact:true})).toBeVisible();await expect(present.locator('.streak-badge')).toHaveCount(0)}
    if(n===3){
      await expect(present.locator('.leaderboard-commentary')).toHaveText('Carol is on a 3-answer streak!',{timeout:10000})
      if(!teams)await expect(present.getByLabel('3 correct answers in a row')).toBeVisible()
      await noOverflow(phone);await noOverflow(present)
      await phone.screenshot({path:testInfo.outputPath('streak-phone-320.png'),fullPage:true})
      await present.screenshot({path:testInfo.outputPath('streak-presentation.png')})
      await page.screenshot({path:testInfo.outputPath('streak-controller.png'),fullPage:true})
      const preview=page.locator('.controller-preview');await expect(preview.locator('.leaderboard-commentary')).toContainText('3-answer streak')
      await present.reload();await expect(present.getByRole('heading',{name:'Leaderboard',exact:true})).toBeVisible()
      await expect(present.locator('.leaderboard-commentary')).toBeEmpty()
    }
    if(n===4){
      await page.getByRole('button',{name:'Mark correct',exact:true}).click()
      await expect.poll(async () => (await session(page)).players[0].currentCorrectStreak).toBe(4)
      // Existing safe-state refresh after a late correction, no new refresh mechanism.
      await phone.reload();await expect(phone.locator('.player-streak')).toContainText('4 correct in a row')
      expect((await session(page)).players[0].currentCorrectStreak).toBe(4)
      await page.getByRole('button',{name:'Undo override',exact:true}).click()
      await expect.poll(async () => (await session(page)).players[0].currentCorrectStreak).toBe(0)
      await phone.reload();await expect(phone.locator('.player-streak')).toHaveCount(0)
      await page.getByRole('button',{name:'Mark correct',exact:true}).click()
      await expect.poll(async () => (await session(page)).players[0].currentCorrectStreak).toBe(4)
    }
    if(n===2){
      await page.getByRole('button',{name:/Next round/}).click();await expect(phone.getByRole('heading',{name:'Round Two',exact:true})).toBeVisible()
      expect((await session(page)).players[0].currentCorrectStreak).toBe(2)
      await page.getByRole('button',{name:'Start round',exact:true}).click()
    }else await page.getByRole('button',{name:'Next question',exact:true}).click()
  }
  await expect(present.locator('.final-results')).toBeVisible();await noOverflow(phone)
  const final=await session(page);expect(final.players[0]).toMatchObject({currentCorrectStreak:1,longestCorrectStreak:4})
  await expect(present.getByText('Longest Streak',{exact:true})).toHaveCount(0)
})
