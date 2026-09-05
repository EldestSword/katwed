import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Call only from a disposable, fully migrated PostgreSQL harness. The factory
// supplies fresh pg-compatible clients; no hosted URL or credentials are used.
export async function testBuzzConcurrency(clientFactory) {
  const setup = clientFactory()
  const contenders = Array.from({ length: 75 }, () => clientFactory())
  try {
    await setup.connect()
    const owner = randomUUID()
    await setup.query('insert into auth.users(id,email) values($1,$2)', [owner, 'buzz-race@example.invalid'])
    await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    const quiz = (await setup.query('select host_save_quiz($1) q', [{
      title: 'Buzz race', quizType: 'standard', roster: [], headToHeadCompetitors: [],
      questions: [{
        id: randomUUID(), type: 'true-false', prompt: 'Race', supportingText: '', timeLimitSeconds: 60,
        points: 1000, buzzInEnabled: true, wagerEnabled: false, progressiveRevealEnabled: false,
        speedScoringEnabled: false, doubleScore: false, displayOrder: 0, media: { type: 'none' },
        mediaVisibility: 'both', presentationChoiceVisibility: 'show', correctValue: true,
      }],
    }])).rows[0].q
    const session = (await setup.query('select host_launch_game($1,$2) s', [quiz.id, { soundPackId: 'none', autoLockWhenAllAnswered: false }])).rows[0].s
    const players = []
    for (let index = 0; index < contenders.length; index += 1) {
      players.push((await setup.query('select join_room($1,$2) p', [session.roomCode, `Player ${index + 1}`])).rows[0].p)
    }
    await setup.query('select host_start_game($1)', [session.id])
    await setup.query("update game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '59 seconds' where id=$1", [session.id])
    await setup.query('delete from realtime.messages')

    await Promise.all(contenders.map(async client => {
      await client.connect()
      await client.query("set statement_timeout='15s'")
      await client.query('set role anon')
    }))
    const startedAt = process.hrtime.bigint()
    const results = await Promise.all(contenders.map((client, index) => client.query(
      'select claim_buzz($1,$2,$3) result',
      [session.roomCode, players[index].player.id, players[index].reconnectToken],
    ).then(result => result.rows[0].result)))
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000

    const winners = results.filter(result => result.won)
    assert.equal(winners.length, 1, 'exactly one concurrent claim must win')
    assert.equal(new Set(results.map(result => result.winnerPlayerId)).size, 1, 'all contenders must observe the same winner')
    assert.equal((await setup.query('select buzz_winner_player_id winner from game_sessions where id=$1', [session.id])).rows[0].winner, winners[0].winnerPlayerId)
    assert.equal((await setup.query('select count(*)::integer count from realtime.messages', [])).rows[0].count, 2, 'only the winning session write may publish the two existing refreshes')
    assert.equal((await setup.query('select count(*)::integer count from player_answers where game_session_id=$1', [session.id])).rows[0].count, 0, 'a claim must not submit an answer')
    console.log(`Buzz-In PostgreSQL concurrency: 75 simultaneous claims in ${elapsedMs.toFixed(1)} ms, one winner, 74 write-free losers, two existing refresh messages.`)
  } finally {
    await Promise.all(contenders.map(client => client.end().catch(() => {})))
    await setup.end().catch(() => {})
  }
}
