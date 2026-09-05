import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Call only from a disposable, fully migrated PostgreSQL harness. The factory
// supplies fresh pg-compatible clients; no hosted URL or credentials are used.
export async function testTieBreakerConcurrency(clientFactory) {
  const setup = clientFactory()
  const contenders = Array.from({ length: 75 }, () => clientFactory())
  let quizId
  let owner
  try {
    await setup.connect()
    owner = randomUUID()
    await setup.query('insert into auth.users(id,email) values($1,$2)', [owner, 'tiebreaker-load@example.invalid'])
    await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    const quiz = (await setup.query('select host_save_quiz($1) q', [{
      title: 'Tie-breaker concurrency', quizType: 'standard', roster: [], headToHeadCompetitors: [],
      questions: [{
        id: randomUUID(), type: 'true-false', prompt: 'Concurrent final', supportingText: '', timeLimitSeconds: 60,
        points: 1000, buzzInEnabled: false, wagerEnabled: false, progressiveRevealEnabled: false,
        speedScoringEnabled: false, doubleScore: false, displayOrder: 0, media: { type: 'none' },
        mediaVisibility: 'both', presentationChoiceVisibility: 'show', correctValue: true,
      }],
    }])).rows[0].q
    quizId = quiz.id
    const session = (await setup.query('select host_launch_game($1,$2) s', [quiz.id, {
      soundPackId: 'none', autoLockWhenAllAnswered: false, automaticTieBreakersEnabled: true,
    }])).rows[0].s
    const players = []
    for (let index = 0; index < contenders.length; index += 1) {
      players.push((await setup.query('select join_room($1,$2) p', [session.roomCode, `Finalist ${index + 1}`])).rows[0].p)
    }
    await setup.query('select host_start_game($1)', [session.id])
    await setup.query('select host_lock_game($1)', [session.id])
    await setup.query('select host_reveal_game($1)', [session.id])
    await setup.query('select host_finish_game($1)', [session.id])
    const active = (await setup.query(`select s.phase,q.answer::text answer
      from game_sessions s join tiebreaker_questions q on q.id=s.tiebreaker_question_id where s.id=$1`, [session.id])).rows[0]
    assert.equal(active.phase, 'tiebreaker')
    await setup.query('delete from realtime.messages')

    await Promise.all(contenders.map(async (client) => {
      await client.connect()
      await client.query("set statement_timeout='30s'")
      await client.query('set role anon')
    }))
    const target = Number(active.answer)
    assert(Number.isFinite(target), 'bank answer must be numeric')
    const startedAt = process.hrtime.bigint()
    await Promise.all(contenders.map((client, index) => client.query(
      'select public.submit_tiebreaker_answer($1,$2,$3,$4)',
      [session.roomCode, players[index].player.id, players[index].reconnectToken, index === 0 ? active.answer : String(target + index)],
    )))
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000

    const answerRows = (await setup.query(`select count(*)::integer count,count(distinct player_id)::integer players
      from game_tiebreaker_answers where session_id=$1`, [session.id])).rows[0]
    assert.deepEqual(answerRows, { count: 75, players: 75 }, 'every contender must have exactly one answer')
    const result = (await setup.query('select phase,tiebreaker_winner_player_id winner from game_sessions where id=$1', [session.id])).rows[0]
    assert.equal(result.phase, 'tiebreaker-result')
    assert.equal(result.winner, players[0].player.id, 'the exact answer must win deterministically')
    assert.equal((await setup.query('select count(*)::integer count from realtime.messages')).rows[0].count, 2,
      '75 answers must produce only the final normal two-recipient refresh')
    console.log(`Automatic Tie-Breaker PostgreSQL concurrency: 75 simultaneous authenticated estimates in ${elapsedMs.toFixed(1)} ms, 75 unique rows, deterministic winner, two existing refresh messages.`)
  } finally {
    await Promise.all(contenders.map((client) => client.end().catch(() => {})))
    if (quizId) await setup.query('delete from quizzes where id=$1', [quizId]).catch(() => {})
    if (owner) await setup.query('delete from auth.users where id=$1', [owner]).catch(() => {})
    await setup.end().catch(() => {})
  }
}
