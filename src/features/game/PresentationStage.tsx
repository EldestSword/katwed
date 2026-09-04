import type { CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Logo } from '../../components/AppShell'
import { AnimatedLeaderboard } from '../../components/AnimatedLeaderboard'
import { QuestionMedia } from '../../components/QuestionMedia'
import { AnswerTile } from '../../components/design-system/AnswerTile'
import { GameBadge } from '../../components/design-system/GameBadge'
import { GameTimer } from '../../components/design-system/GameTimer'
import { LobbyPlayerTile, QuestionProgressBadge, RevealAnswerTile, SubmissionStatus } from '../../components/design-system/LiveGamePrimitives'
import { useCountdown } from '../../hooks/useCountdown'
import { useQuestionPrelude } from '../../hooks/useQuestionPrelude'
import { useRevealedLeaderboard } from '../../hooks/useRevealedLeaderboard'
import { useFinalAwardsHistory } from '../../hooks/useFinalAwardsHistory'
import { competitionState, isTeamGame } from '../teams/teams'
import { TeamLobby } from '../teams/TeamLobby'
import { TeamFinalResults } from '../teams/TeamFinalResults'
import type { RevealPayload, SafeGameState, SafeQuestion } from '../../types/domain'
import { answerColourStyle, resolveAnswerColours } from '../answer-palettes/answerPalettes'
import { HeadToHeadResults } from '../head-to-head/HeadToHeadResults'
import { orderedQuestionOptions } from '../questions/optionOrdering'
import { quizThemeSurfaceProps } from '../themes/quizThemeSurface'
import { DoubleScoreBadge, DoubleScoreIntro } from './DoubleScoreIntro'
import { FinalResults, HeadToHeadFinal } from './FinalResults'
import { PinpointSurface } from './PinpointSurface'
import { RevealAnswerCard } from './RevealAnswerCard'
import { formatSliderValue } from './revealFormatting'
import { QuestionTypeIntro } from './QuestionTypeIntro'
import { questionTypeRegistry } from '../questions/registry'
import { ArrangementPrompt, ArrangementResult } from './ArrangementResult'
import { ConnectionClues } from './ConnectionClues'
import { answerTextDensity, hasExtraLongAnswer, questionTextDensity } from './liveQuestionTypography'

function choicesVisible(question: SafeQuestion, phase: SafeGameState['phase']): boolean {
  if (question.type === 'connections') return true
  return question.presentationChoiceVisibility === 'show' ||
    (question.presentationChoiceVisibility === 'after-lock' && phase !== 'question')
}

function questionComposition(question: SafeQuestion, showMedia: boolean, showChoices: boolean): string {
  if (question.type === 'pinpoint' || question.type === 'mashup') return 'media-focus'
  if (showMedia && showChoices) return 'media-and-answers'
  if (showMedia) return 'media-only'
  if (showChoices) return 'answers-only'
  return 'prompt-only'
}

function PresentationChoices({ question, phase, colours }: { question: SafeQuestion; phase: SafeGameState['phase']; colours: readonly string[] }) {
  if (question.type === 'connections') return <ConnectionClues question={question} />
  if (!choicesVisible(question, phase)) return null
  if (question.type === 'ordering' || question.type === 'matching') return <ArrangementPrompt question={question} />
  if (question.type === 'single-choice' || question.type === 'multiple-select') {
    const options = orderedQuestionOptions(question)
    return (
      <div className="presentation-options" data-option-count={options.length} data-has-extra-long-answer={hasExtraLongAnswer(options.map((option) => option.label)) || undefined}>
        {options.map((option, position) => <AnswerTile className="answer-colour-tile" style={answerColourStyle(colours, position)} optionId={option.id} position={position} label={option.label} textDensity={answerTextDensity(option.label)} key={option.id} />)}
      </div>
    )
  }
  if (question.type === 'true-false') {
    return (
      <div className="presentation-options presentation-options--boolean" data-option-count="2">
        <AnswerTile className="answer-colour-tile" style={answerColourStyle(colours, 0)} position={0} label="True" />
        <AnswerTile className="answer-colour-tile" style={answerColourStyle(colours, 1)} position={1} label="False" />
      </div>
    )
  }
  return null
}

function SliderContext({ question }: { question: Extract<SafeQuestion, { type: 'slider' }> }) {
  return (
    <div className="presentation-slider-context" aria-label={`Range from ${formatSliderValue(question.minimum, question)} to ${formatSliderValue(question.maximum, question)}`}>
      <span>{formatSliderValue(question.minimum, question)}</span><i aria-hidden="true" /><span>{formatSliderValue(question.maximum, question)}</span>
    </div>
  )
}

