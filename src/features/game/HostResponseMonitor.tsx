import type {
  GamePhase,
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

const STATUS_COPY: Record<HostResponseStatus, string> = {
  ready: 'Ready',
  waiting: 'Waiting',
  'locked-in': 'Locked in',
  answered: 'Answered',
  'no-answer': 'No answer',
}

export function HostResponseMonitor({
  players,
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
  responses: readonly HostResponseRecord[]
  answers: readonly PlayerAnswer[]
  question: Question
  roster: readonly RosterMember[]
  settings: GameSessionSettings
  phase: GamePhase
  preludeActive: boolean
  reviewingAnswerId: string | null
  onOverride(answerId: string, correctOverride: true | null): void
}) {
  const rows = buildHostResponseRows(players, responses, answers, question.id, phase, preludeActive)
  const showDetails = settings.showPlayerAnswersToHost && players.length <= HOST_RESPONSE_DETAIL_LIMIT
  const mayReview = question.type === 'typed-answer' && ['locked', 'reveal', 'leaderboard'].includes(phase)

  return (
    <section className="controller-responses" aria-labelledby="live-responses-heading">
      <div className="controller-section-heading">
        <h2 id="live-responses-heading">Live responses</h2>
        <span>{rows.filter((row) => row.response).length} / {rows.length}</span>
      </div>
      <p className={`controller-response-summary${preludeActive ? ' controller-response-summary--neutral' : ''}`} role="status">
        {responseSummary(rows, phase, preludeActive)}
      </p>
      {!settings.showPlayerAnswersToHost && <p className="controller-response-note">Individual answers are hidden for this session.</p>}
      {settings.showPlayerAnswersToHost && players.length > HOST_RESPONSE_DETAIL_LIMIT && (
        <p className="controller-response-note">Individual answers are hidden for rooms over {HOST_RESPONSE_DETAIL_LIMIT} players.</p>
      )}
      <ul className="controller-response-list">
        {rows.map(({ player, answer, status }) => {
          const automaticCorrect = answer?.automaticCorrect ?? answer?.correct ?? false
          const hostAccepted = answer?.hostCorrectOverride === true
          return (
            <li className={`controller-response-row controller-response-row--${status}`} key={player.id}>
              <div className="controller-response-row__heading">
                <strong>{player.nickname}</strong>
                <span>{STATUS_COPY[status]}{!player.connected ? ' · Disconnected' : ''}</span>
              </div>
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
    </section>
  )
}
