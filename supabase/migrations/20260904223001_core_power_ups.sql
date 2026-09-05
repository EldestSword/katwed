-- Personal, optional session consumables. No quiz-format or Realtime changes.
alter table public.game_sessions
  add column power_ups_enabled boolean not null default false,
  add column power_up_run_id uuid not null default gen_random_uuid(),
  add constraint game_sessions_powerup_quiz_identity unique(id,quiz_id);
alter table public.questions add constraint questions_powerup_quiz_identity unique(quiz_id,id);

create table public.player_powerup_uses (
  session_id uuid not null,
  quiz_id uuid not null,
  player_id uuid not null,
  question_id uuid not null,
  powerup_id text not null check(powerup_id in ('double-up','fifty-fifty','fast-five')),
  activated_at timestamptz not null default clock_timestamp(),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  primary key(session_id,player_id,powerup_id),
  unique(session_id,player_id,question_id),
  foreign key(session_id,quiz_id) references public.game_sessions(id,quiz_id) on delete cascade,
  foreign key(session_id,player_id) references public.players(game_session_id,id) on delete cascade,
  foreign key(quiz_id,question_id) references public.questions(quiz_id,id) on delete cascade
);
create index player_powerup_uses_question on public.player_powerup_uses(quiz_id,question_id);
alter table public.player_powerup_uses enable row level security;
alter table public.player_powerup_uses force row level security;
revoke all on public.player_powerup_uses from public,anon,authenticated;

