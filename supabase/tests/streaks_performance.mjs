import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** Disposable, fully migrated PostgreSQL only. No network or project discovery. */
export async function testStreakPerformance(client) {
  const owner=randomUUID()
  await client.query('begin')
  try {
    await client.query('insert into auth.users(id,email) values($1,$2)',[owner,'streak-performance@example.invalid'])
    await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner])
    const questions=Array.from({length:100},(_,displayOrder)=>({id:randomUUID(),type:'true-false',prompt:'True?',correctValue:true,
      timeLimitSeconds:60,points:1000,speedScoringEnabled:false,doubleScore:false,displayOrder,media:{type:'none'},mediaVisibility:'both',presentationChoiceVisibility:'show'}))
    const quiz=(await client.query('select host_save_quiz($1) q',[{title:'Streak performance',quizType:'standard',roster:[],headToHeadCompetitors:[],questions}])).rows[0].q
    const session=(await client.query('select host_launch_game($1,$2) s',[quiz.id,{soundPackId:'none',autoLockWhenAllAnswered:false}])).rows[0].s
    await client.query(`insert into players(game_session_id,nickname,reconnect_token_hash)
      select $1,'Player '||n,extensions.digest(n::text,'sha256') from generate_series(1,75)n`,[session.id])
    // Synthetic completed history, deliberately different from score order and authored order.
    await client.query(`update game_sessions set question_order=(select array_agg(id order by display_order desc) from questions where quiz_id=$2),
      current_question_index=99,current_question_id=$3,phase='reveal' where id=$1`,[session.id,quiz.id,questions[0].id])
    await client.query(`insert into player_answers(game_session_id,question_id,player_id,answer_payload,response_time_ms,correct,automatic_correct,points_awarded)
      select $1,q.id,p.id,'{"type":"true-false","value":true}'::jsonb,1000,q.display_order%17<>0,q.display_order%17<>0,500
      from players p cross join questions q where p.game_session_id=$1 and q.quiz_id=$2 and q.display_order<>50`,[session.id,quiz.id])
    await client.query('delete from realtime.messages')
    const start=performance.now()
    await client.query('select recompute_player_streaks($1,null,100)',[session.id])
    const elapsedMs=performance.now()-start
    const result=await client.query('select current_correct_streak,longest_correct_streak from players where game_session_id=$1',[session.id])
    assert.equal(result.rowCount,75)
    assert(result.rows.every(p=>p.current_correct_streak===0&&p.longest_correct_streak===16))
    assert.equal(Number((await client.query('select count(*) n from realtime.messages')).rows[0].n),0)
    const answerCount=(await client.query('select count(*) n from player_answers where game_session_id=$1',[session.id])).rows[0].n
    console.log(JSON.stringify({players:75,completedQuestions:100,answerRows:Number(answerCount),elapsedMs:Number(elapsedMs.toFixed(2)),perPlayerBroadcasts:0,correct:true}))
  } finally { await client.query('rollback') }
}
