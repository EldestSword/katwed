import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

function question(type, overrides = {}) {
  const q = { id: randomUUID(), type, prompt: `RC ${type}`, supportingText: '', displayOrder: 0,
    timeLimitSeconds: 60, points: 1000, speedScoringEnabled: false, doubleScore: false,
    wagerEnabled: true, progressiveRevealEnabled: false, buzzInEnabled: false,
    media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show' }
  if (type === 'single-choice') {
    q.options = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((label, displayOrder) => ({ id: randomUUID(), label, displayOrder }))
    q.correctOptionId = q.options[0].id
  } else if (type === 'true-false') q.correctValue = true
  else if (type === 'slider') Object.assign(q, { minimum: 0, maximum: 100, step: .5, correctValue: 50, tolerance: 0, unitLabel: 'metres', prefix: '', suffix: '' })
  else if (type === 'pinpoint') Object.assign(q, { media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Map' },
    target: { kind: 'polygon', points: [{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .5, y: .8 }] } })
  else if (type === 'ordering') Object.assign(q, { items: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id })), correctItemIds: ['a', 'b', 'c', 'd'] })
  else if (type === 'matching') Object.assign(q, {
    leftItems: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id })), rightItems: ['w', 'x', 'y', 'z'].map(id => ({ id, label: id })),
    correctPairs: ['a', 'b', 'c', 'd'].map((leftId, i) => ({ leftId, rightId: ['w', 'x', 'y', 'z'][i] })), scoringMode: 'partial',
  })
  else Object.assign(q, { correctAnswer: 'Alex', acceptedAnswers: [], ...(type === 'connections' ? {
    clues: ['First', 'Second', 'Third', 'Fourth'].map((text, i) => ({ id: `c${i}`, text })),
  } : {}) })
  return { ...q, ...overrides }
}
function answer(q, correct = true) {
  switch (q.type) {
    case 'single-choice': return { type: q.type, optionId: q.options[correct ? 0 : 1].id }
    case 'true-false': return { type: q.type, value: correct }
    case 'slider': return { type: q.type, value: correct ? 50 : 0 }
    case 'pinpoint': return { type: q.type, x: correct ? .5 : 0, y: correct ? .5 : 0 }
    case 'ordering': return { type: q.type, itemIds: correct ? q.correctItemIds : [...q.correctItemIds].reverse() }
    case 'matching': return { type: q.type, pairs: correct ? q.correctPairs : q.correctPairs.map((pair, i) => ({ ...pair, rightId: q.correctPairs[[0, 1, 3, 2][i]].rightId })) }
    default: return { type: q.type, value: correct ? 'Alex' : 'Wrong' }
  }
}

