import type { Quiz } from '../../types/domain'

const rosterNames = ['Alex', 'Bailey', 'Casey', 'Drew', 'Ellis', 'Frankie', 'Morgan']

export const sampleQuiz: Quiz = {
  id: 'quiz-demo',
  title: 'The Curious Crew',
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  roster: rosterNames.map((displayName, index) => ({
    id: `member-${displayName.toLowerCase()}`,
    quizId: 'quiz-demo',
    displayName,
    shortName: displayName,
    active: true,
    displayOrder: index,
  })),
  questions: [
    {
      id: 'question-1',
      quizId: 'quiz-demo',
      imagePath: '/demo/portrait-1.svg',
      correctMemberIds: ['member-alex', 'member-bailey'],
      timeLimitSeconds: 30,
      displayOrder: 0,
      revealCaption: 'A bright-eyed blend with excellent imaginary knitwear.',
    },
    {
      id: 'question-2',
      quizId: 'quiz-demo',
      imagePath: '/demo/portrait-2.svg',
      correctMemberIds: ['member-casey', 'member-ellis'],
      timeLimitSeconds: 25,
      displayOrder: 1,
      revealCaption: 'Two very fictional colleagues, one magnificent fringe.',
    },
    {
      id: 'question-3',
      quizId: 'quiz-demo',
      imagePath: '/demo/portrait-3.svg',
      correctMemberIds: ['member-drew', 'member-morgan'],
      timeLimitSeconds: 20,
      displayOrder: 2,
      revealCaption: 'The eyebrows were the giveaway. Probably.',
    },
  ],
}
