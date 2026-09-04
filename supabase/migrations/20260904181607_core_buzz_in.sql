-- Core Buzz-In: one authoritative claim per Standard question and a fixed
-- winner-only answer window. Existing rows remain ordinary non-Buzz games.
alter table public.questions add column buzz_in_enabled boolean not null default false;

alter table public.players add constraint players_session_identity unique (game_session_id,id);
alter table public.game_sessions
  add column buzz_winner_player_id uuid,
  add column buzz_claimed_at timestamptz,
  add column buzz_answer_deadline_at timestamptz,
  add constraint game_sessions_buzz_complete check (
    (buzz_winner_player_id is null and buzz_claimed_at is null and buzz_answer_deadline_at is null) or
    (buzz_winner_player_id is not null and buzz_claimed_at is not null and buzz_answer_deadline_at is not null and
      buzz_answer_deadline_at >= buzz_claimed_at)
  ),
  add constraint game_sessions_buzz_winner_same_session foreign key (id,buzz_winner_player_id)
    references public.players(game_session_id,id);

create function public.buzz_state_to_json(p_session public.game_sessions) returns jsonb
language sql immutable set search_path=public as $$
  select case when p_session.buzz_winner_player_id is null then 'null'::jsonb else jsonb_build_object(
    'winnerPlayerId',p_session.buzz_winner_player_id,
    'claimedAt',p_session.buzz_claimed_at,
    'answerDeadlineAt',p_session.buzz_answer_deadline_at) end
$$;
revoke all on function public.buzz_state_to_json(public.game_sessions) from public,anon,authenticated;

create function pg_temp.patch_buzz_function(p_signature text,p_old text,p_new text) returns void language plpgsql as $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in definition)=0 then raise exception 'Missing Buzz-In predecessor in %: %',p_signature,p_old; end if;
  execute replace(definition,p_old,p_new);
end $$;

-- Save, validate, launch and serialise the saved modifier without weakening
-- any existing question validation or answer-key boundary.
select pg_temp.patch_buzz_function('public.validate_question_json()',
  $old$case new.question_type$old$,
  $new$if coalesce((to_jsonb(new)->>'buzz_in_enabled')::boolean,false) then
    if (select quiz_type from public.quizzes where id=new.quiz_id)<>'standard' then raise exception 'Buzz-In is Standard-only'; end if;
    if new.question_type='connections' then raise exception 'Buzz-In is not available for Connections'; end if;
    if new.progressive_reveal_enabled then raise exception 'Buzz-In cannot be combined with Progressive Reveal'; end if;
  end if;
  case new.question_type$new$);
select pg_temp.patch_buzz_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_type := v_question ->> 'type';$old$,
  $new$v_type := v_question ->> 'type';
    if v_question ? 'buzzInEnabled' and jsonb_typeof(v_question->'buzzInEnabled') is distinct from 'boolean' then
      raise exception 'Invalid Buzz-In setting';
    end if;$new$);
select pg_temp.patch_buzz_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$wager_enabled, progressive_reveal_enabled, type_config, answer_key, image_path$old$,
  $new$buzz_in_enabled, wager_enabled, progressive_reveal_enabled, type_config, answer_key, image_path$new$);
select pg_temp.patch_buzz_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$coalesce((v_question->>'wagerEnabled')::boolean,false), coalesce((v_question->>'progressiveRevealEnabled')::boolean,false),$old$,
  $new$coalesce((v_question->>'buzzInEnabled')::boolean,false), coalesce((v_question->>'wagerEnabled')::boolean,false), coalesce((v_question->>'progressiveRevealEnabled')::boolean,false),$new$);
select pg_temp.patch_buzz_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$wager_enabled = excluded.wager_enabled, progressive_reveal_enabled = excluded.progressive_reveal_enabled,$old$,
  $new$buzz_in_enabled = excluded.buzz_in_enabled, wager_enabled = excluded.wager_enabled, progressive_reveal_enabled = excluded.progressive_reveal_enabled,$new$);
