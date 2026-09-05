begin;
select plan(1);

create function pg_temp.powerup_question(kind text default 'single-choice') returns jsonb language plpgsql as $$
declare q jsonb; options jsonb;
begin
  q:=jsonb_build_object('id',gen_random_uuid(),'type',kind,'prompt','Power-Up check','supportingText','',
    'timeLimitSeconds',60,'points',1000,'buzzInEnabled',false,'wagerEnabled',true,'progressiveRevealEnabled',false,
    'speedScoringEnabled',false,'doubleScore',false,'displayOrder',0,'media','{"type":"none"}'::jsonb,
    'mediaVisibility','both','presentationChoiceVisibility','show');
  if kind='single-choice' then
    select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'label','Choice '||i,'displayOrder',i-1) order by i) into options from generate_series(1,4)i;
    return q||jsonb_build_object('options',options,'correctOptionId',options->0->>'id','randomiseOptions',false);
  elsif kind='typed-answer' then return q||'{"correctAnswer":"Alex","acceptedAnswers":[]}'::jsonb;
  elsif kind='connections' then return q||'{"clues":[{"id":"a","text":"First"},{"id":"b","text":"Second"},{"id":"c","text":"Third"},{"id":"d","text":"Fourth"}],"correctAnswer":"Alex","acceptedAnswers":[]}'::jsonb;
  else return q||'{"correctValue":true}'::jsonb; end if;
end $$;

create function pg_temp.powerup_game(settings jsonb,question jsonb) returns jsonb language plpgsql as $$
declare q jsonb; s jsonb; a jsonb; b jsonb;
begin
  q:=public.host_save_quiz(jsonb_build_object('title','Power-Up SQL','quizType','standard','roster','[]'::jsonb,'headToHeadCompetitors','[]'::jsonb,'questions',jsonb_build_array(question)));
  s:=public.host_launch_game((q->>'id')::uuid,'{"soundPackId":"none","autoLockWhenAllAnswered":false,"automaticTieBreakersEnabled":false}'::jsonb||settings);
  a:=public.join_room(s->>'roomCode','Carol');b:=public.join_room(s->>'roomCode','Roger');
  perform public.host_start_game((s->>'id')::uuid);
  update public.game_sessions set question_opened_at=clock_timestamp()-interval '8 seconds',question_closes_at=clock_timestamp()+interval '52 seconds' where id=(s->>'id')::uuid;
  return jsonb_build_object('session',s,'a',a,'b',b,'question',q->'questions'->0);
end $$;

create function pg_temp.must_reject(command text) returns void language plpgsql as $$
begin
  begin execute command; exception when others then return; end;
  raise exception 'Expected rejection: %',command;
end $$;

do $tests$
declare owner_id uuid:=gen_random_uuid(); g jsonb; q jsonb; s uuid; a uuid; b uuid; room text; token text; personal jsonb; retained jsonb;
  result public.player_answers; expected integer; before_count integer; run_id uuid; kind text; power text; question_id uuid; oldquiz jsonb; c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); h2h jsonb;
