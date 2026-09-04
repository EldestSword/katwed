import { RoundNavigator } from '../features/quiz-editor/RoundNavigator'
import { canonicaliseRounds, moveQuestionToRound } from '../features/quiz-editor/rounds'
import { PinpointTargetEditor } from '../features/quiz-editor/PinpointTargetEditor'
import { PinpointSurface } from '../features/game/PinpointSurface'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { QuestionMedia } from '../components/QuestionMedia'
import { StoredImage } from '../components/StoredImage'
import { StatusMessage } from '../components/StatusMessage'
import { validateQuestion, validateQuizSave } from '../features/quiz-editor/validation'
import { createQuestion } from '../features/questions/factories'
import { questionTypes, questionTypeRegistry } from '../features/questions/registry'
import { quizThemes } from '../features/themes/quizThemes'
import { ThemeBrowser } from '../features/themes/ThemeBrowser'
import {
  backgroundsForTheme,
  normaliseQuizBackgroundId,
} from '../features/themes/quizBackgrounds'
import { quizThemeSurfaceProps } from '../features/themes/quizThemeSurface'
import { createHeadToHeadCompetitors, nextHeadToHeadAssignment } from '../features/head-to-head/headToHead'
import { MAX_TYPED_ANSWER_LENGTH, parseTypedAnswerAlternatives } from '../features/typed-answer/typedAnswer'
import { ArrangementEditor } from '../features/quiz-editor/ArrangementEditor'
import { remapArrangementItems, shuffledTextItems } from '../features/questions/arrangementQuestions'
import { ArrangementPrompt } from '../features/game/ArrangementResult'
import { KATWED_IMAGE_ACCEPT, uploadQuestionImage, uploadQuizCover } from '../services/questionImages'
import { repository } from '../services/repository'
import type {
  AnswerColourTuple,
  AnswerPaletteId,
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
import {
  CLASSIC_ANSWER_COLOURS,
  answerColourStyle,
  answerPalettes,
  isAnswerColourTuple,
  resolveAnswerColours,
} from '../features/answer-palettes/answerPalettes'
import { normaliseHexColour } from '../features/answer-palettes/colourContrast'
import { orderedQuestionOptions } from '../features/questions/optionOrdering'
import { answerTextDensity, hasExtraLongAnswer, questionTextDensity } from '../features/game/liveQuestionTypography'

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
  const [quizSettingsOpen, setQuizSettingsOpen] = useState(false)
  const [addRoundId, setAddRoundId] = useState('')
  const [addQuestionOpen, setAddQuestionOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<'presentation' | 'player'>('presentation')
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const navigate = useNavigate()
  const blocker = useBlocker(dirty)
  const closeQuizSettings = useCallback(() => setQuizSettingsOpen(false), [])

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
    setQuiz((current) => current ? canonicaliseRounds(updater(current)) : current)
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
      roundId: quiz.rounds.find((round) => round.id === addRoundId)?.id || selected?.roundId || quiz.rounds[0].id,
      assignedCompetitorId: nextHeadToHeadAssignment(quiz),
    }
    update((current) => ({ ...current, questions: [...current.questions, question] }))
    setSelectedId(question.id)
    setAddQuestionOpen(false)
    setAddRoundId('')
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
      rounds: quiz.rounds,
      headToHeadCompetitors: quiz.headToHeadCompetitors.map((competitor) => ({
        ...competitor,
        displayName: competitor.displayName.trim(),
      })),
      coverImagePath: quiz.coverImagePath,
      themeId: quiz.themeId,
      backgroundId: quiz.backgroundId,
      answerPaletteId: quiz.answerPaletteId,
      customAnswerColours: quiz.customAnswerColours,
      soundPackId: quiz.soundPackId,
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
      roundId: selected.roundId,
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
      if (quiz.rounds.length !== 1) { setMessage({ tone: 'error', text: 'Head-to-Head supports one round. Move your questions into one round and delete the empty rounds first.' }); return }
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

  return (
    <main className="editor-page editor-page--three-panel">
      <header className="editor-toolbar">
        <div className="editor-toolbar__identity"><Link className="text-link" to="/host">← Quizzes</Link><input className="title-input" aria-label="Quiz title" value={quiz.title} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} /></div>
        <div className="heading-actions"><span className={`save-state${dirty ? ' save-state--dirty' : ''}`} role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="button button--secondary" type="button" onClick={() => setQuizSettingsOpen(true)}>Quiz settings</button><button className="button button--primary" type="button" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Saving…' : 'Save quiz'}</button></div>
      </header>
      {message && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      <div className="editor-workspace">
        <RoundNavigator quiz={quiz} selectedId={selectedId} select={setSelectedId} update={update} addQuestion={(roundId) => { setAddRoundId(roundId); setAddQuestionOpen(true) }} />

        <section className="editor-preview">
          {selected ? <>
            <div className="preview-tabs" role="tablist" aria-label="Preview mode"><button type="button" role="tab" aria-selected={previewMode === 'presentation'} onClick={() => setPreviewMode('presentation')}>Presentation</button><button type="button" role="tab" aria-selected={previewMode === 'player'} onClick={() => setPreviewMode('player')}>Player</button></div>
            <div className={`preview-frame preview-frame--${previewMode}`}>
            <article
              className="question-preview-card quiz-themed-surface"
              data-preview-audience={previewMode}
              data-question-density={questionTextDensity(selected.prompt, previewShowsMedia(selected, previewMode))}
              {...quizThemeSurfaceProps(quiz.themeId, quiz.backgroundId)}
              aria-label={`${quizThemes.find((theme) => theme.id === quiz.themeId)?.name ?? 'Katwed!'} theme preview`}
            ><p className="eyebrow">{questionTypeRegistry[selected.type].name}</p><h1>{selected.prompt}</h1>{selected.supportingText && <p>{selected.supportingText}</p>}{previewShowsMedia(selected, previewMode) && <div className="editor-preview__media">{selected.type === 'pinpoint' ? <PinpointSurface path={selected.media.path} alt={selected.media.altText} mode="author" target={selected.target} allowEnlarge={false} /> : <QuestionMedia media={selected.media} openedAt={new Date().toISOString()} allowEnlarge={false} />}</div>}<EditorAnswerPreview question={selected} previewMode={previewMode} answerPaletteId={quiz.answerPaletteId} customAnswerColours={quiz.customAnswerColours} /></article>
            </div>
            <div className="heading-actions">
              <button className="button button--secondary" type="button" onClick={() => {
                let duplicate = structuredClone(selected)
                duplicate.id = crypto.randomUUID()
                duplicate.displayOrder = quiz.questions.length
                if (duplicate.type === 'ordering' || duplicate.type === 'matching') duplicate = remapArrangementItems(duplicate)
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
          </> : <div className="empty-card"><span className="empty-card__motif" aria-hidden="true">+</span><h2>Add your first question</h2><p>Choose from nine question formats.</p><button className="button button--primary" type="button" onClick={() => setAddQuestionOpen(true)}>Add question</button></div>}
        </section>

        <aside className="question-settings">
          {selected && <>
            <h2 className="sr-only">Question settings</h2><div className="question-settings__heading"><p className="eyebrow">Selected question</p><h2>Question {quiz.questions.findIndex((item) => item.id === selected.id) + 1}</h2><span>{questionTypeRegistry[selected.type].name}</span></div>
            <details className="question-settings-group" open><summary>Question</summary><div>
              <label><span>Type</span><select value={selected.type} onChange={(event) => changeType(event.target.value as QuestionType)}>{questionTypes.map((item) => <option key={item.type} value={item.type}>{item.name}</option>)}</select></label>
              {quiz.quizType === 'standard' && <label><span>Round</span><select value={selected.roundId} onChange={(event) => update((current) => moveQuestionToRound(current, selected.id, event.target.value))}>{quiz.rounds.map((round) => <option key={round.id} value={round.id}>{round.title}</option>)}</select></label>}
              <label><span>Prompt</span><textarea rows={3} value={selected.prompt} onChange={(event) => updateQuestion((question) => ({ ...question, prompt: event.target.value }))} /></label>
              <label><span>Supporting text</span><textarea rows={2} value={selected.supportingText} onChange={(event) => updateQuestion((question) => ({ ...question, supportingText: event.target.value }))} /></label>
              {quiz.quizType === 'head-to-head' && <QuestionCompetitorPicker question={selected} competitors={quiz.headToHeadCompetitors} select={(assignedCompetitorId) => updateQuestion((question) => ({ ...question, assignedCompetitorId }))} />}
              <label><span>Timer</span><input type="number" min="5" max="300" value={selected.timeLimitSeconds} onChange={(event) => updateQuestion((question) => ({ ...question, timeLimitSeconds: number(event.target.value) }))} /></label>
            </div></details>
            <details className="question-settings-group" open><summary>Answers</summary><div><TypeSettings question={selected} roster={quiz.roster} update={updateQuestion} /></div></details>
            <details className="question-settings-group"><summary>Scoring</summary><div>
              {quiz.quizType === 'standard' ? <>
                <label><span>Maximum points</span><input type="number" min="1" value={selected.points} onChange={(event) => updateQuestion((question) => ({ ...question, points: number(event.target.value) }))} /></label>
                <fieldset className="standard-scoring-settings"><legend>Standard scoring</legend>
                  <label><input type="checkbox" checked={selected.speedScoringEnabled} onChange={(event) => updateQuestion((question) => ({ ...question, speedScoringEnabled: event.target.checked }))} /> Faster answers score more</label>
                  <p className="settings-note">Correct answers earn between 100% and 50% of the available points as the timer runs down.</p>
                  <label><input type="checkbox" checked={selected.doubleScore} onChange={(event) => updateQuestion((question) => ({ ...question, doubleScore: event.target.checked }))} /> Double score</label>
                  {selected.doubleScore && <p className="settings-note">Worth up to {(selected.points * 2).toLocaleString('en-GB')} points.</p>}
                </fieldset>
              </> : <p className="settings-note">Head-to-Head uses 1 point for a correct assigned answer. Standard point values are ignored.</p>}
            </div></details>
            <details className="question-settings-group"><summary>Media &amp; presentation</summary><div>
              <MediaSettings question={selected} update={updateQuestion} upload={upload} />
              <label><span>Media visibility</span><select value={selected.mediaVisibility} onChange={(event) => updateQuestion((question) => ({ ...question, mediaVisibility: event.target.value as Question['mediaVisibility'] }))}><option value="presentation">Presentation only</option><option value="players">Player devices only</option><option value="both">Both</option></select></label>
              <label><span>Choices on presentation</span><select value={selected.presentationChoiceVisibility} onChange={(event) => updateQuestion((question) => ({ ...question, presentationChoiceVisibility: event.target.value as Question['presentationChoiceVisibility'] }))}><option value="show">Show choices</option><option value="hide">Hide choices</option><option value="after-lock">Reveal after answers close</option></select></label>
              <label><span>Reveal caption</span><textarea rows={2} value={selected.revealCaption} onChange={(event) => updateQuestion((question) => ({ ...question, revealCaption: event.target.value }))} /></label>
            </div></details>
            {validation && !validation.valid && <ul className="validation-list">{validation.messages.map((item) => <li key={item}>{item}</li>)}</ul>}
          </>}
          <PeopleBank quiz={quiz} update={update} />
        </aside>
      </div>
      {quizSettingsOpen && <QuizSettingsDialog quiz={quiz} update={update} close={closeQuizSettings} changeQuizType={changeQuizType} coverUploading={coverUploading} uploadCover={uploadCover} />}
      {addQuestionOpen && <AddQuestionDialog close={() => setAddQuestionOpen(false)} add={addQuestion} />}
      <footer className="editor-footer"><button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}>Save quiz</button><button className="button button--secondary" type="button" onClick={() => void navigate('/host')}>Back to dashboard</button></footer>
    </main>
  )
}

function AddQuestionDialog({ close, add }: { close(): void; add(type: QuestionType): void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.querySelector<HTMLButtonElement>('.question-type-dialog__grid button')?.focus()
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [close])
  return createPortal(<div className="quiz-settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <div className="question-type-dialog" role="dialog" aria-modal="true" aria-labelledby="add-question-heading" ref={root}>
      <header><div><p className="eyebrow">Question library</p><h1 id="add-question-heading">Add question</h1><p>Pick a format. You can change it later.</p></div><button className="button button--ghost" type="button" onClick={close} aria-label="Close add question">Close</button></header>
      <div className="question-type-dialog__grid">{questionTypes.map((definition) => <button key={definition.type} type="button" onClick={() => add(definition.type)}><span aria-hidden="true">{definition.icon}</span><strong>{definition.name}</strong><small>{definition.description}</small><i aria-hidden="true">→</i></button>)}</div>
    </div>
  </div>, document.body)
}

function QuizSettingsDialog({
  quiz,
  update,
  close,
  changeQuizType,
  coverUploading,
  uploadCover,
}: {
  quiz: Quiz
  update(updater: (quiz: Quiz) => Quiz): void
  close(): void
  changeQuizType(quizType: QuizType): void
  coverUploading: boolean
  uploadCover(file: File | undefined): Promise<void>
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState<'game' | 'appearance' | 'colours'>('game')

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = dialog.current
    root?.querySelector<HTMLButtonElement>('.quiz-settings-dialog__close')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !root) return
      const focusable = [...root.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, summary, [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [close])

  return createPortal(
    <div className="quiz-settings-overlay">
      <div className="quiz-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-settings-heading" ref={dialog}>
        <header>
          <div><p className="eyebrow">Quiz-wide configuration</p><h1 id="quiz-settings-heading">Quiz settings</h1></div>
          <button className="button button--secondary quiz-settings-dialog__close" type="button" onClick={close}>Close</button>
        </header>
        <p className="quiz-settings-dialog__intro">Configure the whole quiz. Changes remain in this draft until you save.</p>
        <div className="quiz-settings-layout">
          <nav className="quiz-settings-nav" aria-label="Quiz settings sections">
            <button type="button" aria-current={section === 'game' ? 'page' : undefined} onClick={() => setSection('game')}><strong>Game</strong><span>Mode and competitors</span></button>
            <button type="button" aria-current={section === 'appearance' ? 'page' : undefined} onClick={() => setSection('appearance')}><strong>Appearance</strong><span>Theme, background and cover</span></button>
            <button type="button" aria-current={section === 'colours' ? 'page' : undefined} onClick={() => setSection('colours')}><strong>Answer colours</strong><span>Palette and custom colours</span></button>
          </nav>
          <div className="quiz-settings-content">
        {section === 'game' && <section className="quiz-settings-section" aria-labelledby="settings-game-heading">
          <header><p className="eyebrow">Game</p><h2 id="settings-game-heading">Choose how this quiz plays</h2></header>
          <div><QuizTypePicker quizType={quiz.quizType} select={changeQuizType} />
            {quiz.quizType === 'head-to-head' && <HeadToHeadSetup quiz={quiz} update={update} />}
          </div>
        </section>}
        {section === 'appearance' && <section className="quiz-settings-section" aria-labelledby="settings-appearance-heading">
          <header><p className="eyebrow">Appearance</p><h2 id="settings-appearance-heading">Define the quiz identity</h2></header>
          <div>
            <QuizThemePicker themeId={quiz.themeId} select={(themeId) => update((current) => ({
              ...current,
              themeId,
              backgroundId: normaliseQuizBackgroundId(current.backgroundId, themeId),
            }))} />
            <QuizBackgroundPicker themeId={quiz.themeId} backgroundId={quiz.backgroundId} select={(backgroundId) => update((current) => ({ ...current, backgroundId }))} />
            <QuizCover coverImagePath={quiz.coverImagePath} uploading={coverUploading} upload={uploadCover} remove={() => update((current) => ({ ...current, coverImagePath: null }))} />
          </div>
        </section>}
        {section === 'colours' && <section className="quiz-settings-section" aria-labelledby="settings-colours-heading">
          <header><p className="eyebrow">Answer colours</p><h2 id="settings-colours-heading">Choose the contestant palette</h2></header>
          <div><AnswerPalettePicker quiz={quiz} update={update} /></div>
        </section>}
          </div>
        </div>
        <footer><button className="button button--primary" type="button" onClick={close}>Done</button></footer>
      </div>
    </div>,
    document.body,
  )
}

function AnswerPalettePicker({ quiz, update }: { quiz: Quiz; update(updater: (quiz: Quiz) => Quiz): void }) {
  const colours = resolveAnswerColours(quiz.answerPaletteId, quiz.customAnswerColours)
  const setCustomColour = (position: number, value: string) => update((current) => {
    const customAnswerColours = [...current.customAnswerColours]
    customAnswerColours[position] = value
    return { ...current, customAnswerColours: customAnswerColours as unknown as AnswerColourTuple }
  })

  return (
    <fieldset className="answer-palette-picker">
      <legend>Answer palette</legend>
      <p>Colours follow the final answer position, including after randomisation.</p>
      <div className="answer-palette-grid">
        {[...answerPalettes, { id: 'custom' as const, name: 'Custom', description: 'Choose all eight answer colours.', colours: quiz.customAnswerColours }].map((palette) => (
          <button key={palette.id} type="button" aria-pressed={quiz.answerPaletteId === palette.id} onClick={() => update((current) => ({ ...current, answerPaletteId: palette.id }))}>
            <span className="answer-palette-swatches" aria-hidden="true">{palette.colours.slice(0, 4).map((colour, index) => <i key={`${colour}-${index}`} style={{ backgroundColor: normaliseHexColour(colour) ?? '#000000' }} />)}</span>
            <span><strong>{palette.name}</strong><small>{palette.description}</small></span>
            <em>{quiz.answerPaletteId === palette.id ? 'Selected' : 'Choose'}</em>
          </button>
        ))}
      </div>
      <div className="answer-palette-preview" aria-label="Answer palette preview">
        {colours.slice(0, 8).map((colour, index) => <span key={`${colour}-${index}`} style={answerColourStyle(colours, index)}>{index + 1}</span>)}
      </div>
      {quiz.answerPaletteId === 'custom' && <div className="custom-answer-colours">
        <h3>Primary colours</h3>
        <div className="custom-answer-colour-grid">{quiz.customAnswerColours.slice(0, 4).map((colour, index) => <CustomColourControl key={index} colour={colour} position={index} update={setCustomColour} />)}</div>
        <details><summary>Additional colours 5–8</summary><div className="custom-answer-colour-grid">{quiz.customAnswerColours.slice(4).map((colour, index) => <CustomColourControl key={index + 4} colour={colour} position={index + 4} update={setCustomColour} />)}</div></details>
        {!isAnswerColourTuple(quiz.customAnswerColours) && <StatusMessage tone="error">Use a six-digit hexadecimal value for every custom colour before saving.</StatusMessage>}
        <button className="button button--secondary" type="button" onClick={() => update((current) => ({ ...current, answerPaletteId: 'classic', customAnswerColours: [...CLASSIC_ANSWER_COLOURS] as AnswerColourTuple }))}>Reset to Classic</button>
      </div>}
    </fieldset>
  )
}

function CustomColourControl({ colour, position, update }: { colour: string; position: number; update(position: number, colour: string): void }) {
  const valid = normaliseHexColour(colour)
  return <label className="custom-answer-colour"><span>Colour {position + 1}</span><span className="custom-answer-colour__inputs">
    <input type="color" aria-label={`Colour ${position + 1} picker`} value={valid ?? '#000000'} onChange={(event) => update(position, event.target.value.toUpperCase())} />
    <input aria-label={`Colour ${position + 1} hex`} aria-invalid={!valid} value={colour} maxLength={7} onChange={(event) => update(position, event.target.value.toUpperCase())} />
    <i aria-hidden="true" style={valid ? answerColourStyle([valid], 0) : undefined}>{position + 1}</i>
  </span></label>
}

function previewShowsMedia(question: Question, previewMode: 'presentation' | 'player'): boolean {
  if (question.media.type === 'none') return false
  return question.mediaVisibility === 'both' || question.mediaVisibility === (previewMode === 'presentation' ? 'presentation' : 'players')
}

function EditorAnswerPreview({
  question,
  previewMode,
  answerPaletteId,
  customAnswerColours,
}: {
  question: Question
  previewMode: 'presentation' | 'player'
  answerPaletteId: AnswerPaletteId
  customAnswerColours: AnswerColourTuple
}) {
  const colours = resolveAnswerColours(answerPaletteId, customAnswerColours)
  if (question.type === 'ordering') return <ArrangementPrompt question={{ ...question, items: shuffledTextItems(question.items, `${question.id}:ordering`), questionNumber: 1, totalQuestions: 1 }} />
  if (question.type === 'matching') return <ArrangementPrompt question={{ ...question, leftItems: shuffledTextItems(question.leftItems, `${question.id}:left`), rightItems: shuffledTextItems(question.rightItems, `${question.id}:right`), questionNumber: 1, totalQuestions: 1 }} />
  const options = question.type === 'single-choice' || question.type === 'multiple-select'
    ? orderedQuestionOptions(question)
    : question.type === 'true-false'
      ? [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }]
      : []

  if (options.length > 0) {
    const choicesHidden = previewMode === 'presentation' && question.presentationChoiceVisibility !== 'show'
    if (choicesHidden) return <p className="editor-preview__context">Choices are hidden on the Presentation during the question.</p>
    return <div className="editor-answer-preview" aria-label="Answer colour preview" data-option-count={options.length} data-has-extra-long-answer={hasExtraLongAnswer(options.map((option) => option.label)) || undefined}>{options.map((option, position) => <span className="answer-colour-tile" data-answer-density={answerTextDensity(option.label)} data-option-id={option.id} style={answerColourStyle(colours, position)} key={option.id}>{option.label}</span>)}</div>
  }

  const context = question.type === 'slider'
    ? `Range from ${question.minimum} to ${question.maximum}`
    : question.type === 'typed-answer'
      ? 'Players type their answer'
      : question.type === 'pinpoint'
        ? 'Players tap the correct place on the image'
        : 'Players select two people on their device'
  return <p className="editor-preview__context">{context}</p>
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
            {...quizThemeSurfaceProps(themeId)}
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
                <img src={background.assetPath} alt="" loading="lazy" />
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
  return <ThemeBrowser selectedId={themeId} onSelect={select} />
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
      <label><input type="checkbox" checked={question.randomiseOptions} onChange={(event) => update((current) => current.type === 'single-choice' || current.type === 'multiple-select' ? { ...current, randomiseOptions: event.target.checked } : current)} /> Randomise options</label>
      {question.type === 'multiple-select' && <><div className="two-columns"><label><span>Minimum</span><input type="number" min="1" value={question.minimumSelections} onChange={(event) => update((current) => current.type === 'multiple-select' ? { ...current, minimumSelections: number(event.target.value) } : current)} /></label><label><span>Maximum</span><input type="number" min="1" value={question.maximumSelections} onChange={(event) => update((current) => current.type === 'multiple-select' ? { ...current, maximumSelections: number(event.target.value) } : current)} /></label></div><label><span>Scoring</span><select value={question.scoringMode} onChange={(event) => update((current) => current.type === 'multiple-select' ? { ...current, scoringMode: event.target.value as 'exact' | 'partial-wipeout' } : current)}><option value="exact">Exact set</option><option value="partial-wipeout">Partial, wrong answer wipes out</option></select></label></>}
    </fieldset>
  }
  if (question.type === 'ordering' || question.type === 'matching') return <ArrangementEditor question={question} onChange={(next) => update(() => next)} />
  if (question.type === 'true-false') return <label><span>Correct answer</span><select value={String(question.correctValue)} onChange={(event) => update((current) => current.type === 'true-false' ? { ...current, correctValue: event.target.value === 'true' } : current)}><option value="true">True</option><option value="false">False</option></select></label>
  if (question.type === 'slider') return <fieldset><legend>Slider answer</legend>{(['minimum', 'maximum', 'step', 'correctValue', 'tolerance'] as const).map((field) => <label key={field}><span>{field}</span><input type="number" value={question[field]} onChange={(event) => update((current) => current.type === 'slider' ? { ...current, [field]: number(event.target.value) } : current)} /></label>)}</fieldset>
  if (question.type === 'pinpoint') return <PinpointTargetEditor key={question.id + question.media.path} question={question} onChange={(target) => update((current) => current.type === 'pinpoint' ? { ...current, target } : current)} />
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
