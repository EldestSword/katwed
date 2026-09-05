begin;
select plan(1);

create function pg_temp.survivor_question(p_order integer,p_buzz boolean default false) returns jsonb language sql as $$
  select jsonb_build_object(
    'id',gen_random_uuid(),'type','typed-answer','prompt','Name the answer','supportingText','',
    'timeLimitSeconds',60,'points',1000,'buzzInEnabled',p_buzz,'wagerEnabled',not p_buzz,
    'progressiveRevealEnabled',false,'speedScoringEnabled',false,'doubleScore',false,'displayOrder',p_order,
    'media','{"type":"none"}'::jsonb,'mediaVisibility','both','presentationChoiceVisibility','show',
    'correctAnswer','Alex','acceptedAnswers','[]'::jsonb)
$$;

create function pg_temp.survivor_quiz(p_questions jsonb) returns jsonb language sql as $$
  select jsonb_build_object('title','Survivor SQL','quizType','standard','roster','[]'::jsonb,
    'headToHeadCompetitors','[]'::jsonb,'questions',p_questions)
$$;

do $survivor$
declare
  owner_id uuid:=gen_random_uuid(); quiz jsonb; session jsonb; points_session jsonb;
  carol jsonb; roger jsonb; jaki jsonb; safe jsonb; claim jsonb;
  sid uuid; answer_id uuid; failed boolean;
