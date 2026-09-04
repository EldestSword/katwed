begin;
select plan(1);

create function pg_temp.buzz_question(p_order integer,p_buzz boolean) returns jsonb language sql as $$
  select jsonb_build_object(
    'id',gen_random_uuid(),'type','typed-answer','prompt','Name the person','supportingText','',
    'timeLimitSeconds',30,'points',1000,'buzzInEnabled',p_buzz,'wagerEnabled',p_buzz,
    'progressiveRevealEnabled',false,'speedScoringEnabled',false,'doubleScore',false,'displayOrder',p_order,
    'media','{"type":"none"}'::jsonb,'mediaVisibility','both','presentationChoiceVisibility','show',
    'correctAnswer','Alex','acceptedAnswers','["Alexander"]'::jsonb)
$$;

create function pg_temp.buzz_quiz(p_questions jsonb) returns jsonb language sql as $$
  select jsonb_build_object('title','Buzz-In SQL','quizType','standard','roster','[]'::jsonb,
    'headToHeadCompetitors','[]'::jsonb,'questions',p_questions)
$$;

do $buzz$
declare
  owner_id uuid:=gen_random_uuid(); definition jsonb; quiz jsonb; session jsonb; carol jsonb; roger jsonb;
  state jsonb; claim jsonb; second_claim jsonb; sid uuid; answer_id uuid; elapsed integer; failed boolean;
  bad jsonb; stored_question_id uuid; c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email) values(owner_id,'buzz@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  assert has_function_privilege('anon','public.claim_buzz(text,uuid,text)','execute');
  assert has_function_privilege('authenticated','public.claim_buzz(text,uuid,text)','execute');
  assert not has_function_privilege('anon','public.host_reset_buzz(uuid)','execute');
  assert has_function_privilege('authenticated','public.host_reset_buzz(uuid)','execute');
  assert not has_function_privilege('anon','public.buzz_state_to_json(public.game_sessions)','execute');

  -- Missing flags retain ordinary behaviour and malformed authored values fail loudly.
  quiz:=public.host_save_quiz(pg_temp.buzz_quiz(jsonb_build_array(pg_temp.buzz_question(0,false)-'buzzInEnabled')));
  assert quiz->'questions'->0->>'buzzInEnabled'='false','Legacy Buzz flag did not default false';
  foreach bad in array array['null'::jsonb,'"true"','1','{}','[]'] loop
    failed:=false;
    begin
      perform public.host_save_quiz(pg_temp.buzz_quiz(jsonb_build_array(pg_temp.buzz_question(0,false)||jsonb_build_object('buzzInEnabled',bad))));
    exception when others then failed:=position('Buzz-In' in sqlerrm)>0; end;
    assert failed,'Malformed Buzz flag saved: '||bad;
  end loop;

  definition:=pg_temp.buzz_question(0,true)||'{"type":"connections","clues":[{"id":"one","text":"One"},{"id":"two","text":"Two"}]}'::jsonb;
  failed:=false;begin perform public.host_save_quiz(pg_temp.buzz_quiz(jsonb_build_array(definition)));exception when others then failed:=position('Buzz-In' in sqlerrm)>0;end;
  assert failed,'Connections Buzz saved';
  definition:=pg_temp.buzz_question(0,true)||'{"progressiveRevealEnabled":true,"media":{"type":"image","path":"/answer.svg","altText":"Answer","revealEffect":"blur","revealDurationSeconds":20}}'::jsonb;
  failed:=false;begin perform public.host_save_quiz(pg_temp.buzz_quiz(jsonb_build_array(definition)));exception when others then failed:=position('Buzz-In' in sqlerrm)>0;end;
  assert failed,'Progressive Buzz saved';
  definition:=pg_temp.buzz_question(0,true)||jsonb_build_object('assignedCompetitorId',c1);
  failed:=false;begin
    perform public.host_save_quiz(pg_temp.buzz_quiz(jsonb_build_array(definition))||jsonb_build_object(
      'quizType','head-to-head','headToHeadCompetitors',jsonb_build_array(
        jsonb_build_object('id',c1,'displayName','One','displayOrder',0),
        jsonb_build_object('id',c2,'displayName','Two','displayOrder',1))));
  exception when others then failed:=position('Buzz-In' in sqlerrm)>0;end;
  assert failed,'Head-to-Head Buzz saved';

  -- Wager, Teams and Rounds share the existing score path. Buzz questions are
  -- removed before compact streak positions are calculated.
  definition:=pg_temp.buzz_quiz(jsonb_build_array(
    pg_temp.buzz_question(0,false),pg_temp.buzz_question(1,true),pg_temp.buzz_question(2,false)));
  quiz:=public.host_save_quiz(definition);
  session:=public.host_launch_game((quiz->>'id')::uuid,
    '{"soundPackId":"none","autoLockWhenAllAnswered":false,"playMode":"teams","teamAssignmentMode":"balanced-random","teamNames":["Blue","Red"]}');
  sid:=(session->>'id')::uuid;
  carol:=public.join_room(session->>'roomCode','Carol');
  roger:=public.join_room(session->>'roomCode','Roger');
  perform public.host_start_game(sid);
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '29 seconds' where id=sid;
  perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_leaderboard_game(sid);
  assert (select current_correct_streak=1 from public.players where id=(carol->'player'->>'id')::uuid),'Ordinary streak did not start';
  perform public.host_next_game(sid);
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '4 seconds',question_closes_at=clock_timestamp()+interval '26 seconds' where id=sid;

  failed:=false;begin
    perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
  exception when others then failed:=position('Nobody has won' in sqlerrm)>0;end;
  assert failed,'Answer accepted before a Buzz winner';
  failed:=false;begin perform public.claim_buzz(session->>'roomCode',(carol->'player'->>'id')::uuid,'wrong-token');exception when insufficient_privilege then failed:=true;end;
  assert failed,'Invalid reconnect token claimed Buzz';

  delete from realtime.messages;
  claim:=public.claim_buzz(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken');
  assert claim->>'won'='true' and claim->>'winnerPlayerId'=carol->'player'->>'id','First valid claim did not win';
  assert extract(epoch from ((claim->>'answerDeadlineAt')::timestamptz-(claim->>'claimedAt')::timestamptz)) between 9.9 and 10.0,'Answer window was not ten seconds';
  assert (select count(*)=1 from realtime.messages where topic='katwed:'||(session->>'roomCode')),'Winning claim missed room refresh';
  assert (select count(*)=1 from realtime.messages where topic='katwed:'||(session->>'id')),'Winning claim missed controller refresh';
  delete from realtime.messages;
  second_claim:=public.claim_buzz(session->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken');
  assert second_claim->>'won'='false' and second_claim->>'winnerPlayerId'=carol->'player'->>'id','Losing claim invented a winner';
  assert (select count(*)=0 from realtime.messages),'Losing claim wrote or broadcast';
  state:=public.get_player_game_state(session->>'roomCode');
  assert state->'buzz'->>'winnerPlayerId'=carol->'player'->>'id' and state->'currentQuestion'->>'buzzInEnabled'='true','Safe Buzz state missing';
  assert position('reconnectToken' in state::text)=0 and state->'leaderboard'='[]'::jsonb,'Buzz safe state leaked private data';
  failed:=false;begin
    perform public.submit_answer(session->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
  exception when insufficient_privilege then failed:=true;end;
  assert failed,'Loser submitted an answer';

  delete from realtime.messages;
  perform public.host_reset_buzz(sid);
  assert (select buzz_winner_player_id is null from public.game_sessions where id=sid),'Reset retained a winner';
  assert (select count(*)=2 from realtime.messages),'Reset did not use the existing two refresh topics';
  claim:=public.claim_buzz(session->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken');
  delete from realtime.messages;
  perform public.submit_answer(session->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken','{"type":"typed-answer","value":"Alexander","wagerPercent":50}'::jsonb);
  select id,response_time_ms into answer_id,elapsed from public.player_answers
    where game_session_id=sid and question_id=(quiz->'questions'->1->>'id')::uuid and player_id=(roger->'player'->>'id')::uuid;
  assert elapsed>=3900,'Buzz claim time replaced the ordinary question response time';
  assert (select points_awarded=1500 from public.player_answers where id=answer_id),'Wager plus Buzz changed scoring';
  assert (select phase='question' from public.game_sessions where id=sid),'Auto-lock ignored the disabled setting';
  assert (select count(*)=0 from realtime.messages),'Ordinary answer broadcast was added';
  failed:=false;begin perform public.host_reset_buzz(sid);exception when others then failed:=position('after the winner has answered' in sqlerrm)>0;end;
  assert failed,'Answered Buzz was reset';
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_leaderboard_game(sid);
  assert (select current_correct_streak=1 and longest_correct_streak=1 from public.players where id=(carol->'player'->>'id')::uuid),'Missing Buzz broke an ordinary streak';
  assert (select current_correct_streak=0 and longest_correct_streak=0 from public.players where id=(roger->'player'->>'id')::uuid),'Correct Buzz advanced a streak';
  perform public.host_next_game(sid);
  assert (select buzz_winner_player_id is null from public.game_sessions where id=sid),'Next question retained stale Buzz state';
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '29 seconds' where id=sid;
  perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_finish_game(sid);
  assert (select current_correct_streak=2 and longest_correct_streak=2 from public.players where id=(carol->'player'->>'id')::uuid),'Compact streak history was not two ordinary questions';

  -- Question close truncates the answer deadline. At either deadline, the
  -- winner is refused. This game also verifies winner-submit auto-lock.
  quiz:=public.host_save_quiz(pg_temp.buzz_quiz(jsonb_build_array(pg_temp.buzz_question(0,true)||'{"wagerEnabled":false}'::jsonb)));
  session:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none","autoLockWhenAllAnswered":true}');sid:=(session->>'id')::uuid;
  carol:=public.join_room(session->>'roomCode','Deadline');perform public.host_start_game(sid);
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '3 seconds' where id=sid;
  claim:=public.claim_buzz(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken');
  assert (claim->>'answerDeadlineAt')::timestamptz<=(select question_closes_at from public.game_sessions where id=sid),'Buzz deadline exceeded question close';
  perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex","wagerPercent":0}'::jsonb);
  assert (select phase='locked' from public.game_sessions where id=sid),'Buzz winner did not auto-lock';
  assert (select buzz_answer_deadline_at<=question_closes_at from public.game_sessions where id=sid),'Auto-lock left an impossible Buzz deadline';

  quiz:=public.host_save_quiz(pg_temp.buzz_quiz(jsonb_build_array(pg_temp.buzz_question(0,true)||'{"wagerEnabled":false}'::jsonb)));
  session:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none","autoLockWhenAllAnswered":false}');sid:=(session->>'id')::uuid;
  carol:=public.join_room(session->>'roomCode','Expired');perform public.host_start_game(sid);
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '30 seconds' where id=sid;
  perform public.claim_buzz(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken');
  update public.game_sessions set buzz_claimed_at=clock_timestamp()-interval '2 seconds',
    buzz_answer_deadline_at=clock_timestamp()-interval '1 millisecond' where id=sid;
  failed:=false;begin
    perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex","wagerPercent":0}'::jsonb);
  exception when others then failed:=position('window has closed' in sqlerrm)>0;end;
  assert failed,'Expired winner submitted';
  perform public.host_lock_game(sid);
  assert (select buzz_answer_deadline_at<=question_closes_at from public.game_sessions where id=sid),'Manual lock left an impossible Buzz deadline';
  state:=public.get_player_game_state(session->>'roomCode');
  assert state->>'phase'='locked' and state->'buzz'->>'winnerPlayerId'=carol->'player'->>'id','Locked safe state lost the Buzz winner';
  perform public.host_close_game(sid);
  assert (select buzz_winner_player_id is null and buzz_claimed_at is null and buzz_answer_deadline_at is null from public.game_sessions where id=sid),'Closing room retained stale Buzz state';

  -- A malformed stored Standard definition cannot be launched as H2H.
  stored_question_id:=(quiz->'questions'->0->>'id')::uuid;
  update public.quizzes set quiz_type='head-to-head' where id=(quiz->>'id')::uuid;
  failed:=false;begin perform public.host_launch_game((quiz->>'id')::uuid);exception when others then failed:=position('Buzz-In is Standard-only' in sqlerrm)>0;end;
  assert failed,'Malformed stored H2H Buzz launched';
end $buzz$;

select pass('Buzz-In authority, deadlines, privacy, reset, compatibility and neutral streaks');
select * from finish();
rollback;
