import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RevealPayload, SafeQuestion } from '../../types/domain'
import { PlayerAnswerReveal } from './PlayerAnswerReveal'

const base = {
  id: 'question',
  prompt: 'Question',
  supportingText: '',
  timeLimitSeconds: 30,
  points: 1000,
  speedScoringEnabled: false,
  doubleScore: false,
  displayOrder: 0,
  media: { type: 'none' as const },
  mediaVisibility: 'both' as const,
  presentationChoiceVisibility: 'show' as const,
  questionNumber: 1,
  totalQuestions: 2,
}

function renderReveal(reveal: RevealPayload, question: SafeQuestion) {
  return render(<PlayerAnswerReveal reveal={reveal} question={question} submittedAnswer={null} />)
}

function expectAnswerCard() {
  expect(screen.getByRole('group', { name: 'Correct answer' })).toHaveClass('reveal-answer-card')
}

describe('PlayerAnswerReveal', () => {
  it('shows the Mars option itself instead of presentation-only placeholder copy', () => {
    renderReveal(
      { type: 'single-choice', correctOptionId: 'mars', caption: '', optionCounts: {} },
      { ...base, type: 'single-choice', options: [{ id: 'mars', label: 'Mars' }, { id: 'venus', label: 'Venus' }], randomiseOptions: false },
    )
    expectAnswerCard()
    expect(screen.getByRole('heading', { name: 'Mars' })).toBeInTheDocument()
    expect(screen.queryByText(/shared presentation/i)).not.toBeInTheDocument()
  })

  it('lists every correct multiple-select option and the exact-set rule', () => {
    renderReveal(
      { type: 'multiple-select', correctOptionIds: ['red', 'green', 'blue'], scoringMode: 'exact', caption: '', optionCounts: {} },
      {
        ...base, type: 'multiple-select', options: [
          { id: 'red', label: 'Red' }, { id: 'green', label: 'Green' },
          { id: 'blue', label: 'Blue' }, { id: 'yellow', label: 'Yellow' },
        ], minimumSelections: 3, maximumSelections: 3, randomiseOptions: false,
      },
    )
    expectAnswerCard()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Red', 'Green', 'Blue'])
    expect(screen.getByText('The complete set was required.')).toBeInTheDocument()
  })

  it('shows explicit true/false, formatted slider and both mash-up names', () => {
    const { rerender } = render(
      <PlayerAnswerReveal
        reveal={{ type: 'true-false', correctValue: false, caption: '', counts: { true: 0, false: 1 } }}
        question={{ ...base, type: 'true-false' }}
        submittedAnswer={null}
      />,
    )
    expectAnswerCard()
    expect(screen.getByRole('heading', { name: 'False' })).toBeInTheDocument()

    rerender(
      <PlayerAnswerReveal
        reveal={{ type: 'slider', correctValue: 20, tolerance: 2, caption: '', values: [] }}
        question={{ ...base, type: 'slider', minimum: 0, maximum: 40, step: 1, prefix: '£', suffix: '', unitLabel: 'million' }}
        submittedAnswer={null}
      />,
    )
    expectAnswerCard()
    expect(screen.getByRole('heading', { name: '£20 million' })).toBeInTheDocument()
    expect(screen.getByText('Accepted range: £18 million–£22 million')).toBeInTheDocument()

    rerender(
      <PlayerAnswerReveal
        reveal={{ type: 'mashup', correctMemberIds: ['alex', 'bailey'], correctNames: ['Alex', 'Bailey'], caption: '' }}
        question={{
          ...base, type: 'mashup',
          media: { type: 'image', path: '/portrait.svg', altText: 'Portrait', revealEffect: 'immediate', revealDurationSeconds: 0 },
        }}
        submittedAnswer={null}
      />,
    )
    expectAnswerCard()
    expect(screen.getByRole('heading')).toHaveTextContent('Alex + Bailey')
  })

  it('distinguishes a player pin from the correct pinpoint target', async () => {
    render(
      <PlayerAnswerReveal
        reveal={{ type: 'pinpoint', targetX: .5, targetY: .43, targetRadius: .12, caption: '', points: [] }}
        question={{
          ...base, type: 'pinpoint',
          media: { type: 'image', path: '/target.svg', altText: 'Target', revealEffect: 'immediate', revealDurationSeconds: 0 },
        }}
        submittedAnswer={{ type: 'pinpoint', x: .25, y: .75 }}
      />,
    )
    expectAnswerCard()
    expect(await screen.findByTestId('pinpoint-player-marker')).toBeInTheDocument()
    expect(screen.getByTestId('pinpoint-correct-target')).toBeInTheDocument()
    expect(screen.getAllByText('Your pin')).toHaveLength(2)
    expect(screen.getByText('Correct area')).toBeInTheDocument()
  })

  it('shows only the primary Typed Answer at reveal', () => {
    renderReveal(
      { type: 'typed-answer', correctAnswer: 'Red Dwarf', caption: '' },
      { ...base, type: 'typed-answer' },
    )
    expectAnswerCard()
    expect(screen.getByRole('heading', { name: 'Red Dwarf' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('The Red Dwarf')
  })
})
