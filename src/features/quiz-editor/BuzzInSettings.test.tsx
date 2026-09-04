import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { connectionsFixture } from '../../test/connectionsFixtures'
import type { Question, QuizType } from '../../types/domain'
import { BuzzInSettings } from './BuzzInSettings'
import { validateQuestion, validateQuizSave } from './validation'
import { wagerQuiz } from '../../test/wagerFixtures'
import { headToHeadDemoQuiz } from '../../lib/demo/sampleData'

function Fixture({ initial, quizType = 'standard', changed = vi.fn() }: { initial: Question; quizType?: QuizType; changed?: (question: Question) => void }) {
  const [question, setQuestion] = useState(initial)
  return <BuzzInSettings question={question} quizType={quizType} update={change => setQuestion(current => {
    const next = change(current)
    changed(next)
    return next
  })} />
}

describe('BuzzInSettings', () => {
  const eligible = { ...progressiveQuestion(), progressiveRevealEnabled: false, media: { type: 'none' as const }, buzzInEnabled: false }

  it('authors an explicit modifier with the fixed answer-window summary', async () => {
    const user = userEvent.setup(), changed = vi.fn()
    render(<Fixture initial={eligible} changed={changed} />)
    await user.click(screen.getByRole('checkbox', { name: /First player to buzz/ }))
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ buzzInEnabled: true }))
    expect(screen.getByText('10 second answer window')).toBeVisible()
  })

  it('does not offer Buzz-In for Head-to-Head, Connections or Progressive Reveal', () => {
    const views = [
      render(<Fixture initial={eligible} quizType="head-to-head" />),
      render(<Fixture initial={{ ...connectionsFixture(), buzzInEnabled: false }} />),
      render(<Fixture initial={{ ...progressiveQuestion(), buzzInEnabled: false }} />),
    ]
    expect(screen.queryAllByRole('checkbox', { name: /First player to buzz/ })).toHaveLength(0)
    views.forEach(view => view.unmount())
  })

  it('rejects impossible saved combinations while allowing Wager plus Buzz-In', () => {
    expect(validateQuestion({ ...eligible, buzzInEnabled: true }, []).valid).toBe(true)
    expect(validateQuestion({ ...connectionsFixture(), buzzInEnabled: true }, []).messages).toContain('Buzz-In is not available for Connections.')
    expect(validateQuestion({ ...progressiveQuestion(), buzzInEnabled: true }, []).messages).toContain('Buzz-In cannot be combined with Progressive Reveal.')
    expect(validateQuizSave({
      ...structuredClone(headToHeadDemoQuiz),
      questions: headToHeadDemoQuiz.questions.map(question => ({ ...question, buzzInEnabled: true })),
    })).toContain('Buzz-In is Standard-only. Disable it before switching to Head-to-Head.')
    const wagerAndBuzz = wagerQuiz([{ ...eligible, wagerEnabled: true, buzzInEnabled: true }])
    expect(validateQuizSave(wagerAndBuzz)).toEqual([])
  })
})