-- Called only after the existing token boundary has authorised this player.
create function public.personal_powerup_state(p_session uuid,p_player uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when s.power_ups_enabled then jsonb_build_object('runId',s.power_up_run_id,'uses',
    coalesce((select jsonb_agg(jsonb_build_object('questionId',u.question_id,'powerUp',u.powerup_id)||u.metadata order by u.activated_at,u.powerup_id)
      from public.player_powerup_uses u where u.session_id=s.id and u.player_id=p_player),'[]'::jsonb)) else null end
  from public.game_sessions s where s.id=p_session
$$;
revoke all on function public.personal_powerup_state(uuid,uuid) from public,anon,authenticated;

create function public.require_powerup_compatible(p_question public.questions,p_powerup text) returns void
language plpgsql immutable set search_path='' as $$
begin
  if p_powerup is null or p_powerup not in ('double-up','fifty-fifty','fast-five') then raise exception 'Unknown Power-Up.'; end if;
  if p_question.buzz_in_enabled then raise exception 'Power-Ups are unavailable on Buzz-In.'; end if;
  if p_powerup='fast-five' and (not p_question.speed_scoring_enabled or p_question.progressive_reveal_enabled or p_question.question_type='connections') then
    raise exception 'Fast Five is for Speed Scoring questions only.';
  end if;
  if p_powerup='fifty-fifty' and p_question.question_type<>'single-choice' then raise exception '50/50 is for Single Choice only.'; end if;
end $$;
revoke all on function public.require_powerup_compatible(public.questions,text) from public,anon,authenticated;

create function public.activate_fifty_fifty(p_room_code text,p_player_id uuid,p_reconnect_token text,p_question_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.game_sessions; p public.players; q public.questions; wrong_id uuid; retained jsonb; received_at timestamptz;
begin
  select * into s from public.game_sessions where room_code=p_room_code and status='active' for share;
  if not found or not s.power_ups_enabled or s.phase<>'question' or s.current_question_id is distinct from p_question_id
    or (select quiz_type from public.quizzes where id=s.quiz_id)<>'standard' then raise exception 'Power-Ups are not available for this question.'; end if;
  select * into p from public.players where id=p_player_id and game_session_id=s.id
    and reconnect_token_hash=extensions.digest(p_reconnect_token,'sha256') for update;
  if not found then raise exception 'Your player session could not be verified.' using errcode='42501'; end if;
  received_at:=clock_timestamp();
  if s.question_opened_at is null or s.question_closes_at is null or received_at<s.question_opened_at or received_at>=s.question_closes_at then raise exception 'Answers are not open.'; end if;
  if s.competition_mode='survivor' and p.survivor_lives_remaining<=0 then raise exception 'Eliminated players can only spectate.' using errcode='42501'; end if;
  if exists(select 1 from public.player_answers where player_id=p.id and question_id=p_question_id) then raise exception 'You have already answered.'; end if;
  select * into strict q from public.questions where id=p_question_id and quiz_id=s.quiz_id;
  perform public.require_powerup_compatible(q,'fifty-fifty');
  if (select count(*) from public.question_options where question_id=q.id)<4 then raise exception '50/50 needs at least four options.'; end if;
  select o.id into strict wrong_id from public.question_options o where o.question_id=q.id and o.id::text<>q.answer_key->>'correctOptionId'
    order by encode(extensions.digest(s.id::text||':'||p.id::text||':'||q.id::text||':'||o.id::text,'sha256'),'hex'),o.id limit 1;
  -- Stable option-ID order conveys no correctness position; UI retains its existing order.
  select jsonb_agg(id order by id) into retained from public.question_options
    where question_id=q.id and (id=wrong_id or id::text=q.answer_key->>'correctOptionId');
  if jsonb_array_length(retained)<>2 then raise exception 'Invalid 50/50 configuration.'; end if;
  insert into public.player_powerup_uses(session_id,quiz_id,player_id,question_id,powerup_id,metadata)
    values(s.id,s.quiz_id,p.id,q.id,'fifty-fifty',jsonb_build_object('optionIds',retained));
  return public.personal_powerup_state(s.id,p.id);
end $$;
revoke all on function public.activate_fifty_fifty(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.activate_fifty_fifty(text,uuid,text,uuid) to anon,authenticated;

create function pg_temp.patch_powerup(p_signature text,p_old text,p_new text) returns void language plpgsql as $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in definition)=0 then raise exception 'Missing Power-Up predecessor in %: %',p_signature,p_old; end if;
  execute replace(definition,p_old,p_new);
end $$;

select pg_temp.patch_powerup('public.host_launch_game(uuid,jsonb)',
  $old$v_auto_tie boolean;$old$,$new$v_auto_tie boolean; v_powerups boolean;$new$);
select pg_temp.patch_powerup('public.host_launch_game(uuid,jsonb)',
  $old$v_auto_tie:=coalesce((p_settings->>'automaticTieBreakersEnabled')::boolean,false);$old$,
  $new$v_auto_tie:=coalesce((p_settings->>'automaticTieBreakersEnabled')::boolean,false);
  if p_settings ? 'powerUpsEnabled' and jsonb_typeof(p_settings->'powerUpsEnabled') is distinct from 'boolean' then raise exception 'Invalid Power-Ups setting.'; end if;
  v_powerups:=v_quiz.quiz_type='standard' and coalesce((p_settings->>'powerUpsEnabled')::boolean,false);$new$);
select pg_temp.patch_powerup('public.host_launch_game(uuid,jsonb)',
  $old$-'automaticTieBreakersEnabled'$old$,$new$-'automaticTieBreakersEnabled'-'powerUpsEnabled'$new$);
select pg_temp.patch_powerup('public.host_launch_game(uuid,jsonb)',
  $old$automatic_tiebreakers_enabled=v_auto_tie where id=v_session_id;$old$,
  $new$automatic_tiebreakers_enabled=v_auto_tie,power_ups_enabled=v_powerups where id=v_session_id;$new$);

select pg_temp.patch_powerup('public.session_to_json(uuid)',
  $old$'automaticTieBreakersEnabled',v_session.automatic_tiebreakers_enabled$old$,
  $new$'automaticTieBreakersEnabled',v_session.automatic_tiebreakers_enabled,
      'powerUpsEnabled',v_session.power_ups_enabled,'powerUpRunId',v_session.power_up_run_id$new$);
select pg_temp.patch_powerup('public.get_player_game_state(text)',
  $old$'automaticTieBreakersEnabled',v_session.automatic_tiebreakers_enabled$old$,
  $new$'automaticTieBreakersEnabled',v_session.automatic_tiebreakers_enabled,
      'powerUpsEnabled',v_session.power_ups_enabled,'powerUpRunId',v_session.power_up_run_id$new$);
select pg_temp.patch_powerup('public.join_team_room(text,text,uuid)',
  $old$'survivorEliminatedAtQuestion',null));$old$,
  $new$'survivorEliminatedAtQuestion',null)) || jsonb_build_object('powerUps',public.personal_powerup_state(v_session.id,(v_result->'player'->>'id')::uuid));$new$);
