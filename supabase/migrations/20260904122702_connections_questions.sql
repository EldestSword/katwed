-- Connections: Standard-only, host-paced text clues and one authoritative guess.
alter table public.questions drop constraint questions_type_check;
alter table public.questions add constraint questions_type_check check (question_type in (
  'single-choice','multiple-select','true-false','slider','pinpoint','typed-answer','mashup','ordering','matching','connections'
));
alter table public.game_sessions add column connection_clue_count integer not null default 0
  check (connection_clue_count between 0 and 6);

create function public.connection_stage_points(p_points integer,p_total integer,p_revealed integer) returns integer
language sql immutable set search_path=public as $$
  select case when p_points >= 0 and p_total between 2 and 6 and p_revealed between 1 and p_total
    then floor(p_points::numeric * (p_total-p_revealed+1) / p_total)::integer else 0 end
$$;

create function public.connection_clues_valid(p_clues jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
begin
  if jsonb_typeof(p_clues) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_clues) not between 2 and 6 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_clues) c where jsonb_typeof(c) is distinct from 'object'
    or c-array['id','text'] <> '{}'::jsonb or jsonb_typeof(c->'id') is distinct from 'string'
    or char_length(c->>'id') not between 1 and 128 or jsonb_typeof(c->'text') is distinct from 'string'
    or char_length(public.arrangement_trim(c->>'text')) not between 1 and 200) then return false; end if;
  return (select count(distinct c->>'id')=count(*) and count(distinct lower(public.arrangement_trim(c->>'text')))=count(*) from jsonb_array_elements(p_clues) c);
end $$;

create function public.connection_safe_config(p_config jsonb,p_points integer,p_double boolean,p_count integer,p_reveal boolean) returns jsonb
language sql immutable set search_path=public as $$
  select jsonb_build_object('visibleClues',coalesce((select jsonb_agg(c order by n) from jsonb_array_elements(p_config->'clues') with ordinality a(c,n) where n<=r),'[]'::jsonb),
    'revealedClueCount',r,'totalClues',total,'availablePoints',public.connection_stage_points(p_points,total,r)*case when p_double then 2 else 1 end,
    'speedScoringEnabled',false)
  from (select jsonb_array_length(p_config->'clues') total, case when p_reveal then jsonb_array_length(p_config->'clues') else greatest(0,least(p_count,jsonb_array_length(p_config->'clues'))) end r) counts
$$;

-- Every retained signature and source fragment is required. No wrapper is replaced.
create function pg_temp.patch_connection_function(p_signature text,p_old text,p_new text) returns void
language plpgsql as $$
declare v_definition text;
begin
  v_definition := replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in v_definition)=0 then raise exception 'Missing Connections predecessor in %: %',p_signature,p_old; end if;
  execute replace(v_definition,p_old,p_new);
end $$;

select pg_temp.patch_connection_function('public.validate_question_json()',
  $old$case new.question_type$old$,
  $new$if new.question_type='connections' then
    if not public.connection_clues_valid(new.type_config->'clues') or new.type_config-'clues'<>'{}'::jsonb
      or new.answer_key-array['correctAnswer','acceptedAnswers']<>'{}'::jsonb then raise exception 'Invalid Connections definition'; end if;
    if (select quiz_type from public.quizzes where id=new.quiz_id)<>'standard' then raise exception 'Connections is Standard-only'; end if;
    new.type_config := jsonb_build_object('clues',(select jsonb_agg(jsonb_build_object('id',c->>'id','text',public.arrangement_trim(c->>'text')) order by n)
      from jsonb_array_elements(new.type_config->'clues') with ordinality a(c,n)));
    new.speed_scoring_enabled := false;
  end if;
  case new.question_type$new$);
select pg_temp.patch_connection_function('public.validate_question_json()',
  $old$when 'typed-answer' then$old$, $new$when 'typed-answer', 'connections' then$new$);
select pg_temp.patch_connection_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_type := v_question ->> 'type';$old$,
  $new$v_type := v_question ->> 'type';
    if v_type='connections' and v_quiz_type<>'standard' then raise exception 'Connections is Standard-only'; end if;$new$);
