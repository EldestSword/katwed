import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QUIZ_BACKGROUND_IDS, QUIZ_THEME_IDS } from '../../types/domain'

interface PortableThemeSchema {
  $defs: {
    quiz: {
      properties: {
        themeId: { enum: string[] }
        backgroundId: { oneOf: [{ enum: string[] }, { type: string }] }
      }
    }
  }
}

describe('portable quiz theme enums', () => {
  it.each([1, 2, 3, 4, 5, 6])('keeps v%i aligned with the trusted theme and background registries', (version) => {
    const schema = JSON.parse(readFileSync(
      resolve(`docs/schemas/katwed-quiz-v${version}.schema.json`),
      'utf8',
    )) as PortableThemeSchema
    expect(schema.$defs.quiz.properties.themeId.enum).toEqual(QUIZ_THEME_IDS)
    expect(schema.$defs.quiz.properties.backgroundId.oneOf).toEqual([
      { enum: QUIZ_BACKGROUND_IDS },
      { type: 'null' },
    ])
  })
})