// Cross-feature games use final public RPCs, real row constraints and scoring.
// Only timestamps are controlled directly to avoid wall-clock sleeps.
export async function testCrossFeatureGames(clientFactory) {
  const db = clientFactory()
  await db.connect()
  const rpc = async (name, ...values) => (await db.query(`select public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) r`, values)).rows[0].r
  const playerCall = async (operation) => {
    await db.query('set role anon')
    try { return await operation() } finally { await db.query('reset role') }
  }
  const owner = randomUUID()
  const create = async (questions, settings = {}, rounds = true, count = 4) => {
    const definitions = [0, 1].map(displayOrder => ({ id: randomUUID(), title: `Round ${displayOrder + 1}`, subtitle: '', displayOrder, introEnabled: true }))
    const input = { title: 'RC combined game', quizType: 'standard', roster: [], headToHeadCompetitors: [],
      ...(rounds ? { rounds: definitions } : {}), questions: questions.map((q, i) => ({ ...q, displayOrder: i,
        ...(rounds ? { roundId: definitions[i < Math.ceil(questions.length / 2) ? 0 : 1].id } : {}) })) }
    const quiz = await rpc('host_save_quiz', input)
    const session = await rpc('host_launch_game', quiz.id, { soundPackId: 'none', autoLockWhenAllAnswered: false,
      automaticTieBreakersEnabled: false, powerUpsEnabled: true, ...settings })
    const players = []
    for (let i = 0; i < count; i++) players.push(await playerCall(() => rpc('join_room', session.roomCode, ['Carol', 'Roger', 'Jaki', 'Sam'][i])))
    return { quiz, session, players }
  }
  const safe = g => playerCall(() => rpc('get_player_game_state', g.session.roomCode))
  const reconnect = (g, i) => playerCall(() => rpc('reconnect_player', g.session.roomCode, g.players[i].player.id, g.players[i].reconnectToken))
  const submit = (g, i, payload) => playerCall(() => db.query('select submit_answer($1::text,$2::uuid,$3::text,$4::jsonb)',
    [g.session.roomCode, g.players[i].player.id, g.players[i].reconnectToken, payload]))
  const assist = (g, i, q) => playerCall(() => rpc('activate_fifty_fifty', g.session.roomCode, g.players[i].player.id, g.players[i].reconnectToken, q.id))
  const rows = async g => (await db.query('select * from players where game_session_id=$1 order by nickname', [g.session.id])).rows
  const answers = async (g, q) => (await db.query('select * from player_answers where game_session_id=$1 and question_id=$2 order by player_id', [g.session.id, q.id])).rows
  const open = async g => {
    if ((await safe(g)).phase === 'round-intro') {
      assert.equal((await safe(g)).currentQuestion, null)
      await reconnect(g, 0)
      await rpc('host_start_round_game', g.session.id)
    }
    assert.equal((await safe(g)).phase, 'question')
    await db.query("update game_sessions set question_opened_at=clock_timestamp()-interval '8 seconds',question_closes_at=clock_timestamp()+interval '52 seconds' where id=$1", [g.session.id])
    const state = await safe(g)
    assert.deepEqual(state.leaderboard, [])
    for (const key of ['correctAnswer', 'correctValue', 'correctOptionId', 'correctPairs', 'correctItemIds', 'target']) assert(!(key in state.currentQuestion), `Leaked ${key}`)
    return state
  }
  const complete = async (g, last = false) => {
    await rpc('host_lock_game', g.session.id)
    await rpc('host_reveal_game', g.session.id)
    assert.equal((await safe(g)).phase, 'reveal')
    await rpc(last ? 'host_finish_game' : 'host_leaderboard_game', g.session.id)
  }
  try {
    await db.query('insert into auth.users(id,email) values($1,$2)', [owner, 'rc-games@example.invalid'])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    // A–D/H/I: mixed rounds, negative wagers, progressive image, clue score,
    // personal assists, all seven requested formats; repeat with balanced teams.
    for (const teams of [false, true]) {
      const questions = ['single-choice', 'slider', 'pinpoint', 'ordering', 'matching', 'connections', 'typed-answer'].map(type => question(type))
      questions[0] = { ...questions[0], progressiveRevealEnabled: true, doubleScore: true,
        media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Portrait', revealEffect: 'blur', revealDurationSeconds: 20 } }
      questions[5].doubleScore = true
      questions[6].speedScoringEnabled = true
      const g = await create(questions, teams ? { playMode: 'teams', teamAssignmentMode: 'balanced-random', teamNames: ['Blue', 'Red'] } : {})
      if (teams) {
        const counts = g.session.teams.map(t => g.players.filter(p => p.player.teamId === t.id).length)
        assert.deepEqual(counts, [2, 2])
      }
      await rpc('host_start_game', g.session.id)
      for (const [index, q] of g.quiz.questions.entries()) {
        await open(g)
        await reconnect(g, 0)
        if (!index) {
          const retained = await assist(g, 0, q)
          assert.equal(retained.uses[0].optionIds.length, 2)
          assert.deepEqual((await reconnect(g, 0)).powerUps, retained)
          assert.deepEqual((await reconnect(g, 1)).powerUps.uses, [])
          await assert.rejects(submit(g, 3, { ...answer(q), powerUp: 'fast-five' }))
        }
        if (q.type === 'connections') {
          assert.equal((await safe(g)).currentQuestion.visibleClues.length, 1)
          await rpc('host_reveal_connection_clue', g.session.id)
          await rpc('host_reveal_connection_clue', g.session.id)
          assert.equal((await safe(g)).currentQuestion.visibleClues.length, 3)
          await assert.rejects(assist(g, 3, q))
          await assert.rejects(submit(g, 3, { ...answer(q), powerUp: 'fast-five' }))
        }
        for (let i = 0; i < 4; i++) {
          const correct = !(index === 0 && i > 1) && !(q.type === 'matching' && i === 2)
          const powerUp = (!index && i === 1) || (q.type === 'connections' && i === 0) || (q.type === 'matching' && i === 2) ? 'double-up'
            : q.type === 'typed-answer' && i === 1 ? 'fast-five' : undefined
          await submit(g, i, { ...answer(q, correct), wagerPercent: 100, ...(powerUp ? { powerUp } : {}) })
        }
        const actual = await answers(g, q)
        assert.equal(actual.length, 4)
        if (!index) {
          assert.equal(actual.filter(a => a.points_awarded === -1000).length, 2)
          const doubled = actual.find(a => a.player_id === g.players[1].player.id)
          const base = (await db.query('select progressive_reveal_score(1000,$1,20000) score', [doubled.response_time_ms])).rows[0].score
          assert.equal(doubled.points_awarded, (base * 2 + 1000) * 2)
        }
        if (q.type === 'connections') assert.equal(actual.find(a => a.player_id === g.players[0].player.id).points_awarded, 4000)
        if (q.type === 'matching') {
          const partial = actual.find(a => a.player_id === g.players[2].player.id)
          assert.equal(partial.correct, false)
          assert.equal(partial.points_awarded, -500, 'half raw credit minus a full losing wager stays negative under Double Up')
        }
        await complete(g, index === questions.length - 1)
        const visible = await safe(g)
        if (teams) {
          for (const team of g.session.teams) assert.equal(
            visible.leaderboard.filter(p => g.players.some(member => member.player.id === p.playerId && member.player.teamId === team.id)).reduce((sum, p) => sum + p.totalScore, 0),
            (await rows(g)).filter(p => p.team_id === team.id).reduce((sum, p) => sum + p.total_score, 0))
        }
        await reconnect(g, 0)
        if (index !== questions.length - 1) await rpc('host_next_game', g.session.id)
      }
      assert.equal((await safe(g)).phase, 'finished')
      assert.equal((await reconnect(g, 0)).player.correctAnswerCount, 7)
      assert.equal((await reconnect(g, 0)).player.currentCorrectStreak, 7)
      console.log(`RC games ${teams ? 'B' : 'A/C/D'}/H/I: seven-format, two-round ${teams ? 'Teams' : 'Individual'} game passed; progressive/Double Score/wager/Power-Up order, negative scores, partial correctness, private inventories, reconnect and final totals.`)
    }

    // E/F/I: three lives, actual partial and missing answers, elimination,
    // neutral Buzz followed by ordinary damage, and round transitions.
    const g = await create([
      question('single-choice', { progressiveRevealEnabled: true, media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Portrait', revealEffect: 'blur', revealDurationSeconds: 20 } }),
      question('matching'), question('connections'), question('typed-answer', { buzzInEnabled: true }), question('single-choice'),
    ], { competitionMode: 'survivor', survivorStartingLives: 3 })
    await rpc('host_start_game', g.session.id)
    for (const [index, q] of g.quiz.questions.entries()) {
      const before = (await rows(g)).map(p => [p.id, p.survivor_lives_remaining, p.current_correct_streak])
      await open(g)
      assert.deepEqual((await rows(g)).map(p => [p.id, p.survivor_lives_remaining, p.current_correct_streak]), before)
      if (q.buzzInEnabled) {
        const claim = i => playerCall(() => rpc('claim_buzz', g.session.roomCode, g.players[i].player.id, g.players[i].reconnectToken))
        await assert.rejects(claim(3))
        assert.equal((await claim(0)).won, true)
        assert.equal((await claim(1)).won, false)
        await reconnect(g, 0); await reconnect(g, 1)
        await rpc('host_reset_buzz', g.session.id)
        assert.equal((await claim(1)).won, true)
        await submit(g, 1, answer(q, false))
      } else {
        for (let i = 0; i < (index === 4 ? 2 : 3); i++) await submit(g, i, { ...answer(q, i < 2), wagerPercent: 50,
          ...(!index && i === 0 ? { powerUp: 'double-up' } : {}) })
        // Sam misses all normal answers. After Q3 both Sam and Jaki are out.
        if (index === 4) {
          await assert.rejects(submit(g, 3, answer(q)))
          await assert.rejects(assist(g, 3, q))
        }
      }
      await complete(g, index === 4)
      const after = await rows(g)
      if (q.buzzInEnabled) assert.deepEqual(after.map(p => [p.id, p.survivor_lives_remaining, p.current_correct_streak]), before)
      assert.equal((await reconnect(g, 3)).player.survivorLivesRemaining, Math.max(0, 3 - Math.min(index + 1, 3)))
      if (index < 4) await rpc('host_next_game', g.session.id)
    }
    assert.equal((await safe(g)).phase, 'finished')
    console.log('RC games E/F/I: three-life rounds, progressive wager/Double Up, partial/missing damage, eliminated spectator rejection, Buzz winner/reset/reconnect/neutral lives and streaks, later ordinary scoring passed.')

    // J: both assists survive host correction/undo without consuming again.
    for (const powerUp of ['double-up', 'fast-five']) {
      const j = await create([question('typed-answer', { speedScoringEnabled: true, doubleScore: true }), question('true-false')],
        { competitionMode: 'survivor', survivorStartingLives: 1 }, false, 2)
      await rpc('host_start_game', j.session.id); await open(j)
      await submit(j, 0, { ...answer(j.quiz.questions[0], false), wagerPercent: 100, powerUp })
      await submit(j, 1, answer(j.quiz.questions[0]))
      await complete(j)
      const original = (await answers(j, j.quiz.questions[0])).find(a => a.player_id === j.players[0].player.id)
      assert.equal(original.points_awarded, -1000)
      assert.equal((await reconnect(j, 0)).player.survivorLivesRemaining, 0)
      await rpc('host_set_typed_answer_override', j.session.id, original.id, true)
      const revised = (await answers(j, j.quiz.questions[0])).find(a => a.id === original.id)
      const effective = Math.max(0, original.response_time_ms - (powerUp === 'fast-five' ? 5000 : 0))
      assert.equal(revised.points_awarded, (Math.floor(2000 * (1 - .5 * effective / 60000)) + 1000) * (powerUp === 'double-up' ? 2 : 1))
      assert.equal(revised.response_time_ms, original.response_time_ms)
      assert.equal((await reconnect(j, 0)).player.survivorLivesRemaining, 1)
      assert.equal((await reconnect(j, 0)).player.currentCorrectStreak, 1)
      await rpc('host_set_typed_answer_override', j.session.id, original.id, null)
      assert.equal((await reconnect(j, 0)).player.survivorLivesRemaining, 0)
      assert.equal((await reconnect(j, 0)).player.currentCorrectStreak, 0)
      assert.equal((await reconnect(j, 0)).powerUps.uses.length, 1)
    }
    console.log('RC game J: Typed correction and undo with Survivor, wagers, authored Double Score and both Double Up/Fast Five passed; real response time and single consumption preserved.')

    // G/H/I: both surviving and Total Wipeout ties preserve real metrics.
    for (const wipeout of [false, true]) {
      const t = await create([question('typed-answer')], { competitionMode: 'survivor', survivorStartingLives: 1, automaticTieBreakersEnabled: true }, false, 3)
      await rpc('host_start_game', t.session.id); await open(t)
      for (let i = 0; i < 3; i++) await submit(t, i, { ...answer(t.quiz.questions[0], !wipeout && i < 2), wagerPercent: i === 2 ? 100 : 50 })
      await complete(t, true)
      assert.equal((await safe(t)).phase, 'tiebreaker')
      const metrics = async () => (await rows(t)).map(p => [p.id, p.total_score, p.correct_answer_count, p.total_correct_response_ms, p.current_correct_streak, p.longest_correct_streak, p.survivor_lives_remaining, p.survivor_eliminated_at_question])
      const before = await metrics()
      const target = (await db.query('select q.answer::text answer from game_sessions s join tiebreaker_questions q on q.id=s.tiebreaker_question_id where s.id=$1', [t.session.id])).rows[0].answer
      const estimate = (i, value) => playerCall(() => rpc('submit_tiebreaker_answer', t.session.roomCode, t.players[i].player.id, t.players[i].reconnectToken, value))
      if (!wipeout) await assert.rejects(estimate(2, target))
      assert(!JSON.stringify((await safe(t)).tieBreaker).includes('sourceUrl'))
      await estimate(0, target); await reconnect(t, 0); await reconnect(t, 2)
      await estimate(1, String(Number(target) + 100))
      if (wipeout) await estimate(2, String(Number(target) + 200))
      assert.equal((await safe(t)).phase, 'tiebreaker-result')
      assert.deepEqual(await metrics(), before)
      await rpc('host_reveal_tiebreaker_final', t.session.id)
      const final = await safe(t)
      assert.equal(final.phase, 'finished')
      assert.equal(final.leaderboard[0].playerId, t.players[0].player.id)
      assert.equal(final.survivorAliveCount, wipeout ? 0 : 2)
    }
    console.log('RC games G/H/I: surviving and wipeout automatic ties, contender/spectator and submitted reconnect, exact closest winner, unchanged lives/streaks/award metrics, final host gate passed.')
  } finally { await db.end() }
}
