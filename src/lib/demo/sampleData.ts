import type { Question, Quiz, QuestionMedia } from '../../types/domain'

const quizId = 'quiz-demo'
const rosterNames = ['Alex', 'Bailey', 'Casey', 'Drew', 'Ellis', 'Frankie', 'Morgan']
const image = (path: string, revealEffect: Extract<QuestionMedia, { type: 'image' }>['revealEffect'] = 'immediate', duration = 0): Extract<QuestionMedia, { type: 'image' }> => ({
  type: 'image',
  path,
  altText: 'AI-generated merged portrait for the current question.',
  revealEffect,
  revealDurationSeconds: duration,
})

const mashup = (
  id: string,
  path: string,
  correctMemberIds: readonly [string, string],
  displayOrder: number,
  revealCaption: string,
): Question => ({
  id,
  quizId,
  type: 'mashup',
  prompt: 'Who is in this mash-up?',
  supportingText: 'Select exactly two different people.',
  media: image(path),
  mediaVisibility: 'both',
  presentationChoiceVisibility: 'hide',
  correctMemberIds,
  timeLimitSeconds: 30,
  points: 1,
  displayOrder,
  revealCaption,
})

export const sampleQuiz: Quiz = {
  id: quizId,
  title: 'The Curious Crew',
  archivedAt: null,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  roster: rosterNames.map((displayName, index) => ({
    id: `member-${displayName.toLowerCase()}`,
    quizId,
    displayName,
    shortName: displayName,
    active: true,
    displayOrder: index,
  })),
  questions: [
    mashup('question-1', '/demo/portrait-1.svg', ['member-alex', 'member-bailey'], 0, 'A bright-eyed blend with excellent imaginary knitwear.'),
    mashup('question-2', '/demo/portrait-2.svg', ['member-casey', 'member-ellis'], 1, 'Two very fictional colleagues, one magnificent fringe.'),
    mashup('question-3', '/demo/portrait-3.svg', ['member-drew', 'member-morgan'], 2, 'The eyebrows were the giveaway. Probably.'),
  ],
}

const mixedId = 'quiz-mixed'
const common = (id: string, type: Question['type'], prompt: string, displayOrder: number) => ({
  id,
  quizId: mixedId,
  type,
  prompt,
  supportingText: '',
  timeLimitSeconds: 30,
  points: 1000,
  displayOrder,
  revealCaption: '',
  media: { type: 'none' } as const,
  mediaVisibility: 'both' as const,
  presentationChoiceVisibility: 'show' as const,
})

export const mixedDemoQuiz: Quiz = {
  id: mixedId,
  title: 'Katwed! Mixed Quiz',
  archivedAt: null,
  createdAt: '2026-07-31T12:00:00.000Z',
  updatedAt: '2026-07-31T12:00:00.000Z',
  roster: sampleQuiz.roster.map((member) => ({ ...member, quizId: mixedId })),
  questions: [
    {
      ...common('mixed-single', 'single-choice', 'Which planet is known as the Red Planet?', 0),
      type: 'single-choice',
      options: [
        { id: 'mars', label: 'Mars' },
        { id: 'venus', label: 'Venus' },
        { id: 'jupiter', label: 'Jupiter' },
        { id: 'mercury', label: 'Mercury' },
      ],
      correctOptionId: 'mars',
      randomiseOptions: false,
      revealCaption: 'Iron minerals in the soil give Mars its rusty colour.',
    },
    {
      ...common('mixed-multiple', 'multiple-select', 'Which of these are primary colours of light?', 1),
      type: 'multiple-select',
      options: [
        { id: 'red', label: 'Red' },
        { id: 'green', label: 'Green' },
        { id: 'blue', label: 'Blue' },
        { id: 'yellow', label: 'Yellow' },
      ],
      correctOptionIds: ['red', 'green', 'blue'],
      minimumSelections: 3,
      maximumSelections: 3,
      scoringMode: 'exact',
      randomiseOptions: false,
      revealCaption: 'Screens mix red, green and blue light.',
    },
    {
      ...common('mixed-boolean', 'true-false', 'A group of flamingos is called a flamboyance.', 2),
      type: 'true-false',
      correctValue: true,
      revealCaption: 'It really is — language can be splendid.',
    },
    {
      ...common('mixed-slider', 'slider', 'How many minutes are in a day?', 3),
      type: 'slider',
      minimum: 0,
      maximum: 2000,
      step: 10,
      correctValue: 1440,
      tolerance: 10,
      prefix: '',
      suffix: '',
      unitLabel: 'minutes',
      presentationChoiceVisibility: 'hide',
      revealCaption: '24 × 60 = 1,440 minutes.',
    },
    {
      ...common('mixed-pinpoint', 'pinpoint', 'Pinpoint the centre of the bright circle.', 4),
      type: 'pinpoint',
      media: image('/demo/portrait-3.svg'),
      targetX: 0.5,
      targetY: 0.43,
      targetRadius: 0.12,
      presentationChoiceVisibility: 'hide',
      revealCaption: 'The target was in the centre of the artwork.',
    },
    {
      ...mashup('mixed-mashup', '/demo/portrait-1.svg', ['member-alex', 'member-bailey'], 5, 'Alex and Bailey were the fictional pair.'),
      quizId: mixedId,
    },
    {
      ...common('mixed-reveal', 'single-choice', 'Which shape appears as the picture becomes clear?', 6),
      type: 'single-choice',
      media: image('/demo/portrait-2.svg', 'tiles', 12),
      options: [
        { id: 'portrait', label: 'A portrait' },
        { id: 'building', label: 'A building' },
        { id: 'landscape', label: 'A landscape' },
      ],
      correctOptionId: 'portrait',
      randomiseOptions: false,
      revealCaption: 'The image reveal is a media effect, not a separate question type.',
    },
  ],
}

export const sampleQuizzes = [sampleQuiz, mixedDemoQuiz]
