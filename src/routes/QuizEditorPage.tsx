import { useEffect, useMemo, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { QuestionMedia } from '../components/QuestionMedia'
import { StoredImage } from '../components/StoredImage'
import { StatusMessage } from '../components/StatusMessage'
import { validateQuestion, validateQuizSave } from '../features/quiz-editor/validation'
import { createQuestion } from '../features/questions/factories'
import { questionTypes, questionTypeRegistry } from '../features/questions/registry'
import { quizThemes } from '../features/themes/quizThemes'
import {
  backgroundsForTheme,
  normaliseQuizBackgroundId,
} from '../features/themes/quizBackgrounds'
import { quizBackgroundSurfaceProps } from '../features/themes/quizBackgroundSurface'
import { createHeadToHeadCompetitors, nextHeadToHeadAssignment } from '../features/head-to-head/headToHead'
import { MAX_TYPED_ANSWER_LENGTH, parseTypedAnswerAlternatives } from '../features/typed-answer/typedAnswer'
import { KATWED_IMAGE_ACCEPT, uploadQuestionImage, uploadQuizCover } from '../services/questionImages'
import { repository } from '../services/repository'
import type {
  ChoiceOption,
  Question,
  QuestionMedia as Media,
  QuestionType,
  Quiz,
  QuizBackgroundId,
  QuizThemeId,
  QuizType,
  RosterMember,
} from '../types/domain'
import { normaliseYouTubeVideoId } from '../utils/youtube'

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const copy = [...items]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

function number(value: string): number {
  return Number(value) || 0
}

export function QuizEditorPage() {
  const quizId = useParams().quizId ?? ''
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const navigate = useNavigate()
  const blocker = useBlocker(dirty)

  useEffect(() => {
    void repository.getQuiz(quizId).then((value) => {
      setQuiz(value)
      setSelectedId(value?.questions[0]?.id ?? '')
      if (!value) setMessage({ tone: 'error', text: 'That quiz could not be found.' })
    }).catch((reason) => setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The quiz could not be loaded.' }))
      .finally(() => setLoading(false))
  }, [quizId])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('You have unsaved changes. Leave without saving?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const selected = useMemo(() => quiz?.questions.find((question) => question.id === selectedId) ?? null, [quiz, selectedId])
  const validation = selected && quiz ? validateQuestion(selected, quiz.roster) : null

  function update(updater: (current: Quiz) => Quiz) {
    setQuiz((current) => current ? updater(current) : current)
    setDirty(true)
    setMessage(null)
  }

  function updateQuestion(updater: (question: Question) => Question) {
    update((current) => ({
      ...current,
      questions: current.questions.map((question) => question.id === selectedId ? updater(question) : question),
    }))
  }

  function addQuestion(type: QuestionType) {
    if (!quiz) return
    const question = {
      ...createQuestion(type, quiz.id, quiz.questions.length, quiz.quizType === 'standard'),
      assignedCompetitorId: nextHeadToHeadAssignment(quiz),
    }
    update((current) => ({ ...current, questions: [...current.questions, question] }))
    setSelectedId(question.id)
  }

  async function upload(file: File | undefined) {
    if (!file || !selected) return
    try {
      const path = await uploadQuestionImage(file)
      updateQuestion((question) => ({
        ...question,
        media: {
          type: 'image',
          path,
          altText: question.type === 'mashup' ? 'AI-generated merged portrait for the current question.' : 'Question image',
          revealEffect: 'immediate',
          revealDurationSeconds: 0,
        },
      }))
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The image could not be uploaded.' })
    }
  }

  async function uploadCover(file: File | undefined) {
    if (!file) return
    setCoverUploading(true)
    setMessage(null)
    try {
      const coverImagePath = await uploadQuizCover(file)
      update((current) => ({ ...current, coverImagePath }))
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The cover could not be uploaded.' })
    } finally {
      setCoverUploading(false)
    }
  }

  async function save() {
    if (!quiz) return
    const input = {
      id: quiz.id,
      title: quiz.title.trim(),
      quizType: quiz.quizType,
      headToHeadCompetitors: quiz.headToHeadCompetitors.map((competitor) => ({
        ...competitor,
        displayName: competitor.displayName.trim(),
      })),
      coverImagePath: quiz.coverImagePath,
      themeId: quiz.themeId,
      backgroundId: quiz.backgroundId,
      roster: quiz.roster.map((member, displayOrder) => ({ ...member, displayOrder })),
      questions: quiz.questions.map((question, displayOrder) => ({ ...question, displayOrder })),
    }
    const messages = validateQuizSave(input)
    if (messages.length) { setMessage({ tone: 'error', text: messages[0] }); return }
    setSaving(true)
    try {
      const saved = await repository.saveQuiz(input)
      setQuiz(saved)
      setDirty(false)
      setMessage({ tone: 'success', text: 'Quiz saved.' })
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The quiz could not be saved.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingScreen message="Opening the quiz editor…" />
  if (!quiz) return <main className="centred-screen"><h1>Quiz not found</h1><Link className="button button--primary" to="/host">Back to quizzes</Link></main>

  const changeType = (type: QuestionType) => {
    if (!selected || type === selected.type) return
    if (!window.confirm('Changing type will replace this question’s type-specific answers. Continue?')) return
    const replacement = createQuestion(type, selected.quizId, selected.displayOrder, quiz.quizType === 'standard')
    updateQuestion(() => ({
      ...replacement,
      id: selected.id,
      prompt: selected.prompt,
      supportingText: selected.supportingText,
      timeLimitSeconds: selected.timeLimitSeconds,
      points: selected.points,
      speedScoringEnabled: selected.speedScoringEnabled,
      doubleScore: selected.doubleScore,
      assignedCompetitorId: selected.assignedCompetitorId,
      revealCaption: selected.revealCaption,
    }))
  }

  const changeQuizType = (quizType: QuizType) => {
    if (quizType === quiz.quizType) return
    if (quizType === 'head-to-head') {
      update((current) => ({
        ...current,
        quizType,
        headToHeadCompetitors: createHeadToHeadCompetitors(current.id),
        questions: current.questions.map((question) => ({
          ...question,
          assignedCompetitorId: null,
          speedScoringEnabled: false,
          doubleScore: false,
        })),
      }))
      return
    }
    const hasConfiguration = quiz.headToHeadCompetitors.some((competitor) => competitor.displayName.trim())
      || quiz.questions.some((question) => question.assignedCompetitorId !== null)
    if (hasConfiguration && !window.confirm(
      'Switch to Standard and clear both competitors and every question assignment?',
    )) return
    update((current) => ({
      ...current,
      quizType: 'standard',
      headToHeadCompetitors: [],
      questions: current.questions.map((question) => ({ ...question, assignedCompetitorId: null })),
    }))
  }

  const assignmentLabel = (question: Question): string => {
    if (quiz.quizType !== 'head-to-head') return ''
    const competitor = quiz.headToHeadCompetitors.find((candidate) => candidate.id === question.assignedCompetitorId)
    if (!competitor) return ' · Unassigned'
    return ` · ${competitor.displayName.trim() || `Competitor ${competitor.displayOrder + 1}`}`
  }

  return (
    <main className="editor-page editor-page--three-panel">
      <header className="editor-toolbar">
        <div><Link className="text-link" to="/host">← All quizzes</Link><input className="title-input" aria-label="Quiz title" value={quiz.title} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} /></div>
        <div className="heading-actions">{dirty && <span className="unsaved-dot">Unsaved changes</span>}<button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save quiz'}</button></div>
      </header>
      {message && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      <div className="editor-workspace">
        <aside className="question-navigator">
          <h2>Questions</h2>
          <div className="question-type-picker">
            {questionTypes.map((definition) => <button key={definition.type} type="button" onClick={() => addQuestion(definition.type)}><span>{definition.icon}</span><strong>{definition.name}</strong><small>{definition.description}</small></button>)}
          </div>
          <ol>
            {quiz.questions.map((question, index) => <li key={question.id}>
              <button className={question.id === selectedId ? 'is-selected' : ''} type="button" onClick={() => setSelectedId(question.id)}>
                <span>{index + 1}</span><span><strong>{question.prompt}</strong><small>{questionTypeRegistry[question.type].name}{assignmentLabel(question)}</small></span>
              </button>
              <div className="mini-actions">
                <button type="button" disabled={index === 0} aria-label={`Move question ${index + 1} up`} onClick={() => update((current) => ({ ...current, questions: move(current.questions, index, -1) }))}>↑</button>
                <button type="button" disabled={index === quiz.questions.length - 1} aria-label={`Move question ${index + 1} down`} onClick={() => update((current) => ({ ...current, questions: move(current.questions, index, 1) }))}>↓</button>
              </div>
            </li>)}
          </ol>
        </aside>

        <section className="editor-preview">
          {selected ? <>
            <div className="preview-tabs"><span>Presentation preview</span><span>Player preview</span></div>
            <article
              className="question-preview-card quiz-themed-surface"
              data-quiz-theme={quiz.themeId}
              {...quizBackgroundSurfaceProps(quiz.backgroundId, quiz.themeId)}
              aria-label={`${quizThemes.find((theme) => theme.id === quiz.themeId)?.name ?? 'Katwed!'} theme preview`}
            ><p className="eyebrow">{questionTypeRegistry[selected.type].name}</p><h1>{selected.prompt}</h1>{selected.supportingText && <p>{selected.supportingText}</p>}<QuestionMedia media={selected.media} openedAt={new Date().toISOString()} allowEnlarge={false} /></article>
            <div className="heading-actions">
              <button className="button button--secondary" type="button" onClick={() => {
                const duplicate = structuredClone(selected)
                duplicate.id = crypto.randomUUID()
                duplicate.displayOrder = quiz.questions.length
                if (duplicate.type === 'single-choice') {
                  const correctIndex = duplicate.options.findIndex((option) => option.id === duplicate.correctOptionId)
                  duplicate.options = duplicate.options.map((option) => ({ ...option, id: crypto.randomUUID() }))
                  duplicate.correctOptionId = duplicate.options[correctIndex]?.id ?? ''
                }
                if (duplicate.type === 'multiple-select') {
                  const correctIndexes = duplicate.options.flatMap((option, index) => duplicate.correctOptionIds.includes(option.id) ? [index] : [])
                  duplicate.options = duplicate.options.map((option) => ({ ...option, id: crypto.randomUUID() }))
                  duplicate.correctOptionIds = correctIndexes.map((index) => duplicate.options[index].id)
                }
                update((current) => ({ ...current, questions: [...current.questions, duplicate] }))
                setSelectedId(duplicate.id)
              }}>Duplicate</button>
              <button className="button button--ghost danger" type="button" onClick={() => {
                if (!window.confirm('Delete this question?')) return
                const index = quiz.questions.findIndex((question) => question.id === selected.id)
                update((current) => ({ ...current, questions: current.questions.filter((question) => question.id !== selected.id) }))
                setSelectedId(quiz.questions[index + 1]?.id ?? quiz.questions[index - 1]?.id ?? '')
              }}>Delete</button>
            </div>
          </> : <div className="empty-card"><h2>Add a question</h2><p>Choose one of the six supported formats.</p></div>}
        </section>

        <aside className="question-settings">
          <QuizTypePicker quizType={quiz.quizType} select={changeQuizType} />
          {quiz.quizType === 'head-to-head' && <HeadToHeadSetup quiz={quiz} update={update} />}
          <QuizThemePicker
            themeId={quiz.themeId}
            select={(themeId) => update((current) => ({
              ...current,
              themeId,
              backgroundId: normaliseQuizBackgroundId(current.backgroundId, themeId),
            }))}
          />
          <QuizBackgroundPicker
            themeId={quiz.themeId}
            backgroundId={quiz.backgroundId}
            select={(backgroundId) => update((current) => ({ ...current, backgroundId }))}
          />
          <QuizCover
            coverImagePath={quiz.coverImagePath}
            uploading={coverUploading}
            upload={uploadCover}
            remove={() => update((current) => ({ ...current, coverImagePath: null }))}
          />
          {selected && <>
            <h2>Question settings</h2>
            <label><span>Type</span><select value={selected.type} onChange={(event) => changeType(event.target.value as QuestionType)}>{questionTypes.map((item) => <option key={item.type} value={item.type}>{item.name}</option>)}</select></label>
            <label><span>Prompt</span><textarea rows={3} value={selected.prompt} onChange={(event) => updateQuestion((question) => ({ ...question, prompt: event.target.value }))} /></label>
            <label><span>Supporting text</span><textarea rows={2} value={selected.supportingText} onChange={(event) => updateQuestion((question) => ({ ...question, supportingText: event.target.value }))} /></label>
            {quiz.quizType === 'head-to-head' && <QuestionCompetitorPicker
              question={selected}
              competitors={quiz.headToHeadCompetitors}
              select={(assignedCompetitorId) => updateQuestion((question) => ({ ...question, assignedCompetitorId }))}
            />}
            <div className="two-columns">
              <label><span>Timer</span><input type="number" min="5" max="300" value={selected.timeLimitSeconds} onChange={(event) => updateQuestion((question) => ({ ...question, timeLimitSeconds: number(event.target.value) }))} /></label>
              {quiz.quizType === 'standard' && <label><span>Maximum points</span><input type="number" min="1" value={selected.points} onChange={(event) => updateQuestion((question) => ({ ...question, points: number(event.target.value) }))} /></label>}
            </div>
            {quiz.quizType === 'standard' && <fieldset className="standard-scoring-settings"><legend>Standard scoring</legend>
              <label><input type="checkbox" checked={selected.speedScoringEnabled} onChange={(event) => updateQuestion((question) => ({ ...question, speedScoringEnabled: event.target.checked }))} /> Faster answers score more</label>
              <p className="settings-note">Correct answers earn between 100% and 50% of the available points as the timer runs down.</p>
              <label><input type="checkbox" checked={selected.doubleScore} onChange={(event) => updateQuestion((question) => ({ ...question, doubleScore: event.target.checked }))} /> Double score</label>
              {selected.doubleScore && <p className="settings-note">Worth up to {(selected.points * 2).toLocaleString('en-GB')} points.</p>}
            </fieldset>}
            {quiz.quizType === 'head-to-head' && <p className="settings-note">Head-to-Head uses 1 point for a correct assigned answer. Standard point values are ignored.</p>}
            <MediaSettings question={selected} update={updateQuestion} upload={upload} />
            <label><span>Media visibility</span><select value={selected.mediaVisibility} onChange={(event) => updateQuestion((question) => ({ ...question, mediaVisibility: event.target.value as Question['mediaVisibility'] }))}><option value="presentation">Presentation only</option><option value="players">Player devices only</option><option value="both">Both</option></select></label>
            <label><span>Choices on presentation</span><select value={selected.presentationChoiceVisibility} onChange={(event) => updateQuestion((question) => ({ ...question, presentationChoiceVisibility: event.target.value as Question['presentationChoiceVisibility'] }))}><option value="show">Show choices</option><option value="hide">Hide choices</option><option value="after-lock">Reveal after answers close</option></select></label>
            <TypeSettings question={selected} roster={quiz.roster} update={updateQuestion} />
            <label><span>Reveal caption</span><textarea rows={2} value={selected.revealCaption} onChange={(event) => updateQuestion((question) => ({ ...question, revealCaption: event.target.value }))} /></label>
            {validation && !validation.valid && <ul className="validation-list">{validation.messages.map((item) => <li key={item}>{item}</li>)}</ul>}
          </>}
          <PeopleBank quiz={quiz} update={update} />
        </aside>
      </div>
      <footer className="editor-footer"><button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}>Save quiz</button><button className="button button--secondary" type="button" onClick={() => void navigate('/host')}>Back to dashboard</button></footer>
    </main>
  )
}

function QuizTypePicker({ quizType, select }: { quizType: QuizType; select(quizType: QuizType): void }) {
  const options: Array<{ id: QuizType; name: string; description: string }> = [
    { id: 'standard', name: 'Standard', description: 'Everyone answers every question using normal Katwed scoring.' },
    { id: 'head-to-head', name: 'Head to Head', description: 'Two named competitors take turns with questions assigned specifically to them.' },
  ]
  return (
    <fieldset className="quiz-type-picker">
      <legend>Quiz type</legend>
      <div className="quiz-type-grid">
        {options.map((option) => <button
          key={option.id}
          type="button"
          aria-pressed={quizType === option.id}
          onClick={() => select(option.id)}
        >
          <strong>{option.name}</strong>
          <small>{option.description}</small>
          <span>{quizType === option.id ? 'Selected' : 'Choose'}</span>
        </button>)}
      </div>
    </fieldset>
  )
}

function HeadToHeadSetup({ quiz, update }: { quiz: Quiz; update(updater: (quiz: Quiz) => Quiz): void }) {
  return (
    <section className="head-to-head-setup" aria-labelledby="head-to-head-competitors-heading">
      <h2 id="head-to-head-competitors-heading">Head-to-Head competitors</h2>
      <p>Every question must be assigned to one of these two competitors.</p>
      {quiz.headToHeadCompetitors.map((competitor) => <label key={competitor.id}>
        <span>Competitor {competitor.displayOrder + 1}</span>
        <input
          value={competitor.displayName}
          maxLength={30}
          placeholder={competitor.displayOrder === 0 ? 'e.g. Ross' : 'e.g. Jess'}
          onChange={(event) => update((current) => ({
            ...current,
            headToHeadCompetitors: current.headToHeadCompetitors.map((candidate) => (
              candidate.id === competitor.id ? { ...candidate, displayName: event.target.value } : candidate
            )),
          }))}
        />
      </label>)}
    </section>
  )
}

function QuestionCompetitorPicker({
  question,
  competitors,
  select,
}: {
  question: Question
  competitors: Quiz['headToHeadCompetitors']
  select(competitorId: string): void
}) {
  return (
    <fieldset className="question-competitor-picker">
      <legend>Question for</legend>
      <div>
        {competitors.map((competitor) => <button
          key={competitor.id}
          type="button"
          aria-pressed={question.assignedCompetitorId === competitor.id}
          onClick={() => select(competitor.id)}
        >
          {competitor.displayName.trim() || `Competitor ${competitor.displayOrder + 1}`}
        </button>)}
      </div>
    </fieldset>
  )
}

function QuizBackgroundPicker({
  themeId,
  backgroundId,
  select,
}: {
  themeId: QuizThemeId
  backgroundId: QuizBackgroundId | null
  select(backgroundId: QuizBackgroundId | null): void
}) {
  const backgrounds = backgroundsForTheme(themeId)
  return (
    <fieldset className="quiz-background-picker">
      <legend>Quiz background</legend>
      <p>Choose Theme default or one image for this theme. Save the quiz to keep this change.</p>
      <div className="quiz-background-grid">
        <button
          className="quiz-background-option"
          type="button"
          aria-pressed={backgroundId === null}
          onClick={() => select(null)}
        >
          <span
            className="quiz-background-option__preview quiz-themed-surface"
            data-quiz-theme={themeId}
            aria-hidden="true"
          ><i /></span>
          <span className="quiz-background-option__copy">
            <strong>Theme default</strong>
            <small>No image</small>
          </span>
          <span className="quiz-background-option__state">{backgroundId === null ? 'Selected' : 'Choose'}</span>
        </button>
        {backgrounds.map((background) => {
          const selected = background.id === backgroundId
          return (
            <button
              key={background.id}
              className="quiz-background-option"
              type="button"
              aria-pressed={selected}
              onClick={() => select(background.id)}
            >
              <span className="quiz-background-option__preview" aria-hidden="true">
                <img src={background.assetPath} alt="" />
              </span>
              <span className="quiz-background-option__copy"><strong>{background.name}</strong></span>
              <span className="quiz-background-option__state">{selected ? 'Selected' : 'Choose'}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function QuizThemePicker({
  themeId,
  select,
}: {
  themeId: QuizThemeId
  select(themeId: QuizThemeId): void
}) {
  return (
    <fieldset className="quiz-theme-picker">
      <legend>Quiz theme</legend>
      <p>Applied to presentation and player game screens. Save the quiz to keep this change.</p>
      <div className="quiz-theme-grid">
        {quizThemes.map((theme) => {
          const selected = theme.id === themeId
          return (
            <button
              key={theme.id}
              className="quiz-theme-option"
              type="button"
              aria-pressed={selected}
              onClick={() => select(theme.id)}
            >
              <span className="quiz-theme-option__swatches" aria-hidden="true">
                {theme.swatches.map((colour) => <i key={colour} style={{ backgroundColor: colour }} />)}
              </span>
              <span className="quiz-theme-option__copy">
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </span>
              <span className="quiz-theme-option__state">{selected ? 'Selected' : 'Choose'}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function QuizCover({
  coverImagePath,
  uploading,
  upload,
  remove,
}: {
  coverImagePath: string | null
  uploading: boolean
  upload(file: File | undefined): Promise<void>
  remove(): void
}) {
  const actionLabel = coverImagePath ? 'Replace cover' : 'Choose cover'
  const fallback = <div className="quiz-cover-editor__fallback">No cover selected</div>

  return (
    <section className="quiz-cover-editor" aria-labelledby="quiz-cover-heading">
      <h2 id="quiz-cover-heading">Quiz cover</h2>
      <div className="quiz-cover-editor__preview">
        {coverImagePath ? (
          <StoredImage reference={coverImagePath} alt="" fallback={fallback} loadingFallback={fallback} />
        ) : fallback}
      </div>
      <div className="quiz-cover-editor__actions">
        <label className="button button--secondary">
          {uploading ? 'Uploading…' : actionLabel}
          <input
            className="sr-only"
            type="file"
            accept={KATWED_IMAGE_ACCEPT}
            aria-label={actionLabel}
            disabled={uploading}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </label>
        {coverImagePath && (
          <button className="button button--ghost" type="button" disabled={uploading} onClick={remove}>
            Remove cover
          </button>
        )}
      </div>
      <p className="quiz-cover-editor__note">Shown in your quiz library only. Save the quiz to keep this change.</p>
    </section>
  )
}

function MediaSettings({ question, update, upload }: { question: Question; update(updater: (question: Question) => Question): void; upload(file: File | undefined): Promise<void> }) {
  const setMedia = (type: Media['type']) => {
    if (type === 'none') update((current) => current.type === 'pinpoint' || current.type === 'mashup' ? current : { ...current, media: { type: 'none' } })
    if (type === 'image') update((current) => ({ ...current, media: { type: 'image', path: '', altText: 'Question image', revealEffect: 'immediate', revealDurationSeconds: 0 } }))
    if (type === 'youtube') update((current) => current.type === 'pinpoint' || current.type === 'mashup' ? current : { ...current, media: { type: 'youtube', videoId: '' }, mediaVisibility: 'presentation' })
  }
  return <fieldset><legend>Media</legend>
    <label><span>Type</span><select value={question.media.type} disabled={question.type === 'pinpoint' || question.type === 'mashup'} onChange={(event) => setMedia(event.target.value as Media['type'])}><option value="none">None</option><option value="image">Uploaded image</option><option value="youtube">YouTube</option></select></label>
    {question.media.type === 'image' && <>
      <label className="button button--secondary">Choose image<input className="sr-only" type="file" accept={KATWED_IMAGE_ACCEPT} onChange={(event) => void upload(event.target.files?.[0])} /></label>
      <label><span>Alt text</span><input value={question.media.altText} onChange={(event) => update((current) => current.media.type === 'image' ? { ...current, media: { ...current.media, altText: event.target.value } } : current)} /></label>
      <label><span>Reveal effect</span><select value={question.media.revealEffect} onChange={(event) => update((current) => {
        if (current.media.type !== 'image') return current
        const revealEffect = event.target.value as Extract<Media, { type: 'image' }>['revealEffect']
        const media = revealEffect === 'tiles'
          ? { ...current.media, revealEffect, tileGridSize: current.media.revealEffect === 'tiles' ? current.media.tileGridSize : 8 as const }
          : {
              type: 'image' as const,
              path: current.media.path,
              altText: current.media.altText,
              revealEffect,
              revealDurationSeconds: current.media.revealDurationSeconds,
            }
        return { ...current, media }
      })}><option value="immediate">Immediate</option><option value="blur">Blur to clear</option><option value="pixelate">Pixelated to clear</option><option value="tiles">Tile uncover</option><option value="zoom-out">Zoom out</option></select></label>
      {question.media.revealEffect === 'tiles' && <label><span>Tile grid</span><select aria-label="Tile grid" value={question.media.tileGridSize ?? ''} onChange={(event) => update((current) => current.media.type === 'image' && current.media.revealEffect === 'tiles' ? { ...current, media: { ...current.media, tileGridSize: Number(event.target.value) as 6 | 8 | 12 | 16 } } : current)}>
        {question.media.tileGridSize === undefined && <option value="">Legacy 6 x 4 - 24 tiles</option>}
        <option value="6">6 x 6 - 36 tiles</option><option value="8">8 x 8 - 64 tiles</option><option value="12">12 x 12 - 144 tiles</option><option value="16">16 x 16 - 256 tiles</option>
      </select></label>}
      <label><span>Reveal duration</span><input type="number" min="0" max="180" value={question.media.revealDurationSeconds} onChange={(event) => update((current) => current.media.type === 'image' ? { ...current, media: { ...current.media, revealDurationSeconds: number(event.target.value) } } : current)} /></label>
    </>}
    {question.media.type === 'youtube' && <>
      <label><span>YouTube URL or video ID</span><input value={question.media.videoId} onChange={(event) => {
        const videoId = normaliseYouTubeVideoId(event.target.value) ?? event.target.value.trim()
        update((current) => {
          if (current.type === 'pinpoint' || current.type === 'mashup' || current.media.type !== 'youtube') return current
          return { ...current, media: { ...current.media, videoId } }
        })
      }} /></label>
      <div className="two-columns">
        <label><span>Start seconds</span><input type="number" min="0" value={question.media.startSeconds ?? ''} onChange={(event) => update((current) => {
          if (current.type === 'pinpoint' || current.type === 'mashup' || current.media.type !== 'youtube') return current
          return { ...current, media: { ...current.media, startSeconds: event.target.value === '' ? undefined : number(event.target.value) } }
        })} /></label>
        <label><span>End seconds</span><input type="number" min="0" value={question.media.endSeconds ?? ''} onChange={(event) => update((current) => {
          if (current.type === 'pinpoint' || current.type === 'mashup' || current.media.type !== 'youtube') return current
          return { ...current, media: { ...current.media, endSeconds: event.target.value === '' ? undefined : number(event.target.value) } }
        })} /></label>
      </div>
    </>}
  </fieldset>
}

function TypeSettings({ question, roster, update }: { question: Question; roster: RosterMember[]; update(updater: (question: Question) => Question): void }) {
  if (question.type === 'single-choice' || question.type === 'multiple-select') {
    const toggleCorrect = (id: string) => update((current) => {
      if (current.type === 'single-choice') return { ...current, correctOptionId: id }
      if (current.type === 'multiple-select') return { ...current, correctOptionIds: current.correctOptionIds.includes(id) ? current.correctOptionIds.filter((value) => value !== id) : [...current.correctOptionIds, id] }
      return current
    })
    return <fieldset><legend>Answer options</legend>{question.options.map((option) => <div className="option-editor" key={option.id}><input type={question.type === 'single-choice' ? 'radio' : 'checkbox'} name={`correct-${question.id}`} checked={question.type === 'single-choice' ? question.correctOptionId === option.id : question.correctOptionIds.includes(option.id)} aria-label={`Mark ${option.label} correct`} onChange={() => toggleCorrect(option.id)} /><div><input value={option.label} aria-label="Option label" onChange={(event) => update((current) => 'options' in current ? { ...current, options: current.options.map((candidate) => candidate.id === option.id ? { ...candidate, label: event.target.value } : candidate) } : current)} /><input value={option.imagePath ?? ''} aria-label="Option image path" placeholder="Optional uploaded image path" onChange={(event) => update((current) => 'options' in current ? { ...current, options: current.options.map((candidate) => candidate.id === option.id ? { ...candidate, imagePath: event.target.value || undefined } : candidate) } : current)} /></div><button type="button" onClick={() => update((current) => 'options' in current ? { ...current, options: current.options.filter((candidate) => candidate.id !== option.id) } : current)}>Remove</button></div>)}<button type="button" className="button button--secondary" disabled={question.options.length >= 8} onClick={() => update((current) => 'options' in current ? { ...current, options: [...current.options, { id: crypto.randomUUID(), label: `Option ${current.options.length + 1}` } as ChoiceOption] } : current)}>Add option</button>
      {question.type === 'multiple-select' && <><div className="two-columns"><label><span>Minimum</span><input type="number" min="1" value={question.minimumSelections} onChange={(event) => update((current) => current.type === 'multiple-select' ? { ...current, minimumSelections: number(event.target.value) } : current)} /></label><label><span>Maximum</span><input type="number" min="1" value={question.maximumSelections} onChange={(event) => update((current) => current.type === 'multiple-select' ? { ...current, maximumSelections: number(event.target.value) } : current)} /></label></div><label><span>Scoring</span><select value={question.scoringMode} onChange={(event) => update((current) => current.type === 'multiple-select' ? { ...current, scoringMode: event.target.value as 'exact' | 'partial-wipeout' } : current)}><option value="exact">Exact set</option><option value="partial-wipeout">Partial, wrong answer wipes out</option></select></label></>}
    </fieldset>
  }
  if (question.type === 'true-false') return <label><span>Correct answer</span><select value={String(question.correctValue)} onChange={(event) => update((current) => current.type === 'true-false' ? { ...current, correctValue: event.target.value === 'true' } : current)}><option value="true">True</option><option value="false">False</option></select></label>
  if (question.type === 'slider') return <fieldset><legend>Slider answer</legend>{(['minimum', 'maximum', 'step', 'correctValue', 'tolerance'] as const).map((field) => <label key={field}><span>{field}</span><input type="number" value={question[field]} onChange={(event) => update((current) => current.type === 'slider' ? { ...current, [field]: number(event.target.value) } : current)} /></label>)}</fieldset>
  if (question.type === 'pinpoint') return <fieldset><legend>Target</legend>{(['targetX', 'targetY', 'targetRadius'] as const).map((field) => <label key={field}><span>{field}</span><input type="number" min="0" max="1" step="0.01" value={question[field]} onChange={(event) => update((current) => current.type === 'pinpoint' ? { ...current, [field]: number(event.target.value) } : current)} /></label>)}</fieldset>
  if (question.type === 'typed-answer') return <fieldset><legend>Typed answer</legend>
    <label><span>Primary answer</span><input maxLength={MAX_TYPED_ANSWER_LENGTH} value={question.correctAnswer} onChange={(event) => update((current) => current.type === 'typed-answer' ? { ...current, correctAnswer: event.target.value } : current)} /></label>
    <label><span>Also accept</span><textarea key={question.id} rows={6} defaultValue={question.acceptedAnswers.join('\n')} placeholder="One alternative per line" onChange={(event) => update((current) => current.type === 'typed-answer' ? { ...current, acceptedAnswers: parseTypedAnswerAlternatives(event.target.value) } : current)} /></label>
    <p className="settings-note">Matching ignores capitals, spaces and punctuation. Add up to 19 alternatives, one per line. The primary answer is shown on reveal; alternatives stay hidden.</p>
  </fieldset>
  return <fieldset><legend>Correct people</legend>{[0, 1].map((index) => <label key={index}><span>Person {index + 1}</span><select value={question.correctMemberIds[index]} onChange={(event) => update((current) => current.type === 'mashup' ? { ...current, correctMemberIds: index === 0 ? [event.target.value, current.correctMemberIds[1]] : [current.correctMemberIds[0], event.target.value] } : current)}><option value="">Choose…</option>{roster.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>)}</fieldset>
}

function PeopleBank({ quiz, update }: { quiz: Quiz; update(updater: (quiz: Quiz) => Quiz): void }) {
  return <details className="people-bank"><summary>People bank ({quiz.roster.length})</summary>{quiz.roster.map((member) => <div className="option-editor" key={member.id}><input value={member.displayName} aria-label="Person name" onChange={(event) => update((current) => ({ ...current, roster: current.roster.map((candidate) => candidate.id === member.id ? { ...candidate, displayName: event.target.value } : candidate) }))} /><label><input type="checkbox" checked={member.active} onChange={(event) => update((current) => ({ ...current, roster: current.roster.map((candidate) => candidate.id === member.id ? { ...candidate, active: event.target.checked } : candidate) }))} /> Active</label></div>)}<button type="button" className="button button--secondary" onClick={() => {
    const member: RosterMember = { id: crypto.randomUUID(), quizId: quiz.id, displayName: `Person ${quiz.roster.length + 1}`, shortName: '', active: true, displayOrder: quiz.roster.length }
    update((current) => ({ ...current, roster: [...current.roster, member] }))
  }}>Add person</button></details>
}
