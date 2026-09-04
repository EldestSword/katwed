import { createQuestion } from '../features/questions/factories'
import { mixedDemoQuiz } from '../lib/demo/sampleData'
import { connectionsState } from './connectionsFixtures'
import { PROGRESSIVE_NEUTRAL_ALT } from '../features/scoring/progressiveReveal'
import type { Quiz, SafeGameState, SafeQuestion, TypedAnswerQuestion } from '../types/domain'

export function progressiveQuestion(): TypedAnswerQuestion {
  return { ...createQuestion('typed-answer', mixedDemoQuiz.id, 0) as TypedAnswerQuestion,
    id: 'progressive-question', prompt: 'Who is appearing?', correctAnswer: 'Alex', acceptedAnswers: [],
    points: 1000, timeLimitSeconds: 60, speedScoringEnabled: true, doubleScore: false, progressiveRevealEnabled: true,
    media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Alex is the answer', revealEffect: 'blur', revealDurationSeconds: 20 } }
}
export function progressiveQuiz(): Quiz { return { ...structuredClone(mixedDemoQuiz), title: 'Progressive Reveal', questions: [progressiveQuestion()] } }
export function progressiveState(): SafeGameState {
  const q = progressiveQuestion()
  if (q.media.type !== 'image') throw new Error('Progressive fixture requires an image')
  const safe: SafeQuestion = { id: q.id, type: q.type, prompt: q.prompt, supportingText: '', points: q.points, timeLimitSeconds: q.timeLimitSeconds,
    speedScoringEnabled: false, doubleScore: false, progressiveRevealEnabled: true, displayOrder: 0, questionNumber: 1, totalQuestions: 1,
    media: { ...q.media, altText: PROGRESSIVE_NEUTRAL_ALT }, mediaVisibility: 'both', presentationChoiceVisibility: 'hide' }
  return { ...connectionsState(), quizTitle: 'Progressive Reveal', currentQuestion: safe,
    questionOpenedAt: new Date(Date.now()).toISOString(), questionClosesAt: new Date(Date.now() + 60000).toISOString() }
}
