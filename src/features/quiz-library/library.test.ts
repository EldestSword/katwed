import { describe, expect, it } from 'vitest'
import type { Quiz } from '../../types/domain'
import {
  DEFAULT_QUIZ_SORT,
  filterQuizzes,
  formatLastEdited,
  normaliseQuizSort,
  sortQuizzes,
} from './library'

function quiz(overrides: Partial<Quiz> & Pick<Quiz, 'id' | 'title'>): Quiz {
  return {
    roster: [],
    questions: [],
    coverImagePath: null,
    themeId: 'katwed',
    archivedAt: null,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('filterQuizzes', () => {
  const quizzes = [
    quiz({ id: 'a', title: 'Friday Team Quiz' }),
    quiz({ id: 'b', title: 'Saturday Social' }),
  ]

  it.each(['', '   '])('returns a copy of all quizzes for query %j', (query) => {
    const result = filterQuizzes(quizzes, query)

    expect(result).toEqual(quizzes)
    expect(result).not.toBe(quizzes)
  })

  it('matches title substrings without case sensitivity and ignores outer whitespace', () => {
    expect(filterQuizzes(quizzes, '  TEAM  ').map((item) => item.id)).toEqual(['a'])
    expect(filterQuizzes(quizzes, 'day').map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('excludes non-matches and does not mutate the source array', () => {
    const original = [...quizzes]

    expect(filterQuizzes(quizzes, 'missing')).toEqual([])
    expect(quizzes).toEqual(original)
  })
})

describe('sortQuizzes', () => {
  it('sorts the newest edited quiz first with deterministic title and ID ties', () => {
    const quizzes = [
      quiz({ id: 'z', title: 'Beta', updatedAt: '2026-01-01T12:00:00.000Z' }),
      quiz({ id: 'b', title: 'Alpha', updatedAt: '2026-02-01T12:00:00.000Z' }),
      quiz({ id: 'a', title: 'Alpha', updatedAt: '2026-02-01T12:00:00.000Z' }),
    ]
    const original = [...quizzes]

    expect(sortQuizzes(quizzes, 'updated-desc').map((item) => item.id)).toEqual(['a', 'b', 'z'])
    expect(quizzes).toEqual(original)
  })

  it('sorts names A–Z case-insensitively with natural numeric ordering', () => {
    const quizzes = [
      quiz({ id: 'c', title: 'Quiz 10' }),
      quiz({ id: 'b', title: 'quiz 2' }),
      quiz({ id: 'a', title: 'Alpha' }),
    ]

    expect(sortQuizzes(quizzes, 'title-asc').map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts names Z–A and remains deterministic for equivalent titles', () => {
    const quizzes = [
      quiz({ id: 'b', title: 'alpha' }),
      quiz({ id: 'a', title: 'Alpha' }),
      quiz({ id: 'c', title: 'Zulu' }),
    ]

    expect(sortQuizzes(quizzes, 'title-desc').map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts the newest-created quiz first', () => {
    const quizzes = [
      quiz({ id: 'old', title: 'Old', createdAt: '2026-01-01T12:00:00.000Z' }),
      quiz({ id: 'new', title: 'New', createdAt: '2026-03-01T12:00:00.000Z' }),
    ]

    expect(sortQuizzes(quizzes, 'created-desc').map((item) => item.id)).toEqual(['new', 'old'])
  })

  it('places malformed timestamps after valid ones and sorts malformed ties deterministically', () => {
    const quizzes = [
      quiz({ id: 'b', title: 'Zulu', updatedAt: 'not-a-date' }),
      quiz({ id: 'c', title: 'Valid', updatedAt: '2026-01-01T12:00:00.000Z' }),
      quiz({ id: 'a', title: 'Alpha', updatedAt: 'also-not-a-date' }),
    ]

    expect(sortQuizzes(quizzes, 'updated-desc').map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('library display helpers', () => {
  it('formats last edited dates in British English', () => {
    const display = formatLastEdited('2026-08-07T12:00:00.000Z')

    expect(display.label).toBe('Last edited 7 Aug 2026')
    expect(display.dateTime).toBe('2026-08-07T12:00:00.000Z')
    expect(display.title).not.toContain('Invalid Date')
  })

  it('degrades gracefully for malformed timestamps', () => {
    const display = formatLastEdited('not-a-date')

    expect(display).toEqual({ label: 'Last edited date unavailable' })
    expect(display.label).not.toContain('Invalid Date')
  })

  it('falls back to Last edited for missing or invalid stored sorts', () => {
    expect(normaliseQuizSort(null)).toBe(DEFAULT_QUIZ_SORT)
    expect(normaliseQuizSort('unexpected')).toBe(DEFAULT_QUIZ_SORT)
    expect(normaliseQuizSort('title-asc')).toBe('title-asc')
  })
})
