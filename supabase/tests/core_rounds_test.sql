begin;
select plan(1);

create function pg_temp.rounds_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Core Rounds: %', message; end if; end;
$$;

do $test$
declare
  v_owner uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid();
  v_quiz jsonb; v_saved jsonb; v_bad jsonb; v_session jsonb; v_state jsonb; v_copy jsonb;
  v_id uuid; v_session_id uuid; v_room text; v_player jsonb; v_h2h jsonb; v_first jsonb; v_second jsonb;
  v_failed boolean; i integer; v_phase text; v_question_id uuid; v_order uuid[];
begin
  insert into auth.users(id, email) values (v_owner, 'core-rounds@example.invalid'), (v_other, 'other-rounds@example.invalid');
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_quiz := jsonb_build_object('title', 'Core Rounds SQL', 'quizType', 'standard', 'headToHeadCompetitors', '[]'::jsonb, 'roster', '[]'::jsonb,
    'rounds', jsonb_build_array(
      jsonb_build_object('id',r1,'title','Opening','subtitle','First up','displayOrder',0,'introEnabled',true),
      jsonb_build_object('id',r2,'title','Middle','subtitle','','displayOrder',1,'introEnabled',true),
      jsonb_build_object('id',r3,'title','Final','subtitle','','displayOrder',2,'introEnabled',false)),
    'questions', (select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'roundId',case when n < 2 then r1 when n = 2 then r2 else r3 end,
      'type','true-false','prompt','Question '||n,'correctValue',true,'timeLimitSeconds',60,'points',1000,
      'speedScoringEnabled',false,'doubleScore',false,'displayOrder',n,'media',jsonb_build_object('type','none'),
      'mediaVisibility','both','presentationChoiceVisibility','show','assignedCompetitorId',null)) from generate_series(0,3) n));
  v_saved := public.host_save_quiz(v_quiz); v_id := (v_saved->>'id')::uuid;
  perform pg_temp.rounds_assert(jsonb_array_length(v_saved->'rounds')=3, 'save/load rounds');
  perform pg_temp.rounds_assert(v_saved->'questions'->0->>'roundId'=r1::text, 'save/load membership');

  -- All invalid saves roll back the entire operation, including any round upserts.
  for i in 0..6 loop
    v_bad := v_saved;
    v_bad := case i
      when 0 then jsonb_set(v_bad,'{rounds}','[]')
      when 1 then jsonb_set(v_bad,'{rounds,1,id}',to_jsonb(r1))
      when 2 then jsonb_set(v_bad,'{questions,0,roundId}',to_jsonb(gen_random_uuid()))
      when 3 then jsonb_set(v_bad,'{rounds,0,title}','""')
      when 4 then jsonb_set(v_bad,'{rounds,0,subtitle}',to_jsonb(repeat('x',201)))
      when 5 then jsonb_set(v_bad,'{rounds,0,introEnabled}','"yes"')
      else jsonb_set(v_bad,'{rounds,1,displayOrder}','0') end;
    v_failed := false;
    begin perform public.host_save_quiz(v_bad); exception when others then v_failed := true; end;
    perform pg_temp.rounds_assert(v_failed, 'malformed round save '||i);
  end loop;
  v_failed := false;
  begin perform public.host_save_quiz(v_saved-'rounds'); exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'stale multi-round client cannot flatten rounds');

  v_copy := public.host_save_quiz(jsonb_build_object('title','Other quiz','quizType','standard','roster','[]'::jsonb,'questions','[]'::jsonb));
  v_bad := jsonb_set(v_saved,'{rounds,0,id}',v_copy->'rounds'->0->'id');
  v_failed := false;
  begin perform public.host_save_quiz(v_bad); exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'cross-quiz round reuse rejected');
  v_failed := false;
  begin update public.questions set round_id=(v_copy->'rounds'->0->>'id')::uuid where quiz_id=v_id; exception when foreign_key_violation then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'composite question FK rejects cross-quiz references');
  v_failed := false;
  begin delete from public.quiz_rounds where id=r1; exception when foreign_key_violation then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'non-empty round cannot be deleted');

  v_bad := jsonb_set(jsonb_set(v_saved,'{rounds,0,displayOrder}','1'),'{rounds,1,displayOrder}','0');
  v_bad := public.host_save_quiz(v_bad);
  perform pg_temp.rounds_assert(v_bad->'rounds'->0->>'id'=r2::text and v_bad->'questions'->0->>'roundId'=r2::text, 'round reorder persists and determines global question order');
  v_bad := jsonb_set(v_bad,'{questions,0,roundId}',to_jsonb(r1));
  v_bad := public.host_save_quiz(v_bad);
  v_bad := public.host_save_quiz(jsonb_set(v_bad,'{rounds}',(v_bad->'rounds')-0));
  perform pg_temp.rounds_assert(jsonb_array_length(v_bad->'rounds')=2 and jsonb_array_length(v_bad->'questions')=4, 'move then delete empty round preserves questions');
  perform public.host_save_quiz(v_saved);

  v_failed := false;
  begin
    perform public.host_launch_game((v_copy->>'id')::uuid);
  exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'empty structural round cannot launch');
  v_failed := false;
  begin
    delete from public.quiz_rounds where quiz_id=(v_copy->>'id')::uuid;
    set constraints rounds_count_check immediate;
  exception when raise_exception then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'deferred constraint prevents deleting the last empty round');

  -- Launch shuffle persists one flat order, with each round still contiguous.
  v_session := public.host_launch_game(v_id, '{"shuffleQuestionOrder":true,"soundPackId":"none"}');
  v_session_id := (v_session->>'id')::uuid; v_room := v_session->>'roomCode';
  select question_order into v_order from public.game_sessions where id=v_session_id;
  perform pg_temp.rounds_assert(v_session->>'currentRoundId'=r1::text, 'launch points at first round');
  perform pg_temp.rounds_assert((select array_agg(round_id order by n) from unnest(v_order) with ordinality o(id,n) join public.questions q using(id))=array[r1,r1,r2,r3], 'shuffle respects round groups');
  v_player := public.join_room(v_room,'Round player');
  perform public.host_start_game(v_session_id);
  v_state := public.get_player_game_state(v_room);
  perform pg_temp.rounds_assert(v_state->>'phase'='round-intro' and v_state->'currentQuestion'='null'::jsonb, 'first intro has no question');
  perform pg_temp.rounds_assert(v_state->'questionOpenedAt'='null'::jsonb and v_state->'questionClosesAt'='null'::jsonb, 'intro has no timer');
  perform pg_temp.rounds_assert(v_state->'leaderboard'='[]'::jsonb and v_state->'reveal'='null'::jsonb and (v_state->>'submittedCount')::int=0, 'intro reveals no results');
  perform pg_temp.rounds_assert(v_state->'currentRound'=jsonb_build_object('id',r1,'title','Opening','subtitle','First up','introEnabled',true,'roundNumber',1,'totalRounds',3,'questionCount',2), 'exact safe round metadata');
  v_failed := false;
  begin perform public.submit_answer(v_room,(v_player->'player'->>'id')::uuid,v_player->>'reconnectToken','{"type":"true-false","value":true}'::jsonb); exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'answers rejected during intro');
  v_failed := false;
  begin perform public.host_lock_game(v_session_id); exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'intro cannot lock');
  perform public.host_start_round_game(v_session_id);
  v_state := public.get_player_game_state(v_room);
  perform pg_temp.rounds_assert(v_state->>'phase'='question' and (v_state->'currentQuestion'->>'questionNumber')::int=1, 'start-round opens first question');
  perform pg_temp.rounds_assert((v_state->>'questionClosesAt')::timestamptz-(v_state->>'questionOpenedAt')::timestamptz=interval '60 seconds', 'full timer begins at question opening');
  perform pg_temp.rounds_assert(not (v_state->'currentQuestion' ? 'correctValue'), 'answer key remains withheld');
  v_failed := false;
  begin perform public.host_start_round_game(v_session_id); exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'duplicate start-round rejected');
  perform public.submit_answer(v_room,(v_player->'player'->>'id')::uuid,v_player->>'reconnectToken','{"type":"true-false","value":true}'::jsonb);
  for i in 0..2 loop
    perform public.host_lock_game(v_session_id); perform public.host_reveal_game(v_session_id);
    v_state := public.get_player_game_state(v_room);
    perform pg_temp.rounds_assert(v_state->'leaderboard'='[]'::jsonb and (v_state->'players'->0->>'totalScore')::int=0, 'reveal still withholds totals');
    perform public.host_leaderboard_game(v_session_id); perform public.host_next_game(v_session_id);
    select phase,current_question_id into v_phase,v_question_id from public.game_sessions where id=v_session_id;
    if i=0 then perform pg_temp.rounds_assert(v_phase='question', 'within-round next skips intro'); end if;
    if i=1 then
      perform pg_temp.rounds_assert(v_phase='round-intro' and v_question_id is null, 'next enabled round intro');
      perform public.host_start_round_game(v_session_id);
    end if;
    if i=2 then perform pg_temp.rounds_assert(v_phase='question', 'disabled next intro opens directly'); end if;
    v_failed := false;
    begin perform public.host_next_game(v_session_id); exception when others then v_failed := true; end;
    perform pg_temp.rounds_assert(v_failed, 'rapid duplicate next cannot skip a question');
  end loop;
  v_state := public.get_player_game_state(v_room);
  perform pg_temp.rounds_assert(v_state->'currentRound'->>'id'=r3::text and (v_state->'currentQuestion'->>'questionNumber')::int=4, 'global numbering and round metadata');
  perform public.host_lock_game(v_session_id); perform public.host_reveal_game(v_session_id);
  v_failed := false;
  begin perform public.host_leaderboard_game(v_session_id); exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'final ordinary leaderboard remains forbidden');
  perform public.host_finish_game(v_session_id);
  perform pg_temp.rounds_assert(public.get_player_game_state(v_room)->>'phase'='finished', 'explicit final reveal');
  perform public.host_restart_game(v_session_id);
  select question_order into v_order from public.game_sessions where id=v_session_id;
  perform pg_temp.rounds_assert(public.session_to_json(v_session_id)->>'currentRoundId'=r1::text, 'restart resets round');
  perform public.host_start_game(v_session_id);
  perform pg_temp.rounds_assert(public.get_player_game_state(v_room)->>'phase'='round-intro', 'restart honours first intro');

  -- Legacy one-round save/launch stays silent, including the old launch overload.
  v_bad := (v_quiz-'rounds') || jsonb_build_object('questions',jsonb_build_array((v_quiz->'questions'->0)-'roundId'));
  v_bad := jsonb_set(v_bad,'{questions,0,id}',to_jsonb(gen_random_uuid()));
  v_copy := public.host_save_quiz(v_bad);
  perform pg_temp.rounds_assert(v_copy->'rounds'->0->>'introEnabled'='false', 'legacy default silent round');
  v_copy := public.host_save_quiz(v_copy-'rounds');
  v_session := public.host_launch_game((v_copy->>'id')::uuid);
  perform public.host_start_game((v_session->>'id')::uuid);
  perform pg_temp.rounds_assert(public.get_player_game_state(v_session->>'roomCode')->>'phase'='question', 'legacy start unchanged');

  -- One-round H2H never enters the Standard intro, even if metadata enables it.
  v_h2h := v_quiz || jsonb_build_object('quizType','head-to-head','rounds',jsonb_build_array(v_quiz->'rounds'->0),
    'headToHeadCompetitors', jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'displayName','One','displayOrder',0),jsonb_build_object('id',gen_random_uuid(),'displayName','Two','displayOrder',1)),
    'questions',jsonb_build_array(v_quiz->'questions'->0));
  v_h2h := jsonb_set(v_h2h,'{rounds,0,id}',to_jsonb(gen_random_uuid()));
  v_h2h := jsonb_set(v_h2h,'{questions,0,roundId}',v_h2h->'rounds'->0->'id');
  v_h2h := jsonb_set(v_h2h,'{questions,0,id}',to_jsonb(gen_random_uuid()));
  v_h2h := jsonb_set(v_h2h,'{questions,0,assignedCompetitorId}',v_h2h->'headToHeadCompetitors'->0->'id');
  v_h2h := public.host_save_quiz(v_h2h);
  v_failed := false;
  begin
    insert into public.quiz_rounds(id,quiz_id,title,display_order) values(gen_random_uuid(),(v_h2h->>'id')::uuid,'Forbidden second round',1);
    set constraints rounds_count_check immediate;
  exception when raise_exception then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'deferred constraint prevents multiple H2H rounds');
  v_session := public.host_launch_game((v_h2h->>'id')::uuid);
  v_first := public.join_head_to_head_room(v_session->>'roomCode',(v_h2h->'headToHeadCompetitors'->0->>'id')::uuid);
  v_second := public.join_head_to_head_room(v_session->>'roomCode',(v_h2h->'headToHeadCompetitors'->1->>'id')::uuid);
  perform public.start_head_to_head_game(v_session->>'roomCode',(v_first->'player'->>'id')::uuid,v_first->>'reconnectToken');
  perform pg_temp.rounds_assert(public.get_player_game_state(v_session->>'roomCode')->>'phase'='question', 'H2H competitor start unchanged');
  v_failed := false;
  begin perform public.host_start_round_game((v_session->>'id')::uuid); exception when others then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'host cannot start H2H rounds');
  perform public.submit_answer(v_session->>'roomCode',(v_first->'player'->>'id')::uuid,v_first->>'reconnectToken','{"type":"true-false","value":true}'::jsonb);
  perform public.submit_answer(v_session->>'roomCode',(v_second->'player'->>'id')::uuid,v_second->>'reconnectToken','{"type":"true-false","value":true}'::jsonb);
  v_state := public.get_player_game_state(v_session->>'roomCode');
  perform pg_temp.rounds_assert(v_state->>'phase'='reveal' and (v_state->'headToHeadCompetitors'->0->>'totalScore')::int=1 and (v_state->'headToHeadCompetitors'->1->>'totalScore')::int=0, 'H2H automatic reveal and assigned scoring unchanged');

  -- Actual role checks, ownership failures and retained locking/wrappers.
  perform pg_temp.rounds_assert(not has_function_privilege('anon','public.host_start_round_game(uuid)','EXECUTE'), 'anon cannot start round');
  perform pg_temp.rounds_assert(not has_function_privilege('authenticated','public.host_change_phase(uuid,text)','EXECUTE'), 'private phase implementation stays private');
  perform pg_temp.rounds_assert(not has_function_privilege('authenticated','public.prepare_quiz_round_save(uuid,jsonb)','EXECUTE'), 'save helper private');
  perform pg_temp.rounds_assert(position('for share' in lower(pg_get_functiondef('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure)))>0, 'shared submission lock retained');
  perform pg_temp.rounds_assert(position('for update' in lower(pg_get_functiondef('public.host_change_phase(uuid,text)'::regprocedure)))>0, 'host phase checks hold exclusive lock');
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  v_failed := false;
  begin perform public.host_start_round_game(v_session_id); exception when insufficient_privilege then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'other owner cannot advance room');
  v_failed := false;
  begin perform public.host_save_quiz(v_saved); exception when insufficient_privilege then v_failed := true; end;
  perform pg_temp.rounds_assert(v_failed, 'other owner cannot save rounds');
  execute 'set local role authenticated';
  if exists(select 1 from public.quiz_rounds where quiz_id=v_id) then raise exception 'Round RLS exposed another owner'; end if;
  execute 'reset role';
  perform pg_temp.rounds_assert((select relrowsecurity from pg_class where oid='public.quiz_rounds'::regclass), 'round RLS enabled');
  perform pg_temp.rounds_assert(not has_table_privilege('anon','public.quiz_rounds','SELECT'), 'anon cannot query round table');
  perform pg_temp.rounds_assert(not has_table_privilege('authenticated','public.quiz_rounds','INSERT'), 'round changes use authoritative save');
end;
$test$;
set constraints all immediate;
select pass('Core Rounds: persistence, integrity, transitions, privacy, H2H and ownership assertions');
select * from finish();
rollback;