select pg_temp.patch_buzz_function('public.host_save_quiz(jsonb)',
  $old$return public.host_save_quiz_without_visual_theme_batch_3(v_forward_quiz);$old$,
  $new$if coalesce(p_quiz->>'quizType','standard')='head-to-head' and exists(
    select 1 from jsonb_array_elements(coalesce(p_quiz->'questions','[]'::jsonb)) item(value)
    where coalesce((item.value->>'buzzInEnabled')::boolean,false)
  ) then raise exception 'Buzz-In is Standard-only'; end if;
  return public.host_save_quiz_without_visual_theme_batch_3(v_forward_quiz);$new$);
select pg_temp.patch_buzz_function('public.host_launch_game(uuid,jsonb)',
  $old$if p_settings is null then$old$,
  $new$if v_quiz.quiz_type='head-to-head' and exists(select 1 from public.questions where quiz_id=p_quiz_id and buzz_in_enabled) then
    raise exception 'Buzz-In is Standard-only';
  end if;
  if p_settings is null then$new$);
select pg_temp.patch_buzz_function('public.question_to_json(uuid,boolean)',
  $old$'points', x.points, 'wagerEnabled', x.wager_enabled,$old$,
  $new$'points', x.points, 'buzzInEnabled', x.buzz_in_enabled, 'wagerEnabled', x.wager_enabled,$new$);

