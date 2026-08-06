-- Supabase installs pgcrypto in the extensions schema. Application RPCs keep
-- search_path restricted to public, so pgcrypto calls must be qualified.

create or replace function public.join_room(p_room_code text, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_player public.players; v_token text;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then raise exception 'We could not find that room.' using errcode = 'P0001'; end if;
  if v_session.status <> 'active' then raise exception 'That room has closed.'; end if;
  if v_session.phase <> 'lobby' then raise exception 'That game has already started.'; end if;
  if char_length(trim(p_nickname)) not between 1 and 30 then raise exception 'Enter a nickname of 1–30 characters.'; end if;
  if exists (select 1 from public.players where game_session_id = v_session.id and lower(nickname) = lower(trim(p_nickname)))
  then raise exception 'That nickname is already in this game.' using errcode = '23505'; end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.players (game_session_id, nickname, reconnect_token_hash)
  values (v_session.id, trim(regexp_replace(p_nickname, '\s+', ' ', 'g')), extensions.digest(v_token, 'sha256'))
  returning * into v_player;
  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id, 'sessionId', v_player.game_session_id, 'nickname', v_player.nickname,
      'connected', v_player.connected, 'joinedAt', v_player.joined_at, 'totalScore', 0,
      'correctAnswerCount', 0, 'totalCorrectResponseMs', 0
    ),
    'reconnectToken', v_token
  );
end;
$$;

