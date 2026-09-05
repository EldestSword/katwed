begin;
select plan(1);
create function pg_temp.progressive_question(p_type text default 'typed-answer') returns jsonb language sql as $$
  select jsonb_build_object('id',gen_random_uuid(),'type',p_type,'prompt','Who is appearing?',
    'timeLimitSeconds',60,'points',1000,'speedScoringEnabled',true,'doubleScore',false,'displayOrder',0,'progressiveRevealEnabled',true,
    'media',jsonb_build_object('type','image','path','/demo/portrait-1.svg','altText','Secret Alex answer','revealEffect','blur','revealDurationSeconds',20),
    'mediaVisibility','both','presentationChoiceVisibility','show','supportingText','') || case p_type
    when 'typed-answer' then '{"correctAnswer":"Alex","acceptedAnswers":[]}'::jsonb
    when 'true-false' then '{"correctValue":true}'::jsonb
    when 'single-choice' then jsonb_build_object('options',jsonb_build_array(jsonb_build_object('id',a,'label','A'),jsonb_build_object('id',b,'label','B')),'correctOptionId',a,'randomiseOptions',false)
    when 'multiple-select' then jsonb_build_object('options',jsonb_build_array(jsonb_build_object('id',a,'label','A'),jsonb_build_object('id',b,'label','B'),jsonb_build_object('id',c,'label','C')),'correctOptionIds',jsonb_build_array(a,b),'minimumSelections',1,'maximumSelections',2,'randomiseOptions',false,'scoringMode','partial-wipeout')
    when 'slider' then '{"minimum":0,"maximum":100,"step":1,"correctValue":50,"tolerance":0,"prefix":"","suffix":"","unitLabel":"units"}'::jsonb
    when 'ordering' then '{"items":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"}],"correctItemIds":["a","b","c"]}'::jsonb
    when 'matching' then '{"leftItems":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"},{"id":"d","label":"D"}],"rightItems":[{"id":"w","label":"W"},{"id":"x","label":"X"},{"id":"y","label":"Y"},{"id":"z","label":"Z"}],"correctPairs":[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"y"},{"leftId":"d","rightId":"z"}],"scoringMode":"partial"}'::jsonb
    else '{}'::jsonb end from (select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c) ids
$$;
create function pg_temp.progressive_quiz(p_question jsonb) returns jsonb language sql as $$
  select jsonb_build_object('title','Progressive SQL','quizType','standard','roster','[]'::jsonb,'headToHeadCompetitors','[]'::jsonb,'questions',jsonb_build_array(p_question))
$$;
do $progressive$
declare owner_id uuid:=gen_random_uuid(); definition jsonb; quiz jsonb; s jsonb; p jsonb; p2 jsonb; state jsonb; answer jsonb; bad jsonb;
  sid uuid; qid uuid; aid uuid; before_row jsonb; after_row jsonb; elapsed integer; earned integer; raw integer; kind text; failed boolean;
  c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); member1 uuid:=gen_random_uuid(); member2 uuid:=gen_random_uuid(); row_count integer;
