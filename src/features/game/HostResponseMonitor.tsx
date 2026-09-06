import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { WagerSummary } from './WagerControl'
import type {
  GamePhase,
  GameTeam,
  GameSessionSettings,
  HostResponseRecord,
  Player,
  PlayerAnswer,
  Question,
  RosterMember,
} from '../../types/domain'
import {
  buildHostResponseRows,
  formatHostAnswer,
  HOST_RESPONSE_DETAIL_LIMIT,
  responseSummary,
  type HostResponseStatus,
} from './hostResponses'
import { loadTypedAnswerReview, type TypedAnswerReviewItem } from '../../services/typedAnswerReview'

const STATUS_COPY: Record<HostResponseStatus, string> = {
  ready: 'Ready',
  waiting: 'Waiting',
  'locked-in': 'Locked in',
  answered: 'Answered',
  correct: 'Correct',
  incorrect: 'Incorrect',
  'no-answer': 'No answer',
}

export function HostResponseMonitor({
  players,
  teams,
  responses,
  answers,
  question,
  roster,
  settings,
  phase,
  preludeActive,
  reviewingAnswerId,
  onOverride,
}: {
  players: readonly Player[]
  teams?: readonly GameTeam[]
  responses: readonly HostResponseRecord[]
  answers: readonly PlayerAnswer[]
  question: Question
  roster: readonly RosterMember[]
  settings: GameSessionSettings
  phase: GamePhase
  preludeActive: boolean
  reviewingAnswerId: string | null
  onOverride(answerId: string, correctOverride: true | null): Promise<void> | void
}) {
  const showDetails = settings.showPlayerAnswersToHost && players.length <= HOST_RESPONSE_DETAIL_LIMIT
  const rows = buildHostResponseRows(players, responses, showDetails ? answers : [], question.id, phase, preludeActive)
  const mayReview = question.type === 'typed-answer' && ['locked', 'reveal', 'leaderboard', 'finished'].includes(phase)
  const sessionId = responses[0]?.sessionId ?? answers[0]?.sessionId ?? null
  const [reviewItems, setReviewItems] = useState<TypedAnswerReviewItem[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const autoOpenedQuestion = useRef<string | null>(null)

  const refreshReview = useCallback(async (openAutomatically = false) => {
    if (!mayReview || !sessionId || question.type !== 'typed-answer') {
      setReviewItems([])
      return
    }
    setReviewLoading(true)
    setReviewError('')
    try {
      const items = await loadTypedAnswerReview(sessionId, question.id, players, answers)
      setReviewItems(items)
      if (openAutomatically && items.length > 0 && autoOpenedQuestion.current !== question.id) {
        autoOpenedQuestion.current = question.id
        setReviewOpen(true)
      }
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : 'Incorrect answers could not be loaded.')
    } finally {
      setReviewLoading(false)
    }
  }, [answers, mayReview, players, question, sessionId])

  useEffect(() => {
    if (!mayReview) {
      setReviewOpen(false)
      setReviewItems([])
      if (question.type !== 'typed-answer' || phase === 'question') autoOpenedQuestion.current = null
      return
    }
    void refreshReview(true)
  }, [mayReview, phase, question.id, question.type, refreshReview])

  useEffect(() => {
    if (autoOpenedQuestion.current !== question.id) {
      setReviewOpen(false)
      setReviewItems([])
    }
  }, [question.id])

  async function accept(item: TypedAnswerReviewItem) {
    try {
      await onOverride(item.answerId, true)
      await refreshReview(false)
    } catch {
      // HostGamePage owns the visible mutation error. Keep the review available.
    }
  }

  return (
    <section className="controller-responses" aria-labelledby="live-responses-heading">
      <div className="controller-section-heading">
        <h2 id="live-responses-heading">Live responses</h2>
        <span>{rows.filter((row) => row.response).length} / {rows.length}</span>
      </div>
      <p className={`controller-response-summary${preludeActive ? ' controller-response-summary--neutral' : ''}`} role="status">
        {responseSummary(rows, phase, preludeActive)}
      </p>
      {mayReview && sessionId && (
        <button className="button button--secondary typed-review-launch" type="button" onClick={() => { setReviewOpen(true); void refreshReview(false) }}>
          <strong>Review incorrect answers</strong>
          <span aria-label={`${reviewItems.length} to review`}>{reviewItems.length}</span>
        </button>
      )}
      {!settings.showPlayerAnswersToHost && <p className="controller-response-note">Live individual answers are hidden for this session. Incorrect Typed Answers can still be reviewed after answers close.</p>}
      {settings.showPlayerAnswersToHost && players.length > HOST_RESPONSE_DETAIL_LIMIT && (
        <p className="controller-response-note">Live individual answers are hidden for rooms over {HOST_RESPONSE_DETAIL_LIMIT} players. Incorrect Typed Answers remain available in the review window after answers close.</p>
      )}
      <ul className="controller-response-list">
        {rows.map(({ player, answer, response, status }) => {
          const automaticCorrect = answer?.automaticCorrect ?? answer?.correct ?? false
          const hostAccepted = answer?.hostCorrectOverride === true
          return (
            <li className={`controller-response-row controller-response-row--${status}`} key={player.id}>
              <div className="controller-response-row__heading">
                <strong>{player.nickname}{teams?.some((team) => team.id === player.teamId) && <small> · {teams.find((team) => team.id === player.teamId)?.name}</small>}</strong>
                <span>{STATUS_COPY[status]}{!player.connected ? ' · Disconnected' : ''}</span>
              </div>
              {question.wagerEnabled && response && <WagerSummary points={question.points} percent={response.wagerPercent ?? answer?.wagerPercent ?? 0} />}
              {showDetails && answer && <p>{formatHostAnswer(answer, question, roster, settings)}</p>}
              {showDetails && answer && question.type === 'typed-answer' && phase !== 'question' && (
                <div className="controller-response-judgement">
                  <span>{hostAccepted ? 'Host accepted ✓' : automaticCorrect ? 'Correct ✓' : 'Not accepted'}</span>
                  {mayReview && !automaticCorrect && (
                    <button
                      className="button button--ghost"
                      type="button"
                      disabled={reviewingAnswerId === answer.id}
                      onClick={() => onOverride(answer.id, hostAccepted ? null : true)}
                    >
                      {reviewingAnswerId === answer.id ? 'Updating…' : hostAccepted ? 'Undo override' : 'Mark correct'}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {reviewOpen && createPortal(
        <div className="typed-review-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false) }}>
          <section className="typed-review-dialog" role="dialog" aria-modal="true" aria-labelledby="typed-review-title">
            <header>
              <div>
                <p className="eyebrow">Typed Answer review</p>
                <h2 id="typed-review-title">Check the answers Katwed marked incorrect</h2>
                <p>Only incorrect answers are shown. Accept obvious spelling mistakes or equivalent wording with one click.</p>
              </div>
              <button className="typed-review-dialog__close" type="button" aria-label="Close answer review" onClick={() => setReviewOpen(false)}>×</button>
            </header>
            {reviewLoading && reviewItems.length === 0 ? <p className="typed-review-empty" role="status">Loading incorrect answers…</p>
              : reviewError ? <p className="typed-review-empty" role="alert">{reviewError}</p>
                : reviewItems.length === 0 ? <div className="typed-review-empty"><strong>Nothing needs reviewing.</strong><p>Every submitted answer is already correct or has been accepted.</p></div>
                  : <ul className="typed-review-list">{reviewItems.map((item) => {
                    const team = teams?.find((candidate) => candidate.id === players.find((player) => player.id === item.playerId)?.teamId)
                    return <li className="typed-review-row" key={item.answerId}>
                      <div className="typed-review-row__player"><strong>{item.nickname}</strong>{team && <small>{team.name}</small>}</div>
                      <p className="typed-review-row__answer">“{item.value}”</p>
                      <button className="button button--primary" type="button" disabled={reviewingAnswerId === item.answerId} onClick={() => void accept(item)}>
                        {reviewingAnswerId === item.answerId ? 'Accepting…' : 'Accept answer'}
                      </button>
                    </li>
                  })}</ul>}
            <footer><button className="button button--secondary" type="button" onClick={() => setReviewOpen(false)}>Done</button></footer>
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}
