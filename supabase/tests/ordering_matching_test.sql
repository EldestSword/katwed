begin;
select plan(1);
create function pg_temp.arrangement_question(p_type text) returns jsonb language sql as $$
  select jsonb_build_object('id',gen_random_uuid(),'type',p_type,'prompt','Arrange these items','timeLimitSeconds',120,
    'points',1001,'speedScoringEnabled',false,'doubleScore',false,'displayOrder',0,'media',jsonb_build_object('type','none'),
    'mediaVisibility','both','presentationChoiceVisibility','show') || case p_type when 'ordering' then
      '{"items":[{"id":"a","label":" Alpha "},{"id":"b","label":"Bravo"},{"id":"c","label":"Charlie"},{"id":"d","label":"Delta"}],"correctItemIds":["a","b","c","d"]}'::jsonb
    else '{"leftItems":[{"id":"a","label":" Jaws "},{"id":"b","label":"Alien"},{"id":"c","label":"Barbie"},{"id":"d","label":"Pulp Fiction"}],"rightItems":[{"id":"w","label":"Spielberg"},{"id":"x","label":"Scott"},{"id":"y","label":"Gerwig"},{"id":"z","label":"Tarantino"}],"correctPairs":[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"y"},{"leftId":"d","rightId":"z"}],"scoringMode":"partial"}'::jsonb end
$$;
create function pg_temp.arrangement_quiz(p_question jsonb, p_type text default 'standard') returns jsonb language plpgsql as $$
declare r uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
begin
  return jsonb_build_object('title','Arrangement SQL','quizType',p_type,'roster','[]'::jsonb,
    'headToHeadCompetitors',case when p_type='head-to-head' then jsonb_build_array(jsonb_build_object('id',c1,'displayName','One','displayOrder',0),jsonb_build_object('id',c2,'displayName','Two','displayOrder',1)) else '[]'::jsonb end,
    'rounds',jsonb_build_array(jsonb_build_object('id',r,'title','Arrange','subtitle','','displayOrder',0,'introEnabled',p_type='standard')),
    'questions',jsonb_build_array(p_question||jsonb_build_object('roundId',r,'assignedCompetitorId',case when p_type='head-to-head' then c1 else null end)));
end $$;

do $test$
declare owner_id uuid:=gen_random_uuid(); question jsonb; input jsonb; quiz jsonb; session jsonb; player jsonb; other_player jsonb;
  state jsonb; initial jsonb; bad jsonb; answer jsonb; cfg jsonb; answer_key jsonb; score record;
  kind text; game_type text; mode text; full_answer boolean; sid uuid; qid uuid; failed boolean;
  expected integer; game_count integer:=0; bad_count integer:=0; old_order jsonb; old_pairs jsonb;
