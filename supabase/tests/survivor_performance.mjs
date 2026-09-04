import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/** Disposable, fully migrated PostgreSQL only. No network or project discovery. */
export async function testSurvivorPerformance(client) {
  const owner = randomUUID()
  await client.query('begin')
  try {
    await client.query('insert into auth.users(id,email) values($1,$2)', [owner, 'survivor-performance@example.invalid'])
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner])
    const questions = Array.from({ length: 100 }, (_, displayOrder) => ({
      id: randomUUID(), type: 'true-false', prompt: 'True?', correctValue: true,
      timeLimitSeconds: 60, points: 1000, buzzInEnabled: displayOrder % 10 === 5,
      speedScoringEnabled: false, doubleScore: false, displayOrder,
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
    }))
    const quiz = (await client.query('select host_save_quiz($1) q', [{
      title: 'Survivor performance', quizType: 'standard', roster: [], headToHeadCompetitors: [], questions,
    }])).rows[0].q
    const session = (await client.query('select host_launch_game($1,$2) s', [quiz.id, {
      soundPackId: 'none', autoLockWhenAllAnswered: false, competitionMode: 'survivor', survivorStartingLives: 3,
    }])).rows[0].s
    await client.query(`insert into players(game_session_id,nickname,reconnect_token_hash,survivor_lives_remaining)
      select $1,'Player '||n,extensions.digest(n::text,'sha256'),3 from generate_series(1,75)n`, [session.id])
    await client.query(`update game_sessions set phase='reveal',current_question_index=99,current_question_id=$2 where id=$1`,
      [session.id, questions[99].id])
    await client.query(`insert into player_answers(game_session_id,question_id,player_id,answer_payload,response_time_ms,correct,automatic_correct,points_awarded)
      select $1,q.id,p.id,'{"type":"true-false","value":true}'::jsonb,1000,
        (q.display_order+p.ordinal)%4<>0,(q.display_order+p.ordinal)%4<>0,500
      from (select *,row_number() over(order by id)::integer ordinal from players where game_session_id=$1) p
      cross join questions q
      where q.quiz_id=$2 and (q.display_order+p.ordinal)%7<>0`, [session.id, quiz.id])
    await client.query('delete from realtime.messages')
    const startedAt = performance.now()
    await client.query('select recompute_survivor_state($1,null,100)', [session.id])
    const elapsedMs = performance.now() - startedAt
    const states = await client.query(`select survivor_lives_remaining,survivor_eliminated_at_question
      from players where game_session_id=$1`, [session.id])
    assert.equal(states.rowCount, 75)
    assert(states.rows.every((player) => player.survivor_lives_remaining === 0 && player.survivor_eliminated_at_question >= 1))
    assert.equal(Number((await client.query('select count(*) n from realtime.messages')).rows[0].n), 0)
    const answerRows = Number((await client.query('select count(*) n from player_answers where game_session_id=$1', [session.id])).rows[0].n)
    const result = { players: 75, questions: 100, answerRows, elapsedMs: Number(elapsedMs.toFixed(2)), perPlayerBroadcasts: 0, correct: true }
    console.log(JSON.stringify(result))
    return result
  } finally {
    await client.query('rollback')
  }
}
