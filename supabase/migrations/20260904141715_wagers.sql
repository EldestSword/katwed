-- Wager is an opt-in Standard question modifier. Defaults preserve old clients/rows.
alter table public.questions add column wager_enabled boolean not null default false;
alter table public.player_answers add column wager_percent smallint not null default 0
  constraint player_answers_wager_percent_check check (wager_percent in (0,25,50,100));
alter table public.player_answers drop constraint player_answers_points_awarded_check;
alter table public.player_answers add constraint player_answers_points_awarded_check
  check (points_awarded >= 0 or wager_percent > 0);
alter table public.players drop constraint players_total_score_check;

create function public.wager_stake(p_points integer,p_percent integer) returns integer
language plpgsql immutable set search_path=public as $$
begin
  if p_points is null or p_points<0 or p_percent is null or p_percent not in (0,25,50,100) then
    raise exception 'Invalid wager stake';
  end if;
  return (p_points::bigint*p_percent/100)::integer;
end $$;
create function public.apply_wager(p_ordinary integer,p_points integer,p_correct boolean,p_percent integer) returns integer
language sql immutable set search_path=public as $$
  select p_ordinary + case when p_correct then public.wager_stake(p_points,p_percent) else -public.wager_stake(p_points,p_percent) end
$$;
revoke all on function public.wager_stake(integer,integer),public.apply_wager(integer,integer,boolean,integer) from public,anon,authenticated;

create function pg_temp.patch_wager_function(p_signature text,p_old text,p_new text) returns void language plpgsql as $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in definition)=0 then raise exception 'Missing Wager predecessor in %: %',p_signature,p_old; end if;
  execute replace(definition,p_old,p_new);
end $$;

select pg_temp.patch_wager_function('public.validate_question_json()',
  $old$case new.question_type$old$,
  $new$if new.wager_enabled and (select quiz_type from public.quizzes where id=new.quiz_id)<>'standard' then
    raise exception 'Wager is Standard-only';
  end if;
  case new.question_type$new$);
select pg_temp.patch_wager_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_type := v_question ->> 'type';$old$,
  $new$v_type := v_question ->> 'type';
    if v_question ? 'wagerEnabled' and jsonb_typeof(v_question->'wagerEnabled') is distinct from 'boolean' then
      raise exception 'Invalid Wager setting';
    end if;$new$);
select pg_temp.patch_wager_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$progressive_reveal_enabled, type_config, answer_key, image_path$old$, $new$wager_enabled, progressive_reveal_enabled, type_config, answer_key, image_path$new$);
select pg_temp.patch_wager_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$coalesce((v_question->>'progressiveRevealEnabled')::boolean,false),$old$,
  $new$coalesce((v_question->>'wagerEnabled')::boolean,false), coalesce((v_question->>'progressiveRevealEnabled')::boolean,false),$new$);
select pg_temp.patch_wager_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$progressive_reveal_enabled = excluded.progressive_reveal_enabled,$old$,
  $new$wager_enabled = excluded.wager_enabled, progressive_reveal_enabled = excluded.progressive_reveal_enabled,$new$);
select pg_temp.patch_wager_function('public.host_launch_game(uuid,jsonb)',
  $old$if p_settings is null then$old$,
  $new$if v_quiz.quiz_type='head-to-head' and exists(select 1 from public.questions where quiz_id=p_quiz_id and wager_enabled) then
    raise exception 'Wager is Standard-only';
  end if;
  if p_settings is null then$new$);
select pg_temp.patch_wager_function('public.question_to_json(uuid,boolean)',
  $old$'points', x.points, 'progressiveRevealEnabled'$old$,
  $new$'points', x.points, 'wagerEnabled', x.wager_enabled, 'progressiveRevealEnabled'$new$);

-- Preserve the session locks, token/deadline checks and retained scoring pipeline.
select pg_temp.patch_wager_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$v_quiz_type text; v_correct$old$, $new$v_wager_percent integer := 0; v_core_fields text[];
  v_quiz_type text; v_correct$new$);
select pg_temp.patch_wager_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if p_answer ->> 'type' <> v_question.question_type then$old$,
  $new$if jsonb_typeof(p_answer) is distinct from 'object' then raise exception 'Invalid answer payload'; end if;
  if p_answer ? 'wagerPercent' then
    if jsonb_typeof(p_answer->'wagerPercent') is distinct from 'number' then raise exception 'Invalid wager percentage'; end if;
    if (p_answer->>'wagerPercent')::numeric not in (0,25,50,100) then raise exception 'Invalid wager percentage'; end if;
    v_wager_percent := (p_answer->>'wagerPercent')::numeric::integer;
  end if;
  if v_wager_percent<>0 and (not v_question.wager_enabled or v_quiz_type<>'standard') then raise exception 'Wager is not enabled for this question'; end if;
  p_answer := p_answer-'wagerPercent';
  v_core_fields := case v_question.question_type
    when 'single-choice' then array['type','optionId']
    when 'multiple-select' then array['type','optionIds']
    when 'pinpoint' then array['type','x','y']
    when 'mashup' then array['type','memberIds']
    when 'ordering' then array['type','itemIds']
    when 'matching' then array['type','pairs']
    else array['type','value'] end;
  if p_answer-v_core_fields<>'{}'::jsonb or not (p_answer ?& v_core_fields) then raise exception 'Invalid answer fields'; end if;
  if p_answer ->> 'type' is distinct from v_question.question_type then$new$);
select pg_temp.patch_wager_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$insert into public.player_answers ($old$,
  $new$if v_quiz_type='standard' then
    v_points := public.apply_wager(v_points,v_question.points,v_correct,v_wager_percent);
  end if;
  insert into public.player_answers ($new$);
select pg_temp.patch_wager_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$response_time_ms, correct, points_awarded$old$, $new$wager_percent, response_time_ms, correct, points_awarded$new$);
select pg_temp.patch_wager_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$v_response_ms, v_correct, v_points$old$, $new$v_wager_percent, v_response_ms, v_correct, v_points$new$);

-- Accept/undo changes only the delta from the original time and persisted wager.
select pg_temp.patch_wager_function('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$update public.player_answers set$old$,
  $new$v_next_points := public.apply_wager(v_next_points,v_question.points,v_next_correct,v_answer.wager_percent);
  update public.player_answers set$new$);

-- Current-question, owner-only response metadata; no new public player outcome data.
select pg_temp.patch_wager_function('public.session_to_json_without_teams(uuid)',
  $old$'playerId', a.player_id,$old$,
  $new$'playerId', a.player_id, 'wagerPercent', a.wager_percent,$new$);
drop function pg_temp.patch_wager_function(text,text,text);
