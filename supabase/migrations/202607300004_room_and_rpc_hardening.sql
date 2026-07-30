-- Harden room lifecycle and RPC execution without changing deployed migrations.

-- A room code is never recycled in version 1. This makes room-code lookups
-- unambiguous even after rooms close.
do $$
declare
  v_duplicate record;
  v_code text;
begin
  for v_duplicate in
    select id
    from (
      select
        id,
        row_number() over (
          partition by room_code
          order by (status = 'active') desc, created_at desc
        ) as occurrence
      from public.game_sessions
    ) ranked
    where occurrence > 1
  loop
    loop
      v_code := lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
      exit when not exists (
        select 1 from public.game_sessions where room_code = v_code
      );
    end loop;
    update public.game_sessions set room_code = v_code where id = v_duplicate.id;
  end loop;
end;
$$;

drop index if exists public.game_sessions_one_active_room_code;
create unique index game_sessions_room_code_unique
  on public.game_sessions (room_code);

create or replace function public.host_launch_game(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_code text;
begin
  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and q.owner_id = auth.uid()
  ) then
    raise exception 'Quiz not found or unauthorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.questions x where x.quiz_id = p_quiz_id) then
    raise exception 'Add at least one valid question before launching';
  end if;

  select id into v_session_id
  from public.game_sessions
  where quiz_id = p_quiz_id and status = 'active'
  order by created_at desc
  limit 1;

  if v_session_id is null then
    loop
      v_code := lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
      exit when not exists (
        select 1 from public.game_sessions where room_code = v_code
      );
    end loop;
    insert into public.game_sessions (quiz_id, room_code)
    values (p_quiz_id, v_code)
    returning id into v_session_id;
  end if;

  return public.session_to_json(v_session_id);
end;
$$;

create or replace function public.host_restart_game(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions;
begin
  v_session := public.require_session_owner(p_session_id);
  if v_session.status <> 'active' then
    raise exception 'This room is closed.';
  end if;
  if v_session.phase <> 'finished' then
    raise exception 'Finish the game before restarting it.';
  end if;
  perform public.host_change_phase(p_session_id, 'restart');
end;
$$;

create or replace function public.set_player_presence(
  p_room_code text,
  p_player_id uuid,
  p_reconnect_token text,
  p_connected boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.players p
  set connected = p_connected, last_seen_at = now()
  from public.game_sessions gs
  where p.id = p_player_id
    and p.game_session_id = gs.id
    and gs.room_code = p_room_code
    and gs.status = 'active'
    and p.reconnect_token_hash = digest(p_reconnect_token, 'sha256');
  if not found then
    raise exception 'Your player session could not be verified.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.prevent_closed_room_reactivation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'A closed room cannot be reactivated.';
  end if;
  return new;
end;
$$;

create trigger game_sessions_prevent_reactivation
before update of status on public.game_sessions
for each row execute function public.prevent_closed_room_reactivation();

-- PostgreSQL grants function execution to PUBLIC by default. Make the intended
-- host/player boundaries explicit for every application RPC.
revoke all on function public.host_list_quizzes() from public, anon;
revoke all on function public.host_get_quiz(uuid) from public, anon;
revoke all on function public.host_save_quiz(jsonb) from public, anon;
revoke all on function public.host_delete_quiz(uuid) from public, anon;
revoke all on function public.host_launch_game(uuid) from public, anon;
revoke all on function public.host_get_game(uuid) from public, anon;
revoke all on function public.host_get_active_game(uuid) from public, anon;
revoke all on function public.host_change_phase(uuid, text) from public, anon, authenticated;
revoke all on function public.host_start_game(uuid) from public, anon;
revoke all on function public.host_lock_game(uuid) from public, anon;
revoke all on function public.host_reveal_game(uuid) from public, anon;
revoke all on function public.host_leaderboard_game(uuid) from public, anon;
revoke all on function public.host_next_game(uuid) from public, anon;
revoke all on function public.host_finish_game(uuid) from public, anon;
revoke all on function public.host_restart_game(uuid) from public, anon;
revoke all on function public.host_close_game(uuid) from public, anon;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.reconnect_player(text, uuid, text) from public;
revoke all on function public.set_player_presence(text, uuid, text, boolean) from public;
revoke all on function public.get_player_game_state(text) from public;
revoke all on function public.submit_answer(text, uuid, text, uuid[]) from public;

grant execute on function public.host_list_quizzes() to authenticated;
grant execute on function public.host_get_quiz(uuid) to authenticated;
grant execute on function public.host_save_quiz(jsonb) to authenticated;
grant execute on function public.host_delete_quiz(uuid) to authenticated;
grant execute on function public.host_launch_game(uuid) to authenticated;
grant execute on function public.host_get_game(uuid) to authenticated;
grant execute on function public.host_get_active_game(uuid) to authenticated;
grant execute on function public.host_start_game(uuid) to authenticated;
grant execute on function public.host_lock_game(uuid) to authenticated;
grant execute on function public.host_reveal_game(uuid) to authenticated;
grant execute on function public.host_leaderboard_game(uuid) to authenticated;
grant execute on function public.host_next_game(uuid) to authenticated;
grant execute on function public.host_finish_game(uuid) to authenticated;
grant execute on function public.host_restart_game(uuid) to authenticated;
grant execute on function public.host_close_game(uuid) to authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.reconnect_player(text, uuid, text) to anon, authenticated;
grant execute on function public.set_player_presence(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
grant execute on function public.submit_answer(text, uuid, text, uuid[]) to anon, authenticated;
