import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PersonalPowerUpState, SafeQuestion } from '../../types/domain'
import { progressiveState } from '../../test/progressiveFixtures'
import { PlayerQuestion } from './PlayerQuestion'
import { safeArrangement, orderingFixture, matchingFixture } from '../../test/arrangementFixtures'

const typed:Extract<SafeQuestion,{type:'typed-answer'}>={...progressiveState().currentQuestion!,type:'typed-answer',progressiveRevealEnabled:false,speedScoringEnabled:true,media:{type:'none'},wagerEnabled:true}
const choice:SafeQuestion={...typed,type:'single-choice',options:['One','Two','Three','Four'].map((label,i)=>({id:String(i),label,displayOrder:i})),randomiseOptions:false}
const full:PersonalPowerUpState={runId:'run',uses:[]}
const deadline=()=>new Date(Date.now()+60000).toISOString()

describe('Player Power-Ups',()=>{
  it('moves focus to a surviving option if the focused choice is removed during activation',async()=>{
    const user=userEvent.setup()
    let release=()=>{}
    const pending=new Promise<void>(resolve=>{release=resolve})
    function Harness(){
      const [powerUps,setPowerUps]=useState(full)
      return <PlayerQuestion question={choice} roster={[]} closesAt={deadline()} powerUps={powerUps} onSubmit={vi.fn()} onFiftyFifty={async()=>{await pending;setPowerUps({runId:'run',uses:[{questionId:choice.id,powerUp:'fifty-fifty',optionIds:['1','3']}]})}}/>
    }
    render(<Harness/>)
    await user.click(screen.getByRole('button',{name:/50\/50/}))
    screen.getByRole('button',{name:'One'}).focus()
    await act(async()=>release())
    await waitFor(()=>expect(screen.getByRole('button',{name:'Two'})).toHaveFocus())
  })
  it('arms and clears choices without losing Typed Answer or Wager drafts; failed answers do not consume',async()=>{
    const user=userEvent.setup(),submit=vi.fn().mockRejectedValueOnce(new Error('Try again')).mockResolvedValue(undefined)
    render(<PlayerQuestion question={typed} roster={[]} closesAt={deadline()} powerUps={full} onSubmit={submit}/>)
    await user.type(screen.getByRole('textbox'),'Alex')
    await user.click(screen.getByRole('radio',{name:/^50%/}))
    await user.click(screen.getByRole('button',{name:/Double Up/}))
    expect(screen.getByRole('textbox')).toHaveValue('Alex')
    await user.click(screen.getByRole('button',{name:/Double Up/}))
    await user.click(screen.getByRole('button',{name:/Fast Five/}))
    expect(screen.getByRole('textbox')).toHaveValue('Alex')
    expect(screen.getByRole('radio',{name:/^50%/})).toBeChecked()
    await user.click(screen.getByRole('button',{name:'Lock in'}))
    expect(await screen.findByText('Try again')).toBeVisible()
    expect(screen.getByRole('button',{name:/Fast Five/})).toHaveAttribute('aria-pressed','true')
    await user.click(screen.getByRole('button',{name:'Lock in'}))
    expect(submit).toHaveBeenLastCalledWith({type:'typed-answer',value:'Alex',wagerPercent:50,powerUp:'fast-five'})
  })
  it.each(['1','0'])('keeps only retained choices and clears a removed selection (%s)',async(selected)=>{
    const user=userEvent.setup(),submit=vi.fn().mockResolvedValue(undefined)
    function Harness(){
      const [powerUps,setPowerUps]=useState(full)
      return <PlayerQuestion question={choice} roster={[]} closesAt={deadline()} powerUps={powerUps} onSubmit={submit} onFiftyFifty={async()=>{setPowerUps({runId:'run',uses:[{questionId:choice.id,powerUp:'fifty-fifty',optionIds:['1','3']}]})}}/>
    }
    render(<Harness/>);await user.click(screen.getByRole('button',{name:selected==='1'?'Two':'One'}))
    await user.click(screen.getByRole('button',{name:/50\/50/}))
    const group=screen.getByRole('group',{name:'Choose one answer'})
    expect(within(group).getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button',{name:'Lock in'}).hasAttribute('disabled')).toBe(selected==='0')
    expect(screen.getByText('50/50 used')).toBeVisible()
    expect(screen.queryByRole('button',{name:/Double Up/})).toBeNull()
  })
  it('restores a 50/50 reduction directly from reconnect state and shows unavailable reasons',()=>{
    const {rerender}=render(<PlayerQuestion question={choice} roster={[]} closesAt={deadline()} powerUps={{runId:'run',uses:[{questionId:choice.id,powerUp:'fifty-fifty',optionIds:['1','3']}]}} onSubmit={vi.fn()}/>)
    expect(within(screen.getByRole('group',{name:'Choose one answer'})).getAllByRole('button')).toHaveLength(2)
    rerender(<PlayerQuestion question={{...typed,speedScoringEnabled:false}} roster={[]} closesAt={deadline()} powerUps={full} onSubmit={vi.fn()}/>)
    expect(screen.getByRole('button',{name:/Fast Five/})).toBeDisabled()
    expect(screen.getByText('Speed questions only')).toBeVisible()
    expect(screen.getByRole('button',{name:/50\/50/})).toBeDisabled()
  })
  it.each([orderingFixture(),matchingFixture()])('does not remount $type controls when selecting power-ups',async(question)=>{
    const user=userEvent.setup()
    const {container}=render(<PlayerQuestion question={safeArrangement(question)} roster={[]} closesAt={deadline()} powerUps={full} onSubmit={vi.fn()}/>)
    const buttons=Array.from(container.querySelectorAll('button')).filter(b=>!b.closest('.power-up-tray'))
    await user.click(screen.getByRole('button',{name:/Double Up/}))
    expect(buttons.every(b=>container.contains(b))).toBe(true)
  })
  it('keeps Slider and Connections input intact when arming and clearing',async()=>{
    const user=userEvent.setup()
    const connection={...typed,type:'connections',visibleClues:[{id:'clue-1',text:'Clue'}],revealedClueCount:1,totalClues:4,availablePoints:1000} as SafeQuestion
    const {rerender}=render(<PlayerQuestion question={connection} roster={[]} closesAt={deadline()} powerUps={full} onSubmit={vi.fn()}/>)
    fireEvent.change(screen.getByRole('textbox'),{target:{value:'Planets'}})
    await user.click(screen.getByRole('button',{name:/Double Up/}));expect(screen.getByRole('textbox')).toHaveValue('Planets')
    const slider:SafeQuestion={...typed,id:'slider',type:'slider',minimum:0,maximum:100,step:1,prefix:'',suffix:'km',unitLabel:'Distance'}
    rerender(<PlayerQuestion question={slider} roster={[]} closesAt={deadline()} powerUps={full} onSubmit={vi.fn()}/>)
    fireEvent.change(screen.getByRole('slider'),{target:{value:'75'}})
    await user.click(screen.getByRole('button',{name:/Double Up/}));expect(screen.getByRole('slider')).toHaveValue('75')
  })
  it('preserves Pinpoint coordinates and the two-person Mash-up selection',async()=>{
    const user=userEvent.setup(),submit=vi.fn().mockResolvedValue(undefined)
    const pinpoint:SafeQuestion={...typed,id:'pinpoint',type:'pinpoint',media:{type:'image',path:'/demo/portrait-1.svg',altText:'Question',revealEffect:'immediate',revealDurationSeconds:0}}
    const {rerender}=render(<PlayerQuestion question={pinpoint} roster={[]} closesAt={deadline()} powerUps={full} onSubmit={submit}/>)
    await user.click(screen.getByText('Keyboard location controls'))
    fireEvent.change(screen.getByLabelText('Horizontal'),{target:{value:'0.75'}})
    fireEvent.change(screen.getByLabelText('Vertical'),{target:{value:'0.25'}})
    await user.click(screen.getByRole('button',{name:/Double Up/}))
    expect(screen.getByLabelText('Horizontal')).toHaveValue('0.75');expect(screen.getByLabelText('Vertical')).toHaveValue('0.25')
    const roster=['Alex','Bailey','Casey'].map((displayName,displayOrder)=>({id:displayName,quizId:'quiz',displayName,shortName:displayName,displayOrder,active:true}))
    rerender(<PlayerQuestion question={{...typed,id:'mashup',type:'mashup',media:pinpoint.media}} roster={roster} closesAt={deadline()} powerUps={full} onSubmit={submit}/>)
    await user.click(screen.getByRole('button',{name:'Alex'}));await user.click(screen.getByRole('button',{name:'Bailey'}))
    await user.click(screen.getByRole('button',{name:/Double Up/}));await user.click(screen.getByRole('button',{name:'Lock in'}))
    expect(submit).toHaveBeenCalledWith({type:'mashup',memberIds:['Alex','Bailey'],wagerPercent:0,powerUp:'double-up'})
  })
  it('hides the tray for Buzz, exhausted inventory and disabled sessions',()=>{
    const {rerender}=render(<PlayerQuestion question={{...typed,buzzInEnabled:true}} roster={[]} closesAt={deadline()} powerUps={full} onSubmit={vi.fn()}/>)
    expect(screen.queryByRole('region',{name:'Power-Ups'})).toBeNull()
    rerender(<PlayerQuestion question={typed} roster={[]} closesAt={deadline()} powerUps={{runId:'run',uses:[{questionId:'a',powerUp:'double-up'},{questionId:'b',powerUp:'fast-five'},{questionId:'c',powerUp:'fifty-fifty',optionIds:['1','3']}]}} onSubmit={vi.fn()}/>)
    expect(screen.queryByRole('region',{name:'Power-Ups'})).toBeNull()
    rerender(<PlayerQuestion question={typed} roster={[]} closesAt={deadline()} onSubmit={vi.fn()}/>)
    expect(screen.queryByRole('region',{name:'Power-Ups'})).toBeNull()
  })
})