function RevealResult({ reveal, question, compact, colours }: { reveal: RevealPayload; question: SafeQuestion; compact: boolean; colours: readonly string[] }) {
  switch (reveal.type) {
    case 'connections': return <div className="connection-reveal">{question.type === 'connections' && <ConnectionClues question={question} reveal />}<RevealAnswerCard><p>What connects them?</p><h2>{reveal.correctAnswer}</h2></RevealAnswerCard></div>
    case 'ordering': return <ArrangementResult question={question} answer={{ type: 'ordering', itemIds: reveal.correctItemIds }} label="Correct order" />
    case 'matching': return <ArrangementResult question={question} answer={{ type: 'matching', pairs: reveal.correctPairs }} label="Correct pairs" />
    case 'single-choice': {
      const options = question.type === 'single-choice' ? orderedQuestionOptions(question) : []
      return <div className="presentation-reveal-grid" data-option-count={options.length}>{options.map((option, position) => <RevealAnswerTile label={option.label} position={position} optionId={option.id} style={answerColourStyle(colours, position)} correct={option.id === reveal.correctOptionId} responseCount={reveal.optionCounts[option.id] ?? 0} key={option.id} />)}</div>
    }
    case 'multiple-select': {
      const options = question.type === 'multiple-select' ? orderedQuestionOptions(question) : []
      return <div className="presentation-reveal-grid" data-option-count={options.length}>{options.map((option, position) => <RevealAnswerTile label={option.label} position={position} optionId={option.id} style={answerColourStyle(colours, position)} correct={reveal.correctOptionIds.includes(option.id)} responseCount={reveal.optionCounts[option.id] ?? 0} key={option.id} />)}</div>
    }
    case 'true-false':
      return <div className="presentation-reveal-grid presentation-reveal-grid--boolean" data-option-count="2">{[true, false].map((value, position) => <RevealAnswerTile label={value ? 'True' : 'False'} position={position} style={answerColourStyle(colours, position)} correct={value === reveal.correctValue} responseCount={value ? reveal.counts.true : reveal.counts.false} key={String(value)} />)}</div>
    case 'slider': {
      if (question.type !== 'slider') return <RevealAnswerCard><h2>{reveal.correctValue}</h2></RevealAnswerCard>
      const range = Math.max(1, question.maximum - question.minimum)
      const left = ((reveal.correctValue - reveal.tolerance - question.minimum) / range) * 100
      const width = (reveal.tolerance * 2 / range) * 100
      return (
        <RevealAnswerCard className="slider-reveal-card">
          <p>Correct value</p><h2>{formatSliderValue(reveal.correctValue, question)}</h2>
          <div className="slider-reveal-range" style={{ '--accepted-left': `${Math.max(0, left)}%`, '--accepted-width': `${Math.min(100, width)}%` } as CSSProperties} aria-hidden="true"><i /></div>
          <p>{reveal.tolerance > 0 ? `Accepted range: ${formatSliderValue(reveal.correctValue - reveal.tolerance, question)}–${formatSliderValue(reveal.correctValue + reveal.tolerance, question)}` : 'Exact value required'}</p>
        </RevealAnswerCard>
      )
    }
    case 'pinpoint':
      return question.type === 'pinpoint' ? (
        <div className="presentation-pinpoint-reveal">
          <PinpointSurface path={question.media.path} alt={question.media.altText} mode="presentation-reveal" markers={reveal.points.map((point) => ({ ...point, kind: 'response' as const, label: 'Player answer' }))} target={reveal.target} allowEnlarge={!compact} />
          <div className="pinpoint-legend" aria-label="Pinpoint answer legend"><span><i className="pinpoint-key pinpoint-key--response" />Player answers</span><span><i className="pinpoint-key pinpoint-key--target" />Correct area</span></div>
          <p className="sr-only">The correct target location has been displayed.</p>
        </div>
      ) : null
    case 'typed-answer':
      return <RevealAnswerCard className="typed-reveal-card"><p>Correct answer</p><h2>{reveal.correctAnswer}</h2></RevealAnswerCard>
    case 'mashup':
      return <RevealAnswerCard className="mashup-reveal-card"><p>Correct pair</p><h2><strong>{reveal.correctNames[0]}</strong><span>+</span><strong>{reveal.correctNames[1]}</strong></h2></RevealAnswerCard>
  }
}

