-- Send payload-free refresh signals to public room-code and host-session topics.
-- Clients refetch through safe RPC functions; broadcasts never contain answers.

create or replace function public.broadcast_game_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_room_code text;
begin
  if tg_table_name = 'game_sessions' then
    v_session_id := coalesce(new.id, old.id);
    v_room_code := coalesce(new.room_code, old.room_code);
  else
    v_session_id := coalesce(new.game_session_id, old.game_session_id);
    select room_code into v_room_code from public.game_sessions where id = v_session_id;
  end if;

  if v_session_id is not null and v_room_code is not null then
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

create trigger game_sessions_broadcast_refresh
after insert or update or delete on public.game_sessions
for each row execute function public.broadcast_game_refresh();

create trigger players_broadcast_refresh
after insert or update or delete on public.players
for each row execute function public.broadcast_game_refresh();

create trigger player_answers_broadcast_refresh
after insert or update or delete on public.player_answers
for each row execute function public.broadcast_game_refresh();