select pg_temp.patch_connection_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_config := case v_type$old$, $new$v_config := case v_type
      when 'connections' then jsonb_build_object('clues',v_question->'clues')$new$);
select pg_temp.patch_connection_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$if v_type = 'typed-answer' then$old$, $new$if v_type in ('typed-answer','connections') then$new$);
select pg_temp.patch_connection_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_answer := case v_type$old$, $new$v_answer := case v_type
      when 'connections' then jsonb_build_object('correctAnswer',trim(v_question->>'correctAnswer'),'acceptedAnswers',v_question->'acceptedAnswers')$new$);
select pg_temp.patch_connection_function('public.host_launch_game(uuid,jsonb)',
  $old$if p_settings is null then$old$,
  $new$if v_quiz.quiz_type='head-to-head' and exists(select 1 from public.questions where quiz_id=p_quiz_id and question_type='connections') then
    raise exception 'Connections is Standard-only';
  end if;
  if p_settings is null then$new$);

-- The shared answer/session lock is retained. Stage count is read after acquiring it.
select pg_temp.patch_connection_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$case v_question.question_type$old$,
  $new$case v_question.question_type
    when 'connections' then
      if v_quiz_type<>'standard' then raise exception 'Connections is Standard-only'; end if;
      if jsonb_typeof(p_answer) is distinct from 'object' or p_answer->>'type' is distinct from 'connections'
        or jsonb_typeof(p_answer->'value') is distinct from 'string' or p_answer-array['type','value']<>'{}'::jsonb then raise exception 'Invalid Connections answer'; end if;
      v_text := public.arrangement_trim(p_answer->>'value');
      v_normalised := public.normalise_typed_answer(v_text);
      if char_length(v_text)>120 or coalesce(v_normalised,'')='' then raise exception 'Enter an answer of at most 120 meaningful characters'; end if;
      if v_session.connection_clue_count not between 1 and jsonb_array_length(v_question.type_config->'clues') then raise exception 'Invalid Connections clue stage'; end if;
      select exists(select 1 from jsonb_array_elements_text(jsonb_build_array(v_question.answer_key->>'correctAnswer') || (v_question.answer_key->'acceptedAnswers')) a(value)
        where public.normalise_typed_answer(a.value)=v_normalised) into v_correct;
      p_answer := jsonb_build_object('type','connections','value',v_text);$new$);
select pg_temp.patch_connection_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$elsif v_correct then
    v_points := v_question.points;$old$,
  $new$elsif v_correct then
    v_points := case when v_question.question_type='connections' then public.connection_stage_points(v_question.points,jsonb_array_length(v_question.type_config->'clues'),v_session.connection_clue_count) else v_question.points end;$new$);
select pg_temp.patch_connection_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if v_question.speed_scoring_enabled and (v_question.question_type <> 'matching' or v_correct) then$old$,
  $new$if v_question.speed_scoring_enabled and v_question.question_type<>'connections' and (v_question.question_type <> 'matching' or v_correct) then$new$);

-- Even the lower-level serialiser with no session context withholds every clue.
select pg_temp.patch_connection_function('public.question_to_json(uuid,boolean)',
  $old$else public.arrangement_safe_config(x.question_type,x.type_config,x.id::text) end$old$,
  $new$when x.question_type='connections' then public.connection_safe_config(x.type_config,x.points,x.double_score,0,false)
      else public.arrangement_safe_config(x.question_type,x.type_config,x.id::text) end$new$);
-- The session-aware retained reader already loads the authoritative question and session.
select pg_temp.patch_connection_function('public.get_player_game_state_without_teams(text)',
  $old$v_prelude := case$old$,
  $new$if v_question.question_type='connections' and v_state->'currentQuestion' is not null then
    v_state := jsonb_set(v_state,'{currentQuestion}',(v_state->'currentQuestion') || public.connection_safe_config(v_question.type_config,v_question.points,v_question.double_score,
      v_session.connection_clue_count,v_session.phase in ('reveal','leaderboard','finished')));
    if v_session.phase in ('reveal','leaderboard','finished') then
      v_state := jsonb_set(v_state,'{reveal}',jsonb_build_object('type','connections','correctAnswer',v_question.answer_key->>'correctAnswer','caption',v_question.reveal_caption));
    end if;
  end if;
  v_prelude := case$new$);