begin
  insert into auth.users(id,email) values(owner_id,'progressive@example.invalid'); perform set_config('request.jwt.claim.sub',owner_id::text,true);
  assert public.progressive_reveal_score(1000,0,20000)=1000;
  assert public.progressive_reveal_score(1000,5000,20000)=812;
  assert public.progressive_reveal_score(1000,10000,20000)=625;
  assert public.progressive_reveal_score(1000,15000,20000)=437;
  assert public.progressive_reveal_score(1000,20000,20000)=250;
  assert public.progressive_reveal_score(1000,59000,20000)=250;
  assert public.progressive_reveal_score(1000,-1,20000)=1000;
  assert public.progressive_reveal_score(1000,1,0)=0;
  assert public.progressive_reveal_score(500,10000,20000)*2=624,'Doubled before flooring';
  assert public.progressive_reveal_score(999,5000,19999)=811,'Odd-duration floor mismatch';
  assert not has_function_privilege('anon','public.progressive_reveal_score(integer,integer,integer)','execute'),'Internal helper exposed as RPC';
  assert not has_function_privilege('authenticated','public.progressive_reveal_score(integer,integer,integer)','execute');
  definition:=pg_temp.progressive_question();
  foreach bad in array array['{"progressiveRevealEnabled":null}'::jsonb,'{"progressiveRevealEnabled":"true"}',
    '{"media":{"type":"none"}}','{"media":{"type":"youtube","videoId":"abc123def45"}}','{"timeLimitSeconds":10}',
    jsonb_build_object('media',(definition->'media')||'{"revealEffect":"immediate"}'),
    jsonb_build_object('media',(definition->'media')||'{"revealDurationSeconds":0}'),
    jsonb_build_object('media',(definition->'media')||'{"revealDurationSeconds":181}'),
    jsonb_build_object('media',(definition->'media')||'{"revealDurationSeconds":null}')]
  loop
    failed:=false; begin perform public.host_save_quiz(pg_temp.progressive_quiz(definition||bad)); exception when others then failed:=true; end;
    assert failed,'Invalid progressive definition saved: '||bad;
  end loop;
  quiz:=public.host_save_quiz(pg_temp.progressive_quiz(definition-'progressiveRevealEnabled'));
  assert quiz->'questions'->0->>'progressiveRevealEnabled'='false','DB-first old client default is not false';
  failed:=false; begin perform public.host_save_quiz(pg_temp.progressive_quiz(definition||jsonb_build_object('id',gen_random_uuid(),'assignedCompetitorId',c1))||jsonb_build_object('quizType','head-to-head',
    'headToHeadCompetitors',jsonb_build_array(jsonb_build_object('id',c1,'displayName','One','displayOrder',0),jsonb_build_object('id',c2,'displayName','Two','displayOrder',1)))); exception when others then failed:=position('Progressive Reveal' in sqlerrm)>0; end;
  assert failed,'H2H saved the modifier';
  foreach kind in array array['pinpoint','connections'] loop
    failed:=false; begin perform public.host_save_quiz(pg_temp.progressive_quiz(definition||jsonb_build_object('type',kind))); exception when others then failed:=true; end;
    assert failed,'Excluded type saved';
  end loop;
  foreach kind in array array['typed-answer','true-false','single-choice','multiple-select','slider','ordering','matching','mashup'] loop
    definition:=pg_temp.progressive_question(kind)||'{"doubleScore":true}';
    if kind='mashup' then definition:=definition||jsonb_build_object('correctMemberIds',jsonb_build_array(member1,member2)); end if;
    quiz:=public.host_save_quiz(pg_temp.progressive_quiz(definition)||case when kind='mashup' then jsonb_build_object('roster',jsonb_build_array(
      jsonb_build_object('id',member1,'displayName','One','shortName','One','active',true,'displayOrder',0),jsonb_build_object('id',member2,'displayName','Two','shortName','Two','active',true,'displayOrder',1))) else '{}'::jsonb end);
    qid:=(quiz->'questions'->0->>'id')::uuid;
    assert public.host_get_quiz((quiz->>'id')::uuid)->'questions'->0->'media'->>'altText'='Secret Alex answer','Private host alt changed';
    s:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none","playMode":"teams","teamAssignmentMode":"balanced-random","teamNames":["Blue","Red"],"autoLockWhenAllAnswered":false}'); sid:=(s->>'id')::uuid;
    p:=public.join_room(s->>'roomCode','Player');
    if kind='typed-answer' then p2:=public.join_room(s->>'roomCode','Correction'); end if;
    perform public.host_start_game(sid);
    update public.game_sessions set question_opened_at=clock_timestamp()-interval '10 seconds',question_closes_at=clock_timestamp()+interval '50 seconds' where id=sid;
    select to_jsonb(gs) into before_row from public.game_sessions gs where id=sid;
    state:=public.get_player_game_state(s->>'roomCode');
    assert state->'currentQuestion'->>'progressiveRevealEnabled'='true' and state->'currentQuestion'->>'speedScoringEnabled'='false';
    assert state->'currentQuestion'->'media'->>'altText'='Progressively revealing question image','Alt spoiler before reveal';
    assert state->'reveal'='null'::jsonb and state->'leaderboard'='[]'::jsonb;
    assert not (state->'currentQuestion') ?| array['correctAnswer','correctValue','correctItemIds','correctPairs','correctMemberIds','acceptedAnswers'];
    answer:=jsonb_build_object('type',kind)||case kind
      when 'typed-answer' then '{"value":"Alex"}'::jsonb when 'true-false' then '{"value":true}'::jsonb
      when 'single-choice' then jsonb_build_object('optionId',quiz->'questions'->0->>'correctOptionId') when 'multiple-select' then jsonb_build_object('optionIds',jsonb_build_array(quiz->'questions'->0->'correctOptionIds'->0))
      when 'slider' then '{"value":50}'::jsonb when 'ordering' then '{"itemIds":["a","b","c"]}'::jsonb
      when 'matching' then '{"pairs":[{"leftId":"a","rightId":"w"},{"leftId":"b","rightId":"x"},{"leftId":"c","rightId":"z"},{"leftId":"d","rightId":"y"}]}'::jsonb
      else jsonb_build_object('memberIds',jsonb_build_array(member1,member2)) end;
    delete from realtime.messages;
    perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',answer);
    select response_time_ms,points_awarded,id into elapsed,earned,aid from public.player_answers where game_session_id=sid;
    raw:=case when kind in ('multiple-select','matching') then 500 else 1000 end;
    assert earned=public.progressive_reveal_score(raw,elapsed,20000)*2,'Wrong progressive score for '||kind;
    assert (select total_score=earned from public.players where id=(p->'player'->>'id')::uuid),'Player total differs';
    assert (select count(*)=0 from realtime.messages),'Submission broadcast added';
    select to_jsonb(gs) into after_row from public.game_sessions gs where id=sid;
    assert before_row=after_row,'Answer changed session state';
    failed:=false; begin perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken',answer); exception when others then failed:=true; end;
    assert failed,'Second answer accepted';
    if kind='typed-answer' then
      perform public.submit_answer(s->>'roomCode',(p2->'player'->>'id')::uuid,p2->>'reconnectToken','{"type":"typed-answer","value":"Al"}'::jsonb);
      select id,response_time_ms into aid,elapsed from public.player_answers where game_session_id=sid and player_id=(p2->'player'->>'id')::uuid;
    end if;
    perform public.host_lock_game(sid); state:=public.get_player_game_state(s->>'roomCode');
    assert state->'currentQuestion'->'media'->>'altText'='Progressively revealing question image','Locked alt leaked';
    if kind='typed-answer' then
      perform public.host_set_typed_answer_override(sid,aid,true); assert (select points_awarded=public.progressive_reveal_score(1000,elapsed,20000)*2 from public.player_answers where id=aid),'Typed correction changed original-time score';
      perform public.host_set_typed_answer_override(sid,aid,null); assert (select points_awarded=0 from public.player_answers where id=aid),'Typed undo retained corrected points';
    end if;
    perform public.host_reveal_game(sid); state:=public.get_player_game_state(s->>'roomCode');
    assert state->'currentQuestion'->'media'->>'altText'='Secret Alex answer','Reveal alt missing';
  end loop;
  -- A full room reading existing safe state generates no writes or broadcasts as time passes.
  quiz:=public.host_save_quiz(pg_temp.progressive_quiz(pg_temp.progressive_question()));
  s:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none"}'); sid:=(s->>'id')::uuid;
  for row_count in 1..75 loop perform public.join_room(s->>'roomCode','Player '||row_count); end loop;
  perform public.host_start_game(sid); select to_jsonb(gs) into before_row from public.game_sessions gs where id=sid; delete from realtime.messages;
  perform pg_sleep(.02);
  for row_count in 1..75 loop perform public.get_player_game_state(s->>'roomCode'); end loop;
  select to_jsonb(gs) into after_row from public.game_sessions gs where id=sid;
  assert before_row=after_row,'Reveal progression wrote session state';
  assert (select count(*)=0 from realtime.messages),'Reveal progression added traffic';
  assert (select count(*)=0 from public.player_answers where game_session_id=sid);
  update public.quizzes set quiz_type='head-to-head' where id=(quiz->>'id')::uuid;
  failed:=false; begin perform public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none"}'); exception when others then failed:=position('Progressive Reveal' in sqlerrm)>0; end;
  assert failed,'Malformed stored H2H launched';
  raise notice 'Progressive: eight eligible types, raw partial decay before Double, original-time override, privacy, validation, DB-first default and 75-player zero-traffic assertions passed';
end $progressive$;
select pass('Progressive Reveal authoritative scoring, privacy and compatibility');
select * from finish();
rollback;