select pg_temp.patch_buzz_function('public.session_to_json(uuid)',
  $old$return v_result || jsonb_build_object('connectionClueCount',v_session.connection_clue_count,'teams',$old$,
  $new$return v_result || jsonb_build_object('buzz',public.buzz_state_to_json(v_session),'connectionClueCount',v_session.connection_clue_count,'teams',$new$);
select pg_temp.patch_buzz_function('public.get_player_game_state(text)',
  $old$return v_result || jsonb_build_object('teams',$old$,
  $new$return v_result || jsonb_build_object('buzz',public.buzz_state_to_json(v_session),'teams',$new$);

-- Every retained Standard opening path clears the previous race. Round Intro,
-- restart, finish and close also remove stale Buzz state.
select pg_temp.patch_buzz_function('public.host_change_phase(uuid,text)',
  $old$connection_clue_count = case when v_question.question_type='connections' then 1 else 0 end, current_question_id = v_question.id,$old$,
  $new$connection_clue_count = case when v_question.question_type='connections' then 1 else 0 end,
        buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null, current_question_id = v_question.id,$new$);
select pg_temp.patch_buzz_function('public.host_change_phase(uuid,text)',
  $old$phase = 'round-intro', connection_clue_count = 0,$old$,
  $new$phase = 'round-intro', connection_clue_count = 0, buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null,$new$);
select pg_temp.patch_buzz_function('public.host_change_phase(uuid,text)',
  $old$status = 'active', phase = 'lobby', connection_clue_count = 0,$old$,
  $new$status = 'active', phase = 'lobby', connection_clue_count = 0, buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null,$new$);
select pg_temp.patch_buzz_function('public.host_change_phase(uuid,text)',
  $old$phase = 'finished', connection_clue_count = 0,$old$,
  $new$phase = 'finished', connection_clue_count = 0, buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null,$new$);
select pg_temp.patch_buzz_function('public.host_change_phase(uuid,text)',
  $old$set phase = 'locked', question_closes_at = least(coalesce(question_closes_at, v_now), v_now)$old$,
  $new$set phase = 'locked', question_closes_at = least(coalesce(question_closes_at, v_now), v_now),
        buzz_answer_deadline_at=case when buzz_answer_deadline_at is null then null else least(buzz_answer_deadline_at,v_now) end$new$);
-- Player identity is verified before the exclusive row lock is taken, then all
-- mutable game conditions are checked again while holding that single lock.
create function public.claim_buzz(p_room_code text,p_player_id uuid,p_reconnect_token text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare v_session public.game_sessions; v_question public.questions; v_now timestamptz; v_won boolean:=false;
begin
  select * into v_session from public.game_sessions where room_code=p_room_code and status='active';
  if not found then raise exception 'This room is not active.'; end if;
  if not exists(select 1 from public.players where id=p_player_id and game_session_id=v_session.id
    and reconnect_token_hash=extensions.digest(p_reconnect_token,'sha256')) then
    raise exception 'Your player session could not be verified.' using errcode='42501';
  end if;
  select * into strict v_session from public.game_sessions where id=v_session.id for update;
  select * into v_question from public.questions where id=v_session.current_question_id and quiz_id=v_session.quiz_id;
  if not found then raise exception 'Buzzers are not open for this question.'; end if;
  v_now:=clock_timestamp();
  if v_session.status<>'active' or v_session.phase<>'question' or not v_question.buzz_in_enabled or
    v_question.question_type='connections' or v_question.progressive_reveal_enabled or
    (select quiz_type from public.quizzes where id=v_session.quiz_id)<>'standard' then raise exception 'Buzzers are not open for this question.'; end if;
  if v_session.question_opened_at is null or v_session.question_closes_at is null or
    v_now<v_session.question_opened_at or v_now>=v_session.question_closes_at then raise exception 'Buzzers are closed for this question.'; end if;
  if v_session.buzz_winner_player_id is null then
    update public.game_sessions set buzz_winner_player_id=p_player_id,buzz_claimed_at=v_now,
      buzz_answer_deadline_at=least(v_session.question_closes_at,v_now+interval '10 seconds') where id=v_session.id
      returning * into v_session;
    v_won:=true;
  end if;
  return jsonb_build_object('won',v_won,'winnerPlayerId',v_session.buzz_winner_player_id,
    'claimedAt',v_session.buzz_claimed_at,'answerDeadlineAt',v_session.buzz_answer_deadline_at);
end $$;
revoke all on function public.claim_buzz(text,uuid,text) from public;
grant execute on function public.claim_buzz(text,uuid,text) to anon,authenticated;

-- Buzz submissions need an exclusive session lock so Reset, Lock and answer
-- acceptance cannot cross. Ordinary Standard answers retain their shared lock.
select pg_temp.patch_buzz_function('public.submit_answer(text,uuid,text,jsonb)',
  $old$if v_quiz_type = 'head-to-head' then$old$,
  $new$if v_quiz_type = 'head-to-head' or exists(select 1 from public.questions where id=v_session.current_question_id and quiz_id=v_session.quiz_id and buzz_in_enabled) then$new$);
select pg_temp.patch_buzz_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$select * into v_question from public.questions where id = v_session.current_question_id and quiz_id = v_session.quiz_id;$old$,
  $new$select * into v_question from public.questions where id = v_session.current_question_id and quiz_id = v_session.quiz_id;
  if v_quiz_type='standard' and v_question.buzz_in_enabled then
    if v_session.buzz_winner_player_id is null or v_session.buzz_claimed_at is null or v_session.buzz_answer_deadline_at is null then raise exception 'Nobody has won the Buzz yet.'; end if;
    if v_session.buzz_winner_player_id<>p_player_id then raise exception 'Only the Buzz winner can answer this question.' using errcode='42501'; end if;
    if v_now>=v_session.buzz_answer_deadline_at or v_now>=v_session.question_closes_at then raise exception 'Your Buzz answer window has closed.'; end if;
  end if;$new$);
select pg_temp.patch_buzz_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if v_quiz_type = 'head-to-head' then perform public.reveal_head_to_head_if_complete(v_session.id, v_question.id); end if;$old$,
  $new$if v_quiz_type='standard' and v_question.buzz_in_enabled and v_session.auto_lock_when_all_answered then
    update public.game_sessions set phase='locked',question_closes_at=least(question_closes_at,v_now),
      buzz_answer_deadline_at=least(buzz_answer_deadline_at,v_now)
      where id=v_session.id and phase='question';
  end if;
  if v_quiz_type = 'head-to-head' then perform public.reveal_head_to_head_if_complete(v_session.id, v_question.id); end if;$new$);

create function public.host_reset_buzz(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions; v_question public.questions;
begin
  select s.* into v_session from public.game_sessions s join public.quizzes q on q.id=s.quiz_id
    where s.id=p_session_id and q.owner_id=auth.uid() and q.quiz_type='standard' for update of s;
  if not found then raise exception 'Session not found or unauthorised' using errcode='42501'; end if;
  select * into v_question from public.questions where id=v_session.current_question_id and quiz_id=v_session.quiz_id;
  if not found then raise exception 'Buzz cannot be reset now.'; end if;
  if v_session.status<>'active' or v_session.phase<>'question' or not v_question.buzz_in_enabled or
    v_session.buzz_winner_player_id is null then raise exception 'Buzz cannot be reset now.'; end if;
  if exists(select 1 from public.player_answers where game_session_id=v_session.id and question_id=v_question.id
    and player_id=v_session.buzz_winner_player_id) then raise exception 'Buzz cannot be reset after the winner has answered.'; end if;
  update public.game_sessions set buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null where id=v_session.id;
end $$;
revoke all on function public.host_reset_buzz(uuid) from public,anon;
grant execute on function public.host_reset_buzz(uuid) to authenticated;

-- Completed Buzz questions are removed before streak positions are compacted.
do $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef('public.recompute_player_streaks(uuid,uuid,integer)'::regprocedure),E'\r\n',E'\n');
  if position('cross join unnest(v_session.question_order) with ordinality' in definition)=0 then raise exception 'Missing Streak predecessor for Buzz-In'; end if;
end $$;
create or replace function public.recompute_player_streaks(p_session_id uuid,p_player_id uuid,p_completed_count integer)
returns void language plpgsql set search_path=public as $$
declare v_session public.game_sessions;
begin
  select s.* into strict v_session from public.game_sessions s join public.quizzes q on q.id=s.quiz_id
    where s.id=p_session_id and q.quiz_type='standard';
  if v_session.phase not in ('reveal','leaderboard') or p_completed_count is null or p_completed_count<0 or
    p_completed_count>least(cardinality(v_session.question_order),v_session.current_question_index+1) then raise exception 'Invalid completed-question boundary for streaks'; end if;
  with roster as (
    select id from public.players where game_session_id=p_session_id and (p_player_id is null or id=p_player_id)
  ), eligible as (
    select ordered.question_id,row_number() over(order by ordered.source_position)::integer position
    from unnest(v_session.question_order) with ordinality ordered(question_id,source_position)
    join public.questions q on q.id=ordered.question_id and q.quiz_id=v_session.quiz_id
    where ordered.source_position<=p_completed_count and not q.buzz_in_enabled
  ), history as (
    select p.id,e.position,coalesce(a.correct,false) correct
    from roster p cross join eligible e left join public.player_answers a
      on a.game_session_id=p_session_id and a.player_id=p.id and a.question_id=e.question_id
  ), runs as (
    select id,position,position-coalesce(max(position) filter(where not correct)
      over(partition by id order by position rows between unbounded preceding and current row),0) run from history
  ), totals as (
    select id,max(run)::integer longest,max(run) filter(where position=(select max(position) from eligible))::integer current from runs group by id
  )
  update public.players p set current_correct_streak=coalesce(t.current,0),longest_correct_streak=coalesce(t.longest,0)
  from roster r left join totals t on t.id=r.id where p.id=r.id and
    (p.current_correct_streak,p.longest_correct_streak) is distinct from (coalesce(t.current,0),coalesce(t.longest,0));
end $$;

-- Reuse the existing two-topic session refresh. Losing claims perform no write.
do $$
declare definition text;
begin
  select pg_get_triggerdef(oid) into strict definition from pg_trigger where tgrelid='public.game_sessions'::regclass and tgname='game_sessions_broadcast_refresh';
  if position('connection_clue_count' in definition)=0 or position('broadcast_game_refresh()' in definition)=0 then raise exception 'Unexpected session broadcast predecessor for Buzz-In'; end if;
end $$;
drop trigger game_sessions_broadcast_refresh on public.game_sessions;
create trigger game_sessions_broadcast_refresh after insert or delete or update of status,phase,current_question_id,current_question_index,
  question_opened_at,question_closes_at,started_at,ended_at,connection_clue_count,
  buzz_winner_player_id,buzz_claimed_at,buzz_answer_deadline_at on public.game_sessions
  for each row execute function public.broadcast_game_refresh();

drop function pg_temp.patch_buzz_function(text,text,text);
