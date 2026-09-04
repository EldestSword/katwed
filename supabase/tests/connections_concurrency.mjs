import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

// Call only from a disposable, fully migrated PostgreSQL harness. clientFactory
// supplies fresh pg-compatible clients; no credentials or hosted URL are used here.
export async function testConnectionsConcurrency(clientFactory) {
  const clients = [clientFactory(), clientFactory(), clientFactory()]
  const [setup, answer, host] = clients
  try {
    await Promise.all(clients.map(client => client.connect()))
    await Promise.all(clients.map(client => client.query("set statement_timeout='8s'")))
    const owner = randomUUID()
    await setup.query('insert into auth.users(id,email) values($1,$2)', [owner, 'concurrency@example.invalid'])
    await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    await host.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    const quiz = (await setup.query('select host_save_quiz($1) q', [{ title: 'Connections lock boundary', quizType: 'standard', roster: [], headToHeadCompetitors: [],
      questions: [{ id: randomUUID(), type: 'connections', prompt: 'What connects these clues?', timeLimitSeconds: 120, points: 1000,
        speedScoringEnabled: false, doubleScore: false, displayOrder: 0, media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
        clues: ['Mercury', 'Venus', 'Earth', 'Mars'].map((text, index) => ({ id: `c${index}`, text })), correctAnswer: 'Planets', acceptedAnswers: [] }] }])).rows[0].q
    const session = (await setup.query('select host_launch_game($1,$2) s', [quiz.id, { soundPackId: 'none' }])).rows[0].s
    const early = (await setup.query("select join_room($1,'Before reveal') p", [session.roomCode])).rows[0].p
    const late = (await setup.query("select join_room($1,'After reveal') p", [session.roomCode])).rows[0].p
    await setup.query('select host_start_game($1)', [session.id])
    await host.query('set role authenticated')
    await answer.query('set role anon')
    const hostPid = (await host.query('select pg_backend_pid() pid')).rows[0].pid
    const answerPid = (await answer.query('select pg_backend_pid() pid')).rows[0].pid
    async function waitForLock(pid) {
      const deadline = Date.now() + 4000
      while (Date.now() < deadline) {
        if ((await setup.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return
        await delay(20)
      }
      assert.fail('Competing transaction never waited for the session lock')
    }
    const submit = player => answer.query('select submit_answer($1,$2,$3,$4::jsonb)', [session.roomCode, player.player.id, player.reconnectToken, { type: 'connections', value: 'Planets' }])
    await answer.query('begin')
    await submit(early) // Holds the existing shared session lock until commit.
    const reveal = host.query('select host_reveal_connection_clue($1)', [session.id])
    await waitForLock(hostPid)
    await answer.query('commit')
    await reveal
    assert.equal((await setup.query('select points_awarded from player_answers where player_id=$1', [early.player.id])).rows[0].points_awarded, 1000)

    await host.query('begin')
    await host.query('select host_reveal_connection_clue($1)', [session.id]) // Third clue; exclusive lock still held.
    const submission = submit(late)
    await waitForLock(answerPid)
    await host.query('commit')
    await submission
    assert.equal((await setup.query('select points_awarded from player_answers where player_id=$1', [late.player.id])).rows[0].points_awarded, 500)
    assert.equal((await setup.query('select connection_clue_count from game_sessions where id=$1', [session.id])).rows[0].connection_clue_count, 3)
    console.log('Connections PostgreSQL concurrency: answer-first=1000; reveal-first=500; both competing locks verified.')
  } finally {
    await Promise.all(clients.map(async client => { await client.query('rollback').catch(() => {}); await client.end().catch(() => {}) }))
  }
}
