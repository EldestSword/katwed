-- Add the quiz-selected shared Presentation sound pack without changing game authority.

alter table public.quizzes
  add column sound_pack_id text not null default 'katwed',
  add constraint quizzes_sound_pack_id_check check (sound_pack_id in ('katwed', 'none'));

-- Extend every owner-facing quiz read through the established serialiser boundary.
alter function public.quiz_to_json(uuid) rename to quiz_to_json_without_sound_pack;
revoke all on function public.quiz_to_json_without_sound_pack(uuid) from public, anon, authenticated;

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.quiz_to_json_without_sound_pack(p_quiz_id) || jsonb_build_object(
    'soundPackId', q.sound_pack_id
  )
  from public.quizzes q
  where q.id = p_quiz_id
$$;

revoke all on function public.quiz_to_json(uuid) from public, anon, authenticated;

-- Preserve the current save chain behind a restricted stale-client-compatible wrapper.
alter function public.host_save_quiz(jsonb) rename to host_save_quiz_without_sound_pack;
revoke all on function public.host_save_quiz_without_sound_pack(jsonb) from public, anon, authenticated;

create or replace function public.host_save_quiz(p_quiz jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_saved jsonb;
  v_quiz_id uuid;
  v_sound_pack_id text;
begin
  if p_quiz ? 'soundPackId' then
    if jsonb_typeof(p_quiz -> 'soundPackId') is distinct from 'string' then
      raise exception 'Sound pack ID must be text';
    end if;
    v_sound_pack_id := p_quiz ->> 'soundPackId';
    if v_sound_pack_id not in ('katwed', 'none') then
      raise exception 'Unsupported sound pack';
    end if;
  end if;

  v_saved := public.host_save_quiz_without_sound_pack(p_quiz);
  v_quiz_id := (v_saved ->> 'id')::uuid;

  update public.quizzes
  set sound_pack_id = case
        when p_quiz ? 'soundPackId' then p_quiz ->> 'soundPackId'
        else sound_pack_id
      end
  where id = v_quiz_id;

  return public.quiz_to_json(v_quiz_id);
end;
$$;

revoke all on function public.host_save_quiz(jsonb) from public, anon;
grant execute on function public.host_save_quiz(jsonb) to authenticated;

-- Sound-pack choice is harmless Presentation configuration in the player-safe payload.
alter function public.get_player_game_state(text) rename to get_player_game_state_without_sound_pack;
revoke all on function public.get_player_game_state_without_sound_pack(text) from public, anon, authenticated;

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_state jsonb;
  v_audio jsonb;
begin
  v_state := public.get_player_game_state_without_sound_pack(p_room_code);
  if v_state is null then return null; end if;

  select jsonb_build_object('soundPackId', q.sound_pack_id) into v_audio
  from public.game_sessions s
  join public.quizzes q on q.id = s.quiz_id
  where s.room_code = p_room_code;

  return v_state || coalesce(v_audio, '{}'::jsonb);
end;
$$;

revoke all on function public.get_player_game_state(text) from public;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
