import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { StoredImage } from '../components/StoredImage'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../features/auth/AuthProvider'
import {
  DEFAULT_QUIZ_SORT,
  QUIZ_SORT_STORAGE_KEY,
  filterQuizzes,
  formatLastEdited,
  normaliseQuizSort,
  quizSortOptions,
  sortQuizzes,
  type QuizSort,
} from '../features/quiz-library/library'
import { repository } from '../services/repository'
import type { Quiz } from '../types/domain'
import { DEFAULT_QUIZ_THEME_ID } from '../features/themes/quizThemes'
import { CLASSIC_ANSWER_COLOURS } from '../features/answer-palettes/answerPalettes'
import { DEFAULT_QUIZ_TYPE } from '../features/head-to-head/headToHead'
import {
  KATWED_QUIZ_FILE_EXTENSION,
  createKatwedQuizFilename,
  parseKatwedQuizFile,
  serialiseKatwedQuiz,
  type ParsedKatwedQuiz,
} from '../features/quiz-transfer/katwedQuizFormat'
import { QuizImportPreview } from '../features/quiz-transfer/QuizImportPreview'

type LibraryView = 'active' | 'archived'

export function HostDashboardPage() {
  const [activeQuizzes, setActiveQuizzes] = useState<Quiz[]>([])
  const [archivedQuizzes, setArchivedQuizzes] = useState<Quiz[]>([])
  const [view, setView] = useState<LibraryView>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<QuizSort>(() => {
    try {
      return normaliseQuizSort(window.sessionStorage.getItem(QUIZ_SORT_STORAGE_KEY))
    } catch {
      return DEFAULT_QUIZ_SORT
    }
  })
  const [activeSessionIds, setActiveSessionIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importCandidate, setImportCandidate] = useState<ParsedKatwedQuiz | null>(null)
  const [workingQuizId, setWorkingQuizId] = useState('')
  const [exportingQuizId, setExportingQuizId] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const sourceQuizzes = view === 'active' ? activeQuizzes : archivedQuizzes
  const normalisedSearchQuery = searchQuery.trim()
  const quizzes = useMemo(
    () => sortQuizzes(filterQuizzes(sourceQuizzes, searchQuery), sort),
    [searchQuery, sort, sourceQuizzes],
  )

  async function refresh() {
    try {
      const [loadedActive, loadedArchived] = await Promise.all([
        repository.listQuizzes(),
        repository.listArchivedQuizzes(),
      ])
      setActiveQuizzes(loadedActive)
      setArchivedQuizzes(loadedArchived)
      const sessions = await Promise.all(
        loadedActive.map(async (quiz) => [quiz.id, (await repository.getActiveSessionForQuiz(quiz.id))?.id ?? ''] as const),
      )
      setActiveSessionIds(Object.fromEntries(sessions))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Quizzes could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function createQuiz() {
    setCreating(true)
    setNotice('')
    try {
      const quiz = await repository.saveQuiz({
        title: 'Untitled quiz',
        quizType: DEFAULT_QUIZ_TYPE,
        headToHeadCompetitors: [],
        coverImagePath: null,
      themeId: DEFAULT_QUIZ_THEME_ID,
      backgroundId: null,
      answerPaletteId: 'classic',
      customAnswerColours: CLASSIC_ANSWER_COLOURS,
        roster: [],
        questions: [],
      })
      await navigate(`/host/quizzes/${quiz.id}/edit`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be created.')
    } finally {
      setCreating(false)
    }
  }

  async function archive(quiz: Quiz) {
    setWorkingQuizId(quiz.id)
    setNotice('')
    try {
      await repository.archiveQuiz(quiz.id)
      await refresh()
      setNotice(`“${quiz.title}” was archived.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be archived.')
    } finally {
      setWorkingQuizId('')
    }
  }

  async function duplicate(quiz: Quiz) {
    setWorkingQuizId(quiz.id)
    setNotice('')
    try {
      const copy = await repository.duplicateQuiz(quiz.id)
      await navigate(`/host/quizzes/${copy.id}/edit`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be duplicated.')
    } finally {
      setWorkingQuizId('')
    }
  }

  async function restore(quiz: Quiz) {
    setWorkingQuizId(quiz.id)
    setNotice('')
    try {
      await repository.restoreQuiz(quiz.id)
      await refresh()
      setNotice(`“${quiz.title}” was restored.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be restored.')
    } finally {
      setWorkingQuizId('')
    }
  }

  async function permanentlyRemove(quiz: Quiz) {
    const confirmed = window.confirm(
      `Permanently delete “${quiz.title}”? This will remove the quiz, its questions and its game history. This cannot be undone.`,
    )
    if (!confirmed) return
    setWorkingQuizId(quiz.id)
    setNotice('')
    try {
      const result = await repository.permanentlyDeleteQuiz(quiz.id)
      await refresh()
      setNotice(`“${quiz.title}” was permanently deleted.`)
      if (result.failedMediaCount > 0) {
        setError(
          `The quiz was deleted, but ${result.failedMediaCount} stored ${result.failedMediaCount === 1 ? 'image' : 'images'} could not be removed.`,
        )
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be permanently deleted.')
    } finally {
      setWorkingQuizId('')
    }
  }

  async function launch(quiz: Quiz) {
    try {
      const session = await repository.launchGame(quiz.id)
      await navigate(`/host/game/${session.id}/control`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The game could not be launched.')
    }
  }

  async function selectImportFile(file: File | undefined) {
    if (!file) return
    setNotice('')
    setError('')
    try {
      setImportCandidate(await parseKatwedQuizFile(file))
    } catch (reason) {
      setImportCandidate(null)
      setError(reason instanceof Error ? reason.message : 'The quiz file could not be read.')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function importQuiz() {
    if (!importCandidate || importing) return
    setImporting(true)
    setNotice('')
    setError('')
    try {
      const imported = await repository.saveQuiz(importCandidate.input)
      await refresh()
      setImportCandidate(null)
      setView('active')
      setSearchQuery('')
      setNotice(`Imported ${imported.title}: ${imported.questions.length} ${imported.questions.length === 1 ? 'question' : 'questions'}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  async function exportQuiz(quiz: Quiz) {
    setExportingQuizId(quiz.id)
    setNotice('')
    setError('')
    try {
      const fullQuiz = await repository.getQuiz(quiz.id)
      if (!fullQuiz) throw new Error('That quiz could not be found.')
      const blob = new Blob([serialiseKatwedQuiz(fullQuiz)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = createKatwedQuizFilename(fullQuiz.title)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setNotice(`Exported ${fullQuiz.title}. The file contains the quiz’s correct answers.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be exported.')
    } finally {
      setExportingQuizId('')
    }
  }

  function changeSort(nextSort: QuizSort) {
    setSort(nextSort)
    try {
      window.sessionStorage.setItem(QUIZ_SORT_STORAGE_KEY, nextSort)
    } catch {
      // The selection still works when browser storage is unavailable.
    }
  }

  if (loading) return <LoadingScreen message="Opening host headquarters…" />

  return (
    <main className="host-page">
      <header className="page-heading">
        <div><p className="eyebrow">Host headquarters</p><h1>Your quizzes</h1><p>Welcome, {user?.email ?? 'host'}.</p></div>
        <div className="heading-actions">
          <Link className="button button--ghost" to="/host/design-system">Visual lab</Link>
          <Link className="button button--secondary" to="/host/storage">Storage</Link>
          <button className="button button--secondary" type="button" onClick={() => importInputRef.current?.click()}>
            Import quiz
          </button>
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept={`${KATWED_QUIZ_FILE_EXTENSION},application/json`}
            aria-label="Choose Katwed quiz file"
            onChange={(event) => void selectImportFile(event.target.files?.[0])}
          />
          <button className="button button--primary" type="button" disabled={creating} onClick={() => void createQuiz()}>
            {creating ? 'Creating…' : '+ Create quiz'}
          </button>
          <button className="button button--ghost" type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <div className="library-tabs" role="tablist" aria-label="Quiz library">
        <button type="button" role="tab" aria-selected={view === 'active'} onClick={() => setView('active')}>
          Active quizzes <span>{activeQuizzes.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'archived'} onClick={() => setView('archived')}>
          Archived quizzes <span>{archivedQuizzes.length}</span>
        </button>
      </div>
      <div className="library-toolbar">
        <div className="library-control library-search">
          <label htmlFor="quiz-library-search">Search quizzes</label>
          <div className="library-search__row">
            <input
              id="quiz-library-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search quiz titles"
            />
            {searchQuery.length > 0 && (
              <button className="button button--ghost" type="button" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            )}
          </div>
        </div>
        <div className="library-control library-sort">
          <label htmlFor="quiz-library-sort">Sort quizzes</label>
          <select
            id="quiz-library-sort"
            value={sort}
            onChange={(event) => changeSort(event.target.value as QuizSort)}
          >
            {quizSortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="library-export-warning" role="note">
        Export files contain the quiz’s correct answers. Keep the file closed if you plan to play it blind.
      </p>
      {importCandidate && (
        <QuizImportPreview
          summary={importCandidate.summary}
          importing={importing}
          onImport={() => void importQuiz()}
          onCancel={() => setImportCandidate(null)}
        />
      )}
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <div className="quiz-grid">
        {quizzes.map((quiz) => {
          const lastEdited = formatLastEdited(quiz.updatedAt)
          const titleId = `quiz-${quiz.id}-title`
          const coverFallback = <span>{quiz.questions.length}</span>

          return (
            <article
              aria-labelledby={titleId}
              className={`quiz-card${view === 'archived' ? ' quiz-card--archived' : ''}`}
              key={quiz.id}
            >
              <div className="quiz-card__art" aria-hidden="true">
                {quiz.coverImagePath ? (
                  <StoredImage
                    reference={quiz.coverImagePath}
                    alt=""
                    className="quiz-card__cover"
                    fallback={coverFallback}
                    loadingFallback={coverFallback}
                  />
                ) : coverFallback}
              </div>
              <div className="quiz-card__body">
                <h2 id={titleId}>{quiz.title}</h2>
                {quiz.quizType === 'head-to-head' && <span className="quiz-type-badge">Head to Head</span>}
                <p>{quiz.roster.filter((member) => member.active).length} people in bank · {quiz.questions.length} questions</p>
                {lastEdited.dateTime ? (
                  <time className="quiz-card__metadata" dateTime={lastEdited.dateTime} title={lastEdited.title}>
                    {lastEdited.label}
                  </time>
                ) : (
                  <span className="quiz-card__metadata">{lastEdited.label}</span>
                )}
                {view === 'active' ? (
                  <div className="card-actions">
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={!quiz.questions.length}
                      onClick={() => void launch(quiz)}
                    >
                      {activeSessionIds[quiz.id] ? 'Resume game' : 'Launch game'}
                    </button>
                    <Link className="button button--secondary" to={`/host/quizzes/${quiz.id}/edit`}>Edit</Link>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={workingQuizId === quiz.id}
                      onClick={() => void duplicate(quiz)}
                    >{workingQuizId === quiz.id ? 'Duplicating...' : 'Duplicate'}</button>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={exportingQuizId === quiz.id}
                      onClick={() => void exportQuiz(quiz)}
                    >{exportingQuizId === quiz.id ? 'Exporting…' : 'Export'}</button>
                    <button
                      className="button button--ghost"
                      type="button"
                      disabled={Boolean(activeSessionIds[quiz.id]) || workingQuizId === quiz.id}
                      title={activeSessionIds[quiz.id] ? 'Close the active game before archiving this quiz.' : undefined}
                      onClick={() => void archive(quiz)}
                    >Archive</button>
                  </div>
                ) : (
                  <div className="card-actions">
                    <button className="button button--secondary" type="button" disabled={workingQuizId === quiz.id} onClick={() => void restore(quiz)}>Restore</button>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={exportingQuizId === quiz.id}
                      onClick={() => void exportQuiz(quiz)}
                    >{exportingQuizId === quiz.id ? 'Exporting…' : 'Export'}</button>
                    <button className="button button--ghost danger" type="button" disabled={workingQuizId === quiz.id} onClick={() => void permanentlyRemove(quiz)}>Permanently delete</button>
                  </div>
                )}
              </div>
            </article>
          )
        })}
        {!quizzes.length && (
          <div className="empty-card">
            {sourceQuizzes.length > 0 && normalisedSearchQuery ? (
              <>
                <h2>No {view} quizzes match “{normalisedSearchQuery}”.</h2>
                <button className="button button--secondary" type="button" onClick={() => setSearchQuery('')}>Clear search</button>
              </>
            ) : (
              <>
                <h2>{view === 'active' ? 'No active quizzes' : 'No archived quizzes'}</h2>
                <p>{view === 'active' ? 'Create a quiz or restore one from the archive.' : 'Archived quizzes will appear here.'}</p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
