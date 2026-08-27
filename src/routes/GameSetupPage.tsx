import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Logo } from '../components/AppShell'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusMessage } from '../components/StatusMessage'
import { StoredImage } from '../components/StoredImage'
import { soundPacks } from '../features/audio/soundPacks'
import {
  defaultLaunchGameSettings,
  quizUsesMixedQuestionTypes,
} from '../features/game/launchSettings'
import { questionTypeRegistry } from '../features/questions/registry'
import { repository } from '../services/repository'
import type { LaunchGameSettings, Quiz, SoundPackId } from '../types/domain'

export function GameSetupPage() {
  const quizId = useParams().quizId ?? ''
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [settings, setSettings] = useState<LaunchGameSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void Promise.all([repository.getQuiz(quizId), repository.getActiveSessionForQuiz(quizId)])
      .then(async ([loadedQuiz, active]) => {
        if (cancelled) return
        if (active) {
          await navigate(`/host/game/${active.id}/control`, { replace: true })
          return
        }
        if (!loadedQuiz) throw new Error('That quiz could not be found.')
        setQuiz(loadedQuiz)
        setSettings(defaultLaunchGameSettings(loadedQuiz))
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Game setup could not be loaded.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [navigate, quizId])

  const questionTypes = useMemo(() => quiz
    ? [...new Set(quiz.questions.map((question) => question.type))]
    : [], [quiz])
  const mixed = quiz ? quizUsesMixedQuestionTypes(quiz.questions) : false

  function update<K extends keyof LaunchGameSettings>(key: K, value: LaunchGameSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current)
  }

  async function startLobby() {
    if (!quiz || !settings || starting) return
    setStarting(true)
    setError('')
    try {
      const active = await repository.getActiveSessionForQuiz(quiz.id)
      if (active) {
        await navigate(`/host/game/${active.id}/control`, { replace: true })
        return
      }
      const session = await repository.launchGame(quiz.id, settings)
      await navigate(`/host/game/${session.id}/control`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The lobby could not be started.')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <LoadingScreen message="Preparing game setup…" />
  if (!quiz || !settings) {
    return <main className="centred-screen"><Logo /><h1>Game setup unavailable</h1><p>{error}</p><Link className="button button--primary" to="/host">Back to quizzes</Link></main>
  }

  return (
    <main className="host-page game-setup-page">
      <header className="page-heading game-setup-heading">
        <div><p className="eyebrow">Game setup</p><h1>Set up tonight’s game</h1><p>Choose how this run will play. The saved quiz stays unchanged.</p></div>
        <Link className="button button--ghost" to="/host">Back to quizzes</Link>
      </header>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <div className="game-setup-layout">
        <aside className="game-setup-summary" aria-labelledby="setup-quiz-title">
          <div className="game-setup-summary__cover">
            {quiz.coverImagePath
              ? <StoredImage reference={quiz.coverImagePath} alt="" />
              : <span aria-hidden="true">{quiz.questions.length}</span>}
          </div>
          <p className="eyebrow">Tonight’s quiz</p>
          <h2 id="setup-quiz-title">{quiz.title}</h2>
          <dl>
            <div><dt>Questions</dt><dd>{quiz.questions.length}</dd></div>
            <div><dt>Game mode</dt><dd>{quiz.quizType === 'head-to-head' ? 'Head to Head' : 'Standard'}</dd></div>
            <div><dt>Format</dt><dd>{mixed ? 'Mixed format' : 'Single format'}</dd></div>
          </dl>
          <div className="game-setup-summary__types" aria-label="Question types present">
            {questionTypes.map((type) => <span key={type}>{questionTypeRegistry[type].name}</span>)}
          </div>
          <p>{mixed ? 'A brief format intro will appear before ordinary questions.' : 'No question-type intros are needed for this quiz.'}</p>
        </aside>

        <section className="game-setup-settings" aria-labelledby="session-settings-heading">
          <header><p className="eyebrow">This session only</p><h2 id="session-settings-heading">Presentation and play settings</h2></header>

          <fieldset className="game-setup-sound-packs">
            <legend>Music theme</legend>
            <p>Music and stings play from the shared Presentation. Contestant phones stay silent.</p>
            <div className="sound-pack-grid">
              {soundPacks.map((pack) => (
                <button key={pack.id} type="button" aria-pressed={settings.soundPackId === pack.id} onClick={() => update('soundPackId', pack.id as SoundPackId)}>
                  <span aria-hidden="true">{pack.id === 'none' ? '×' : '!'}</span>
                  <span><strong>{pack.name}</strong><small>{pack.description}</small></span>
                  <em>{settings.soundPackId === pack.id ? 'Selected' : 'Choose'}</em>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="game-setup-toggles">
            <SessionToggle label="Shuffle question order" note="Creates one stable order for this room without changing the saved quiz." checked={settings.shuffleQuestionOrder} onChange={(checked) => update('shuffleQuestionOrder', checked)} />
            <SessionToggle label="Shuffle all answer choices" note="Forces eligible Single Choice and Multiple Select answers into one stable session order." checked={settings.shuffleAnswerOptions} onChange={(checked) => update('shuffleAnswerOptions', checked)} />
            {quiz.quizType === 'standard' && <SessionToggle label="Auto-close answers when everyone has locked in" note="Turn off to keep the timer running until time expires or you close answers manually." checked={settings.autoLockWhenAllAnswered} onChange={(checked) => update('autoLockWhenAllAnswered', checked)} />}
          </div>

          <footer>
            <button className="button button--primary" type="button" disabled={starting || quiz.questions.length === 0} onClick={() => void startLobby()}>{starting ? 'Starting lobby…' : 'Start lobby'}</button>
            <p>The room is created only when you start the lobby.</p>
          </footer>
        </section>
      </div>
    </main>
  )
}

function SessionToggle({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange(checked: boolean): void }) {
  return (
    <label className="game-setup-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{label}</strong><small>{note}</small></span>
    </label>
  )
}
