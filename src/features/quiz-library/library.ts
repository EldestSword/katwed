import type { Quiz } from '../../types/domain'

export type QuizSort = 'updated-desc' | 'title-asc' | 'title-desc' | 'created-desc'

export const DEFAULT_QUIZ_SORT: QuizSort = 'updated-desc'
export const QUIZ_SORT_STORAGE_KEY = 'katwed.host.library.sort'

export const quizSortOptions: ReadonlyArray<{ value: QuizSort; label: string }> = [
  { value: 'updated-desc', label: 'Last edited' },
  { value: 'title-asc', label: 'Name A–Z' },
  { value: 'title-desc', label: 'Name Z–A' },
  { value: 'created-desc', label: 'Newest created' },
]

const titleCollator = new Intl.Collator('en-GB', {
  numeric: true,
  sensitivity: 'base',
})

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const fullDateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'full',
  timeStyle: 'short',
})

export function normaliseQuizSort(value: string | null): QuizSort {
  return quizSortOptions.some((option) => option.value === value)
    ? value as QuizSort
    : DEFAULT_QUIZ_SORT
}

export function filterQuizzes(quizzes: readonly Quiz[], query: string): Quiz[] {
  const normalisedQuery = query.trim().toLocaleLowerCase('en-GB')
  if (!normalisedQuery) return [...quizzes]

  return quizzes.filter((quiz) => quiz.title.toLocaleLowerCase('en-GB').includes(normalisedQuery))
}

function compareTitles(left: Quiz, right: Quiz): number {
  return titleCollator.compare(left.title, right.title)
}

function compareIds(left: Quiz, right: Quiz): number {
  return left.id.localeCompare(right.id, 'en-GB')
}

function compareTimestampDescending(left: string, right: string): number {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  const leftIsValid = Number.isFinite(leftTime)
  const rightIsValid = Number.isFinite(rightTime)

  if (leftIsValid && rightIsValid && leftTime !== rightTime) return rightTime - leftTime
  if (leftIsValid !== rightIsValid) return leftIsValid ? -1 : 1
  return 0
}

export function sortQuizzes(quizzes: readonly Quiz[], sort: QuizSort): Quiz[] {
  return [...quizzes].sort((left, right) => {
    let primary = 0

    if (sort === 'updated-desc') primary = compareTimestampDescending(left.updatedAt, right.updatedAt)
    if (sort === 'created-desc') primary = compareTimestampDescending(left.createdAt, right.createdAt)
    if (sort === 'title-asc') primary = compareTitles(left, right)
    if (sort === 'title-desc') primary = compareTitles(right, left)

    if (primary !== 0) return primary

    const titleTieBreaker = compareTitles(left, right)
    return titleTieBreaker !== 0 ? titleTieBreaker : compareIds(left, right)
  })
}

export type LastEditedDisplay = {
  label: string
  dateTime?: string
  title?: string
}

export function formatLastEdited(value: string): LastEditedDisplay {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return { label: 'Last edited date unavailable' }

  return {
    label: `Last edited ${shortDateFormatter.format(date)}`,
    dateTime: value,
    title: `Last edited ${fullDateFormatter.format(date)}`,
  }
}
