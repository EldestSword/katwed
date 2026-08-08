import { describe, expect, it } from 'vitest'
import {
  isMeaningfulTypedAnswer,
  normaliseTypedAnswer,
  parseTypedAnswerAlternatives,
  typedAnswerMatches,
} from './typedAnswer'

describe('typed answers', () => {
  it.each([
    ['Red Dwarf', 'reddwarf'],
    ['red-dwarf', 'reddwarf'],
    ['Chris O\u2019Dowd', 'chrisodowd'],
    ["Chris O'Dowd", 'chrisodowd'],
    ['Spider-Man', 'spiderman'],
    ['\uff32\uff45\uff44\u3000\uff24\uff57\uff41\uff52\uff46', 'reddwarf'],
    ['\u041c\u043e\u0441\u043a\u0432\u0430!', '\u043c\u043e\u0441\u043a\u0432\u0430'],
  ])('normalises %s', (value, expected) => {
    expect(normaliseTypedAnswer(value)).toBe(expected)
  })

  it('matches only an exact normalised primary or accepted answer', () => {
    expect(typedAnswerMatches(' red-dwarf ', 'Red Dwarf', ['The Red Dwarf'])).toBe(true)
    expect(typedAnswerMatches('chris odowd', 'Chris O\u2019Dowd', [])).toBe(true)
    expect(typedAnswerMatches('Kirsten', 'Kristen', [])).toBe(false)
  })

  it('rejects answers containing no letters or numbers', () => {
    expect(isMeaningfulTypedAnswer(' - \u2019 ! ')).toBe(false)
  })

  it('parses one trimmed non-empty alternative per line', () => {
    expect(parseTypedAnswerAlternatives(' Red Dwarf \r\n\nreddwarf\n  ')).toEqual(['Red Dwarf', 'reddwarf'])
  })
})
