import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Supply fresh clients connected only to a disposable, fully migrated database.
export async function testPowerUpConcurrency(clientFactory) {
  const setup = clientFactory()
  const clients = Array.from({ length: 75 }, () => clientFactory())
  let owner, quizId
  try {
    await setup.connect()
    owner = randomUUID()
    await setup.query('insert into auth.users(id,email) values($1,$2)', [owner, 'powerup-load@example.invalid'])
    await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    const questions = Array.from({ length: 2 }, (_, displayOrder) => {
      const options = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), label: `Choice ${i + 1}`, displayOrder: i }))
      return { id: randomUUID(), type: 'single-choice', prompt: 'Concurrent Power-Ups', supportingText: '',
        timeLimitSeconds: 60, points: 1000, buzzInEnabled: false, wagerEnabled: false,
        progressiveRevealEnabled: false, speedScoringEnabled: true, doubleScore: false, displayOrder,
        media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
        options, correctOptionId: options[0].id, randomiseOptions: false }
    })
    const quiz = (await setup.query('select host_save_quiz($1) q', [{ title: 'Power-Up concurrency',
      quizType: 'standard', roster: [], headToHeadCompetitors: [], questions }])).rows[0].q
    quizId = quiz.id
    const session = (await setup.query('select host_launch_game($1,$2) s', [quiz.id, {
      soundPackId: 'none', autoLockWhenAllAnswered: false, automaticTieBreakersEnabled: false, powerUpsEnabled: true,
    }])).rows[0].s
    const players = []
    for (let i = 0; i < clients.length; i += 1) {
      players.push((await setup.query('select join_room($1,$2) p', [session.roomCode, `Player ${i + 1}`])).rows[0].p)
    }
    await setup.query('select host_start_game($1)', [session.id])
    await Promise.all(clients.map(async client => {
      await client.connect()
      await client.query("set statement_timeout='30s'")
      await client.query('set role anon')
    }))
    await setup.query("update game_sessions set question_opened_at=clock_timestamp()-interval '8 seconds',question_closes_at=clock_timestamp()+interval '52 seconds' where id=$1", [session.id])
    await setup.query('delete from realtime.messages')
    const powers = [undefined, 'double-up', 'fast-five']
    const startedAt = performance.now()
    await Promise.all(clients.map((client, i) => client.query('select submit_answer($1::text,$2::uuid,$3::text,$4::jsonb)',
      [session.roomCode, players[i].player.id, players[i].reconnectToken,
        { type: 'single-choice', optionId: questions[0].correctOptionId, ...(powers[i % 3] ? { powerUp: powers[i % 3] } : {}) }],
    )))
    const answerMs = performance.now() - startedAt
    const rows = (await setup.query(`select a.player_id,a.response_time_ms,a.points_awarded,p.total_correct_response_ms,
      u.powerup_id from player_answers a join players p on p.id=a.player_id
      left join player_powerup_uses u on u.session_id=a.game_session_id and u.player_id=a.player_id and u.question_id=a.question_id
      where a.game_session_id=$1`, [session.id])).rows
    assert.equal(rows.length, 75)
    assert.equal(new Set(rows.map(row => row.player_id)).size, 75)
    for (let i = 0; i < players.length; i += 1) {
      const row = rows.find(row => row.player_id === players[i].player.id)
      const power = powers[i % 3]
      assert.equal(row.powerup_id, power ?? null)
      assert(row.response_time_ms >= 8000)
      assert.equal(Number(row.total_correct_response_ms), row.response_time_ms)
      const effective = Math.max(0, row.response_time_ms - (power === 'fast-five' ? 5000 : 0))
      assert.equal(row.points_awarded, Math.floor(1000 * (1 - .5 * effective / 60000)) * (power === 'double-up' ? 2 : 1))
    }
    assert.equal((await setup.query('select count(*)::int n from player_powerup_uses where session_id=$1', [session.id])).rows[0].n, 50)
    assert.equal((await setup.query('select count(*)::int n from realtime.messages')).rows[0].n, 0)
    await setup.query('select host_lock_game($1)', [session.id])
    await setup.query('select host_reveal_game($1)', [session.id])
    await setup.query('select host_leaderboard_game($1)', [session.id])
    await setup.query('select host_next_game($1)', [session.id])
    await setup.query('delete from realtime.messages')
    // Q2 cannot reuse the same Double Up already consumed on Q1.
    await assert.rejects(clients[1].query('select submit_answer($1::text,$2::uuid,$3::text,$4::jsonb)',
      [session.roomCode, players[1].player.id, players[1].reconnectToken,
        { type: 'single-choice', optionId: questions[1].correctOptionId, powerUp: 'double-up' }]), /duplicate key/)
    const assistStart = performance.now()
    const assists = await Promise.all(clients.map((client, i) => client.query('select activate_fifty_fifty($1,$2,$3,$4) p',
      [session.roomCode, players[i].player.id, players[i].reconnectToken, questions[1].id])))
    const assistMs = performance.now() - assistStart
    for (const result of assists) {
      const use = result.rows[0].p.uses.find(use => use.powerUp === 'fifty-fifty')
      assert.equal(use.optionIds.length, 2)
      assert.equal(new Set(use.optionIds).size, 2)
      assert(use.optionIds.includes(questions[1].correctOptionId))
    }
    assert.equal((await setup.query('select count(*)::int n from player_powerup_uses where session_id=$1', [session.id])).rows[0].n, 125)
    assert.equal((await setup.query('select count(*)::int n from player_answers where question_id=$1', [questions[1].id])).rows[0].n, 0)
    assert.equal((await setup.query('select count(*)::int n from realtime.messages')).rows[0].n, 0)
    // Two simultaneous repeat requests both reject and cannot duplicate a use.
    const duplicates = await Promise.allSettled(clients.slice(0, 2).map(client => client.query('select activate_fifty_fifty($1,$2,$3,$4)',
      [session.roomCode, players[0].player.id, players[0].reconnectToken, questions[1].id])))
    assert(duplicates.every(result => result.status === 'rejected'))
    console.log(`Power-Up concurrency: 75 mixed answers in ${answerMs.toFixed(1)} ms; 75 unique answers, 50 correct consumptions, real metrics, zero broadcasts/deadlocks. 75 private 50/50 activations in ${assistMs.toFixed(1)} ms; exact retained pairs, zero answers/broadcasts, duplicate retries rejected.`)
  } finally {
    await Promise.all(clients.map(client => client.end().catch(() => {})))
    if (quizId) await setup.query('delete from quizzes where id=$1', [quizId]).catch(() => {})
    if (owner) await setup.query('delete from auth.users where id=$1', [owner]).catch(() => {})
    await setup.end().catch(() => {})
  }
}
