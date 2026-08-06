import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../features/auth/AuthProvider'
import { repository } from '../services/repository'
import type { Quiz } from '../types/domain'

type LibraryView = 'active' | 'archived'

export function HostDashboardPage() {
  const [activeQuizzes, setActiveQuizzes] = useState<Quiz[]>([])
  const [archivedQuizzes, setArchivedQuizzes] = useState<Quiz[]>([])
  const [view, setView] = useState<LibraryView>('active')
  const [activeSessionIds, setActiveSessionIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const [workingQuizId, setWorkingQuizId] = useState('')
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

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
      const quiz = await repository.saveQuiz({ title: 'Untitled quiz', roster: [], questions: [] })
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

  if (loading) return <LoadingScreen message="Opening host headquarters…" />

  const quizzes = view === 'active' ? activeQuizzes : archivedQuizzes

  return (
    <main className="host-page">
      <header className="page-heading">
        <div><p className="eyebrow">Host headquarters</p><h1>Your quizzes</h1><p>Welcome, {user?.email ?? 'host'}.</p></div>
        <div className="heading-actions">
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
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <div className="quiz-grid">
        {quizzes.map((quiz) => (
          <article className={`quiz-card${view === 'archived' ? ' quiz-card--archived' : ''}`} key={quiz.id}>
            <div className="quiz-card__art" aria-hidden="true"><span>{quiz.questions.length}</span></div>
            <div className="quiz-card__body">
              <h2>{quiz.title}</h2>
              <p>{quiz.roster.filter((member) => member.active).length} people in bank · {quiz.questions.length} questions</p>
              {view === 'active' ? (
                <div className="card-actions">
                  <button className="button button--primary" type="button" disabled={!quiz.questions.length} onClick={() => void launch(quiz)}>
                    {activeSessionIds[quiz.id] ? 'Resume game' : 'Launch game'}
                  </button>
                  <Link className="button button--secondary" to={`/host/quizzes/${quiz.id}/edit`}>Edit</Link>
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
                  <button className="button button--ghost danger" type="button" disabled={workingQuizId === quiz.id} onClick={() => void permanentlyRemove(quiz)}>Permanently delete</button>
                </div>
              )}
            </div>
          </article>
        ))}
        {!quizzes.length && (
          <div className="empty-card">
            <h2>{view === 'active' ? 'No active quizzes' : 'No archived quizzes'}</h2>
            <p>{view === 'active' ? 'Create a quiz or restore one from the archive.' : 'Archived quizzes will appear here.'}</p>
          </div>
        )}
      </div>
    </main>
  )
}
