begin;
select plan(1);
create function pg_temp.connection_question(p_total integer default 4) returns jsonb language sql as $$
  select jsonb_build_object('id',gen_random_uuid(),'type','connections','prompt','What connects these clues?',
    'timeLimitSeconds',120,'points',1000,'speedScoringEnabled',true,'doubleScore',false,'displayOrder',0,
    'media',jsonb_build_object('type','none'),'mediaVisibility','both','presentationChoiceVisibility','show',
    'clues',(select jsonb_agg(jsonb_build_object('id','c'||n,'text',' Secret clue '||n||' ') order by n) from generate_series(1,p_total) n),
    'correctAnswer','Planets','acceptedAnswers',jsonb_build_array('Solar worlds'))
$$;
create function pg_temp.connection_quiz(p_question jsonb) returns jsonb language sql as $$
  select jsonb_build_object('title','Connections SQL','quizType','standard','roster','[]'::jsonb,'headToHeadCompetitors','[]'::jsonb,'questions',jsonb_build_array(p_question))
$$;

do $connections$
declare owner_id uuid:=gen_random_uuid(); q jsonb; s jsonb; p jsonb; late_player jsonb; wrong_player jsonb; state jsonb; before_state jsonb;
  question jsonb; bad jsonb; sid uuid; qid uuid; failed boolean; n integer; r integer; expected integer; rejects integer:=0;
  phase_name text; timer_open timestamptz; timer_close timestamptz; r1 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); r3 uuid:=gen_random_uuid(); competitor uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email) values(owner_id,'connections@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  -- Every stage, including fractional floors, uses the same integer formula as TypeScript.
  for n in 2..6 loop for r in 1..n loop
    assert public.connection_stage_points(1000,n,r)=floor(1000::numeric*(n-r+1)/n)::int,'Stage formula differs';
    assert public.connection_stage_points(999,n,r)=floor(999::numeric*(n-r+1)/n)::int,'Fractional formula differs';
  end loop; end loop;
  question:=pg_temp.connection_question();
  foreach bad in array array[
    '{"clues":[]}'::jsonb,'{"clues":null}','{"correctAnswer":"!!!"}','{"correctAnswer":null}',
    '{"acceptedAnswers":["P-L-A-N-E-T-S"]}','{"acceptedAnswers":["Moon","MOON"]}',
    jsonb_build_object('acceptedAnswers',(select jsonb_agg('Answer'||variant) from generate_series(1,20) variant)),
    jsonb_build_object('clues',jsonb_set(question->'clues','{0,id}','"c2"')),
    jsonb_build_object('clues',jsonb_set(question->'clues','{0,text}','" SECRET CLUE 2 "')),
    jsonb_build_object('clues',jsonb_set(question->'clues','{0,text}','" "')),
    jsonb_build_object('clues',jsonb_set(question->'clues','{0,text}',to_jsonb(repeat('x',201)))),
    jsonb_build_object('clues',jsonb_set(question->'clues','{0,image}','"future.png"')),
    jsonb_build_object('clues',pg_temp.connection_question(7)->'clues')
  ] loop
    failed:=false; begin perform public.host_save_quiz(pg_temp.connection_quiz(question||bad)); exception when others then failed:=true; end;
    assert failed,'Malformed Connections definition saved: '||bad; rejects:=rejects+1;
  end loop;
  failed:=false;
  begin perform public.host_save_quiz(pg_temp.connection_quiz(question||jsonb_build_object('assignedCompetitorId',competitor))||jsonb_build_object('quizType','head-to-head',
    'headToHeadCompetitors',jsonb_build_array(jsonb_build_object('id',competitor,'displayName','One','displayOrder',0),jsonb_build_object('id',gen_random_uuid(),'displayName','Two','displayOrder',1))));
  exception when others then failed:=position('Standard-only' in sqlerrm)>0; end;
  assert failed,'H2H accepted Connections';
  q:=public.host_save_quiz(pg_temp.connection_quiz(question||jsonb_build_object('id',gen_random_uuid())));
  update public.quizzes set quiz_type='head-to-head' where id=(q->>'id')::uuid;
  failed:=false; begin perform public.host_launch_game((q->>'id')::uuid,'{"soundPackId":"none"}'); exception when others then failed:=position('Standard-only' in sqlerrm)>0; end;
  assert failed,'Malformed stored H2H Connections quiz launched';
  assert not has_function_privilege('anon','public.host_reveal_connection_clue(uuid)','execute'),'Anonymous host action exposed';
  assert not has_function_privilege('anon','public.connection_safe_config(jsonb,integer,boolean,integer,boolean)','execute'),'Internal helper exposed';

  -- Real save/launch, three rounds, per-player one-guess scores and team aggregation.
  q:=public.host_save_quiz(pg_temp.connection_quiz(question||jsonb_build_object('roundId',r1))||jsonb_build_object(
    'rounds',jsonb_build_array(
      jsonb_build_object('id',r1,'title','First','subtitle','','displayOrder',0,'introEnabled',true),
      jsonb_build_object('id',r2,'title','Second','subtitle','','displayOrder',1,'introEnabled',true),
      jsonb_build_object('id',r3,'title','Last','subtitle','','displayOrder',2,'introEnabled',false)),
    'questions',jsonb_build_array(question||jsonb_build_object('roundId',r1),
      pg_temp.connection_question()||jsonb_build_object('roundId',r2,'displayOrder',1,'doubleScore',true),
      (question-array['clues','correctAnswer','acceptedAnswers'])||jsonb_build_object('id',gen_random_uuid(),'type','true-false','correctValue',true,'supportingText','','roundId',r3,'displayOrder',2))));
  assert q->'questions'->0->'clues'->0->>'text'='Secret clue 1','Host save did not trim clue text';
  assert q->'questions'->0->>'speedScoringEnabled'='false','Save retained speed scoring';
  assert public.host_get_quiz((q->>'id')::uuid)->'questions'=q->'questions','Host reload changed clues/answers';
  s:=public.host_launch_game((q->>'id')::uuid,'{"soundPackId":"none","playMode":"teams","teamNames":["Blue","Red"],"teamAssignmentMode":"balanced-random"}'); sid:=(s->>'id')::uuid;
  p:=public.join_room(s->>'roomCode','Early'); late_player:=public.join_room(s->>'roomCode','Late'); wrong_player:=public.join_room(s->>'roomCode','Wrong');
  foreach phase_name in array array['lobby','round-intro'] loop
    if phase_name='round-intro' then perform public.host_start_game(sid); end if;
    assert (select connection_clue_count=0 from public.game_sessions where id=sid),'Intro/lobby retained progress';
    failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when others then failed:=true; end;
    assert failed,'Clue reveal allowed outside question';
    assert public.get_player_game_state(s->>'roomCode')->'currentQuestion'='null'::jsonb,'Intro leaked a question';
  end loop;
  perform public.host_start_round_game(sid);
  -- Advance past the existing mixed-type prelude in this transaction's local fixture.
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '119 seconds' where id=sid;
  select current_question_id,question_opened_at,question_closes_at into qid,timer_open,timer_close from public.game_sessions where id=sid;
  state:=public.get_player_game_state(s->>'roomCode'); before_state:=state;
  assert state->'currentQuestion'->>'revealedClueCount'='1' and state->'currentQuestion'->>'availablePoints'='1000','First clue not open';
  assert state::text not like '%Secret clue 2%' and state::text not like '%Planets%' and state::text not like '%Solar worlds%','Future clue/key leaked';
  assert public.question_to_json(qid,false)::text not like '%Secret clue%','Context-free reader leaked clues';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when insufficient_privilege then failed:=true; end;
  assert failed,'Non-owner revealed a clue'; perform set_config('request.jwt.claim.sub',owner_id::text,true);
  foreach bad in array array['{}'::jsonb,'{"type":"typed-answer","value":"Planets"}','{"type":"connections","value":null}',
    '{"type":"connections","value":"!!!"}','{"type":"connections","value":"Planets","revealedClueCount":1}',
    jsonb_build_object('type','connections','value',repeat('a',121))] loop
    failed:=false; begin perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',bad); exception when others then failed:=true; end;
    assert failed,'Invalid answer accepted'; rejects:=rejects+1;
  end loop;
  perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"connections","value":"ＰＬＡＮＥＴＳ!"}'::jsonb);
  perform public.submit_answer(s->>'roomCode',(wrong_player->'player'->>'id')::uuid,wrong_player->>'reconnectToken','{"type":"connections","value":"Stars"}'::jsonb);
  perform public.host_reveal_connection_clue(sid); perform public.host_reveal_connection_clue(sid);
  assert (select phase='question' and connection_clue_count=3 and question_opened_at=timer_open and question_closes_at=timer_close from public.game_sessions where id=sid),'Clue changed timer/phase';
  assert (select count(*)=2 from public.player_answers where game_session_id=sid),'Reveal mutated answers';
  perform public.submit_answer(s->>'roomCode',(late_player->'player'->>'id')::uuid,late_player->>'reconnectToken','{"type":"connections","value":" Solar-worlds! "}'::jsonb);
  assert (select points_awarded=1000 from public.player_answers where question_id=qid and player_id=(p->'player'->>'id')::uuid),'Early answer not 1000';
  assert (select points_awarded=500 and correct from public.player_answers where question_id=qid and player_id=(late_player->'player'->>'id')::uuid),'Alternative/stage incorrect';
  assert (select points_awarded=0 and not correct from public.player_answers where question_id=qid and player_id=(wrong_player->'player'->>'id')::uuid),'Wrong answer scored';
  failed:=false; begin perform public.submit_answer(s->>'roomCode',(wrong_player->'player'->>'id')::uuid,wrong_player->>'reconnectToken','{"type":"connections","value":"Planets"}'::jsonb); exception when others then failed:=true; end;
  assert failed and (select count(*)=3 from public.player_answers where question_id=qid),'A second guess was allowed';
  assert public.reconnect_player(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken') is not null,'Reconnect failed';
  perform public.host_lock_game(sid); state:=public.get_player_game_state(s->>'roomCode');
  assert state->'currentQuestion'->>'revealedClueCount'='3' and state::text not like '%Secret clue 4%' and state->'reveal'='null'::jsonb,'Locked leaked future clues/key';
  foreach phase_name in array array['locked','reveal','leaderboard'] loop
    if phase_name='reveal' then perform public.host_reveal_game(sid); elsif phase_name='leaderboard' then perform public.host_leaderboard_game(sid); end if;
    failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when others then failed:=true; end;
    assert failed,'Clue reveal allowed in '||phase_name;
  end loop;
  state:=public.get_player_game_state(s->>'roomCode');
  assert state->'currentQuestion'->>'revealedClueCount'='4' and state->'reveal'->>'correctAnswer'='Planets','Reveal incomplete';
  assert jsonb_array_length(state->'reveal'->'correctPlayerIds')=2 and state::text not like '%Solar worlds%','Correctness or alternative privacy incorrect';
  perform public.host_next_game(sid); assert (select phase='round-intro' and connection_clue_count=0 from public.game_sessions where id=sid),'Next round retained progress';
  perform public.host_start_round_game(sid); assert (select connection_clue_count=1 from public.game_sessions where id=sid),'Second Connections did not reset';
  -- Simulate malformed legacy speed flag without changing authored trigger behaviour.
  alter table public.questions disable trigger questions_validate_multiformat;
  update public.questions set speed_scoring_enabled=true where id=(select current_question_id from public.game_sessions where id=sid);
  alter table public.questions enable trigger questions_validate_multiformat;
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '60 seconds',question_closes_at=clock_timestamp()+interval '60 seconds' where id=sid;
  perform public.host_reveal_connection_clue(sid); perform public.host_reveal_connection_clue(sid);
  perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"connections","value":"Planets"}'::jsonb);
  assert (select points_awarded=1000 from public.player_answers where question_id=(select current_question_id from public.game_sessions where id=sid) and player_id=(p->'player'->>'id')::uuid),'Double/speed-ignore failed';
  perform public.host_lock_game(sid); perform public.host_reveal_game(sid); perform public.host_leaderboard_game(sid); perform public.host_next_game(sid);
  assert (select phase='question' and connection_clue_count=0 from public.game_sessions where id=sid),'Non-Connections retained clue progress';
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '119 seconds' where id=sid;
  failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when others then failed:=true; end; assert failed,'Non-Connections reveal accepted';
  perform public.host_lock_game(sid); perform public.host_reveal_game(sid); perform public.host_finish_game(sid);
  state:=public.get_player_game_state(s->>'roomCode');
  assert (select sum((e->>'totalScore')::int)=2500 from jsonb_array_elements(state->'leaderboard') e),'Individual totals changed';
  assert (select bool_and(e->>'teamId' is not null) from jsonb_array_elements(state->'players') e),'Team membership lost';
  failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when others then failed:=true; end; assert failed,'Finished reveal accepted';
  perform public.host_restart_game(sid); assert (select phase='lobby' and connection_clue_count=0 from public.game_sessions where id=sid),'Restart retained progress';
  raise notice 'Connections definitions/payloads: % rejections; Teams, Rounds, privacy, one guess, normalisation, Double and speed-ignore passed',rejects;