begin
  insert into auth.users(id,email) values(owner_id,'powerups@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  assert not has_table_privilege('anon','public.player_powerup_uses','select');
  assert not has_table_privilege('authenticated','public.player_powerup_uses','select');
  assert not has_function_privilege('anon','public.personal_powerup_state(uuid,uuid)','execute');
  assert has_function_privilege('anon','public.activate_fifty_fifty(text,uuid,text,uuid)','execute');

  -- Mandatory DB-first old client: missing capability, old payload, same score.
  g:=pg_temp.powerup_game('{}',pg_temp.powerup_question('typed-answer'));
  s:=(g->'session'->>'id')::uuid; a:=(g->'a'->'player'->>'id')::uuid; room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  assert not (select power_ups_enabled from public.game_sessions where id=s);
  assert g->'a'->'powerUps'='null'::jsonb;
  perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,'{"type":"typed-answer","value":"Alex","powerUp":"double-up"}'));
  perform public.submit_answer(room,a,token,'{"type":"typed-answer","value":"Alex"}'::jsonb);
  assert (select points_awarded=1000 from public.player_answers where player_id=a);

  -- Enable individual inventory, exact 50/50 and private reconnect recovery.
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',pg_temp.powerup_question());q:=g->'question';question_id:=(q->>'id')::uuid;
  s:=(g->'session'->>'id')::uuid; a:=(g->'a'->'player'->>'id')::uuid;b:=(g->'b'->'player'->>'id')::uuid;
  room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  assert g->'a'->'powerUps'->'uses'='[]'::jsonb;
  delete from realtime.messages;
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,'wrong',question_id));
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,b,token,question_id));
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,token,gen_random_uuid()));
  personal:=public.activate_fifty_fifty(room,a,token,question_id);retained:=personal->'uses'->0->'optionIds';
  assert jsonb_array_length(retained)=2 and retained ? (q->>'correctOptionId');
  assert not personal::text like '%correctOptionId%';
  assert public.reconnect_player(room,a,token)->'powerUps'=personal;
  assert public.personal_powerup_state(s,b)->'uses'='[]'::jsonb;
  assert (public.get_player_game_state(room)->>'submittedCount')::integer=0;
  assert not public.get_player_game_state(room)::text like '%"uses"%';
  assert not public.get_player_game_state(room)::text like '%powerUpUses%';
  assert (select count(*)=0 from realtime.messages),'50/50 broadcast';
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,token,question_id));
  perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,jsonb_build_object('type','single-choice','optionId',q->>'correctOptionId','powerUp','double-up')));
  perform public.submit_answer(room,a,token,jsonb_build_object('type','single-choice','optionId',q->>'correctOptionId','wagerPercent',50));
  assert (select points_awarded=1500 and correct from public.player_answers where player_id=a);
  assert (select count(*)=0 from realtime.messages),'Answer broadcast';
  run_id:=(personal->>'runId')::uuid;
  perform public.host_finish_game(s);perform public.host_restart_game(s);
  assert public.reconnect_player(room,a,token)->'powerUps'->'uses'='[]'::jsonb;
  assert (select power_up_run_id<>run_id from public.game_sessions where id=s);

  -- Positive-only Double Up, Speed input only, Wager order, actual metrics and host corrections.
  foreach power in array array['double-up','fast-five'] loop
    g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',pg_temp.powerup_question('typed-answer')||'{"speedScoringEnabled":true,"doubleScore":true}');
    s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
    perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,jsonb_build_object('type','typed-answer','value','','powerUp',power)));
    assert (select count(*)=0 from public.player_powerup_uses where session_id=s);
    perform public.submit_answer(room,a,token,jsonb_build_object('type','typed-answer','value','Wrong','powerUp',power,'wagerPercent',100));
    select * into strict result from public.player_answers where player_id=a;
    assert result.points_awarded=-1000 and not result.correct and result.response_time_ms>=8000;
    perform public.host_lock_game(s);perform public.host_set_typed_answer_override(s,result.id,true);
    select * into strict result from public.player_answers where id=result.id;
    expected:=floor(2000*(1-0.5*greatest(0,result.response_time_ms-case when power='fast-five' then 5000 else 0 end)::numeric/60000))+1000;
    if power='double-up' then expected:=expected*2;end if;
    assert result.points_awarded=expected and result.correct;
    assert (select total_correct_response_ms=result.response_time_ms from public.players where id=a);
    perform public.host_set_typed_answer_override(s,result.id,null);
    assert (select points_awarded=-1000 from public.player_answers where id=result.id);
    assert (select count(*)=1 from public.player_powerup_uses where session_id=s and player_id=a);
  end loop;

  -- Concurrent-safe constraints and failed payloads roll back consumption.
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',pg_temp.powerup_question('typed-answer'));
  s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  foreach power in array array['unknown','fifty-fifty','fast-five'] loop
    perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,jsonb_build_object('type','typed-answer','value','Alex','powerUp',power)));
  end loop;
  perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,'{"type":"typed-answer","value":"Alex","powerUp":"double-up","extra":true}'));
  assert (select count(*)=0 from public.player_powerup_uses where session_id=s);
  update public.game_sessions set question_closes_at=clock_timestamp()-interval '1 second' where id=s;
  perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,'{"type":"typed-answer","value":"Alex","powerUp":"double-up"}'));
  assert (select count(*)=0 from public.player_powerup_uses where session_id=s);

  -- Three-option choice and all other question discriminators are ineligible.
  q:=pg_temp.powerup_question();q:=jsonb_set(q,'{options}',(q->'options')-3);
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',q);
  s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,token,q->>'id'));
  foreach kind in array array['typed-answer','true-false','connections'] loop
    g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',pg_temp.powerup_question(kind));q:=g->'question';
    s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
    perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,token,q->>'id'));
    assert (select count(*)=0 from public.player_powerup_uses where session_id=s);
  end loop;
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',pg_temp.powerup_question());q:=g->'question';
  s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  perform public.host_lock_game(s);
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,token,q->>'id'));
  assert (select count(*)=0 from public.player_powerup_uses where session_id=s);

  -- Positive Matching partial points double but correctness does not change.
  q:=pg_temp.powerup_question('matching')||'{"leftItems":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"},{"id":"d","label":"D"}],"rightItems":[{"id":"w","label":"W"},{"id":"x","label":"X"},{"id":"y","label":"Y"},{"id":"z","label":"Z"}],"correctPairs":[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"y"},{"leftId":"d","rightId":"z"}],"scoringMode":"partial"}'::jsonb;
  q:=q-'correctValue';
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',q);
  a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  perform public.submit_answer(room,a,token,'{"type":"matching","pairs":[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"z"},{"leftId":"d","rightId":"y"}],"powerUp":"double-up"}'::jsonb);
  assert (select points_awarded=1000 and not correct from public.player_answers where player_id=a);

  -- Progressive and Connections reject Fast Five; Double Up works with their pipeline.
  foreach kind in array array['progressive','connections'] loop
    q:=case when kind='progressive' then pg_temp.powerup_question('typed-answer')||'{"progressiveRevealEnabled":true,"media":{"type":"image","path":"/demo/portrait-1.svg","altText":"Portrait","revealEffect":"blur","revealDurationSeconds":20}}'::jsonb else pg_temp.powerup_question('connections') end;
    g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',q);
    s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
    perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,jsonb_build_object('type',q->>'type','value','Alex','powerUp','fast-five')));
    perform public.submit_answer(room,a,token,jsonb_build_object('type',q->>'type','value','Alex','powerUp','double-up'));
    select * into strict result from public.player_answers where player_id=a;
    expected:=case when kind='progressive' then public.progressive_reveal_score(1000,result.response_time_ms,20000)*2 else 2000 end;
    assert result.correct and result.points_awarded=expected;
  end loop;

  -- Team inventory is personal; modified points remain ordinary team contributions.
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true,"playMode":"teams","teamAssignmentMode":"balanced-random","teamNames":["Blue","Red"]}',pg_temp.powerup_question('typed-answer'));
  s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;b:=(g->'b'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  perform public.submit_answer(room,a,token,'{"type":"typed-answer","value":"Alex","powerUp":"double-up"}'::jsonb);
  assert (select total_score=2000 from public.players where id=a);
  assert public.personal_powerup_state(s,b)->'uses'='[]'::jsonb;

  -- Survivor correctness still controls lives; eliminated players cannot activate or submit.
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true,"competitionMode":"survivor","survivorStartingLives":1}',pg_temp.powerup_question('typed-answer'));
  s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';
  perform public.submit_answer(room,a,token,'{"type":"typed-answer","value":"Wrong","powerUp":"double-up"}'::jsonb);
  perform public.host_lock_game(s);perform public.host_reveal_game(s);perform public.host_finish_game(s);
  assert (select survivor_lives_remaining=0 from public.players where id=a);
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true,"competitionMode":"survivor","survivorStartingLives":1}',pg_temp.powerup_question());
  s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';q:=g->'question';
  update public.players set survivor_lives_remaining=0,survivor_eliminated_at_question=1 where id=a;
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,token,q->>'id'));
  perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,jsonb_build_object('type','single-choice','optionId',q->>'correctOptionId','powerUp','double-up')));

  -- Buzz rejects both activation and answer modifiers; no new Tie-Break payload.
  g:=pg_temp.powerup_game('{"powerUpsEnabled":true}',pg_temp.powerup_question()||'{"buzzInEnabled":true}');
  s:=(g->'session'->>'id')::uuid;a:=(g->'a'->'player'->>'id')::uuid;room:=g->'session'->>'roomCode';token:=g->'a'->>'reconnectToken';q:=g->'question';
  perform pg_temp.must_reject(format('select public.activate_fifty_fifty(%L,%L,%L,%L)',room,a,token,q->>'id'));
  perform public.claim_buzz(room,a,token);
  perform pg_temp.must_reject(format('select public.submit_answer(%L::text,%L::uuid,%L::text,%L::jsonb)',room,a,token,jsonb_build_object('type','single-choice','optionId',q->>'correctOptionId','powerUp','double-up')));
  assert (select count(*)=0 from public.player_powerup_uses where session_id=s);

  -- H2H new-client opt-in is forced off, preserving existing draw flow.
  oldquiz:=public.host_save_quiz(jsonb_build_object('title','H2H Power-Up exclusion','quizType','head-to-head','roster','[]'::jsonb,
    'headToHeadCompetitors',jsonb_build_array(jsonb_build_object('id',c1,'displayName','A','displayOrder',0),jsonb_build_object('id',c2,'displayName','B','displayOrder',1)),
    'questions',jsonb_build_array(pg_temp.powerup_question('true-false')||jsonb_build_object('wagerEnabled',false,'assignedCompetitorId',c1))));
  h2h:=public.host_launch_game((oldquiz->>'id')::uuid,'{"powerUpsEnabled":true}');
  assert not (h2h->'settings'->>'powerUpsEnabled')::boolean;
end $tests$;
select pass('Power-Up capability, scoring, inventory, security, mode, reconnect and rollback assertions passed');
select * from finish();
rollback;
