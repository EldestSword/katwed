import { beforeEach, expect, it } from 'vitest'
import { loadSubmittedAnswer, saveSubmittedAnswer } from './playerSession'

beforeEach(() => localStorage.clear())
it('retains the one Connections guess through refresh and separates restarts', () => {
  const payload = { type: 'connections', value: 'Planets' } as const
  saveSubmittedAnswer('p', 'q', 'first-open', payload)
  expect(loadSubmittedAnswer('p', 'q', 'first-open')).toEqual(payload)
  expect(loadSubmittedAnswer('p', 'q', 'next-open')).toBeNull()
})
it.each([null, { type: 'connections', value: '!!!' }, { type: 'connections', value: 'x'.repeat(121) }, { type: 'connections', value: 'Planets', revealedClueCount: 1 }])('rejects malformed cached Connections guess %j', payload => {
  localStorage.setItem('katwed.answer.p.q.open', JSON.stringify(payload))
  expect(loadSubmittedAnswer('p', 'q', 'open')).toBeNull()
})
