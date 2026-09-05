import { createQuestion } from '../features/questions/factories'
import { connectionSafeFields } from '../features/questions/connections'
import { mixedDemoQuiz } from '../lib/demo/sampleData'
import type { ConnectionsQuestion, Quiz, SafeGameState, SafeQuestion } from '../types/domain'

export function connectionsFixture(): ConnectionsQuestion {
  return { ...createQuestion('connections', mixedDemoQuiz.id, 0) as ConnectionsQuestion, id: 'connections-question',
    clues: ['Mercury', 'Venus', 'Earth', 'Mars'].map((text, i) => ({ id: `clue-${i + 1}`, text })),
    correctAnswer: 'Planets', acceptedAnswers: ['planets of the solar system'] }
}
export function connectionsQuiz(): Quiz { return { ...structuredClone(mixedDemoQuiz), title: 'Connections', questions: [connectionsFixture()] } }
export function safeConnections(count = 1, reveal = false): Extract<SafeQuestion, { type: 'connections' }> {
  const q = connectionsFixture()
  return { id: q.id, type: q.type, prompt: q.prompt, supportingText: '', timeLimitSeconds: q.timeLimitSeconds, points: q.points,
    doubleScore: q.doubleScore, speedScoringEnabled: false, displayOrder: 0, media: q.media, mediaVisibility: q.mediaVisibility,
    presentationChoiceVisibility: q.presentationChoiceVisibility, questionNumber: 1, totalQuestions: 1, ...connectionSafeFields(q, count, reveal) }
}
export function connectionsState(count = 1): SafeGameState {
  return { sessionId: 'connections-session', quizType: 'standard', quizTitle: 'Connections', themeId: 'katwed', backgroundId: null,
    roomCode: '123456', status: 'active', phase: 'question', currentQuestion: safeConnections(count), roster: [], players: [],
    submittedCount: 0, leaderboard: [], reveal: null, questionOpenedAt: new Date(Date.now() - 1000).toISOString(), questionClosesAt: new Date(Date.now() + 59000).toISOString() }
}
