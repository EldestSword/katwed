import { describe, expect, it } from 'vitest'
import { headToHeadDemoQuiz, mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { Quiz } from '../../types/domain'
import {
  KATWED_QUIZ_MAX_FILE_BYTES,
  createKatwedQuizFilename,
  exportQuizToPortable,
  isSafeKatwedMediaReference,
  parseKatwedQuizJson,
  serialiseKatwedQuiz,
  type KatwedQuizFileV1,
  type KatwedQuizFileV2,
} from './katwedQuizFormat'

function uuidFactory() {
  let next = 1
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`
}

function standardFile(): KatwedQuizFileV2 {
  return structuredClone(exportQuizToPortable(mixedDemoQuiz))
}

function headToHeadFile(): KatwedQuizFileV2 {
  return structuredClone(exportQuizToPortable(headToHeadDemoQuiz))
}

function parse(file: KatwedQuizFileV2) {
  return parseKatwedQuizJson(JSON.stringify(file), uuidFactory())
}

function quizFromInput(parsed: ReturnType<typeof parse>, id = 'new-quiz'): Quiz {
  return {
    id,
    ...structuredClone(parsed.input),
    archivedAt: null,
    createdAt: '2026-08-07T18:00:00.000Z',
    updatedAt: '2026-08-07T18:00:00.000Z',
  }
}

describe('Katwed quiz portable parser', () => {
  it('rejects malformed JSON, the wrong format and unsupported versions', () => {
    expect(() => parseKatwedQuizJson('{')).toThrow('not valid JSON')
    expect(() => parseKatwedQuizJson(JSON.stringify({ ...standardFile(), format: 'another-format' }))).toThrow(
      'not a Katwed quiz file',
    )
    expect(() => parseKatwedQuizJson(JSON.stringify({ ...standardFile(), formatVersion: 3 }))).toThrow(
      'format version is not supported',
    )
  })

  it('rejects input above the 2 MB limit before parsing', () => {
    expect(() => parseKatwedQuizJson(' '.repeat(KATWED_QUIZ_MAX_FILE_BYTES + 1))).toThrow(
      'no larger than 2 MB',
    )
  })

  it.each([
    ['competitor', (file: KatwedQuizFileV2) => { file.quiz.competitors[1].key = file.quiz.competitors[0].key }],
    ['people bank', (file: KatwedQuizFileV2) => { file.quiz.roster[1].key = file.quiz.roster[0].key }],
    ['question', (file: KatwedQuizFileV2) => { file.quiz.questions[1].key = file.quiz.questions[0].key }],
    ['option', (file: KatwedQuizFileV2) => {
      const question = file.quiz.questions[0]
      if (question.type !== 'single-choice') throw new Error('Fixture changed')
      question.options[1].key = question.options[0].key
    }],
  ])('rejects duplicate %s keys', (_subject, mutate) => {
    const file = headToHeadFile()
    mutate(file)
    expect(() => parse(file)).toThrow(/keys must be unique/i)
  })

  it('rejects invalid key syntax and unknown question types', () => {
    const invalidKey = standardFile()
    invalidKey.quiz.questions[0].key = 'not a safe key'
    expect(() => parse(invalidKey)).toThrow('1–64 letters')

    const invalidType = standardFile() as unknown as { quiz: { questions: Array<{ type: string }> } }
    invalidType.quiz.questions[0].type = 'future-question'
    expect(() => parseKatwedQuizJson(JSON.stringify(invalidType))).toThrow('unsupported question type')
  })

  it('enforces Standard competitor and assignment rules', () => {
    const competitors = standardFile()
    competitors.quiz.competitors = [{ key: 'a', displayName: 'A' }]
    expect(() => parse(competitors)).toThrow('Standard quizzes cannot contain competitors')

    const assignment = standardFile()
    assignment.quiz.questions[0].assignedTo = 'competitor-1'
    expect(() => parse(assignment)).toThrow('cannot be assigned in a Standard quiz')
  })

  it('enforces Head-to-Head competitor count and assignment references', () => {
    const count = headToHeadFile()
    count.quiz.competitors.pop()
    expect(() => parse(count)).toThrow('exactly two competitors')

    const missing = headToHeadFile()
    delete missing.quiz.questions[0].assignedTo
    expect(() => parse(missing)).toThrow('must be assigned to a competitor')

    const invalid = headToHeadFile()
    invalid.quiz.questions[0].assignedTo = 'unknown'
    expect(() => parse(invalid)).toThrow('invalid competitor assignment')
  })

  it('validates themes, backgrounds and compatibility through the registries', () => {
    const theme = standardFile() as unknown as { quiz: { themeId: string } }
    theme.quiz.themeId = 'future'
    expect(() => parseKatwedQuizJson(JSON.stringify(theme))).toThrow('unsupported theme')

    const background = standardFile() as unknown as { quiz: { backgroundId: string } }
    background.quiz.backgroundId = 'future'
    expect(() => parseKatwedQuizJson(JSON.stringify(background))).toThrow('unsupported background')

    const incompatible = standardFile()
    incompatible.quiz.themeId = 'paper'
    incompatible.quiz.backgroundId = 'arcade-grid'
    expect(() => parse(incompatible)).toThrow('does not belong')
  })

  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'blob:https://example.test/id']) (
    'rejects the unsafe image reference %s',
    (path) => {
      const file = standardFile()
      file.quiz.coverImagePath = path
      expect(() => parse(file)).toThrow('safe HTTPS or Katwed application image reference')
    },
  )

  it('accepts only the intended application and HTTPS media references', () => {
    expect(isSafeKatwedMediaReference('https://media.example/image.webp')).toBe(true)
    expect(isSafeKatwedMediaReference('/demo/portrait.svg')).toBe(true)
    expect(isSafeKatwedMediaReference('demo-image://00000000-0000-4000-8000-000000000001')).toBe(true)
    expect(isSafeKatwedMediaReference('//example.test/image.webp')).toBe(false)
    expect(isSafeKatwedMediaReference('http://example.test/image.webp')).toBe(false)
  })

  it('validates single-choice and multiple-select answer references without echoing answer values', () => {
    const single = standardFile()
    if (single.quiz.questions[0].type !== 'single-choice') throw new Error('Fixture changed')
    single.quiz.questions[0].correctOptionKey = 'secret-invalid-answer'
    expect(() => parse(single)).toThrow('Question 1 has an invalid correct option reference.')
    try {
      parse(single)
    } catch (error) {
      expect(String(error)).not.toContain('secret-invalid-answer')
    }

    const multiple = standardFile()
    if (multiple.quiz.questions[1].type !== 'multiple-select') throw new Error('Fixture changed')
    multiple.quiz.questions[1].correctOptionKeys.push('missing')
    expect(() => parse(multiple)).toThrow('Question 2 has an invalid correct option reference.')
    multiple.quiz.questions[1].correctOptionKeys = [
      multiple.quiz.questions[1].correctOptionKeys[0],
      multiple.quiz.questions[1].correctOptionKeys[0],
    ]
    expect(() => parse(multiple)).toThrow('repeats a correct option reference')
  })

  it('validates Mash-up references and Pinpoint image media', () => {
    const mashup = standardFile()
    const mashupQuestion = mashup.quiz.questions.find((question) => question.type === 'mashup')
    if (!mashupQuestion || mashupQuestion.type !== 'mashup') throw new Error('Fixture changed')
    mashupQuestion.correctPersonKeys[1] = 'missing-person'
    expect(() => parse(mashup)).toThrow('invalid people-bank reference')

    const pinpoint = standardFile()
    const pinpointQuestion = pinpoint.quiz.questions.find((question) => question.type === 'pinpoint')
    if (!pinpointQuestion) throw new Error('Fixture changed')
    ;(pinpointQuestion as unknown as { media: { type: string } }).media = { type: 'none' }
    expect(() => parse(pinpoint)).toThrow('must use image media for Pinpoint')
  })

  it('supplies the documented optional defaults without defaulting answers', () => {
    const file: KatwedQuizFileV1 = {
      format: 'katwed-quiz',
      formatVersion: 1,
      quiz: {
        title: 'Concise generated quiz',
        quizType: 'standard',
        themeId: 'katwed',
        backgroundId: null,
        coverImagePath: null,
        competitors: [],
        roster: [],
        questions: [{ key: 'q1', type: 'true-false', prompt: 'Generated prompt', correctValue: true }],
      },
    }
    const question = parseKatwedQuizJson(JSON.stringify(file), uuidFactory()).input.questions[0]
    expect(question).toMatchObject({
      supportingText: '',
      timeLimitSeconds: 30,
      points: 1000,
      revealCaption: '',
      media: { type: 'none' },
      mediaVisibility: 'both',
      presentationChoiceVisibility: 'show',
    })
  })

  it('continues to import a version 1 file and rejects Typed Answer in version 1', () => {
    const legacy: KatwedQuizFileV1 = {
      format: 'katwed-quiz',
      formatVersion: 1,
      quiz: {
        title: 'Legacy quiz', quizType: 'standard', themeId: 'katwed', backgroundId: null,
        coverImagePath: null, competitors: [], roster: [],
        questions: [{ key: 'q1', type: 'true-false', prompt: 'Legacy?', correctValue: true }],
      },
    }
    expect(parseKatwedQuizJson(JSON.stringify(legacy)).input.questions[0]).toMatchObject({ type: 'true-false' })
    const invalid = structuredClone(legacy) as unknown as { formatVersion: 1; quiz: { questions: unknown[] } }
    invalid.quiz.questions = [{ key: 'q1', type: 'typed-answer', prompt: 'Name it', correctAnswer: 'Katwed', acceptedAnswers: [] }]
    expect(() => parseKatwedQuizJson(JSON.stringify(invalid))).toThrow('requires format version 2')
  })

  it('imports and exports Typed Answer only in version 2', () => {
    const file = standardFile()
    file.quiz.questions = [{
      key: 'q1', type: 'typed-answer', assignedTo: null, prompt: 'Name the programme',
      correctAnswer: 'Red Dwarf', acceptedAnswers: ['The Red Dwarf'],
    }]
    const parsed = parse(file)
    expect(parsed.input.questions[0]).toMatchObject({
      type: 'typed-answer', correctAnswer: 'Red Dwarf', acceptedAnswers: ['The Red Dwarf'],
    })
    const exported = exportQuizToPortable(quizFromInput(parsed))
    expect(exported.formatVersion).toBe(2)
    expect(exported.quiz.questions[0]).toMatchObject({ type: 'typed-answer', correctAnswer: 'Red Dwarf' })
  })

  it('rejects unexpected lifecycle and answer-adjacent fields strictly', () => {
    const file = standardFile() as unknown as { quiz: Record<string, unknown> }
    file.quiz.archivedAt = '2026-08-07T00:00:00.000Z'
    expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow('unsupported field “archivedAt”')
  })
})

describe('Katwed quiz portable v2 ID remapping and round trip', () => {
  it('imports all seven types with fresh IDs and correctly remapped answer references', () => {
    const source = standardFile()
    source.quiz.coverImagePath = 'https://media.example/shared-cover.webp'
    const singleSource = source.quiz.questions[0]
    if (singleSource.type !== 'single-choice') throw new Error('Fixture changed')
    singleSource.options[0].imagePath = 'https://media.example/shared-option.webp'
    singleSource.options[0].imageAlt = 'Shared option'
    singleSource.media = {
      type: 'youtube',
      videoId: 'abcdefghijk',
      startSeconds: 4,
      endSeconds: 40,
    }

    const parsed = parse(source)
    const input = parsed.input
    const allIds = [
      ...input.roster.map((member) => member.id),
      ...input.questions.map((question) => question.id),
      ...input.questions.flatMap((question) => 'options' in question ? question.options.map((option) => option.id) : []),
    ]
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(allIds.every((id) => /^[0-9a-f-]{36}$/i.test(id))).toBe(true)
    expect(input.questions.map((question) => question.type)).toEqual([
      'single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'mashup', 'typed-answer', 'single-choice',
    ])

    const single = input.questions[0]
    const multiple = input.questions[1]
    const slider = input.questions[3]
    const pinpoint = input.questions[4]
    const mashup = input.questions[5]
    expect(single.type).toBe('single-choice')
    if (single.type === 'single-choice') {
      expect(single.options.some((option) => option.id === single.correctOptionId)).toBe(true)
      expect(single.media).toEqual(singleSource.media)
      expect(single.options[0]).toMatchObject({
        imagePath: 'https://media.example/shared-option.webp',
        imageAlt: 'Shared option',
      })
    }
    expect(multiple.type).toBe('multiple-select')
    if (multiple.type === 'multiple-select') {
      expect(multiple.correctOptionIds.every((id) => multiple.options.some((option) => option.id === id))).toBe(true)
      expect(multiple.scoringMode).toBe('exact')
    }
    expect(slider).toMatchObject({ type: 'slider', minimum: 0, maximum: 2000, correctValue: 1440, tolerance: 10 })
    expect(pinpoint).toMatchObject({ type: 'pinpoint', targetX: 0.5, targetY: 0.43, targetRadius: 0.12 })
    expect(mashup.type).toBe('mashup')
    if (mashup.type === 'mashup') {
      expect(mashup.correctMemberIds.every((id) => input.roster.some((member) => member.id === id))).toBe(true)
    }
    expect(input.coverImagePath).toBe(source.quiz.coverImagePath)
  })

  it('remaps Head-to-Head competitor assignments to two fresh competitor UUIDs', () => {
    const parsed = parse(headToHeadFile())
    const competitorIds = parsed.input.headToHeadCompetitors.map((competitor) => competitor.id)
    expect(competitorIds).toHaveLength(2)
    expect(new Set(competitorIds).size).toBe(2)
    expect(parsed.input.questions.every((question) => competitorIds.includes(question.assignedCompetitorId ?? ''))).toBe(true)
    expect(parsed.input.questions[0].assignedCompetitorId).toBe(competitorIds[0])
    expect(parsed.input.questions[1].assignedCompetitorId).toBe(competitorIds[1])
  })

  it.each([
    ['Standard', standardFile()],
    ['Head-to-Head', headToHeadFile()],
  ])('round trips the %s playable definition while replacing internal identities', (_name, file) => {
    const sourceJson = JSON.stringify(file)
    const parsed = parse(file)
    const roundTrip = exportQuizToPortable(quizFromInput(parsed))
    expect(roundTrip).toEqual(file)
    expect(JSON.stringify(roundTrip)).not.toContain(mixedDemoQuiz.id)
    expect(JSON.stringify(parsed.input)).not.toContain('competitor-1')
    expect(JSON.stringify(parsed.input)).not.toContain('person-1')
    expect(JSON.stringify(parsed.input)).not.toContain('option-1')
    expect(JSON.stringify(file)).toBe(sourceJson)
  })

  it('exports deterministic portable keys without lifecycle or database identities', () => {
    const serialised = serialiseKatwedQuiz(headToHeadDemoQuiz)
    const portable = JSON.parse(serialised) as KatwedQuizFileV2
    expect(portable.format).toBe('katwed-quiz')
    expect(portable.formatVersion).toBe(2)
    expect(portable.quiz.competitors.map((competitor) => competitor.key)).toEqual(['competitor-1', 'competitor-2'])
    expect(portable.quiz.questions[0].key).toBe('q1')
    expect(portable.quiz.questions[0].assignedTo).toBe('competitor-1')
    expect(serialised).not.toContain(headToHeadDemoQuiz.id)
    expect(serialised).not.toContain(headToHeadDemoQuiz.headToHeadCompetitors[0].id)
    expect(serialised).not.toContain('createdAt')
    expect(serialised).not.toContain('archivedAt')
  })
})

describe('Katwed quiz export filenames', () => {
  it('creates safe descriptive filenames with a fallback', () => {
    expect(createKatwedQuizFilename('Ross vs Jess — Ultimate Quiz!')).toBe('ross-vs-jess-ultimate-quiz.katwed.json')
    expect(createKatwedQuizFilename('  ***  ')).toBe('katwed-quiz.katwed.json')
  })
})
