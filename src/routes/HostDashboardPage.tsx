import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../features/auth/AuthProvider'
import { repository } from '../services/repository'
import type { Quiz } from '../types/domain'

export function HostDashboardPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [activeSessionIds, setActiveSessionIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function refresh() {
    try {
      const loadedQuizzes = await repository.listQuizzes()
      setQuizzes(loadedQuizzes)
      const sessions = await Promise.all(
        loadedQuizzes.map(async (quiz) => [quiz.id, (await repository.getActiveSessionForQuiz(quiz.id))?.id ?? ''] as const),
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
    try {
      const quiz = await repository.saveQuiz({ title: 'Untitled quiz', roster: [], questions: [] })
      await navigate(`/host/quizzes/${quiz.id}/edit`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be created.')
    } finally {
      setCreating(false)
    }
  }

  async function remove(quiz: Quiz) {
    if (!window.confirm(`Delete “${quiz.title}”? This cannot be undone.`)) return
    try {
      await repository.deleteQuiz(quiz.id)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quiz could not be deleted.')
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
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <div className="quiz-grid">
        {quizzes.map((quiz) => (
          <article className="quiz-card" key={quiz.id}>
            <div className="quiz-card__art" aria-hidden="true"><span>{quiz.questions.length}</span></div>
            <div className="quiz-card__body">
              <h2>{quiz.title}</h2>
              <p>{quiz.roster.filter((member) => member.active).length} people in bank · {quiz.questions.length} questions</p>
              <div className="card-actions">
                <button className="button button--primary" type="button" disabled={!quiz.questions.length} onClick={() => void launch(quiz)}>
                  {activeSessionIds[quiz.id] ? 'Resume game' : 'Launch game'}
                </button>
                <Link className="button button--secondary" to={`/host/quizzes/${quiz.id}/edit`}>Edit</Link>
                <button className="icon-button danger" aria-label={`Delete ${quiz.title}`} type="button" onClick={() => void remove(quiz)}>Delete</button>
              </div>
            </div>
          </article>
        ))}
        {!quizzes.length && <div className="empty-card"><h2>No quizzes yet</h2><p>Create one and give your team something strange to stare at.</p></div>}
      </div>
    </main>
  )
}
