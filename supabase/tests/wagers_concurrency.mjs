import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Disposable fully migrated PostgreSQL only. All clients start the same burst;
// setup is complete before measuring broadcasts/rows/scores.
export async function testWagersConcurrency(clientFactory) {
  const setup = clientFactory(), clients = Array.from({ length: 75 }, clientFactory)
  try {
    await setup.connect()
    const owner = randomUUID()
    await setup.query('insert into auth.users(id,email) values($1,$2)', [owner, 'wager-burst@example.invalid'])
    await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    const quiz = (await setup.query('select host_save_quiz($1) q', [{ title: 'Wager burst', quizType: 'standard', roster: [], headToHeadCompetitors: [],
      questions: [{ id: randomUUID(), type: 'true-false', prompt: 'True?', correctValue: true, timeLimitSeconds: 120, points: 999,
        wagerEnabled: true, speedScoringEnabled: false, doubleScore: false, displayOrder: 0, media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show' }] }])).rows[0].q
    const session = (await setup.query('select host_launch_game($1,$2) s', [quiz.id, { soundPackId: 'none', autoLockWhenAllAnswered: false }])).rows[0].s
    const players = []
    for (let i = 0; i < 75; i++) players.push((await setup.query('select join_room($1,$2) p', [session.roomCode, `Wager ${i}`])).rows[0].p)
    await Promise.all(clients.map(async client => { await client.connect(); await client.query("set role anon; set statement_timeout='15s'") }))
    await setup.query('select host_start_game($1)', [session.id])
    const before = (await setup.query('select to_jsonb(s) s from game_sessions s where id=$1', [session.id])).rows[0].s
    await setup.query('delete from realtime.messages')
    const start = Date.now()
    await Promise.all(clients.map((client, i) => client.query('select submit_answer($1,$2,$3,$4::jsonb)', [session.roomCode, players[i].player.id, players[i].reconnectToken,
      { type: 'true-false', value: i % 2 === 0, wagerPercent: [0,25,50,100][i % 4] } ])))
    const elapsed = Date.now() - start
    const answers = (await setup.query('select player_id, wager_percent, points_awarded, answer_payload, correct from player_answers where game_session_id=$1', [session.id])).rows
    assert.equal(answers.length, 75); assert.equal(new Set(answers.map(a => a.player_id)).size, 75)
    const totals = (await setup.query('select id,total_score from players where game_session_id=$1', [session.id])).rows
    for (let i = 0; i < 75; i++) {
      const percent = [0,25,50,100][i % 4], correct = i % 2 === 0, stake = Math.floor(999 * percent / 100)
      const answer = answers.find(a => a.player_id === players[i].player.id)
      assert.equal(answer.wager_percent, percent); assert.equal(answer.correct, correct)
      assert.equal(answer.points_awarded, correct ? 999 + stake : -stake)
      assert.deepEqual(answer.answer_payload, { type: 'true-false', value: correct })
      assert.equal(totals.find(p => p.id === players[i].player.id).total_score, answer.points_awarded)
    }
    assert.equal((await setup.query('select count(*)::integer n from realtime.messages')).rows[0].n, 0)
    assert.deepEqual((await setup.query('select to_jsonb(s) s from game_sessions s where id=$1', [session.id])).rows[0].s, before)
    console.log(`Wager PostgreSQL burst: 75 simultaneous answers in ${elapsed}ms; 75 unique rows; exact percentages/scores/totals; zero broadcasts/session writes.`)
  } finally { await Promise.allSettled([setup, ...clients].map(client => client.end())) }
}
