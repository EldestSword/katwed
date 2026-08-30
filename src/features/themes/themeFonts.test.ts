import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getThemeFont, isThemeFontId, themeFonts } from './themeFonts'

describe('theme font registry', () => {
  it('keeps a small unique allow-list with explicit source and licence metadata', () => {
    expect(themeFonts.length).toBeGreaterThanOrEqual(10)
    expect(themeFonts.length).toBeLessThanOrEqual(15)
    expect(new Set(themeFonts.map((font) => font.id)).size).toBe(themeFonts.length)
    for (const font of themeFonts) {
      expect(font.family).toBeTruthy()
      expect(font.source).toBeTruthy()
      expect(font.licence.id).toBeTruthy()
      expect(font.licence.attribution).toBeTruthy()
      expect(font.roleSuitability.display || font.roleSuitability.ui).toBe(true)
    }
  })

  it('resolves only approved IDs and verifies every redistributed file', () => {
    for (const font of themeFonts) {
      expect(isThemeFontId(font.id)).toBe(true)
      expect(getThemeFont(font.id)).toBe(font)
      if (!font.packageName) continue
      for (const file of font.files) {
        expect(existsSync(resolve('node_modules', font.packageName, 'files', file)), `${font.id}: ${file}`).toBe(true)
      }
    }
    expect(isThemeFontId('Comic Sans')).toBe(false)
    expect(getThemeFont('https://fonts.example/font.woff2')).toBeNull()
  })
})
