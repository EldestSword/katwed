import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { GameSessionSettings, Player, PlayerAnswer, PlayerAnswerPayload, Question } from '../../types/domain'
import { buildHostResponseRows, formatHostAnswer, hostResponseRecordForAnswer, responseSummary } from './hostResponses'

const settings: GameSessionSettings = {
  soundPackId: 'katwed',
  doubleScoreIntroMs: 5000,
  shuffleQuestionOrder: false,
  shuffleAnswerOptions: false,
  autoLockWhenAllAnswered: true,
  showPlayerAnswersToHost: true,
  questionTypeIntrosEnabled: true,
  answerOptionSeed: 'session',
}

const players: Player[] = ['Roger', 'Mandy', 'James'].map((nickname, index) => ({
  id: `player-${index}`,
  sessionId: 'session',
  nickname,
  connected: nickname !== 'Roger',
  joinedAt: '2026-08-27T12:00:00.000Z',
  totalScore: 0,
  correctAnswerCount: 0,
  totalCorrectResponseMs: 0,
}))

function answer(playerId: string, question: Question, payload: PlayerAnswerPayload): PlayerAnswer {
  return {
    id: `answer-${playerId}`,
    sessionId: 'session',
    questionId: question.id,
    playerId,
    payload,
    resolutionStatus: 'answered',
    submittedAt: '2026-08-27T12:00:05.000Z',
    responseTimeMs: 5000,
    automaticCorrect: false,
    hostCorrectOverride: null,
    correct: false,
    pointsAwarded: 0,
  }
}

describe('host response intelligence', () => {
  it('sorts missing players first and uses phase-appropriate named status copy', () => {
    const question = mixedDemoQuiz.questions[0]
    const answers = [
      answer(players[1].id, question, { type: 'single-choice', optionId: 'mars' }),
      answer(players[2].id, question, { type: 'single-choice', optionId: 'venus' }),
    ]
    const responses = answers.map(hostResponseRecordForAnswer)
    const active = buildHostResponseRows(players, responses, answers, question.id, 'question', false)
    expect(active.map((row) => [row.player.nickname, row.status, row.player.connected])).toEqual([
      ['Roger', 'waiting', false],
      ['James', 'locked-in', true],
      ['Mandy', 'locked-in', true],
    ])
    expect(responseSummary(active, 'question', false)).toBe('Waiting for: Roger')
    expect(responseSummary(buildHostResponseRows(players, responses, answers, question.id, 'locked', false), 'locked', false))
      .toBe('Answers closed · No answer from: Roger')
    expect(responseSummary(buildHostResponseRows(players, responses, answers, question.id, 'question', true), 'question', true))
      .toBe('Question opens shortly')
    const completeAnswers = [
      ...answers,
      answer(players[0].id, question, { type: 'single-choice', optionId: 'jupiter' }),
    ]
    expect(responseSummary(buildHostResponseRows(
      players,
      completeAnswers.map(hostResponseRecordForAnswer),
      completeAnswers,
      question.id,
      'question',
      false,
    ), 'question', false)).toBe('Everyone locked in')
  })

  it('distinguishes revealed correct and incorrect results when private detail is available', () => {
    const question = mixedDemoQuiz.questions[0]
    const incorrect = answer(players[1].id, question, { type: 'single-choice', optionId: 'venus' })
    const correct = {
      ...answer(players[2].id, question, { type: 'single-choice', optionId: 'mars' }),
      automaticCorrect: true,
      correct: true,
      pointsAwarded: 1000,
    }
    const answers = [incorrect, correct]
    const rows = buildHostResponseRows(players, answers.map(hostResponseRecordForAnswer), answers, question.id, 'reveal', false)

    expect(rows.map((row) => [row.player.nickname, row.status])).toEqual([
      ['Roger', 'no-answer'],
      ['James', 'correct'],
      ['Mandy', 'incorrect'],
    ])
    expect(responseSummary(rows, 'reveal', false)).toBe('Results shown · No answer from: Roger')
  })

  it('keeps named submission status when raw answer detail is omitted', () => {
    const question = mixedDemoQuiz.questions[0]
    const submitted = answer(players[1].id, question, { type: 'single-choice', optionId: 'mars' })
    const rows = buildHostResponseRows(
      players,
      [hostResponseRecordForAnswer(submitted)],
      [],
      question.id,
      'question',
      false,
    )

    expect(rows.map((row) => [row.player.nickname, row.status, row.answer])).toEqual([
      ['James', 'waiting', null],
      ['Roger', 'waiting', null],
      ['Mandy', 'locked-in', null],
    ])
    expect(responseSummary(rows, 'question', false)).toBe('Waiting for: James · Roger')
  })

  it('formats every answer type for people rather than exposing identifiers', () => {
    const cases: Array<[Question['type'], PlayerAnswerPayload, string]> = [
      ['single-choice', { type: 'single-choice', optionId: 'mars' }, 'Mars'],
      ['multiple-select', { type: 'multiple-select', optionIds: ['blue', 'red', 'green'] }, 'Red, Green, Blue'],
      ['true-false', { type: 'true-false', value: false }, 'False'],
      ['slider', { type: 'slider', value: 1440 }, '1440 minutes'],
      ['pinpoint', { type: 'pinpoint', x: 0.123, y: 0.987 }, 'Pin placed'],
      ['typed-answer', { type: 'typed-answer', value: '  Purple Reign?!  ' }, '  Purple Reign?!  '],
      ['mashup', { type: 'mashup', memberIds: ['member-alex', 'member-bailey'] }, 'Alex + Bailey'],
    ]
    for (const [type, payload, expected] of cases) {
      const question = mixedDemoQuiz.questions.find((candidate) => candidate.type === type)
      if (!question) throw new Error(`Missing ${type} fixture`)
      expect(formatHostAnswer(answer('player', question, payload), question, mixedDemoQuiz.roster, settings)).toBe(expected)
    }
  })
})