begin
  insert into auth.users(id,email) values(owner_id,'arrangement-owner@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  assert public.arrangement_trim(U&'\00A0\0009 trimmed \3000\FEFF')='trimmed','Unicode trim differs from browser';
  -- Host save rejects malformed text sets, permutations, mappings and extra fields.
  foreach kind in array array['ordering','matching'] loop
    question:=pg_temp.arrangement_question(kind);
    foreach bad in array case when kind='ordering' then array[
      '{"items":[]}'::jsonb,'{"items":[{"id":"a","label":"one"}]}','{"correctItemIds":["a","b","c"]}',
      '{"correctItemIds":["a","a","c","d"]}','{"correctItemIds":["a","b","c","missing"]}',
      '{"correctItemIds":["a","b","c","d","extra"]}', '{"correctItemIds":null}',
      jsonb_build_object('items',jsonb_set(question->'items','{0,label}','" "')),
      jsonb_build_object('items',jsonb_set(question->'items','{0,label}','" BRAVO "')),
      jsonb_build_object('items',jsonb_set(question->'items','{0,id}','"b"')),
      jsonb_build_object('items',jsonb_set(question->'items','{0,label}',to_jsonb(repeat('x',121)))),
      jsonb_build_object('items',jsonb_set(question->'items','{0,image}','"/x"')),
      jsonb_build_object('items',(select jsonb_agg(jsonb_build_object('id',i,'label',i)) from generate_series(1,9) i))
    ] else array[
      '{"leftItems":[]}'::jsonb,'{"rightItems":[]}','{"scoringMode":"bad"}','{"scoringMode":null}',
      '{"correctPairs":[]}', '{"correctPairs":null}',
      jsonb_build_object('leftItems',jsonb_set(question->'leftItems','{0,label}','" ALIEN "')),
      jsonb_build_object('rightItems',jsonb_set(question->'rightItems','{0,label}','" "')),
      jsonb_build_object('rightItems',jsonb_set(question->'rightItems','{0,id}','"a"')),
      jsonb_build_object('correctPairs',jsonb_set(question->'correctPairs','{0,leftId}','"b"')),
      jsonb_build_object('correctPairs',jsonb_set(question->'correctPairs','{0,rightId}','"x"')),
      jsonb_build_object('correctPairs',jsonb_set(question->'correctPairs','{0,rightId}','"missing"')),
      jsonb_build_object('correctPairs',jsonb_set(question->'correctPairs','{0,extra}','true'))
    ] end loop
      failed:=false;
      begin perform public.host_save_quiz(pg_temp.arrangement_quiz(question||bad)); exception when others then failed:=true; end;
      assert failed,'Malformed arrangement saved'; bad_count:=bad_count+1;
    end loop;
  end loop;

  foreach game_type in array array['standard','head-to-head'] loop
  foreach kind in array array['ordering','matching'] loop
  foreach mode in array array['exact','partial'] loop
  foreach full_answer in array array[true,false] loop
    question:=pg_temp.arrangement_question(kind);
    if kind='matching' then question:=question||jsonb_build_object('scoringMode',mode); end if;
    input:=pg_temp.arrangement_quiz(question,game_type);
    quiz:=public.host_save_quiz(input); qid:=(quiz->'questions'->0->>'id')::uuid;
    assert public.host_get_quiz((quiz->>'id')::uuid)->'questions'=quiz->'questions','Host reload changed answer material';
    assert quiz->'questions'->0->case when kind='ordering' then 'items' else 'leftItems' end->0->>'label'=case when kind='ordering' then 'Alpha' else 'Jaws' end,'Labels not trimmed';
    session:=public.host_launch_game((quiz->>'id')::uuid,case when game_type='standard' then '{"playMode":"teams","teamAssignmentMode":"balanced-random","teamNames":["Blue","Red"],"soundPackId":"none"}'::jsonb else '{"soundPackId":"none"}'::jsonb end);
    sid:=(session->>'id')::uuid;
    if game_type='head-to-head' then
      player:=public.join_head_to_head_room(session->>'roomCode',(quiz->'headToHeadCompetitors'->0->>'id')::uuid);
      other_player:=public.join_head_to_head_room(session->>'roomCode',(quiz->'headToHeadCompetitors'->1->>'id')::uuid);
      perform public.start_head_to_head_game(session->>'roomCode',(player->'player'->>'id')::uuid,player->>'reconnectToken');
    else
      player:=public.join_room(session->>'roomCode','Carol');
      perform public.host_start_game(sid);
      state:=public.get_player_game_state(session->>'roomCode');
      assert state->>'phase'='round-intro' and state->'currentQuestion'='null'::jsonb,'Round intro leaked question';
      perform public.host_start_round_game(sid);
    end if;
    state:=public.get_player_game_state(session->>'roomCode'); initial:=state->'currentQuestion';
    assert state->'reveal'='null'::jsonb and not initial ?| array['correctItemIds','correctPairs'],'Question leaked answers';
    assert public.get_player_game_state(session->>'roomCode')->'currentQuestion'=initial,'Polling reshuffled question';
    assert public.reconnect_player(session->>'roomCode',(player->'player'->>'id')::uuid,player->>'reconnectToken') is not null,'Reconnect failed';
    assert public.get_player_game_state(session->>'roomCode')->'currentQuestion'=initial,'Reconnect reshuffled question';
    select type_config,questions.answer_key into cfg,answer_key from public.questions where id=qid;
    -- Reversing authored arrays and changing the key cannot affect network display order.
    if kind='ordering' then
      old_order:=answer_key->'correctItemIds';
      update public.questions set type_config=jsonb_build_object('items',(select jsonb_agg(item order by n desc) from jsonb_array_elements(cfg->'items') with ordinality x(item,n))),
        answer_key=jsonb_build_object('correctItemIds',(select jsonb_agg(item order by n desc) from jsonb_array_elements(old_order) with ordinality x(item,n))) where id=qid;
    else
      old_pairs:=answer_key->'correctPairs';
      update public.questions set type_config=cfg||jsonb_build_object(
        'leftItems',(select jsonb_agg(item order by n desc) from jsonb_array_elements(cfg->'leftItems') with ordinality x(item,n)),
        'rightItems',(select jsonb_agg(item order by n desc) from jsonb_array_elements(cfg->'rightItems') with ordinality x(item,n))),
        answer_key=jsonb_build_object('correctPairs','[{"leftId":"a","rightId":"x"},{"leftId":"b","rightId":"w"},{"leftId":"c","rightId":"z"},{"leftId":"d","rightId":"y"}]'::jsonb) where id=qid;
    end if;
    assert public.get_player_game_state(session->>'roomCode')->'currentQuestion'=initial,'Array order or key affected safe display';
    update public.questions set type_config=cfg,answer_key=case when kind='ordering' then jsonb_build_object('correctItemIds',old_order) else jsonb_build_object('correctPairs',old_pairs) end where id=qid;
    answer:=case when kind='ordering' then jsonb_build_object('type',kind,'itemIds',case when full_answer then '["a","b","c","d"]'::jsonb else '["b","a","c","d"]'::jsonb end)
      else jsonb_build_object('type',kind,'pairs',case when full_answer then old_pairs else '[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"z"},{"leftId":"d","rightId":"y"}]'::jsonb end) end;
    foreach bad in array array[answer||'{"extra":true}'::jsonb,answer||'{"type":null}'::jsonb,
      jsonb_set(answer,array[case when kind='ordering' then 'itemIds' else 'pairs' end],'[]'),
      jsonb_set(answer,array[case when kind='ordering' then 'itemIds' else 'pairs' end],'null'),
      jsonb_set(answer,array[case when kind='ordering' then 'itemIds' else 'pairs' end],case when kind='ordering' then '["a","a","c","d"]'::jsonb else '[{"leftId":"a","rightId":"w","extra":1},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"y"},{"leftId":"d","rightId":"z"}]'::jsonb end)
    ] loop
      failed:=false; begin perform public.submit_answer(session->>'roomCode',(player->'player'->>'id')::uuid,player->>'reconnectToken',bad); exception when others then failed:=true; end;
      assert failed,'Invalid payload accepted';
      assert not exists(select 1 from public.player_answers where question_id=qid),'Rejected answer wrote a score'; bad_count:=bad_count+1;
    end loop;
    perform public.submit_answer(session->>'roomCode',(player->'player'->>'id')::uuid,player->>'reconnectToken',answer);
    expected:=case when game_type='head-to-head' then case when full_answer then 1 else 0 end when full_answer then 1001 when kind='matching' and mode='partial' then 500 else 0 end;
    assert (select points_awarded=expected and correct=full_answer from public.player_answers where question_id=qid),'Incorrect points or correctness';
    if game_type='head-to-head' then
      perform public.submit_answer(session->>'roomCode',(other_player->'player'->>'id')::uuid,other_player->>'reconnectToken',answer);
      assert (select points_awarded=0 from public.player_answers where question_id=qid and player_id=(other_player->'player'->>'id')::uuid),'Play-along scored';
    else
      perform public.host_lock_game(sid); assert public.get_player_game_state(session->>'roomCode')->'reveal'='null'::jsonb,'Lock leaked answer';
      perform public.host_reveal_game(sid);
    end if;
    state:=public.get_player_game_state(session->>'roomCode');
    assert state->'reveal'->>'type'=kind,'Reveal missing';
    if kind='matching' then assert state->'reveal'->>'scoringMode'=mode and state->'reveal'->'correctPairs'=old_pairs, 'Matching reveal incorrect: '||state::text;
    else assert state->'reveal'->'correctItemIds'=old_order,'Ordering reveal incorrect'; end if;
    if game_type='standard' then
      assert state->'leaderboard'='[]'::jsonb,'Reveal exposed totals';
      perform public.host_finish_game(sid); state:=public.get_player_game_state(session->>'roomCode');
      assert (state->'leaderboard'->0->>'totalScore')::int=expected and state->'players'->0->>'teamId' is not null,'Team contribution lost';
    end if;
    game_count:=game_count+1;
  end loop; end loop; end loop; end loop;
  assert game_count=16,'Missing game cases';
  assert not has_function_privilege('anon','public.score_arrangement_answer(text,jsonb,jsonb,jsonb,integer)','execute'),'Private scoring helper exposed';
  raise notice 'Passed % Standard/Team/H2H games and % malformed definition/answer checks',game_count,bad_count;
end $test$;
do $speed$
declare owner_id uuid:=gen_random_uuid(); kind text; doubled boolean; full_answer boolean; q jsonb; s jsonb; p jsonb; answer jsonb; sid uuid; result integer; base integer;
begin
  insert into auth.users(id,email) values(owner_id,'arrangement-speed@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  foreach kind in array array['ordering','matching'] loop
  foreach doubled in array array[false,true] loop
  foreach full_answer in array array[false,true] loop
    q:=public.host_save_quiz(pg_temp.arrangement_quiz(pg_temp.arrangement_question(kind)||jsonb_build_object('points',1000,'speedScoringEnabled',true,'doubleScore',doubled)));
    s:=public.host_launch_game((q->>'id')::uuid,'{"soundPackId":"none"}'); sid:=(s->>'id')::uuid;
    p:=public.join_room(s->>'roomCode','Speed player'); perform public.host_start_game(sid); perform public.host_start_round_game(sid);
    -- Synthetic local clock window: answer arrives halfway through the existing timer.
    update public.game_sessions set question_opened_at=clock_timestamp()-interval '60 seconds',question_closes_at=clock_timestamp()+interval '60 seconds' where id=sid;
    answer:=case when kind='ordering' then jsonb_build_object('type',kind,'itemIds',case when full_answer then '["a","b","c","d"]'::jsonb else '["b","a","c","d"]'::jsonb end)
      else jsonb_build_object('type',kind,'pairs',case when full_answer then q->'questions'->0->'correctPairs' else '[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"z"},{"leftId":"d","rightId":"y"}]'::jsonb end) end;
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',answer);
    select points_awarded into result from public.player_answers where game_session_id=sid;
    base:=case when doubled then 2 else 1 end;
    if full_answer then assert result between 750*base-1 and 750*base,'Fully correct answer lost generic timed scoring';
    elsif kind='matching' then assert result=500*base,'Partial Matching was altered by speed scoring';
    else assert result=0,'Wrong Ordering scored'; end if;
  end loop; end loop; end loop;
end $speed$;
select pass('Ordering/Matching validation, safe serialisation, Standard/Team/H2H, timed scoring and reveal gating');
select * from finish();
rollback;