begin
  insert into auth.users(id,email) values(owner_id,'survivor@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  assert not has_function_privilege('anon','public.recompute_survivor_state(uuid,uuid,integer)','execute');
  assert not has_function_privilege('authenticated','public.survivor_leaderboard(uuid)','execute');

  quiz:=public.host_save_quiz(pg_temp.survivor_quiz(jsonb_build_array(
    pg_temp.survivor_question(0,false),pg_temp.survivor_question(1,true))));

  -- An old launch call remains Points. Invalid combinations fail before a room is created.
  points_session:=public.host_launch_game((quiz->>'id')::uuid);
  assert points_session->'settings'->>'competitionMode'='points';
  assert (select competition_mode='points' and survivor_starting_lives is null from public.game_sessions where id=(points_session->>'id')::uuid);
  perform public.host_close_game((points_session->>'id')::uuid);
  failed:=false;begin
    perform public.host_launch_game((quiz->>'id')::uuid,'{"competitionMode":"survivor","survivorStartingLives":2,"soundPackId":"none"}');
  exception when others then failed:=position('1 life or 3 lives' in sqlerrm)>0;end;assert failed,'Invalid lives launched';
  failed:=false;begin
    perform public.host_launch_game((quiz->>'id')::uuid,'{"competitionMode":"survivor","survivorStartingLives":3,"playMode":"teams","teamNames":["A","B"],"soundPackId":"none"}');
  exception when others then failed:=position('individual play' in sqlerrm)>0;end;assert failed,'Team Survivor launched';

  session:=public.host_launch_game((quiz->>'id')::uuid,
    '{"competitionMode":"survivor","survivorStartingLives":1,"soundPackId":"none","autoLockWhenAllAnswered":false}');
  sid:=(session->>'id')::uuid;
  carol:=public.join_room(session->>'roomCode','Carol');
  roger:=public.join_room(session->>'roomCode','Roger');
  jaki:=public.join_room(session->>'roomCode','Jaki');
  assert carol->'player'->>'survivorLivesRemaining'='1';
  safe:=public.get_player_game_state(session->>'roomCode');
  assert safe->'sessionSettings'->>'competitionMode'='survivor' and safe->'survivorAliveCount'='3' and safe->'eligibleResponderCount'='3';

  perform public.host_start_game(sid);
  perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
  perform public.submit_answer(session->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken','{"type":"typed-answer","value":"Wrong","wagerPercent":100}'::jsonb);
  assert (select bool_and(survivor_lives_remaining=1) from public.players where game_session_id=sid),'Submission leaked correctness into lives';
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);
  assert (select bool_and(survivor_lives_remaining=1) from public.players where game_session_id=sid),'Reveal finalised lives early';
  delete from realtime.messages;
  perform public.host_leaderboard_game(sid);
  assert (select survivor_lives_remaining=1 from public.players where id=(carol->'player'->>'id')::uuid);
  assert (select survivor_lives_remaining=0 and survivor_eliminated_at_question=1 and total_score<0 from public.players where id=(roger->'player'->>'id')::uuid);
  assert (select survivor_lives_remaining=0 and survivor_eliminated_at_question=1 from public.players where id=(jaki->'player'->>'id')::uuid);
  assert (select count(*)=2 from realtime.messages),'Bulk elimination added per-player broadcasts';
  safe:=public.get_player_game_state(session->>'roomCode');
  assert safe->'survivorAliveCount'='1' and safe->'leaderboard'->0->>'playerId'=carol->'player'->>'id';
  assert safe->'leaderboard'->0->>'survivorLivesRemaining'='1' and safe->'leaderboard'->1->>'survivorEliminatedAtQuestion'='1';
  failed:=false;begin perform public.host_next_game(sid);exception when others then failed:=position('final result' in sqlerrm)>0;end;
  assert failed,'Terminal Survivor advanced';

  -- A correction on Leaderboard can revive and undo deterministically.
  select id into answer_id from public.player_answers where player_id=(roger->'player'->>'id')::uuid;
  perform public.host_set_typed_answer_override(sid,answer_id,true);
  assert (select survivor_lives_remaining=1 and survivor_eliminated_at_question is null from public.players where id=(roger->'player'->>'id')::uuid);
  perform public.host_set_typed_answer_override(sid,answer_id,null);
  assert (select survivor_lives_remaining=0 and survivor_eliminated_at_question=1 from public.players where id=(roger->'player'->>'id')::uuid);
  perform public.host_set_typed_answer_override(sid,answer_id,true);
  perform public.host_next_game(sid);

  -- Eliminated spectators cannot claim or answer. Buzz remains neutral for all.
  safe:=public.get_player_game_state(session->>'roomCode');
  assert safe->'eligibleResponderCount'='0';
  failed:=false;begin
    perform public.claim_buzz(session->>'roomCode',(jaki->'player'->>'id')::uuid,jaki->>'reconnectToken');
  exception when insufficient_privilege then failed:=true;end;assert failed,'Eliminated player claimed Buzz';
  claim:=public.claim_buzz(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken');
  assert claim->>'won'='true';
  safe:=public.get_player_game_state(session->>'roomCode');assert safe->'eligibleResponderCount'='1';
  perform public.host_reset_buzz(sid);
  assert (select survivor_lives_remaining=1 from public.players where id=(carol->'player'->>'id')::uuid);
  perform public.claim_buzz(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken');
  perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Wrong"}'::jsonb);
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_finish_game(sid);
  assert (select bool_and(survivor_lives_remaining=1) from public.players where id in ((carol->'player'->>'id')::uuid,(roger->'player'->>'id')::uuid)),'Buzz changed lives';
  assert public.reconnect_player(session->>'roomCode',(jaki->'player'->>'id')::uuid,jaki->>'reconnectToken')->'player'->>'survivorLivesRemaining'='0';
  perform public.host_restart_game(sid);
  assert (select bool_and(survivor_lives_remaining=1 and survivor_eliminated_at_question is null) from public.players where game_session_id=sid),'Restart did not restore lives';

  -- Three-life mode and correctness-only partial/missing history.
  perform public.host_close_game(sid);
  session:=public.host_launch_game((quiz->>'id')::uuid,
    '{"competitionMode":"survivor","survivorStartingLives":3,"soundPackId":"none","autoLockWhenAllAnswered":false}');
  sid:=(session->>'id')::uuid;carol:=public.join_room(session->>'roomCode','Partial');roger:=public.join_room(session->>'roomCode','Missing');
  assert carol->'player'->>'survivorLivesRemaining'='3';
  perform public.host_start_game(sid);
  perform public.submit_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Wrong","wagerPercent":100}'::jsonb);
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_finish_game(sid);
  assert (select bool_and(survivor_lives_remaining=2) from public.players where game_session_id=sid),'Reveal early finish excluded completed damage';
  perform public.host_restart_game(sid);
  update public.game_sessions set phase='reveal' where id=sid;
  insert into public.player_answers(game_session_id,question_id,player_id,answer_payload,response_time_ms,correct,automatic_correct,points_awarded)
    values(sid,(quiz->'questions'->0->>'id')::uuid,(carol->'player'->>'id')::uuid,'{"type":"typed-answer","value":"partial"}',1000,false,false,500);
  perform public.recompute_survivor_state(sid,null,1);
  assert (select survivor_lives_remaining=2 from public.players where id=(carol->'player'->>'id')::uuid),'Positive partial points prevented damage';
  assert (select survivor_lives_remaining=2 from public.players where id=(roger->'player'->>'id')::uuid),'Missing answer did not cause damage';

  -- Zero survivors is a valid terminal result.
  update public.players set survivor_lives_remaining=0,survivor_eliminated_at_question=1 where game_session_id=sid;
  update public.game_sessions set phase='leaderboard' where id=sid;
  perform public.host_finish_game(sid);
  assert (select phase='finished' from public.game_sessions where id=sid);
end $survivor$;

select pass('Survivor authority, safety, ranking, correction, Buzz neutrality and compatibility passed');
select * from finish();
rollback;