function StageHeader({ question, compact, remaining, headToHead, showTimer = true }: { question: SafeQuestion; compact: boolean; remaining: number; headToHead: boolean; showTimer?: boolean }) {
  return (
    <header className="presentation-question__header">
      <div><QuestionProgressBadge questionNumber={question.questionNumber} totalQuestions={question.totalQuestions} compact={compact} />{!headToHead && question.doubleScore && <DoubleScoreBadge />}</div>
      {headToHead ? (
        <GameBadge tone="neutral" large={!compact}>Untimed</GameBadge>
      ) : showTimer ? (
        <GameTimer seconds={remaining} totalSeconds={question.timeLimitSeconds} compact={compact} />
      ) : (
        <GameBadge tone="success" large={!compact}>Revealed</GameBadge>
      )}
    </header>
  )
}

export function PresentationStage({ state, compact = false }: { state: SafeGameState; compact?: boolean }) {
  const teamMode = isTeamGame(state)
  const leaderboard = useRevealedLeaderboard(competitionState(state))
  const awardsBaseline = useFinalAwardsHistory(teamMode ? null : state)
  const remaining = useCountdown(state.questionClosesAt)
  const question = state.currentQuestion
  const headToHead = state.quizType === 'head-to-head'
  const configuredPrelude = state.questionPreludeKind ?? (question?.doubleScore ? 'double-score' : null)
  const activePrelude = useQuestionPrelude(configuredPrelude, state.questionOpenedAt)
  const competitors = state.headToHeadCompetitors ?? []
  const answerColours = resolveAnswerColours(state.answerPaletteId, state.customAnswerColours)
  const joinUrl = `${window.location.origin}/join?room=${state.roomCode}`
  const showMedia = Boolean(question && question.media.type !== 'none' && (question.mediaVisibility === 'presentation' || question.mediaVisibility === 'both'))
  const showChoices = Boolean(question && choicesVisible(question, state.phase))
  const composition = question ? questionComposition(question, showMedia, showChoices) : undefined
  const promptDensity = question ? questionTextDensity(question.prompt, showMedia) : undefined

  return (
    <section className={`presentation-stage quiz-themed-surface ${compact ? 'presentation-stage--compact' : ''}`} data-phase={state.phase} data-question-type={question?.type} data-composition={composition} {...quizThemeSurfaceProps(state.themeId, state.backgroundId)} aria-live={state.phase === 'leaderboard' ? 'off' : 'polite'}>
      {state.phase === 'lobby' && (
        <div className={`presentation-lobby ${headToHead ? 'presentation-lobby--head-to-head' : ''}`}>
          <header className="presentation-lobby__brand"><Logo /><GameBadge tone="accent">Lobby</GameBadge></header>
          <div className="presentation-lobby__join">
            <p className="eyebrow">The show is about to start</p><h1>{state.quizTitle}</h1><p className="presentation-lobby__instruction">Join the game</p>
            <strong className="presentation-room-code" aria-label={`Room code ${state.roomCode}`}>{state.roomCode}</strong>
            <div className="presentation-lobby__join-tools"><div className="presentation-qr-panel"><QRCodeSVG value={joinUrl} size={compact ? 92 : 300} level="M" bgColor="#ffffff" fgColor="#111827" title="QR code for joining this Katwed room" /></div><p>Scan or visit<br /><strong>{window.location.host}</strong></p></div>
          </div>
          {headToHead ? (
            <div className="presentation-lobby__players head-to-head-lobby-stage">
              <p className="eyebrow">Two competitors</p>
              <div className="head-to-head-lobby-stage__slots">{competitors.map((competitor, index) => <article className={competitor.claimed ? 'is-joined' : 'is-waiting'} aria-label={`Competitor ${index + 1}: ${competitor.displayName}`} key={competitor.competitorId}><span>Competitor {index + 1}</span><strong>{competitor.displayName}</strong><GameBadge tone={competitor.connected ? 'success' : competitor.claimed ? 'warning' : 'neutral'}>{competitor.claimed ? (competitor.connected ? 'Ready' : 'Joined') : 'Waiting'}</GameBadge></article>)}</div>
            </div>
          ) : teamMode ? <div className="presentation-lobby__players"><TeamLobby teams={state.teams ?? []} players={state.players} /></div> : (
            <div className="presentation-lobby__players">
              <div className="presentation-lobby__player-heading"><div><p className="eyebrow">Contestants</p><h2>Players joined</h2></div><strong aria-label={`${state.players.length} players joined`}>{state.players.length}</strong></div>
              {state.players.length > 0 ? <ul className="lobby-player-grid">{state.players.slice(0, compact ? 6 : 24).map((player) => <LobbyPlayerTile connected={player.connected} key={player.id}>{player.nickname}</LobbyPlayerTile>)}</ul> : <p className="presentation-lobby__empty">Waiting for the first player…</p>}
            </div>
          )}
        </div>
      )}

      {state.phase === 'round-intro' && state.currentRound && <div className="presentation-round-intro"><p className="eyebrow">Round {state.currentRound.roundNumber} of {state.currentRound.totalRounds}</p><h1>{state.currentRound.title}</h1>{state.currentRound.subtitle && <p className="presentation-round-intro__subtitle">{state.currentRound.subtitle}</p>}<span>{state.currentRound.questionCount} {state.currentRound.questionCount === 1 ? 'question' : 'questions'}</span></div>}
      {state.phase === 'question' && question && activePrelude === 'double-score' && <DoubleScoreIntro compact={compact} questionTypeLabel={state.sessionSettings?.questionTypeIntrosEnabled ? questionTypeRegistry[question.type].introLabel : undefined} />}
      {state.phase === 'question' && question && activePrelude === 'question-type' && <QuestionTypeIntro type={question.type} compact={compact} />}
      {state.phase === 'question' && question && !activePrelude && (
        <div className="presentation-question">
          <StageHeader question={question} compact={compact} remaining={remaining} headToHead={headToHead} />
          <div className="presentation-question__body">
            {question.type === 'connections' && <p className="eyebrow connection-intro-label">Find the connection</p>}
            <div className="presentation-question__copy" data-question-density={promptDensity}>{headToHead && <p className="head-to-head-presentation-assignment">For <strong>{competitors.find((competitor) => competitor.competitorId === question.assignedCompetitorId)?.displayName}</strong> · 1 point</p>}<h1>{question.prompt}</h1>{question.supportingText && <p>{question.supportingText}</p>}</div>
            {showMedia && <div className="presentation-question__media"><QuestionMedia media={question.media} openedAt={state.questionOpenedAt} compact={compact} allowEnlarge={false} /></div>}
            {question.type === 'slider' && <SliderContext question={question} />}
            <PresentationChoices question={question} phase={state.phase} colours={answerColours} />
          </div>
          <footer className="presentation-question__footer"><SubmissionStatus submitted={state.submittedCount} total={state.players.length} label={headToHead ? 'responses resolved' : 'answered'} /></footer>
        </div>
      )}

      {state.phase === 'locked' && <div className="presentation-locked">{question && <QuestionProgressBadge questionNumber={question.questionNumber} totalQuestions={question.totalQuestions} compact={compact} />}<div className="presentation-locked__mark" aria-hidden="true"><span>!</span></div><p className="eyebrow">Submissions closed</p><h1>Answers locked</h1><p>Ready for the reveal</p></div>}

      {state.phase === 'reveal' && state.reveal && question && (
        <div className="presentation-reveal">
          <StageHeader question={question} compact={compact} remaining={remaining} headToHead={headToHead} showTimer={false} />
          <div className="presentation-reveal__copy" data-question-density={questionTextDensity(question.prompt, showMedia)}><p className="eyebrow">Answer reveal</p><h1>{question.prompt}</h1></div>
          {question.type !== 'pinpoint' && showMedia && <div className="presentation-reveal__media"><QuestionMedia media={question.media} openedAt={state.questionOpenedAt} compact={compact} allowEnlarge={false} /></div>}
          <RevealResult reveal={state.reveal} question={question} compact={compact} colours={answerColours} />
          {state.reveal.caption && <aside className="reveal-caption"><span>More to know</span><p>{state.reveal.caption}</p></aside>}
          {headToHead && <div className="presentation-reveal__head-to-head"><HeadToHeadResults competitors={competitors} results={state.headToHeadResults ?? []} /><div className="head-to-head-scoreboard">{competitors.map((competitor) => <div key={competitor.competitorId}><strong>{competitor.displayName}</strong><span>{competitor.totalScore}</span></div>)}</div></div>}
        </div>
      )}

      {state.phase === 'leaderboard' && leaderboard.reveal && <div className="presentation-leaderboard"><p className="eyebrow">Current standings</p><h1>Leaderboard</h1><AnimatedLeaderboard reveal={leaderboard.reveal} limit={compact ? 6 : undefined} onSettled={leaderboard.settle} /></div>}
      {state.phase === 'finished' && (headToHead ? <HeadToHeadFinal competitors={competitors} variant="presentation" /> : teamMode ? <TeamFinalResults state={state} variant="presentation" /> : <FinalResults entries={state.leaderboard} awardsBaseline={awardsBaseline} variant="presentation" />)}
    </section>
  )
}
