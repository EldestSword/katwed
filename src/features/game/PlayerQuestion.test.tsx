import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerQuestion } from './PlayerQuestion'
import type { RosterMember, SafeQuestion } from '../../types/domain'

const question: SafeQuestion = {
  id: 'q1',
  type: 'mashup',
  prompt: 'Who is in this mash-up?',
  supportingText: '',
  media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Question image', revealEffect: 'immediate', revealDurationSeconds: 0 },
  mediaVisibility: 'both',
  presentationChoiceVisibility: 'hide',
  points: 1,
  speedScoringEnabled: false,
  doubleScore: false,
  displayOrder: 0,
  questionNumber: 1,
  totalQuestions: 3,
  timeLimitSeconds: 30,
}
const roster: RosterMember[] = ['Alex', 'Bailey', 'Casey'].map((displayName, displayOrder) => ({
  id: displayName.toLowerCase(), quizId: 'quiz', displayName, shortName: displayName, active: true, displayOrder,
}))
const closesAt = new Date(Date.now() + 60_000).toISOString()

describe('PlayerQuestion mash-up', () => {
  it('enables submission only when exactly two choices are selected', async () => {
    const user = userEvent.setup()
    render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Lock in' })
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    expect(submit).toBeEnabled()
  })

  it('blocks a third choice and allows deselection', async () => {
    const user = userEvent.setup()
    render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    await user.click(screen.getByRole('button', { name: 'Casey' }))
    expect(screen.getByText(/Two selected already/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
  })

  it('locks and restores a typed answer without exposing correctness', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    await user.click(screen.getByRole('button', { name: 'Lock in' }))
    expect(await screen.findByRole('heading', { name: 'Answer locked' })).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith({ type: 'mashup', memberIds: ['alex', 'bailey'] })
    rerender(<PlayerQuestion question={question} roster={roster} closesAt={closesAt}
      initialAnswer={{ type: 'mashup', memberIds: ['bailey', 'alex'] }} onSubmit={vi.fn()} />)
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument()
  })
})

describe('PlayerQuestion Buzz-In', () => {
  const buzzQuestion: SafeQuestion = {
    id: 'buzz', type: 'true-false', prompt: 'Buzz if you know it', supportingText: 'One answer only',
    media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
    points: 1000, speedScoringEnabled: false, doubleScore: false, wagerEnabled: true, buzzInEnabled: true,
    displayOrder: 0, questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30,
  }
  const players = [
    { id: 'winner', sessionId: 'session', nickname: 'Carol', teamId: 'blue', connected: true, joinedAt: '', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0 },
    { id: 'loser', sessionId: 'session', nickname: 'Roger', teamId: 'red', connected: true, joinedAt: '', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0 },
  ]
  const teams = [
    { id: 'blue', sessionId: 'session', name: 'Blue Team', displayOrder: 0 },
    { id: 'red', sessionId: 'session', name: 'Red Team', displayOrder: 1 },
  ]

  it('shows prompt, Wager and one large buzzer before exposing answer controls', () => {
    render(<PlayerQuestion question={buzzQuestion} roster={[]} closesAt={closesAt} playerId="winner" players={players} teams={teams} onBuzz={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Buzz if you know it' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'BUZZ' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Your wager' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'True' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock in' })).toBeNull()
  })

  it('reveals the existing answer controls only after an authoritative winning result', async () => {
    const user = userEvent.setup()
    const result = { won: true, winnerPlayerId: 'winner', claimedAt: new Date().toISOString(), answerDeadlineAt: new Date(Date.now() + 10_000).toISOString() }
    const onBuzz = vi.fn().mockResolvedValue(result)
    render(<PlayerQuestion question={buzzQuestion} roster={[]} closesAt={closesAt} playerId="winner" players={players} teams={teams} onBuzz={onBuzz} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'BUZZ' }))
    expect(await screen.findByText('You got the buzz!')).toBeVisible()
    expect(screen.getByRole('button', { name: 'True' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
    expect(onBuzz).toHaveBeenCalledOnce()
  })

  it('names the winner and locks out every other player', () => {
    const buzz = { winnerPlayerId: 'winner', claimedAt: new Date().toISOString(), answerDeadlineAt: new Date(Date.now() + 10_000).toISOString() }
    render(<PlayerQuestion question={buzzQuestion} roster={[]} closesAt={closesAt} buzz={buzz} playerId="loser" players={players} teams={teams} onBuzz={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByText('Carol · Blue Team buzzed first')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Waiting for their answer…' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'True' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'BUZZ' })).toBeNull()
  })

  it('keeps the selected Wager after winning and reopens the buzzer after an authoritative reset', async () => {
    const user = userEvent.setup()
    const view = render(<PlayerQuestion question={buzzQuestion} roster={[]} closesAt={closesAt} buzz={null} playerId="winner" players={players} teams={teams} onBuzz={vi.fn()} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('radio', { name: /^50%/ }))
    const won = { winnerPlayerId: 'winner', claimedAt: new Date().toISOString(), answerDeadlineAt: new Date(Date.now() + 10_000).toISOString() }
    view.rerender(<PlayerQuestion question={buzzQuestion} roster={[]} closesAt={closesAt} buzz={won} playerId="winner" players={players} teams={teams} onBuzz={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /^50%/ })).toBeChecked()
    expect(screen.getByText('You got the buzz!')).toBeVisible()
    view.rerender(<PlayerQuestion question={buzzQuestion} roster={[]} closesAt={closesAt} buzz={null} playerId="winner" players={players} teams={teams} onBuzz={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'BUZZ' })).toBeVisible()
    expect(screen.getByRole('radio', { name: /^50%/ })).toBeChecked()
  })
})

describe('PlayerQuestion image choices', () => {
  it('opens enlargement without selecting the answer and closes with Escape', async () => {
    const user = userEvent.setup()
    const imageQuestion: SafeQuestion = {
      id: 'image-choice', type: 'single-choice', prompt: 'Choose', supportingText: '',
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0, questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30,
      options: [
        { id: 'picture', label: 'Picture', imagePath: '/demo/portrait-1.svg', imageAlt: 'Fictional portrait' },
        { id: 'text', label: 'Text only' },
      ],
      randomiseOptions: false,
    }
    render(<PlayerQuestion question={imageQuestion} roster={[]} closesAt={closesAt} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Enlarge' }))
    expect(screen.getByRole('dialog', { name: 'Enlarged question image' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Picture/ })).toHaveAttribute('aria-pressed', 'false')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('PlayerQuestion slider', () => {
  const sliderQuestion: SafeQuestion = {
    id: 'slider', type: 'slider', prompt: 'Choose a value', supportingText: '',
    media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'hide',
    points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0, questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30,
    minimum: 0, maximum: 100, step: 5, prefix: '', suffix: '', unitLabel: 'units',
  }

  it('retains a native range, changes value normally and submits the selected value', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<PlayerQuestion question={sliderQuestion} roster={[]} closesAt={closesAt} onSubmit={onSubmit} />)
    const slider = screen.getByRole('slider', { name: 'units' }) as HTMLInputElement

    expect(slider.tagName).toBe('INPUT')
    expect(slider.type).toBe('range')
    expect(slider.closest('.slider-answer__interaction')).not.toBeNull()
    expect(slider).toHaveValue('50')
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
    fireEvent.change(slider, { target: { value: '60' } })
    expect(slider.value).toBe('60')
    expect(screen.getByText(/60 units/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeEnabled()

    slider.focus()
    expect(document.activeElement).toBe(slider)
    expect(fireEvent.keyDown(slider, { key: 'ArrowRight' })).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Lock in' }))
    expect(onSubmit).toHaveBeenCalledWith({ type: 'slider', value: Number(slider.value) })
    expect(container.querySelector('.slider-answer')).not.toBeInTheDocument()
  })

  it('only submits a nudged decimal answer on Lock in and clears selection for the next question', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const decimalQuestion = { ...sliderQuestion, minimum: -2.5, maximum: 2.5, step: .25 }
    const { rerender } = render(<PlayerQuestion question={decimalQuestion} roster={[]} closesAt={null} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Increase answer' }))
    await user.click(screen.getByRole('button', { name: 'Increase answer' }))
    await user.click(screen.getByRole('button', { name: 'Decrease answer' }))
    expect(screen.getByRole('slider')).toHaveValue('0.25')
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Lock in' }))
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ type: 'slider', value: .25 })
    expect(screen.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
    rerender(<PlayerQuestion question={{ ...decimalQuestion, id: 'next-slider' }} roster={[]} closesAt={null} onSubmit={onSubmit} />)
    expect(screen.getByRole('slider')).toHaveValue('0')
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
  })

  it('restores a submitted slider answer without offering another selection', () => {
    render(<PlayerQuestion question={sliderQuestion} roster={[]} closesAt={null} initialAnswer={{ type: 'slider', value: 60 }} onSubmit={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument()
  })
})

describe('PlayerQuestion Typed Answer', () => {
  const typedQuestion: SafeQuestion = {
    id: 'typed', type: 'typed-answer', prompt: 'Name the programme', supportingText: '',
    media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'hide',
    points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0, questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30,
  }

  it('trims and submits meaningful text with Enter without exposing correctness', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<PlayerQuestion question={typedQuestion} roster={[]} closesAt={closesAt} onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Type your answer' })
    expect(input).toHaveAttribute('maxlength', '120')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
    await user.type(input, '  Red Dwarf  {Enter}')
    expect(onSubmit).toHaveBeenCalledWith({ type: 'typed-answer', value: 'Red Dwarf' })
    expect(await screen.findByText('Red Dwarf')).toBeInTheDocument()
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument()
  })

  it('does not allow punctuation-only text to be submitted', async () => {
    const user = userEvent.setup()
    render(<PlayerQuestion question={typedQuestion} roster={[]} closesAt={closesAt} onSubmit={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Type your answer' }), '---')
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
  })
})

describe('PlayerQuestion answer palettes', () => {
  const colours = ['#FFFFFF', '#071326', '#FFFF00', '#00FFFF', '#C62828', '#1565C0', '#2E7D32', '#F9A825'] as const

  it.each([2, 3, 4, 5, 8])('exposes an option count for the responsive %s-answer layout', (optionCount) => {
    const choiceQuestion: SafeQuestion = {
      id: `choice-${optionCount}`, type: 'single-choice', prompt: 'Choose', supportingText: '',
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30, randomiseOptions: false,
      options: Array.from({ length: optionCount }, (_, index) => ({ id: `option-${index + 1}`, label: `Option ${index + 1}` })),
    }
    const { container } = render(<PlayerQuestion question={choiceQuestion} roster={[]} closesAt={null} onSubmit={vi.fn()} />)
    expect(container.querySelector('.player-question .answer-grid')).toHaveAttribute('data-option-count', String(optionCount))
  })

  it('assigns True and False palette positions without implying correctness', () => {
    const question: SafeQuestion = {
      id: 'boolean', type: 'true-false', prompt: 'True or false?', supportingText: '',
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30,
    }
    render(<PlayerQuestion question={question} roster={[]} closesAt={null} answerPaletteId="custom" customAnswerColours={colours} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'True' })).toHaveStyle({ backgroundColor: '#FFFFFF', color: '#111827' })
    expect(screen.getByRole('button', { name: 'False' })).toHaveStyle({ backgroundColor: '#071326', color: '#FFFFFF' })
  })

  it('supports all eight positional colours', () => {
    const question: SafeQuestion = {
      id: 'eight-options', type: 'single-choice', prompt: 'Choose', supportingText: '',
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30, randomiseOptions: false,
      options: colours.map((_, index) => ({ id: `option-${index + 1}`, label: `Option ${index + 1}` })),
    }
    const { container } = render(<PlayerQuestion question={question} roster={[]} closesAt={null} answerPaletteId="custom" customAnswerColours={colours} onSubmit={vi.fn()} />)
    expect([...container.querySelectorAll<HTMLElement>('[data-option-id]')].map((tile) => tile.style.backgroundColor))
      .toHaveLength(8)
  })
})

describe('PlayerQuestion responsive live copy', () => {
  function choiceQuestion(prompt: string, labels: string[], withMedia = false): SafeQuestion {
    return {
      id: `responsive-${prompt.length}`, type: 'single-choice', prompt, supportingText: '',
      media: withMedia
        ? { type: 'image', path: '/demo/portrait-1.svg', altText: 'Visual clue', revealEffect: 'immediate', revealDurationSeconds: 0 }
        : { type: 'none' },
      mediaVisibility: 'both', presentationChoiceVisibility: 'show', points: 1000,
      speedScoringEnabled: false, doubleScore: false, displayOrder: 0, questionNumber: 1,
      totalQuestions: 1, timeLimitSeconds: 30, randomiseOptions: false,
      options: labels.map((label, index) => ({ id: `option-${index}`, label })),
    }
  }

  it('marks centred prompts with progressively denser tiers, including earlier compaction for media', () => {
    const view = render(<PlayerQuestion question={choiceQuestion('Short prompt?', ['One', 'Two'])} roster={[]} closesAt={null} onSubmit={vi.fn()} />)
    expect(view.container.querySelector('.player-question__prompt')).toHaveAttribute('data-question-density', 'short')

    const mediumPrompt = 'A'.repeat(100)
    view.rerender(<PlayerQuestion question={choiceQuestion(mediumPrompt, ['One', 'Two'])} roster={[]} closesAt={null} onSubmit={vi.fn()} />)
    expect(view.container.querySelector('.player-question__prompt')).toHaveAttribute('data-question-density', 'medium')

    view.rerender(<PlayerQuestion question={choiceQuestion('A'.repeat(180), ['One', 'Two'])} roster={[]} closesAt={null} onSubmit={vi.fn()} />)
    expect(view.container.querySelector('.player-question__prompt')).toHaveAttribute('data-question-density', 'long')

    view.rerender(<PlayerQuestion question={choiceQuestion('A'.repeat(260), ['One', 'Two'])} roster={[]} closesAt={null} onSubmit={vi.fn()} />)
    expect(view.container.querySelector('.player-question__prompt')).toHaveAttribute('data-question-density', 'extra-long')

    view.rerender(<PlayerQuestion question={choiceQuestion('A'.repeat(70), ['One', 'Two'], true)} roster={[]} closesAt={null} onSubmit={vi.fn()} />)
    expect(view.container.querySelector('.player-question__prompt')).toHaveAttribute('data-question-density', 'medium')
  })

  it('keeps a three-answer orphan as a normal tile and marks an unbroken long word for fitting', () => {
    const longWord = 'Pneumonoultramicroscopicsilicovolcanoconiosis'
    const { container } = render(<PlayerQuestion
      question={choiceQuestion('Choose', ['Short', 'Another answer', longWord])}
      roster={[]}
      closesAt={null}
      onSubmit={vi.fn()}
    />)
    const grid = container.querySelector('.answer-grid')
    const tiles = grid?.querySelectorAll(':scope > .answer-tile') ?? []
    expect(grid).toHaveAttribute('data-option-count', '3')
    expect(grid).toHaveAttribute('data-has-extra-long-answer', 'true')
    expect(tiles).toHaveLength(3)
    expect(tiles[2]).toHaveAttribute('data-answer-density', 'extra-long')
    expect(tiles[2].querySelector('.answer-tile__label')).toHaveTextContent(longWord)
  })
})
