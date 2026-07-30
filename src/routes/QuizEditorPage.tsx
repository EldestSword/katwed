import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { QuestionImage } from '../components/QuestionImage'
import { StatusMessage } from '../components/StatusMessage'
import { validateQuestion } from '../features/quiz-editor/validation'
import { uploadQuestionImage } from '../services/questionImages'
import { repository } from '../services/repository'
import type { Question, Quiz, RosterMember } from '../types/domain'

function makeId(_prefix: string): string {
  return crypto.randomUUID()
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const copy = [...items]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

export function QuizEditorPage() {
  const quizId = useParams().quizId ?? ''
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQuestionId, setUploadingQuestionId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    void repository.getQuiz(quizId).then((value) => {
      setQuiz(value)
      if (!value) setMessage({ tone: 'error', text: 'That quiz could not be found.' })
    }).catch((reason) => {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The quiz could not be loaded.' })
    }).finally(() => setLoading(false))
  }, [quizId])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const invalidQuestions = useMemo(
    () => quiz?.questions.map((question) => validateQuestion(question, quiz.roster)) ?? [],
    [quiz],
  )

  function update(updater: (current: Quiz) => Quiz) {
    setQuiz((current) => current ? updater(current) : current)
    setDirty(true)
    setMessage(null)
  }

  function addMember() {
    if (!quiz) return
    const member: RosterMember = {
      id: makeId('member'),
      quizId: quiz.id,
      displayName: `Person ${quiz.roster.length + 1}`,
      shortName: '',
      active: true,
      displayOrder: quiz.roster.length,
    }
    update((current) => ({ ...current, roster: [...current.roster, member] }))
  }

  function removeMember(member: RosterMember) {
    if (!quiz) return
    if (quiz.questions.some((question) => question.correctMemberIds.includes(member.id))) {
      window.alert('This person is used as a correct answer. Change those questions before deleting them.')
      return
    }
    if (!window.confirm(`Delete ${member.displayName}?`)) return
    update((current) => ({ ...current, roster: current.roster.filter((candidate) => candidate.id !== member.id) }))
  }

  function addQuestion() {
    if (!quiz) return
    const active = quiz.roster.filter((member) => member.active)
    const question: Question = {
      id: makeId('question'),
      quizId: quiz.id,
      imagePath: '',
      correctMemberIds: [active[0]?.id ?? '', active[1]?.id ?? ''],
      timeLimitSeconds: 30,
      displayOrder: quiz.questions.length,
      revealCaption: '',
    }
    update((current) => ({ ...current, questions: [...current.questions, question] }))
  }

  async function upload(questionId: string, file: File | undefined) {
    if (!file) return
    setUploadingQuestionId(questionId)
    setMessage(null)
    try {
      const imagePath = await uploadQuestionImage(file)
      update((current) => ({
        ...current,
        questions: current.questions.map((question) => question.id === questionId ? { ...question, imagePath } : question),
      }))
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The image could not be uploaded.' })
    } finally {
      setUploadingQuestionId('')
    }
  }

  async function save() {
    if (!quiz) return
    const title = quiz.title.trim()
    if (!title) return setMessage({ tone: 'error', text: 'Give the quiz a title before saving.' })
    if (quiz.roster.some((member) => !member.displayName.trim())) {
      return setMessage({ tone: 'error', text: 'Every roster member needs a display name.' })
    }
    const duplicateNames = new Set<string>()
    for (const member of quiz.roster) {
      const key = member.displayName.trim().toLocaleLowerCase('en-GB')
      if (duplicateNames.has(key)) return setMessage({ tone: 'error', text: 'Roster names must be unique.' })
      duplicateNames.add(key)
    }
    if (invalidQuestions.some((validation) => !validation.valid)) {
      return setMessage({ tone: 'error', text: 'Fix the highlighted question details before saving.' })
    }
    setSaving(true)
    try {
      const roster = quiz.roster.map((member, displayOrder) => ({ ...member, displayOrder }))
      const questions = quiz.questions.map((question, displayOrder) => ({ ...question, displayOrder }))
      const saved = await repository.saveQuiz({ id: quiz.id, title, roster, questions })
      setQuiz(saved)
      setDirty(false)
      setMessage({ tone: 'success', text: 'Quiz saved.' })
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The quiz could not be saved.' })
    } finally {
      setSaving(false)
    }
  }

  function leave(event: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) event.preventDefault()
  }

  if (loading) return <LoadingScreen message="Opening the quiz editor…" />
  if (!quiz) return <main className="centred-screen"><h1>Quiz not found</h1><Link className="button button--primary" to="/host">Back to quizzes</Link></main>

  const activeRoster = quiz.roster.filter((member) => member.active)

  return (
    <main className="editor-page">
      <header className="editor-toolbar">
        <div>
          <Link className="text-link" to="/host" onClick={leave}>← All quizzes</Link>
          <input className="title-input" aria-label="Quiz title" value={quiz.title}
            onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} />
        </div>
        <div className="heading-actions">
          {dirty && <span className="unsaved-dot">Unsaved changes</span>}
          <button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save quiz'}
          </button>
        </div>
      </header>
      {message && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}

      <section className="editor-section" aria-labelledby="roster-title">
        <div className="section-heading">
          <div><p className="eyebrow">Answer pool</p><h2 id="roster-title">Team roster</h2><p>Inactive people stay in your quiz but will not appear as choices.</p></div>
          <button className="button button--secondary" type="button" onClick={addMember}>+ Add person</button>
        </div>
        <div className="roster-editor">
          {quiz.roster.map((member, index) => (
            <div className={`roster-row ${!member.active ? 'is-inactive' : ''}`} key={member.id}>
              <div className="reorder-buttons">
                <button type="button" aria-label={`Move ${member.displayName} up`} disabled={index === 0}
                  onClick={() => update((current) => ({ ...current, roster: move(current.roster, index, -1) }))}>↑</button>
                <button type="button" aria-label={`Move ${member.displayName} down`} disabled={index === quiz.roster.length - 1}
                  onClick={() => update((current) => ({ ...current, roster: move(current.roster, index, 1) }))}>↓</button>
              </div>
              <label><span>Display name</span><input value={member.displayName} maxLength={60}
                onChange={(event) => update((current) => ({ ...current, roster: current.roster.map((candidate) => candidate.id === member.id ? { ...candidate, displayName: event.target.value } : candidate) }))} /></label>
              <label><span>Short name</span><input value={member.shortName} maxLength={30} placeholder="Optional"
                onChange={(event) => update((current) => ({ ...current, roster: current.roster.map((candidate) => candidate.id === member.id ? { ...candidate, shortName: event.target.value } : candidate) }))} /></label>
              <label className="switch-label"><input type="checkbox" checked={member.active}
                onChange={(event) => update((current) => ({ ...current, roster: current.roster.map((candidate) => candidate.id === member.id ? { ...candidate, active: event.target.checked } : candidate) }))} /><span>{member.active ? 'Active' : 'Inactive'}</span></label>
              <button className="icon-button danger" type="button" onClick={() => removeMember(member)}>Delete</button>
            </div>
          ))}
          {!quiz.roster.length && <p className="empty-note">Add at least two people to build a question.</p>}
        </div>
      </section>

      <section className="editor-section" aria-labelledby="questions-title">
        <div className="section-heading">
          <div><p className="eyebrow">The strange portraits</p><h2 id="questions-title">Questions</h2><p>Every question needs an image and exactly two active correct people.</p></div>
          <button className="button button--secondary" type="button" disabled={activeRoster.length < 2} onClick={addQuestion}>+ Add question</button>
        </div>
        <div className="question-list">
          {quiz.questions.map((question, index) => {
            const validation = invalidQuestions[index]
            return (
              <article className={`question-editor ${validation && !validation.valid ? 'has-errors' : ''}`} key={question.id}>
                <div className="question-editor__header">
                  <h3>Question {index + 1}</h3>
                  <div className="reorder-buttons">
                    <button type="button" aria-label={`Move question ${index + 1} up`} disabled={index === 0}
                      onClick={() => update((current) => ({ ...current, questions: move(current.questions, index, -1) }))}>↑</button>
                    <button type="button" aria-label={`Move question ${index + 1} down`} disabled={index === quiz.questions.length - 1}
                      onClick={() => update((current) => ({ ...current, questions: move(current.questions, index, 1) }))}>↓</button>
                    <button className="danger" type="button" onClick={() => {
                      if (window.confirm(`Delete question ${index + 1}?`)) update((current) => ({ ...current, questions: current.questions.filter((candidate) => candidate.id !== question.id) }))
                    }}>Delete</button>
                  </div>
                </div>
                <div className="question-editor__grid">
                  <div className="image-uploader">
                    {question.imagePath
                      ? <QuestionImage path={question.imagePath} alt={`Preview for question ${index + 1}`} />
                      : <div className="image-placeholder">No portrait yet</div>}
                    <label className="button button--secondary">
                      {uploadingQuestionId === question.id ? 'Preparing image…' : 'Choose image'}
                      <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingQuestionId === question.id} onChange={(event) => void upload(question.id, event.target.files?.[0])} />
                    </label>
                    <small>JPEG, PNG or WebP · up to 8 MB</small>
                  </div>
                  <div className="question-fields">
                    <div className="two-columns">
                      <label><span>First correct person</span><select value={question.correctMemberIds[0]} onChange={(event) => update((current) => ({ ...current, questions: current.questions.map((candidate) => candidate.id === question.id ? { ...candidate, correctMemberIds: [event.target.value, candidate.correctMemberIds[1]] } : candidate) }))}>
                        <option value="">Choose…</option>{activeRoster.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
                      </select></label>
                      <label><span>Second correct person</span><select value={question.correctMemberIds[1]} onChange={(event) => update((current) => ({ ...current, questions: current.questions.map((candidate) => candidate.id === question.id ? { ...candidate, correctMemberIds: [candidate.correctMemberIds[0], event.target.value] } : candidate) }))}>
                        <option value="">Choose…</option>{activeRoster.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
                      </select></label>
                    </div>
                    <label><span>Timer (seconds)</span><input type="number" min={5} max={180} value={question.timeLimitSeconds}
                      onChange={(event) => update((current) => ({ ...current, questions: current.questions.map((candidate) => candidate.id === question.id ? { ...candidate, timeLimitSeconds: Number(event.target.value) } : candidate) }))} /></label>
                    <label><span>Reveal caption <em>optional</em></span><textarea rows={2} maxLength={240} value={question.revealCaption}
                      onChange={(event) => update((current) => ({ ...current, questions: current.questions.map((candidate) => candidate.id === question.id ? { ...candidate, revealCaption: event.target.value } : candidate) }))} /></label>
                    {validation && !validation.valid && <ul className="validation-list">{validation.messages.map((item) => <li key={item}>{item}</li>)}</ul>}
                  </div>
                </div>
              </article>
            )
          })}
          {!quiz.questions.length && <div className="empty-card"><h3>No questions yet</h3><p>Add a portrait once at least two roster members are active.</p></div>}
        </div>
      </section>
      <footer className="editor-footer">
        <button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}>Save quiz</button>
        <button className="button button--secondary" type="button" onClick={() => {
          if (!dirty || window.confirm('Leave without saving your changes?')) void navigate('/host')
        }}>Back to dashboard</button>
      </footer>
    </main>
  )
}
