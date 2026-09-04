-- Progressive Reveal is a saved question modifier, never live session state.
alter table public.questions add column progressive_reveal_enabled boolean not null default false;

create function public.progressive_reveal_score(p_base integer,p_elapsed integer,p_duration integer) returns integer
language sql immutable set search_path=public as $$
  select case when p_base is null or p_base<0 or p_elapsed is null or p_duration is null or p_duration<=0 then 0
    else floor(p_base::numeric * (4::numeric*p_duration-3::numeric*least(greatest(p_elapsed,0),p_duration)) / (4::numeric*p_duration))::integer end
$$;
revoke all on function public.progressive_reveal_score(integer,integer,integer) from public,anon,authenticated;

create function pg_temp.patch_progressive_function(p_signature text,p_old text,p_new text) returns void language plpgsql as $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in definition)=0 then raise exception 'Missing Progressive Reveal predecessor in %: %',p_signature,p_old; end if;
  execute replace(definition,p_old,p_new);
end $$;

select pg_temp.patch_progressive_function('public.validate_question_json()',
  $old$case new.question_type$old$,
  $new$if new.progressive_reveal_enabled then
    if (select quiz_type from public.quizzes where id=new.quiz_id)<>'standard'
      or new.question_type in ('pinpoint','connections') or new.media->>'type' is distinct from 'image'
      or coalesce(new.media->>'revealEffect','') not in ('blur','pixelate','tiles','zoom-out')
      or jsonb_typeof(new.media->'revealDurationSeconds') is distinct from 'number'
      or (new.media->>'revealDurationSeconds')::numeric<=0
      or (new.media->>'revealDurationSeconds')::numeric>least(180,new.time_limit_seconds) then
      raise exception 'Progressive Reveal requires a Standard timed image, excluding Pinpoint and Connections, within the question timer';
    end if;
  end if;
  case new.question_type$new$);

select pg_temp.patch_progressive_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_type := v_question ->> 'type';$old$,
  $new$v_type := v_question ->> 'type';
    if v_question ? 'progressiveRevealEnabled' and jsonb_typeof(v_question->'progressiveRevealEnabled') is distinct from 'boolean' then
      raise exception 'Invalid Progressive Reveal setting';
    end if;$new$);
select pg_temp.patch_progressive_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$type_config, answer_key, image_path$old$, $new$progressive_reveal_enabled, type_config, answer_key, image_path$new$);
select pg_temp.patch_progressive_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_config, v_answer,$old$, $new$coalesce((v_question->>'progressiveRevealEnabled')::boolean,false), v_config, v_answer,$new$);
select pg_temp.patch_progressive_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$type_config = excluded.type_config,$old$, $new$progressive_reveal_enabled = excluded.progressive_reveal_enabled, type_config = excluded.type_config,$new$);
select pg_temp.patch_progressive_function('public.host_launch_game(uuid,jsonb)',
  $old$if p_settings is null then$old$,
  $new$if v_quiz.quiz_type='head-to-head' and exists(select 1 from public.questions where quiz_id=p_quiz_id and progressive_reveal_enabled) then
    raise exception 'Progressive Reveal is Standard-only';
  end if;
  if p_settings is null then$new$);

select pg_temp.patch_progressive_function('public.question_to_json(uuid,boolean)',
  $old$'points', x.points, 'speedScoringEnabled', x.speed_scoring_enabled,$old$,
  $new$'points', x.points, 'progressiveRevealEnabled', x.progressive_reveal_enabled,
      'speedScoringEnabled', case when not p_include_answer and x.progressive_reveal_enabled then false else x.speed_scoring_enabled end,$new$);
select pg_temp.patch_progressive_function('public.question_to_json(uuid,boolean)',
  $old$'media', x.media,$old$,
  $new$'media', case when not p_include_answer and x.progressive_reveal_enabled then jsonb_set(x.media,'{altText}','"Progressively revealing question image"'::jsonb) else x.media end,$new$);
-- Keep neutral alt throughout question/locked; no time-sensitive cache or new fetch.
select pg_temp.patch_progressive_function('public.get_player_game_state_without_teams(text)',
  $old$v_prelude := case$old$,
  $new$if v_question.progressive_reveal_enabled and v_session.phase in ('reveal','leaderboard','finished') and v_state->'currentQuestion'<>'null'::jsonb then
    v_state:=jsonb_set(v_state,'{currentQuestion,media}',v_question.media);
  end if;
  v_prelude := case$new$);

-- Existing raw correctness/partial scoring and session shared locks are unchanged.
select pg_temp.patch_progressive_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if v_question.double_score then$old$,
  $new$if v_question.progressive_reveal_enabled then
      v_points:=public.progressive_reveal_score(v_points,v_response_ms,greatest(1,round((v_question.media->>'revealDurationSeconds')::numeric*1000)::integer));
    end if;
    if v_question.double_score then$new$);
select pg_temp.patch_progressive_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if v_question.speed_scoring_enabled and v_question.question_type<>'connections'$old$,
  $new$if v_question.speed_scoring_enabled and not v_question.progressive_reveal_enabled and v_question.question_type<>'connections'$new$);
-- Accept/undo must recalculate from the original authoritative answer time too.
select pg_temp.patch_progressive_function('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$v_next_points := v_question.points;$old$,
  $new$v_next_points := case when v_question.progressive_reveal_enabled then public.progressive_reveal_score(v_question.points,v_answer.response_time_ms,greatest(1,round((v_question.media->>'revealDurationSeconds')::numeric*1000)::integer)) else v_question.points end;$new$);
select pg_temp.patch_progressive_function('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$if v_question.speed_scoring_enabled then$old$, $new$if v_question.speed_scoring_enabled and not v_question.progressive_reveal_enabled then$new$);

drop function pg_temp.patch_progressive_function(text,text,text);
