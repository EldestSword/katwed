import { useId, useMemo, useState } from 'react'
import type { QuizThemeId } from '../../types/domain'
import { getThemeCategory, type ThemeCategoryId } from './themeCategories'
import { getThemeFont } from './themeFonts'
import { quizThemes, type QuizThemeDefinition } from './quizThemes'

function normaliseSearch(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB')
}

export function ThemeBrowser({
  selectedId,
  onSelect,
  themes = quizThemes,
  description = 'Applied to presentation and player game screens. Save the quiz to keep this change.',
}: {
  selectedId: QuizThemeId
  onSelect(themeId: QuizThemeId): void
  themes?: readonly QuizThemeDefinition[]
  description?: string
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<ThemeCategoryId | 'all'>('all')
  const availableCategories = useMemo(() => {
    const ids = new Set(themes.map((theme) => theme.category))
    return [...ids].map(getThemeCategory).filter((category) => category !== null)
  }, [themes])
  const visibleThemes = useMemo(() => {
    const needle = normaliseSearch(query)
    return themes.filter((theme) => {
      if (categoryId !== 'all' && theme.category !== categoryId) return false
      if (!needle) return true
      const category = getThemeCategory(theme.category)
      const haystack = normaliseSearch([
        theme.name,
        theme.description,
        category?.name ?? '',
        ...theme.keywords,
      ].join(' '))
      return haystack.includes(needle)
    })
  }, [categoryId, query, themes])

  return (
    <fieldset className="quiz-theme-picker">
      <legend>Quiz theme</legend>
      <p>{description}</p>
      <div className="quiz-theme-browser__controls">
        <label htmlFor={searchId}>Search themes</label>
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder="Try colour, mood or style"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="quiz-theme-categories" role="group" aria-label="Theme categories">
          <button type="button" aria-pressed={categoryId === 'all'} onClick={() => setCategoryId('all')}>All</button>
          {availableCategories.map((category) => (
            <button
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
              key={category.id}
            >{category.name}</button>
          ))}
        </div>
      </div>
      <p className="quiz-theme-browser__count" role="status">
        {visibleThemes.length} {visibleThemes.length === 1 ? 'theme' : 'themes'} shown
      </p>
      {visibleThemes.length > 0 ? <div className="quiz-theme-grid">
        {visibleThemes.map((theme) => {
          const selected = theme.id === selectedId
          const displayFont = getThemeFont(theme.typography.displayFontId)
          const category = getThemeCategory(theme.category)
          return (
            <button
              key={theme.id}
              className="quiz-theme-option"
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(theme.id)}
            >
              {theme.preview?.kind === 'thumbnail'
                ? <span className="quiz-theme-option__thumbnail"><img src={theme.preview.thumbnailPath} alt={theme.preview.label} loading="lazy" /></span>
                : <span className="quiz-theme-option__swatches" role="img" aria-label={theme.preview?.label ?? `${theme.name} theme preview`}>
                    {theme.swatches.map((colour) => <i key={colour} style={{ backgroundColor: colour }} />)}
                  </span>}
              <span className="quiz-theme-option__copy">
                <strong style={{ fontFamily: displayFont?.family }}>{theme.name}</strong>
                <small>{theme.description}</small>
                <small className="quiz-theme-option__category">{category?.name}</small>
              </span>
              <span className="quiz-theme-option__state">{selected ? 'Selected' : 'Choose'}</span>
            </button>
          )
        })}
      </div> : <p className="empty-note">No themes match that search and category.</p>}
    </fieldset>
  )
}
