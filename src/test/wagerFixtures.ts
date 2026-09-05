import { mixedDemoQuiz } from '../lib/demo/sampleData'
import { matchingFixture, orderingFixture } from './arrangementFixtures'
import { connectionsFixture } from './connectionsFixtures'
import type { PlayerAnswerPayload, Question, Quiz } from '../types/domain'

export function wagerQuiz(questions?: Question[]): Quiz {
  const source = structuredClone(mixedDemoQuiz)
  return { ...source, title: 'Wagers', questions: (questions ?? source.questions).map((q, i) => ({ ...q, wagerEnabled: true, displayOrder: i, roundId: source.rounds[0].id })) }
}

export function allWagerQuestions(): Question[] {
  return [...structuredClone(mixedDemoQuiz.questions), orderingFixture(), matchingFixture(), connectionsFixture()]
    .map(q => ({ ...q, wagerEnabled: true, points: 1000, doubleScore: false, speedScoringEnabled: false }))
}

export function correctPayload(q: Question): PlayerAnswerPayload {
  switch (q.type) {
    case 'single-choice': return { type: q.type, optionId: q.correctOptionId }
    case 'multiple-select': return { type: q.type, optionIds: [...q.correctOptionIds] }
    case 'true-false': return { type: q.type, value: q.correctValue }
    case 'slider': return { type: q.type, value: q.correctValue }
    case 'pinpoint': return { type: q.type, x: .5, y: .5 }
    case 'typed-answer': return { type: q.type, value: q.acceptedAnswers[0] ?? q.correctAnswer }
    case 'mashup': return { type: q.type, memberIds: [...q.correctMemberIds] }
    case 'ordering': return { type: q.type, itemIds: [...q.correctItemIds] }
    case 'matching': return { type: q.type, pairs: structuredClone(q.correctPairs) }
    case 'connections': return { type: q.type, value: q.acceptedAnswers[0] ?? q.correctAnswer }
  }
}