select pg_temp.patch_powerup('public.reconnect_player(text,uuid,text)',
  $old$jsonb_build_object('tieBreakerSubmission',v_submission);$old$,
  $new$jsonb_build_object('tieBreakerSubmission',v_submission,'powerUps',public.personal_powerup_state(v_session.id,p_player_id));$new$);

-- Reuse the hardened answer body. Each player lock serialises activation with
-- that player's submissions while different players retain shared session locks.
select pg_temp.patch_powerup('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$v_wager_percent integer := 0;$old$,$new$v_powerup text; v_wager_percent integer := 0;$new$);
select pg_temp.patch_powerup('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if v_quiz_type='standard' and v_session.competition_mode='survivor'$old$,
  $new$if v_session.power_ups_enabled then perform 1 from public.players where id=p_player_id for update; end if;
  if v_quiz_type='standard' and v_session.competition_mode='survivor'$new$);
select pg_temp.patch_powerup('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if p_answer ? 'wagerPercent' then$old$,
  $new$if p_answer ? 'powerUp' and p_answer->'powerUp'<>'null'::jsonb then
    if jsonb_typeof(p_answer->'powerUp') is distinct from 'string' or p_answer->>'powerUp' not in ('double-up','fast-five') then raise exception 'Invalid Power-Up answer metadata.'; end if;
    v_powerup:=p_answer->>'powerUp';
    if not v_session.power_ups_enabled or v_quiz_type<>'standard' then raise exception 'Power-Ups are not enabled.'; end if;
    perform public.require_powerup_compatible(v_question,v_powerup);
    insert into public.player_powerup_uses(session_id,quiz_id,player_id,question_id,powerup_id)
      values(v_session.id,v_session.quiz_id,p_player_id,v_question.id,v_powerup);
  end if;
  p_answer:=p_answer-'powerUp';
  if p_answer ? 'wagerPercent' then$new$);
select pg_temp.patch_powerup('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$v_scoring_response_ms := least(v_available_ms, greatest(0, v_response_ms));$old$,
  $new$v_scoring_response_ms := least(v_available_ms, greatest(0, v_response_ms-case when v_powerup='fast-five' then 5000 else 0 end));$new$);
select pg_temp.patch_powerup('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$v_points := public.apply_wager(v_points,v_question.points,v_correct,v_wager_percent);$old$,
  $new$v_points := public.apply_wager(v_points,v_question.points,v_correct,v_wager_percent);
    if v_powerup='double-up' and v_points>0 then v_points:=v_points*2; end if;$new$);

-- Host accept/undo reuses the same real response and persists the original use.
select pg_temp.patch_powerup('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$v_scoring_response_ms integer;$old$,$new$v_scoring_response_ms integer; v_powerup text;$new$);
select pg_temp.patch_powerup('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$v_previous_correct := v_answer.correct;$old$,
  $new$select powerup_id into v_powerup from public.player_powerup_uses where session_id=v_session.id and player_id=v_answer.player_id and question_id=v_answer.question_id;
  v_previous_correct := v_answer.correct;$new$);
select pg_temp.patch_powerup('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$v_scoring_response_ms := least(v_duration_ms, greatest(0, v_answer.response_time_ms));$old$,
  $new$v_scoring_response_ms := least(v_duration_ms, greatest(0, v_answer.response_time_ms-case when v_powerup='fast-five' then 5000 else 0 end));$new$);
select pg_temp.patch_powerup('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$v_next_points := public.apply_wager(v_next_points,v_question.points,v_next_correct,v_answer.wager_percent);$old$,
  $new$v_next_points := public.apply_wager(v_next_points,v_question.points,v_next_correct,v_answer.wager_percent);
  if v_powerup='double-up' and v_next_points>0 then v_next_points:=v_next_points*2; end if;$new$);
select pg_temp.patch_powerup('public.host_change_phase(uuid,text)',
  $old$delete from public.player_answers where game_session_id = p_session_id;$old$,
  $new$delete from public.player_answers where game_session_id = p_session_id;
      delete from public.player_powerup_uses where session_id=p_session_id;$new$);
select pg_temp.patch_powerup('public.host_change_phase(uuid,text)',
  $old$tiebreaker_winner_player_id=null,tiebreaker_used_question_ids='{}' where id = p_session_id;$old$,
  $new$tiebreaker_winner_player_id=null,tiebreaker_used_question_ids='{}',power_up_run_id=gen_random_uuid() where id = p_session_id;$new$);
drop function pg_temp.patch_powerup(text,text,text);
