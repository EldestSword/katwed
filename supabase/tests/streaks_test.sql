begin;
select plan(1);
create function pg_temp.streak_definition(p_count integer) returns jsonb language sql as $$
  select jsonb_build_object('title','Streak SQL','quizType','standard','roster','[]'::jsonb,'headToHeadCompetitors','[]'::jsonb,
    'questions',(select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'type','typed-answer','prompt','Name',
      'timeLimitSeconds',60,'points',1000,'wagerEnabled',true,'speedScoringEnabled',false,'doubleScore',false,'displayOrder',n,
      'media','{"type":"none"}'::jsonb,'mediaVisibility','both','presentationChoiceVisibility','show',
      'correctAnswer','Alex','acceptedAnswers','["Alexander"]'::jsonb)) from generate_series(0,p_count-1) n))
$$;
do $streaks$
declare owner_id uuid:=gen_random_uuid(); q jsonb; s jsonb; carol jsonb; roger jsonb; safe jsonb; sid uuid; aid uuid;
  n integer; before_current integer; score_before bigint; failed boolean; action text; round_id uuid:=gen_random_uuid(); first_round uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email) values(owner_id,'streaks@example.invalid'); perform set_config('request.jwt.claim.sub',owner_id::text,true);
  assert not has_function_privilege('anon','public.recompute_player_streaks(uuid,uuid,integer)','execute');
  assert not has_function_privilege('authenticated','public.recompute_player_streaks(uuid,uuid,integer)','execute');
  q:=pg_temp.streak_definition(6);
  q:=q||jsonb_build_object('rounds',jsonb_build_array(
    jsonb_build_object('id',first_round,'title','First','subtitle','','displayOrder',0,'introEnabled',false),
    jsonb_build_object('id',round_id,'title','Second','subtitle','','displayOrder',1,'introEnabled',true)),
    'questions',(select jsonb_agg(value||jsonb_build_object('roundId',case when ord<=3 then first_round else round_id end) order by ord) from jsonb_array_elements(q->'questions') with ordinality a(value,ord)));
  q:=public.host_save_quiz(q);
  s:=public.host_launch_game((q->>'id')::uuid,'{"soundPackId":"none","autoLockWhenAllAnswered":false,"playMode":"teams","teamAssignmentMode":"balanced-random","teamNames":["Blue","Red"]}');sid:=(s->>'id')::uuid;
  carol:=public.join_room(s->>'roomCode','Carol');roger:=public.join_room(s->>'roomCode','Roger');
  assert carol->'player'->>'currentCorrectStreak'='0' and carol->'player'->>'longestCorrectStreak'='0';
  foreach action in array array['negative','inconsistent'] loop
    failed:=false;begin
      update public.players set current_correct_streak=case when action='negative' then -1 else 1 end,longest_correct_streak=0 where id=(carol->'player'->>'id')::uuid;
    exception when check_violation then failed:=true;end;assert failed,'Streak constraint missing';
  end loop;
  perform public.host_start_game(sid);
  for n in 1..6 loop
    select current_correct_streak,total_score into before_current,score_before from public.players where id=(carol->'player'->>'id')::uuid;
    delete from realtime.messages;
    perform public.submit_answer(s->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken',
      jsonb_build_object('type','typed-answer','value',case when n in (3,5) then 'Nearly' else 'Alexander' end,'wagerPercent',100));
    if n<>3 then perform public.submit_answer(s->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken',
      jsonb_build_object('type','typed-answer','value',case when n=4 then 'Wrong' else 'Alex' end));end if;
    assert (select count(*)=0 from realtime.messages),'Answer broadcasts added';
    assert (select current_correct_streak=before_current from public.players where id=(carol->'player'->>'id')::uuid),'Streak changed on submission';
    safe:=public.get_player_game_state(s->>'roomCode');
    assert safe->'leaderboard'='[]'::jsonb and safe->'players'->0->>'totalScore'='0','Premature scores';
    assert (select value->>'currentCorrectStreak'=before_current::text from jsonb_array_elements(safe->'players') where value->>'id'=carol->'player'->>'id'),'Prior streak missing';
    perform public.host_lock_game(sid);
    select id into aid from public.player_answers where player_id=(carol->'player'->>'id')::uuid and question_id=(q->'questions'->(n-1)->>'id')::uuid;
    if n=5 then perform public.host_set_typed_answer_override(sid,aid,true);end if;
    perform public.host_reveal_game(sid);
    assert (select current_correct_streak=before_current from public.players where id=(carol->'player'->>'id')::uuid),'Reveal finalised early';
    select total_score into score_before from public.players where id=(carol->'player'->>'id')::uuid;
    delete from realtime.messages;
    if n=6 then perform public.host_finish_game(sid);else perform public.host_leaderboard_game(sid);end if;
    assert (select total_score=score_before from public.players where id=(carol->'player'->>'id')::uuid),'Streak changed score';
    assert (select count(*)=1 from realtime.messages where topic='katwed:'||(s->>'roomCode')),'Expected one room phase broadcast';
    assert (select count(*)=2 from realtime.messages),'Per-player streak broadcasts added';
    assert (select current_correct_streak=case when n=3 then 0 else n end from public.players where id=(carol->'player'->>'id')::uuid),'Incorrect streak';
    if n=3 then
      assert (select current_correct_streak=0 and longest_correct_streak=2 from public.players where id=(roger->'player'->>'id')::uuid),'No answer did not break streak';
      perform public.host_set_typed_answer_override(sid,aid,true);
      assert (select current_correct_streak=3 and longest_correct_streak=3 from public.players where id=(carol->'player'->>'id')::uuid),'Late accept failed';
      perform public.host_set_typed_answer_override(sid,aid,null);
      assert (select current_correct_streak=0 and longest_correct_streak=2 from public.players where id=(carol->'player'->>'id')::uuid),'Late undo failed';
      perform public.host_set_typed_answer_override(sid,aid,true);
    end if;
    safe:=public.get_player_game_state(s->>'roomCode');
    assert safe->'leaderboard'->0->>'currentCorrectStreak'=n::text,'Leaderboard statistics absent';
    assert (select value->>'currentCorrectStreak'=n::text from jsonb_array_elements(public.host_get_live_session(sid)->'players') where value->>'id'=carol->'player'->>'id'),'Host statistics absent';
    assert public.reconnect_player(s->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken')->'player'->>'currentCorrectStreak'=n::text,'Reconnect lost streak';
    if n<6 then
      perform public.host_next_game(sid);
      if n=3 then
        assert (select phase='round-intro' from public.game_sessions where id=sid);
        assert (select current_correct_streak=3 from public.players where id=(carol->'player'->>'id')::uuid),'Round boundary reset streak';
        perform public.host_start_round_game(sid);
      end if;
    end if;
  end loop;
  perform public.host_restart_game(sid);
  assert (select bool_and(current_correct_streak=0 and longest_correct_streak=0) from public.players where game_session_id=sid),'Restart failed';
  -- Manual early Finish excludes even an already-submitted correct current answer.
  foreach action in array array['question','locked'] loop
    perform public.host_start_game(sid);
    perform public.submit_answer(s->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
    perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_leaderboard_game(sid);perform public.host_next_game(sid);
    perform public.submit_answer(s->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
    if action='locked' then perform public.host_lock_game(sid);end if;
    perform public.host_finish_game(sid);
    assert (select current_correct_streak=1 and longest_correct_streak=1 from public.players where id=(carol->'player'->>'id')::uuid),'Early finish counted unresolved answer';
    perform public.host_restart_game(sid);
  end loop;
end $streaks$;
do $formats$
declare owner_id uuid:=gen_random_uuid(); kind text; definition jsonb; q jsonb; s jsonb; p jsonb; payload jsonb;
  sid uuid; second jsonb; earned integer; correct boolean;
begin
  insert into auth.users(id,email) values(owner_id,'streak-formats@example.invalid');perform set_config('request.jwt.claim.sub',owner_id::text,true);
  foreach kind in array array['matching','multiple-select','connections','progressive'] loop
    definition:=pg_temp.streak_definition(2);second:=definition->'questions'->1;
    if kind='matching' then
      second:=(second-'correctAnswer'-'acceptedAnswers')||'{"type":"matching","scoringMode":"partial","leftItems":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"}],"rightItems":[{"id":"x","label":"X"},{"id":"y","label":"Y"},{"id":"z","label":"Z"}],"correctPairs":[{"leftId":"a","rightId":"x"},{"leftId":"b","rightId":"y"},{"leftId":"c","rightId":"z"}]}'::jsonb;
      payload:='{"type":"matching","pairs":[{"leftId":"a","rightId":"x"},{"leftId":"b","rightId":"z"},{"leftId":"c","rightId":"y"}]}';
    elsif kind='multiple-select' then
      second:=(second-'correctAnswer'-'acceptedAnswers')||'{"type":"multiple-select","scoringMode":"partial-wipeout","minimumSelections":1,"maximumSelections":2,"options":[{"id":"10000000-0000-4000-8000-000000000001","label":"A","imagePath":null,"displayOrder":0},{"id":"10000000-0000-4000-8000-000000000002","label":"B","imagePath":null,"displayOrder":1}],"correctOptionIds":["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"]}'::jsonb;
      payload:='{"type":"multiple-select","optionIds":["10000000-0000-4000-8000-000000000001"]}';
    elsif kind='connections' then
      second:=second||'{"type":"connections","clues":[{"id":"one","text":"One"},{"id":"two","text":"Two"}]}'::jsonb;
      payload:='{"type":"connections","value":"Wrong","wagerPercent":100}';
    else
      second:=second||'{"progressiveRevealEnabled":true,"doubleScore":true,"media":{"type":"image","path":"/streak.svg","altText":"Answer","revealEffect":"blur","revealDurationSeconds":20}}'::jsonb;
      payload:='{"type":"typed-answer","value":"Alex","wagerPercent":50}';
    end if;
    definition:=jsonb_set(definition,'{questions,1}',second);q:=public.host_save_quiz(definition);
    s:=public.host_launch_game((q->>'id')::uuid,'{"soundPackId":"none","autoLockWhenAllAnswered":false}');sid:=(s->>'id')::uuid;
    p:=public.join_room(s->>'roomCode','Player');perform public.host_start_game(sid);
    update public.game_sessions set question_opened_at=clock_timestamp()-interval '1 second',question_closes_at=clock_timestamp()+interval '59 seconds' where id=sid;
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"typed-answer","value":"Alex"}'::jsonb);
    perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_leaderboard_game(sid);perform public.host_next_game(sid);
    update public.game_sessions set question_opened_at=clock_timestamp()-interval '10 seconds',question_closes_at=clock_timestamp()+interval '50 seconds' where id=sid;
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',payload);
    select a.points_awarded,a.correct into earned,correct from public.player_answers a where player_id=(p->'player'->>'id')::uuid and question_id=(second->>'id')::uuid;
    if kind in ('matching','multiple-select') then assert earned>0 and not correct,'Partial fixture must earn positive points without full correctness';end if;
    if kind='connections' then assert earned=-1000 and not correct;end if;
    perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_finish_game(sid);
    assert (select current_correct_streak=case when kind='progressive' then 2 else 0 end and longest_correct_streak=case when kind='progressive' then 2 else 1 end from public.players where id=(p->'player'->>'id')::uuid),'Streak inferred from points for '||kind;
  end loop;
end $formats$;
select pass('Authoritative Streak lifecycle, corrections, privacy and transport assertions passed');
select * from finish();
rollback;
