import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_CATEGORY_IDS } from './themeCategories'
import { THEME_FONT_IDS } from './themeFonts'

interface ManifestSchema {
  additionalProperties: boolean
  properties: {
    category: { enum: string[] }
    displayFontId: { $ref: string }
    tokens: { additionalProperties: boolean; properties: { stageBackground: { $ref: string } } }
  }
  $defs: {
    fontId: { enum: string[] }
    localImageFilename: { pattern: string }
    stageBackground: { oneOf: Array<{ type: string }> }
  }
}

describe('theme authoring manifest schema', () => {
  const schema = JSON.parse(readFileSync(
    resolve('docs/theme-authoring/theme-manifest.schema.json'),
    'utf8',
  )) as ManifestSchema

  it('uses the exact approved category and font registries', () => {
    expect(schema.properties.category.enum).toEqual(THEME_CATEGORY_IDS)
    expect(schema.$defs.fontId.enum).toEqual(THEME_FONT_IDS)
    expect(schema.properties.displayFontId.$ref).toBe('#/$defs/fontId')
  })

  it('rejects extension fields, remote asset URLs and raw stage CSS by construction', () => {
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.tokens.additionalProperties).toBe(false)
    const filename = new RegExp(schema.$defs.localImageFilename.pattern)
    expect(filename.test('theme-name-shadows.png')).toBe(true)
    expect(filename.test('https://example.com/image.png')).toBe(false)
    expect(filename.test('../image.png')).toBe(false)
    expect(schema.properties.tokens.properties.stageBackground.$ref).toBe('#/$defs/stageBackground')
    expect(schema.$defs.stageBackground.oneOf.every((option) => option.type === 'object')).toBe(true)
  })
})