select pg_temp.patch_connection_function('public.get_player_game_state_without_teams(text)',
  $old$and v_question.question_type = 'typed-answer' then$old$, $new$and v_question.question_type in ('typed-answer','connections') then$new$);
select pg_temp.patch_connection_function('public.session_to_json(uuid)',
  $old$return v_result || jsonb_build_object('teams',$old$, $new$return v_result || jsonb_build_object('connectionClueCount',v_session.connection_clue_count,'teams',$new$);

-- First start, Start round and Next all open through these retained paths.
select pg_temp.patch_connection_function('public.host_change_phase(uuid,text)',
  $old$current_question_id = v_question.id,$old$, $new$connection_clue_count = case when v_question.question_type='connections' then 1 else 0 end, current_question_id = v_question.id,$new$);
select pg_temp.patch_connection_function('public.host_change_phase(uuid,text)',
  $old$phase = 'round-intro',$old$, $new$phase = 'round-intro', connection_clue_count = 0,$new$);
select pg_temp.patch_connection_function('public.host_change_phase(uuid,text)',
  $old$status = 'active', phase = 'lobby',$old$, $new$status = 'active', phase = 'lobby', connection_clue_count = 0,$new$);
select pg_temp.patch_connection_function('public.host_change_phase(uuid,text)',
  $old$phase = 'finished',$old$, $new$phase = 'finished', connection_clue_count = 0,$new$);

create function public.host_reveal_connection_clue(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions; v_question public.questions; v_now timestamptz;
begin
  select s.* into v_session from public.game_sessions s join public.quizzes q on q.id=s.quiz_id
    where s.id=p_session_id and q.owner_id=auth.uid() for update of s;
  if not found then raise exception 'Session not found or unauthorised' using errcode='42501'; end if;
  if v_session.status<>'active' or v_session.phase<>'question' or (select quiz_type from public.quizzes where id=v_session.quiz_id)<>'standard' then
    raise exception 'Clues can only be revealed in an open Standard question'; end if;
  select * into v_question from public.questions where id=v_session.current_question_id and quiz_id=v_session.quiz_id;
  if not found or v_question.question_type<>'connections' then raise exception 'This is not a Connections question'; end if;
  v_now := clock_timestamp();
  if v_session.question_opened_at is null or v_session.question_closes_at is null or v_now<v_session.question_opened_at or v_now>=v_session.question_closes_at then raise exception 'Answers are not open'; end if;
  if v_session.connection_clue_count not between 1 and jsonb_array_length(v_question.type_config->'clues')-1 then raise exception 'No further clue is available'; end if;
  update public.game_sessions set connection_clue_count=connection_clue_count+1 where id=p_session_id;
end $$;
revoke all on function public.host_reveal_connection_clue(uuid) from public,anon;
grant execute on function public.host_reveal_connection_clue(uuid) to authenticated;

-- Extend the existing shared-session signal, with no new channel/subscription.
-- Each reveal emits one room event and its existing private-controller topic copy.
do $$
declare definition text;
begin
  select pg_get_triggerdef(oid) into strict definition from pg_trigger where tgrelid='public.game_sessions'::regclass and tgname='game_sessions_broadcast_refresh';
  if position('UPDATE OF status, phase, current_question_id, current_question_index, question_opened_at, question_closes_at, started_at, ended_at' in definition)=0
    or position('broadcast_game_refresh()' in definition)=0 then raise exception 'Unexpected session broadcast predecessor'; end if;
end $$;
drop trigger game_sessions_broadcast_refresh on public.game_sessions;
create trigger game_sessions_broadcast_refresh after insert or delete or update of status,phase,current_question_id,current_question_index,
  question_opened_at,question_closes_at,started_at,ended_at,connection_clue_count on public.game_sessions
  for each row execute function public.broadcast_game_refresh();

revoke all on function public.connection_stage_points(integer,integer,integer),public.connection_clues_valid(jsonb),public.connection_safe_config(jsonb,integer,boolean,integer,boolean) from public,anon,authenticated;
drop function pg_temp.patch_connection_function(text,text,text);
