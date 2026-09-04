import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { allWagerQuestions, wagerQuiz } from '../../src/test/wagerFixtures'
import { progressiveQuestion } from '../../src/test/progressiveFixtures'
import type { GameSession, PowerUpUse, Question, Quiz } from '../../src/types/domain'

test.setTimeout(90_000)

type DemoSession=GameSession & {powerUpUses:Array<PowerUpUse & {playerId:string}>}
const hostState=(page:Page):Promise<DemoSession>=>page.evaluate(()=>(JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as {sessions:DemoSession[]}).sessions[0])
async function setup(page:Page,question:Question){
  await page.setViewportSize({width:1440,height:1000})
  const quiz=wagerQuiz([{...question,speedScoringEnabled:question.speedScoringEnabled,wagerEnabled:false,displayOrder:0}]);quiz.title='Power-Up browser check'
  await page.goto('/');await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()})
  await page.goto('/host/login');await page.getByRole('button',{name:'Enter demo host area'}).click()
  await expect(page.getByRole('article',{name:'Katwed! Mixed Quiz'})).toBeVisible()
  await page.evaluate((quiz:Quiz)=>{const key='katwed.demo.state.v2';const state=JSON.parse(localStorage.getItem(key)!) as {quizzes:Quiz[]};state.quizzes=[quiz];localStorage.setItem(key,JSON.stringify(state))},quiz)
  await page.reload();await page.getByRole('button',{name:'Launch game'}).click()
  const toggle=page.getByRole('checkbox',{name:/Give every player three one-use Power-Ups/})
  await expect(toggle).not.toBeChecked();await toggle.check()
  await page.getByRole('checkbox',{name:/Auto-close answers/}).uncheck()
  await page.getByRole('button',{name:/None/}).click();await page.getByRole('button',{name:'Start lobby',exact:true}).click()
  await expect(page.getByRole('button',{name:'Start game',exact:true})).toBeVisible()
  return (await hostState(page)).roomCode
}
async function join(context:BrowserContext,room:string,name:string){
  const phone=await context.newPage();await phone.setViewportSize({width:320,height:740})
  await phone.goto(`/join?room=${room}`);await phone.getByLabel('Nickname').fill(name);await phone.getByRole('button',{name:'Join game',exact:true}).click()
  await expect(phone.getByRole('heading',{name:`You’re in, ${name}!`})).toBeVisible();return phone
}
async function noOverflow(page:Page){expect(await page.locator('html').evaluate((el:{scrollWidth:number;clientWidth:number})=>el.scrollWidth<=el.clientWidth)).toBe(true)}

test('Double Up doubles positive points and remains used after reconnect at 320px',async({page,context})=>{
  const room=await setup(page,{...progressiveQuestion(),progressiveRevealEnabled:false,speedScoringEnabled:false,media:{type:'none'}})
  const phone=await join(context,room,'Carol');await page.getByRole('button',{name:'Start game',exact:true}).click()
  await phone.getByRole('textbox').fill('Alex');await phone.getByRole('button',{name:/Double Up/}).click()
  await expect(phone.getByRole('textbox')).toHaveValue('Alex');await noOverflow(phone)
  await phone.getByRole('button',{name:'Lock in',exact:true}).click();await expect(phone.getByRole('heading',{name:'Answer locked'})).toBeVisible()
  expect((await hostState(page)).players[0].totalScore).toBe(2000)
  await phone.reload();await expect(phone.getByText('Power-Up: Double Up')).toBeVisible()
  expect((await hostState(page)).powerUpUses).toHaveLength(1)
})

test('50/50 retains exactly two original choices through reload without revealing them on Presentation',async({page,context})=>{
  const q=allWagerQuestions().find(q=>q.type==='single-choice')!
  const room=await setup(page,q),phone=await join(context,room,'Carol')
  const present=await context.newPage();await present.setViewportSize({width:1280,height:720});await present.goto(page.url().replace('/control','/present'))
  await page.getByRole('button',{name:'Start game',exact:true}).click()
  await phone.getByRole('button',{name:/50\/50/}).click()
  const choices=phone.getByRole('group',{name:'Choose one answer'}).getByRole('button')
  await expect(choices).toHaveCount(2);const labels=await choices.allTextContents()
  await phone.reload();await expect(choices).toHaveCount(2);expect(await choices.allTextContents()).toEqual(labels)
  await expect(present.getByRole('region',{name:'Power-Ups'})).toHaveCount(0)
  expect((await hostState(page)).answers).toHaveLength(0)
  await noOverflow(phone);await choices.first().click();await phone.getByRole('button',{name:'Lock in',exact:true}).click()
  await expect(phone.getByText('Power-Up: 50/50')).toBeVisible()
})

test('Fast Five uses five-second faster scoring while preserving actual response metrics',async({page,context})=>{
  const room=await setup(page,{...progressiveQuestion(),progressiveRevealEnabled:false,speedScoringEnabled:true,media:{type:'none'}})
  const a=await join(context,room,'Carol'),b=await join(context,room,'Roger')
  await page.getByRole('button',{name:'Start game',exact:true}).click()
  await expect(a.getByRole('textbox')).toBeVisible();await expect(b.getByRole('textbox')).toBeVisible()
  const opened=Date.parse((await hostState(page)).questionOpenedAt!)
  await a.clock.setFixedTime(new Date(opened+8000));await b.clock.setFixedTime(new Date(opened+8000))
  await a.getByRole('textbox').fill('Alex');await b.getByRole('textbox').fill('Alex')
  await a.getByRole('button',{name:/Fast Five/}).click()
  await a.getByRole('button',{name:'Lock in',exact:true}).click();await b.getByRole('button',{name:'Lock in',exact:true}).click()
  await expect(b.getByRole('heading',{name:'Answer locked'})).toBeVisible()
  const state=await hostState(page)
  expect(state.answers.map(answer=>answer.responseTimeMs)).toEqual([8000,8000])
  expect(state.players.map(player=>player.totalCorrectResponseMs)).toEqual([8000,8000])
  expect(state.players.map(player=>player.totalScore)).toEqual([975,933])
  await noOverflow(a)
})
