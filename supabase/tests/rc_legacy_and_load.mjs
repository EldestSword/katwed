import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// The caller supplies clients for a disposable PostgreSQL database only.
// No hosted connection discovery, credentials, migrations or network services.
export async function testLegacyAndOrdinaryLoad(clientFactory) {
  const db = clientFactory()
  const peers = Array.from({ length: 75 }, clientFactory)
  await db.connect()
  const rpc = async (name, ...values) => (await db.query(
    `select public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) result`, values,
  )).rows[0].result
  const asPlayer = async (operation) => {
    await db.query('set role anon')
    try { return await operation() } finally { await db.query('reset role') }
  }
  const owner = randomUUID(), outsider = randomUUID()
  const members = [randomUUID(), randomUUID(), randomUUID()]
  const questions = [0, 1].map(displayOrder => ({
    id: randomUUID(), type: 'mashup', prompt: 'Legacy exact pair', displayOrder,
    timeLimitSeconds: 60, points: 1000, speedScoringEnabled: false, doubleScore: false,
    media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Portrait' },
    mediaVisibility: 'both', presentationChoiceVisibility: 'show', correctMemberIds: members.slice(0, 2),
  }))
  try {
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',
      [owner, 'rc-legacy@example.invalid', outsider, 'rc-outsider@example.invalid'])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    await db.query('set role authenticated')
    const input = { title: 'RC legacy definition', quizType: 'standard', headToHeadCompetitors: [],
      roster: members.map((id, i) => ({ id, displayName: `Person ${i}`, shortName: `P${i}`, active: true, displayOrder: i })), questions }
    const quiz = await rpc('host_save_quiz', input)
    assert((await rpc('host_list_quizzes')).some(q => q.id === quiz.id))
    assert.equal((await rpc('host_get_quiz', quiz.id)).id, quiz.id)
    // Save precisely the old definition again: no round or modifier fields.
    await rpc('host_save_quiz', { ...input, id: quiz.id })
    const session = await rpc('host_launch_game', quiz.id)
    assert.equal(session.settings.playMode, 'individual')
    assert.equal(session.settings.competitionMode, 'points')
    assert.equal(session.settings.automaticTieBreakersEnabled, false)
    assert.equal(session.settings.powerUpsEnabled, false)
    await db.query('reset role')
    const player = await asPlayer(() => rpc('join_room', session.roomCode, 'Legacy Carol'))
    const wrong = await asPlayer(() => rpc('join_room', session.roomCode, 'Legacy Roger'))
    assert.equal(player.powerUps, null)
    const reconnect = () => asPlayer(() => rpc('reconnect_player', session.roomCode, player.player.id, player.reconnectToken))
    assert.equal((await reconnect()).player.id, player.player.id)
    await assert.rejects(asPlayer(() => rpc('host_get_quiz', quiz.id)), /permission denied/)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [outsider])
    await db.query('set role authenticated')
    assert.equal(await rpc('host_get_quiz', quiz.id), null)
    assert.equal(await rpc('session_to_json', session.id), null)
    await assert.rejects(rpc('host_start_game', session.id))
    await db.query('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    await rpc('host_start_game', session.id)
    for (let i = 0; i < 2; i++) {
      const safe = await asPlayer(() => rpc('get_player_game_state', session.roomCode))
      assert.equal(safe.phase, 'question', 'legacy quiz must have a silent default round')
      assert.equal(safe.currentQuestion.type, 'mashup')
      assert.equal(safe.reveal, null)
      assert.deepEqual(safe.leaderboard, [])
      assert(!JSON.stringify(safe.currentQuestion).includes('correctMemberIds'))
      await asPlayer(() => db.query('select public.submit_answer($1::text,$2::uuid,$3::text,$4::jsonb)',
        [session.roomCode, player.player.id, player.reconnectToken, { type: 'mashup', memberIds: members.slice(0, 2) }]))
      await asPlayer(() => db.query('select public.submit_answer($1::text,$2::uuid,$3::text,$4::jsonb)',
        [session.roomCode, wrong.player.id, wrong.reconnectToken, { type: 'mashup', memberIds: [members[0], members[2]] }]))
      await reconnect()
      await rpc('host_lock_game', session.id)
      await rpc('host_reveal_game', session.id)
      assert.notEqual((await rpc('get_player_game_state', session.roomCode)).phase, 'finished')
      await rpc(i ? 'host_finish_game' : 'host_leaderboard_game', session.id)
      const visible = await rpc('get_player_game_state', session.roomCode)
      assert.equal(visible.leaderboard[0].totalScore, (i + 1) * 1000)
      assert.equal(visible.leaderboard[1].totalScore, 0, 'mash-up must have no partial credit')
      if (!i) await rpc('host_next_game', session.id)
    }
    assert.equal((await rpc('get_player_game_state', session.roomCode)).phase, 'finished')
    await rpc('host_restart_game', session.id)
    assert.equal((await rpc('get_player_game_state', session.roomCode)).phase, 'lobby')
    assert.equal((await reconnect()).player.totalScore, 0)
    await rpc('host_close_game', session.id)
    assert.equal((await rpc('get_player_game_state', session.roomCode)).status, 'closed')

    const competitors = [0, 1].map(displayOrder => ({ id: randomUUID(), displayName: `Competitor ${displayOrder}`, displayOrder }))
    const h2h = await rpc('host_save_quiz', { title: 'RC legacy H2H', quizType: 'head-to-head', roster: [],
      headToHeadCompetitors: competitors, questions: competitors.map((c, displayOrder) => ({
        id: randomUUID(), type: 'true-false', prompt: 'Legacy H2H', correctValue: true,
        displayOrder, assignedCompetitorId: c.id, timeLimitSeconds: 60, points: 1000,
        speedScoringEnabled: false, doubleScore: false, media: { type: 'none' },
        mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      })) })
    const hs = await rpc('host_launch_game', h2h.id)
    const hp = []
    for (const c of competitors) hp.push(await asPlayer(() => rpc('join_head_to_head_room', hs.roomCode, c.id)))
    await asPlayer(() => rpc('start_head_to_head_game', hs.roomCode, hp[0].player.id, hp[0].reconnectToken))
    for (let i = 0; i < 2; i++) {
      assert.equal((await rpc('get_player_game_state', hs.roomCode)).phase, 'question')
      for (const contender of hp) await asPlayer(() => db.query('select public.submit_answer($1::text,$2::uuid,$3::text,$4::jsonb)',
        [hs.roomCode, contender.player.id, contender.reconnectToken, { type: 'true-false', value: true }]))
      await asPlayer(() => rpc('continue_head_to_head_game', hs.roomCode, hp[i].player.id, hp[i].reconnectToken, h2h.questions[i].id))
    }
    assert.equal((await rpc('get_player_game_state', hs.roomCode)).phase, 'finished')
    assert.equal(hs.settings.powerUpsEnabled, false)
    console.log('DB-first deployed client: owner/outsider boundaries, list/load/save, unchanged JSON answer RPC, exact-pair scoring, every phase, reconnect/restart/close and complete H2H passed.')

    const load = await rpc('host_launch_game', quiz.id, { soundPackId: 'none', autoLockWhenAllAnswered: false })
    await Promise.all(peers.map(async c => { await c.connect(); await c.query("set role anon; set statement_timeout='30s'") }))
    await db.query('delete from realtime.messages')
    let start = performance.now()
    const players = await Promise.all(peers.map((c, i) => c.query('select join_room($1,$2) p', [load.roomCode, `Load ${i}`]).then(r => r.rows[0].p)))
    const joinMs = performance.now() - start
    assert.equal(new Set(players.map(p => p.player.id)).size, 75)
    assert.equal((await db.query('select count(*)::int n from players where game_session_id=$1', [load.id])).rows[0].n, 75)
    assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n, 0)
    await rpc('host_start_game', load.id)
    await db.query('delete from realtime.messages')
    start = performance.now()
    await Promise.all(peers.map((c, i) => c.query('select submit_answer($1::text,$2::uuid,$3::text,$4::jsonb)',
      [load.roomCode, players[i].player.id, players[i].reconnectToken, { type: 'mashup', memberIds: members.slice(0, 2) }])))
    const answerMs = performance.now() - start
    assert.equal((await db.query('select count(*)::int n from player_answers where game_session_id=$1', [load.id])).rows[0].n, 75)
    assert.equal((await db.query('select count(*)::int n from players where game_session_id=$1 and total_score=1000', [load.id])).rows[0].n, 75)
    assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n, 0)
    console.log(`Ordinary local load: 75 simultaneous joins ${joinMs.toFixed(1)}ms; 75 simultaneous answers ${answerMs.toFixed(1)}ms; 75 unique players/answers, exact scores, zero broadcasts, deadlocks or timeouts.`)
  } finally {
    await Promise.all(peers.map(c => c.end().catch(() => {})))
    await db.end()
  }
}
