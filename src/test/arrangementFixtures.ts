import { createQuestion } from '../features/questions/factories'
import { mixedDemoQuiz } from '../lib/demo/sampleData'
import type { MatchingQuestion, OrderingQuestion, Quiz, SafeQuestion } from '../types/domain'

export function orderingFixture(): OrderingQuestion {
  const base = createQuestion('ordering', mixedDemoQuiz.id, 0, false) as OrderingQuestion
  const items = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((label, i) => ({ id: `item-${i}`, label }))
  return { ...base, id: 'ordering-question', items, correctItemIds: items.map((item) => item.id), timeLimitSeconds: 120 }
}
export function matchingFixture(): MatchingQuestion {
  const base = createQuestion('matching', mixedDemoQuiz.id, 1, false) as MatchingQuestion
  const leftItems = ['Jaws', 'Alien', 'Barbie', 'Pulp Fiction'].map((label, i) => ({ id: `left-${i}`, label }))
  const rightItems = ['Spielberg', 'Scott', 'Gerwig', 'Tarantino'].map((label, i) => ({ id: `right-${i}`, label }))
  return { ...base, id: 'matching-question', leftItems, rightItems, correctPairs: leftItems.map((item, i) => ({ leftId: item.id, rightId: rightItems[i].id })), timeLimitSeconds: 120 }
}
export function arrangementQuiz(): Quiz {
  return { ...structuredClone(mixedDemoQuiz), title: 'Arrangements', questions: [orderingFixture(), matchingFixture()] }
}
export function safeArrangement(question: OrderingQuestion | MatchingQuestion): SafeQuestion {
  const base = {
    id: question.id, prompt: question.prompt, supportingText: question.supportingText,
    displayOrder: question.displayOrder, timeLimitSeconds: question.timeLimitSeconds, points: question.points,
    speedScoringEnabled: question.speedScoringEnabled, doubleScore: question.doubleScore,
    media: question.media, mediaVisibility: question.mediaVisibility, presentationChoiceVisibility: question.presentationChoiceVisibility,
  }
  if (question.type === 'ordering') return { ...base, type: question.type, items: [...question.items].reverse(), questionNumber: 1, totalQuestions: 2 }
  return { ...base, type: question.type, scoringMode: question.scoringMode, leftItems: [...question.leftItems].reverse(), rightItems: [question.rightItems[1], question.rightItems[3], question.rightItems[0], question.rightItems[2]], questionNumber: 2, totalQuestions: 2 }
}