create or replace function public.reconnect_player(
  p_room_code text,
  p_player_id uuid,
  p_reconnect_token text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player public.players;
  v_scores_visible boolean;
begin
  update public.players p set connected = true, last_seen_at = now()
  from public.game_sessions gs
  where p.id = p_player_id and p.game_session_id = gs.id and gs.room_code = p_room_code
    and gs.status = 'active' and p.reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256')
  returning p.* into v_player;
  if not found then return null; end if;

  select phase in ('leaderboard', 'finished') into v_scores_visible
  from public.game_sessions where id = v_player.game_session_id;

  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id, 'sessionId', v_player.game_session_id, 'nickname', v_player.nickname,
      'connected', true, 'joinedAt', v_player.joined_at,
      'totalScore', case when v_scores_visible then v_player.total_score else 0 end,
      'correctAnswerCount', case when v_scores_visible then v_player.correct_answer_count else 0 end,
      'totalCorrectResponseMs', case when v_scores_visible then v_player.total_correct_response_ms else 0 end
    ),
    'reconnectToken', p_reconnect_token
  );
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
    and p.reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256');
  if not found then
    raise exception 'Your player session could not be verified.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.submit_answer(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_answer jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_question public.questions;
  v_correct boolean := false;
  v_points integer := 0;
  v_response_ms integer;
  v_selected text[];
  v_correct_ids text[];
  v_value numeric;
  v_x numeric;
  v_y numeric;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code and status = 'active' for update;
  if not found then raise exception 'This room is not active.'; end if;
  if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
  if v_session.question_closes_at is null or clock_timestamp() > v_session.question_closes_at then raise exception 'Time is up for this question.'; end if;
  if not exists (select 1 from public.players where id = p_player_id and game_session_id = v_session.id and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256'))
  then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if exists (select 1 from public.player_answers where player_id = p_player_id and question_id = v_session.current_question_id)
  then raise exception 'You have already answered this question.' using errcode = '23505'; end if;
  select * into v_question from public.questions where id = v_session.current_question_id and quiz_id = v_session.quiz_id;
  if p_answer ->> 'type' <> v_question.question_type then raise exception 'Answer type does not match the question'; end if;

  case v_question.question_type
    when 'single-choice' then
      if not exists (select 1 from public.question_options where question_id = v_question.id and id = (p_answer ->> 'optionId')::uuid)
      then raise exception 'Invalid option'; end if;
      v_correct := p_answer ->> 'optionId' = v_question.answer_key ->> 'correctOptionId';
    when 'multiple-select' then
      select array_agg(value) into v_selected from jsonb_array_elements_text(p_answer -> 'optionIds');
      select array_agg(value) into v_correct_ids from jsonb_array_elements_text(v_question.answer_key -> 'correctOptionIds');
      if cardinality(v_selected) not between (v_question.type_config ->> 'minimumSelections')::integer and (v_question.type_config ->> 'maximumSelections')::integer
        or cardinality(v_selected) <> cardinality(array(select distinct unnest(v_selected)))
        or exists (select 1 from unnest(v_selected) id where not exists (select 1 from public.question_options where question_id = v_question.id and question_options.id = id::uuid))
      then raise exception 'Invalid option selection'; end if;
      v_correct := v_selected @> v_correct_ids and v_correct_ids @> v_selected;
      if v_question.type_config ->> 'scoringMode' = 'partial-wipeout'
        and not exists (select 1 from unnest(v_selected) id where not id = any(v_correct_ids))
      then v_points := floor(v_question.points * cardinality(v_selected)::numeric / cardinality(v_correct_ids)); end if;
    when 'true-false' then
      if jsonb_typeof(p_answer -> 'value') <> 'boolean' then raise exception 'A Boolean answer is required'; end if;
      v_correct := (p_answer ->> 'value')::boolean = (v_question.answer_key ->> 'correctValue')::boolean;
    when 'slider' then
      v_value := (p_answer ->> 'value')::numeric;
      if v_value not between (v_question.type_config ->> 'minimum')::numeric and (v_question.type_config ->> 'maximum')::numeric
        or abs(mod(v_value - (v_question.type_config ->> 'minimum')::numeric, (v_question.type_config ->> 'step')::numeric)) > 0.00000001
      then raise exception 'Invalid slider value'; end if;
      v_correct := abs(v_value - (v_question.answer_key ->> 'correctValue')::numeric) <= (v_question.answer_key ->> 'tolerance')::numeric;
    when 'pinpoint' then
      v_x := (p_answer ->> 'x')::numeric; v_y := (p_answer ->> 'y')::numeric;
      if v_x not between 0 and 1 or v_y not between 0 and 1 then raise exception 'Coordinates must be between 0 and 1'; end if;
      v_correct := sqrt(
        power(v_x - (v_question.answer_key ->> 'targetX')::numeric, 2)
        + power(v_y - (v_question.answer_key ->> 'targetY')::numeric, 2)
      ) <= (v_question.answer_key ->> 'targetRadius')::numeric;
    when 'mashup' then
      select array_agg(value) into v_selected from jsonb_array_elements_text(p_answer -> 'memberIds');
      select array_agg(value) into v_correct_ids from jsonb_array_elements_text(v_question.answer_key -> 'correctMemberIds');
      if cardinality(v_selected) <> 2 or v_selected[1] = v_selected[2]
        or (select count(*) from public.roster_members where quiz_id = v_session.quiz_id and active and id::text = any(v_selected)) <> 2
      then raise exception 'Select exactly two different active people'; end if;
      v_correct := v_selected @> v_correct_ids and v_correct_ids @> v_selected;
  end case;

  if v_correct then v_points := v_question.points; end if;
  v_response_ms := greatest(0, floor(extract(epoch from (clock_timestamp() - v_session.question_opened_at)) * 1000)::integer);
  insert into public.player_answers (game_session_id, question_id, player_id, answer_payload, response_time_ms, correct, points_awarded)
  values (v_session.id, v_question.id, p_player_id, p_answer, v_response_ms, v_correct, v_points);
  update public.players set total_score = total_score + v_points,
    correct_answer_count = correct_answer_count + case when v_correct then 1 else 0 end,
    total_correct_response_ms = total_correct_response_ms + case when v_correct then v_response_ms else 0 end,
    last_seen_at = now() where id = p_player_id;
end;
$$;

revoke all on function public.join_room(text, text) from public;
revoke all on function public.reconnect_player(text, uuid, text) from public;
revoke all on function public.set_player_presence(text, uuid, text, boolean) from public;
revoke all on function public.submit_answer(text, uuid, text, jsonb) from public;

grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.reconnect_player(text, uuid, text) to anon, authenticated;
grant execute on function public.set_player_presence(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.submit_answer(text, uuid, text, jsonb) to anon, authenticated;
