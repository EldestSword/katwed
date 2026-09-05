begin;
select plan(1);
create function pg_temp.wager_question() returns jsonb language sql as $$
  select jsonb_build_object('id',gen_random_uuid(),'type','typed-answer','prompt','Name the person',
    'timeLimitSeconds',60,'points',1000,'speedScoringEnabled',false,'doubleScore',false,'displayOrder',0,'wagerEnabled',true,
    'media','{"type":"none"}'::jsonb,'mediaVisibility','both','presentationChoiceVisibility','show',
    'correctAnswer','Alex','acceptedAnswers','["Alexander"]'::jsonb)
$$;
create function pg_temp.wager_quiz(p_question jsonb) returns jsonb language sql as $$
  select jsonb_build_object('title','Wager SQL','quizType','standard','roster','[]'::jsonb,'headToHeadCompetitors','[]'::jsonb,'questions',jsonb_build_array(p_question))
$$;
do $wagers$
declare owner_id uuid:=gen_random_uuid(); definition jsonb; quiz jsonb; s jsonb; p jsonb; state jsonb; bad jsonb;
  sid uuid; aid uuid; elapsed integer; earned integer; percent integer; failed boolean; before_row jsonb;
  c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); full_correct boolean; progressive boolean;
begin
  insert into auth.users(id,email) values(owner_id,'wagers@example.invalid'); perform set_config('request.jwt.claim.sub',owner_id::text,true);
  assert public.wager_stake(999,0)=0 and public.wager_stake(999,25)=249 and public.wager_stake(999,50)=499 and public.wager_stake(999,100)=999;
  assert public.wager_stake(2147483647,100)=2147483647,'Stake intermediate overflow';
  assert public.apply_wager(820,1000,true,50)=1320;
  assert public.apply_wager(0,1000,false,50)=-500;
  assert public.apply_wager(500,1000,false,50)=0;
  assert public.apply_wager(250,1000,false,100)=-750;
  assert not has_function_privilege('anon','public.wager_stake(integer,integer)','execute');
  assert not has_function_privilege('authenticated','public.apply_wager(integer,integer,boolean,integer)','execute');
  definition:=pg_temp.wager_question();
  foreach bad in array array['null'::jsonb,'"true"','1','{}','[]'] loop
    failed:=false; begin perform public.host_save_quiz(pg_temp.wager_quiz(definition||jsonb_build_object('wagerEnabled',bad))); exception when others then failed:=position('Wager' in sqlerrm)>0; end;
    assert failed,'Malformed question flag saved';
  end loop;
  quiz:=public.host_save_quiz(pg_temp.wager_quiz(definition-'wagerEnabled'));
  assert quiz->'questions'->0->>'wagerEnabled'='false','Legacy question not default false';
  s:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none"}'); sid:=(s->>'id')::uuid;
  p:=public.join_room(s->>'roomCode','Legacy'); perform public.host_start_game(sid);
  failed:=false; begin perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"typed-answer","value":"Alex","wagerPercent":25}'::jsonb); exception when others then failed:=position('Wager is not enabled' in sqlerrm)>0; end;
  assert failed,'Ordinary question accepted wager';
  perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
  assert (select wager_percent=0 and points_awarded=1000 from public.player_answers where player_id=(p->'player'->>'id')::uuid),'Old payload failed';
  -- Each allowed wager, negative answers, exact metadata, private host and safe state.
  foreach percent in array array[0,25,50,100] loop
    quiz:=public.host_save_quiz(pg_temp.wager_quiz(pg_temp.wager_question()));
    s:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none","autoLockWhenAllAnswered":false}'); sid:=(s->>'id')::uuid;
    p:=public.join_room(s->>'roomCode','Player'); perform public.host_start_game(sid);
    foreach bad in array array['null'::jsonb,'"50"','10','33','75','200','-25','25.1','{}','[]','true'] loop
      failed:=false; begin perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',jsonb_build_object('type','typed-answer','value','Alex','wagerPercent',bad)); exception when others then failed:=position('wager percentage' in sqlerrm)>0; end;
      assert failed,'Invalid wager accepted: '||bad;
    end loop;
    failed:=false; begin perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"typed-answer","value":"Alex","wagerPercent":50,"wager":{"stake":1000}}'::jsonb); exception when others then failed:=true; end;
    assert failed,'Nested wager object accepted';
    select to_jsonb(gs) into before_row from public.game_sessions gs where id=sid;
    delete from realtime.messages;
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',jsonb_build_object('type','typed-answer','value','Wrong','wagerPercent',percent));
    select id into aid from public.player_answers where player_id=(p->'player'->>'id')::uuid;
    assert (select wager_percent=percent and points_awarded=-public.wager_stake(1000,percent) and not correct and not answer_payload ? 'wagerPercent' from public.player_answers where id=aid),'Incorrect stored wager result';
    assert (select total_score=-public.wager_stake(1000,percent) and correct_answer_count=0 and total_correct_response_ms=0 from public.players where id=(p->'player'->>'id')::uuid);
    assert (select count(*)=0 from realtime.messages),'Answer broadcast added';
    assert (select before_row=to_jsonb(gs) from public.game_sessions gs where id=sid),'Answer wrote session';
    state:=public.get_player_game_state(s->>'roomCode');
    assert state->'currentQuestion'->>'wagerEnabled'='true';
    assert state->'leaderboard'='[]'::jsonb and state->'reveal'='null'::jsonb;
    assert position('wagerPercent' in state::text)=0 and position('pointsAwarded' in state::text)=0,'Private wager leaked';
    assert public.host_get_live_session(sid)->'hostResponses'->0->>'wagerPercent'=percent::text,'Private response missing wager';
    failed:=false; begin perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"typed-answer","value":"Alex","wagerPercent":100}'::jsonb); exception when unique_violation then failed:=true; end;
    assert failed,'Duplicate answer accepted';
    perform public.host_lock_game(sid);
    perform public.host_set_typed_answer_override(sid,aid,true);
    assert (select points_awarded=1000+public.wager_stake(1000,percent) from public.player_answers where id=aid),'Accept failed';
    perform public.host_set_typed_answer_override(sid,aid,null);
    assert (select total_score=-public.wager_stake(1000,percent) and correct_answer_count=0 and total_correct_response_ms=0 from public.players where id=(p->'player'->>'id')::uuid),'Undo delta failed';
  end loop;
  -- Progressive original-time correction and Double before the fixed stake.
  definition:=pg_temp.wager_question()||'{"progressiveRevealEnabled":true,"doubleScore":true,"speedScoringEnabled":true,"media":{"type":"image","path":"/image.svg","altText":"Secret Alex","revealEffect":"blur","revealDurationSeconds":20}}';
  quiz:=public.host_save_quiz(pg_temp.wager_quiz(definition));
  s:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none"}'); sid:=(s->>'id')::uuid;
  p:=public.join_room(s->>'roomCode','Progressive'); perform public.host_start_game(sid);
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '10 seconds',question_closes_at=clock_timestamp()+interval '50 seconds' where id=sid;
  perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"typed-answer","value":"Almost","wagerPercent":50}'::jsonb);
  select id,response_time_ms into aid,elapsed from public.player_answers where player_id=(p->'player'->>'id')::uuid;
  perform public.host_lock_game(sid); perform public.host_set_typed_answer_override(sid,aid,true);
  assert (select points_awarded=public.progressive_reveal_score(1000,elapsed,20000)*2+500 from public.player_answers where id=aid),'Progressive override order';
  perform public.host_set_typed_answer_override(sid,aid,null);
  assert (select points_awarded=-500 from public.player_answers where id=aid),'Progressive undo lost stake';
  -- Connections stage 3, correct/wrong, Team totals; exact core payload survives extraction.
  foreach full_correct in array array[true,false] loop
    definition:=pg_temp.wager_question()||'{"type":"connections","doubleScore":true,"clues":[{"id":"a","text":"One"},{"id":"b","text":"Two"},{"id":"c","text":"Three"},{"id":"d","text":"Four"}]}';
    quiz:=public.host_save_quiz(pg_temp.wager_quiz(definition));
    s:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none","playMode":"teams","teamNames":["Blue","Red"],"teamAssignmentMode":"balanced-random"}'); sid:=(s->>'id')::uuid;
    p:=public.join_room(s->>'roomCode','Connections'); perform public.host_start_game(sid);
    update public.game_sessions set question_opened_at=clock_timestamp()-interval '10 seconds',question_closes_at=clock_timestamp()+interval '50 seconds' where id=sid;
    perform public.host_reveal_connection_clue(sid); perform public.host_reveal_connection_clue(sid);
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',jsonb_build_object('type','connections','value',case when full_correct then 'Alexander' else 'Wrong' end,'wagerPercent',100));
    earned:=case when full_correct then 2000 else -1000 end;
    assert (select points_awarded=earned from public.player_answers where player_id=(p->'player'->>'id')::uuid),'Connections stage/Double/wager order';
    assert (select sum(total_score)=earned from public.players where game_session_id=sid),'Team source total';
  end loop;
  -- Partial Matching loses the wager, including raw partial decay before Double.
  foreach progressive in array array[false,true] loop
    definition:=pg_temp.wager_question()-array['correctAnswer','acceptedAnswers']||'{"type":"matching","doubleScore":true,"speedScoringEnabled":true,"leftItems":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"},{"id":"d","label":"D"}],"rightItems":[{"id":"w","label":"W"},{"id":"x","label":"X"},{"id":"y","label":"Y"},{"id":"z","label":"Z"}],"correctPairs":[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"y"},{"leftId":"d","rightId":"z"}],"scoringMode":"partial"}'::jsonb;
    if progressive then definition:=definition||'{"progressiveRevealEnabled":true,"media":{"type":"image","path":"/image.svg","altText":"Matching","revealEffect":"blur","revealDurationSeconds":20}}'; end if;
    quiz:=public.host_save_quiz(pg_temp.wager_quiz(definition));
    s:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none"}'); sid:=(s->>'id')::uuid;
    p:=public.join_room(s->>'roomCode','Matching'); perform public.host_start_game(sid);
    update public.game_sessions set question_opened_at=clock_timestamp()-interval '10 seconds',question_closes_at=clock_timestamp()+interval '50 seconds' where id=sid;
    failed:=false; begin perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"matching","pairs":[],"wagerPercent":50,"extra":true}'::jsonb); exception when others then failed:=true; end;
    assert failed,'Metadata weakened core validation';
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"matching","pairs":[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"z"},{"leftId":"d","rightId":"y"}],"wagerPercent":100}'::jsonb);
    select points_awarded,response_time_ms into earned,elapsed from public.player_answers where player_id=(p->'player'->>'id')::uuid;
    assert earned=(case when progressive then public.progressive_reveal_score(500,elapsed,20000)*2 else 1000 end)-1000,'Partial wager pipeline';
    assert (select correct_answer_count=0 and total_correct_response_ms=0 from public.players where id=(p->'player'->>'id')::uuid),'Partial manufactured correctness';
  end loop;
  -- H2H definition and launch guard, with actual malformed stored data.
  definition:=pg_temp.wager_question()||jsonb_build_object('assignedCompetitorId',c1);
  failed:=false; begin perform public.host_save_quiz(pg_temp.wager_quiz(definition)||jsonb_build_object('quizType','head-to-head','headToHeadCompetitors',jsonb_build_array(jsonb_build_object('id',c1,'displayName','One','displayOrder',0),jsonb_build_object('id',c2,'displayName','Two','displayOrder',1)))); exception when others then failed:=position('Wager is Standard-only' in sqlerrm)>0; end;
  assert failed,'H2H definition accepted';
  quiz:=public.host_save_quiz(pg_temp.wager_quiz(pg_temp.wager_question()));
  update public.quizzes set quiz_type='head-to-head' where id=(quiz->>'id')::uuid;
  failed:=false; begin perform public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none"}'); exception when others then failed:=position('Wager is Standard-only' in sqlerrm)>0; end;
  assert failed,'Malformed H2H launch accepted';
  raise notice 'Wagers: default/strict metadata, negative totals, accept/undo, Progressive/Double, Connections/Team, H2H, privacy and zero broadcasts passed';
end $wagers$;
select pass('Wager authoritative scoring, privacy and compatibility');
select * from finish();
rollback;
