-- Bound Realtime fan-out and remove the session-row write bottleneck for
-- standard concurrent answers. Player-facing state remains RPC-authoritative.

drop trigger if exists players_broadcast_refresh on public.players;
drop trigger if exists player_answers_broadcast_refresh on public.player_answers;
drop trigger if exists game_sessions_broadcast_refresh on public.game_sessions;

create trigger game_sessions_broadcast_refresh
after insert or delete or update of
  status,
  phase,
  current_question_id,
  current_question_index,
  question_opened_at,
  question_closes_at,
  started_at,
  ended_at
on public.game_sessions
for each row execute function public.broadcast_game_refresh();

-- Head-to-Head has exactly two competitors and its player activity is part of
-- the control flow. Keep that deliberately narrow exception while standard
-- rooms rely on the controller's bounded poll for roster and response counts.
create or replace function public.broadcast_head_to_head_player_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_room_code text;
begin
  v_session_id := coalesce(new.game_session_id, old.game_session_id);

  select gs.room_code
  into v_room_code
  from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id
  where gs.id = v_session_id
    and q.quiz_type = 'head-to-head';

  if v_room_code is not null then
    perform realtime.send(
      jsonb_build_object('changed', true),
      'game_changed',
      'katwed:' || v_room_code,
      false
    );
    perform realtime.send(
      jsonb_build_object('changed', true),
      'game_changed',
      'katwed:' || v_session_id::text,
      false
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.broadcast_head_to_head_player_refresh() from public, anon, authenticated;

create trigger head_to_head_players_broadcast_refresh
after insert or update or delete on public.players
for each row execute function public.broadcast_head_to_head_player_refresh();

-- The controller's frequent refresh needs changing session data, not the full
-- quiz definition. session_to_json retains its owner check and response safety
-- bound; this RPC adds an explicit owner predicate at the public entry point.
create or replace function public.host_get_live_session(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.session_to_json(gs.id)
  from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id
  where gs.id = p_session_id
    and q.owner_id = auth.uid()
$$;

revoke all on function public.host_get_live_session(uuid) from public, anon;
grant execute on function public.host_get_live_session(uuid) to authenticated;

-- All retained answer implementations currently acquire an exclusive session
-- row lock. A shared lock still establishes a strict boundary with host phase
-- updates, but allows standard players to validate and submit concurrently.
do $$
declare
  v_oid oid;
  v_definition text;
  v_parallel_definition text;
begin
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('submit_answer', 'submit_answer_without_session_prelude')
  loop
    v_definition := pg_get_functiondef(v_oid);
    v_parallel_definition := regexp_replace(
      v_definition,
      '\mfor[[:space:]]+update\M',
      'for share',
      'gi'
    );
    if v_parallel_definition <> v_definition then
      execute v_parallel_definition;
    end if;
  end loop;
end;
$$;

-- Head-to-Head resolution may advance the session from inside the answer
-- implementation. Serialise only those two competitors before entering the
-- shared-lock implementation, avoiding lock-upgrade contention while leaving
-- standard rooms fully concurrent.
create or replace function public.submit_answer(
  p_room_code text,
  p_player_id uuid,
  p_reconnect_token text,
  p_answer jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions;
  v_quiz_type text;
begin
  select gs.*
  into v_session
  from public.game_sessions gs
  where gs.room_code = p_room_code
    and gs.status = 'active';

  if not found then raise exception 'This room is not active.'; end if;

  select q.quiz_type
  into v_quiz_type
  from public.quizzes q
  where q.id = v_session.quiz_id;

  if v_quiz_type = 'head-to-head' then
    select gs.*
    into v_session
    from public.game_sessions gs
    where gs.id = v_session.id
    for update;
  end if;

  if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
  if v_session.question_opened_at is null or clock_timestamp() < v_session.question_opened_at then
    raise exception 'Wait for the question to open.';
  end if;

  perform public.submit_answer_without_session_prelude(
    p_room_code,
    p_player_id,
    p_reconnect_token,
    p_answer
  );
end;
$$;

revoke all on function public.submit_answer(text, uuid, text, jsonb) from public;
grant execute on function public.submit_answer(text, uuid, text, jsonb) to anon, authenticated;