end $connections$;

do $burst$
declare owner_id uuid:=gen_random_uuid(); q jsonb; s jsonb; p jsonb; sid uuid; i integer; failed boolean;
begin
  insert into auth.users(id,email) values(owner_id,'connections-burst@example.invalid'); perform set_config('request.jwt.claim.sub',owner_id::text,true);
  q:=public.host_save_quiz(pg_temp.connection_quiz(pg_temp.connection_question(6)));
  s:=public.host_launch_game((q->>'id')::uuid,'{"soundPackId":"none"}'); sid:=(s->>'id')::uuid;
  create temporary table connection_players as select public.join_room(s->>'roomCode','Player '||n) joined from generate_series(1,75) n;
  perform public.host_start_game(sid);
  -- Only the local fixture records realtime.send calls; hosted tests can count via an equivalent spy.
  delete from realtime.messages;
  for i in 2..6 loop perform public.host_reveal_connection_clue(sid); end loop;
  assert (select count(*)=5 from realtime.messages where topic='katwed:'||(s->>'roomCode')),'Expected exactly five room refreshes';
  assert (select count(*)=5 from realtime.messages where topic='katwed:'||sid::text),'Expected five existing host-topic copies';
  for p in select joined from connection_players loop
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"connections","value":"Planets"}'::jsonb);
  end loop;
  assert (select count(*)=75 and min(points_awarded)=166 and max(points_awarded)=166 from public.player_answers where game_session_id=sid),'Burst lost answers/stage points';
  assert (select count(*)=10 from realtime.messages),'Answers caused broadcasts';
  failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when others then failed:=true; end; assert failed,'Seventh clue accepted';
  update public.game_sessions set connection_clue_count=0 where id=sid;
  failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when others then failed:=true; end; assert failed,'Invalid current stage accepted';
  update public.game_sessions set connection_clue_count=1,question_closes_at=clock_timestamp()-interval '1 second' where id=sid;
  failed:=false; begin perform public.host_reveal_connection_clue(sid); exception when others then failed:=true; end; assert failed,'Expired question revealed a clue';
  raise notice '75-player answer burst: 75 scores, zero answer broadcasts; six clues: five room refreshes plus five existing host copies';
end $burst$;
select pass('Connections authoritative validation, privacy, progression, scoring, team totals and bounded broadcasts');
select * from finish();
rollback;
