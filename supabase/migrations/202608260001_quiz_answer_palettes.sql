-- Add persistent quiz-wide positional answer palettes without changing scoring or answer visibility.

create or replace function public.is_valid_answer_colour_palette(p_colours jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(p_colours) <> 'array' then false
    when jsonb_array_length(p_colours) <> 8 then false
    else not exists (
      select 1
      from jsonb_array_elements(p_colours) colour(value)
      where jsonb_typeof(colour.value) <> 'string'
        or trim(both '"' from colour.value::text) !~ '^#[0-9A-F]{6}$'
    )
  end
$$;

revoke all on function public.is_valid_answer_colour_palette(jsonb) from public, anon, authenticated;

alter table public.quizzes
  add column answer_palette_id text not null default 'classic',
  add column custom_answer_colours jsonb not null default
    '["#C62828", "#1565C0", "#2E7D32", "#F9A825", "#7B1FA2", "#00838F", "#EF6C00", "#455A64"]'::jsonb,
  add constraint quizzes_answer_palette_id_check check (answer_palette_id in (
    'classic', 'katwed', 'festive', 'tropical', 'summer', 'sports', 'arcade', 'neon',
    'pastel', 'retro', 'ocean', 'forest', 'galaxy', 'sunset', 'autumn', 'winter',
    'halloween', 'custom'
  )),
  add constraint quizzes_custom_answer_colours_check check (
    public.is_valid_answer_colour_palette(custom_answer_colours)
  );

-- Extend every owner-facing quiz read through the established serialiser boundary.
alter function public.quiz_to_json(uuid) rename to quiz_to_json_without_answer_palette;
revoke all on function public.quiz_to_json_without_answer_palette(uuid) from public, anon, authenticated;

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.quiz_to_json_without_answer_palette(p_quiz_id) || jsonb_build_object(
    'answerPaletteId', q.answer_palette_id,
    'customAnswerColours', q.custom_answer_colours
  )
  from public.quizzes q
  where q.id = p_quiz_id
$$;

revoke all on function public.quiz_to_json(uuid) from public, anon, authenticated;

-- Preserve the current save chain, including Standard scoring, behind a restricted wrapper.
alter function public.host_save_quiz(jsonb) rename to host_save_quiz_without_answer_palette;
revoke all on function public.host_save_quiz_without_answer_palette(jsonb) from public, anon, authenticated;

create or replace function public.host_save_quiz(p_quiz jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_saved jsonb;
  v_quiz_id uuid;
  v_palette_id text;
begin
  if p_quiz ? 'answerPaletteId' then
    if jsonb_typeof(p_quiz -> 'answerPaletteId') is distinct from 'string' then
      raise exception 'Answer palette ID must be text';
    end if;
    v_palette_id := p_quiz ->> 'answerPaletteId';
    if v_palette_id not in (
      'classic', 'katwed', 'festive', 'tropical', 'summer', 'sports', 'arcade', 'neon',
      'pastel', 'retro', 'ocean', 'forest', 'galaxy', 'sunset', 'autumn', 'winter',
      'halloween', 'custom'
    ) then
      raise exception 'Unsupported answer palette';
    end if;
  end if;

  if p_quiz ? 'customAnswerColours'
    and not public.is_valid_answer_colour_palette(p_quiz -> 'customAnswerColours') then
    raise exception 'Custom answer colours must contain exactly eight six-digit hexadecimal colours';
  end if;
  if v_palette_id = 'custom' and not (p_quiz ? 'customAnswerColours') then
    raise exception 'Custom answer palettes must include eight colours';
  end if;

  v_saved := public.host_save_quiz_without_answer_palette(p_quiz);
  v_quiz_id := (v_saved ->> 'id')::uuid;

  update public.quizzes
  set answer_palette_id = case
        when p_quiz ? 'answerPaletteId' then p_quiz ->> 'answerPaletteId'
        else answer_palette_id
      end,
      custom_answer_colours = case
        when p_quiz ? 'customAnswerColours' then p_quiz -> 'customAnswerColours'
        else custom_answer_colours
      end
  where id = v_quiz_id;

  return public.quiz_to_json(v_quiz_id);
end;
$$;

revoke all on function public.host_save_quiz(jsonb) from public, anon;
grant execute on function public.host_save_quiz(jsonb) to authenticated;

-- Add only harmless presentation configuration to the existing player-safe payload.
alter function public.get_player_game_state(text) rename to get_player_game_state_without_answer_palette;
revoke all on function public.get_player_game_state_without_answer_palette(text) from public, anon, authenticated;

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_state jsonb;
  v_palette jsonb;
begin
  v_state := public.get_player_game_state_without_answer_palette(p_room_code);
  if v_state is null then return null; end if;

  select jsonb_build_object(
    'answerPaletteId', q.answer_palette_id,
    'customAnswerColours', q.custom_answer_colours
  ) into v_palette
  from public.game_sessions s
  join public.quizzes q on q.id = s.quiz_id
  where s.room_code = p_room_code;

  return v_state || coalesce(v_palette, '{}'::jsonb);
end;
$$;

revoke all on function public.get_player_game_state(text) from public;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
