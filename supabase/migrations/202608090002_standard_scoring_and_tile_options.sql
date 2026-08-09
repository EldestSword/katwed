-- Add opt-in Standard scoring modifiers and configurable square tile grids.
-- Historical rows retain fixed scoring and the legacy 24-tile layout.

alter table public.questions
  add column speed_scoring_enabled boolean not null default false,
  add column double_score boolean not null default false;

alter table public.questions
  drop constraint questions_media_shape_check,
  add constraint questions_media_shape_check check (
    jsonb_typeof(media) = 'object'
    and media ->> 'type' in ('none', 'image', 'youtube')
    and (
      media ->> 'type' = 'none'
      or (
        media ->> 'type' = 'image'
        and nullif(trim(media ->> 'path'), '') is not null
        and media ->> 'revealEffect' in ('immediate', 'blur', 'pixelate', 'tiles', 'zoom-out')
        and (media ->> 'revealDurationSeconds')::numeric between 0 and 180
      )
      or (
        media ->> 'type' = 'youtube'
        and media ->> 'videoId' ~ '^[A-Za-z0-9_-]{11}$'
      )
    )
    and (
      not (media ? 'tileGridSize')
      or (
        media ->> 'type' = 'image'
        and media ->> 'revealEffect' = 'tiles'
        and jsonb_typeof(media -> 'tileGridSize') = 'number'
        and (media ->> 'tileGridSize')::numeric in (6, 8, 12, 16)
      )
    )
  );

create or replace function public.question_to_json(p_question_id uuid, p_include_answer boolean default true)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', x.id, 'quizId', x.quiz_id, 'type', x.question_type, 'prompt', x.prompt,
      'supportingText', x.supporting_text, 'timeLimitSeconds', x.time_limit_seconds,
      'points', x.points, 'speedScoringEnabled', x.speed_scoring_enabled,
      'doubleScore', x.double_score, 'displayOrder', x.display_order,
      'revealCaption', x.reveal_caption, 'media', x.media,
      'mediaVisibility', x.media_visibility,
      'presentationChoiceVisibility', x.presentation_choice_visibility
    )
    || x.type_config
    || case when p_include_answer then x.answer_key else '{}'::jsonb end
    || case when x.question_type in ('single-choice', 'multiple-select') then jsonb_build_object(
      'options', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', o.id, 'label', o.label, 'imagePath', o.image_path, 'imageAlt', o.image_alt
        )) order by o.display_order)
        from public.question_options o where o.question_id = x.id
      ), '[]'::jsonb)
    ) else '{}'::jsonb end
  ) || case when p_include_answer then jsonb_build_object(
    'assignedCompetitorId', x.assigned_competitor_id
  ) else '{}'::jsonb end
  from public.questions x
  where x.id = p_question_id
$$;

-- Preserve the complete current save implementation behind a restricted wrapper.
-- This avoids recreating its roster, option, theme, background, H2H and Typed Answer
-- behaviour while allowing the two new common columns to be persisted atomically.
alter function public.host_save_quiz(jsonb) rename to host_save_quiz_without_standard_scoring;
revoke all on function public.host_save_quiz_without_standard_scoring(jsonb) from public, anon, authenticated;

create or replace function public.host_save_quiz(p_quiz jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_saved jsonb;
  v_quiz_id uuid;
  v_quiz_type text;
  v_question jsonb;
begin
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb)) item(value)
    where (item.value ? 'speedScoringEnabled'
      and jsonb_typeof(item.value -> 'speedScoringEnabled') is distinct from 'boolean')
      or (item.value ? 'doubleScore'
        and jsonb_typeof(item.value -> 'doubleScore') is distinct from 'boolean')
  ) then
    raise exception 'Standard scoring settings must be Boolean values';
  end if;

  v_saved := public.host_save_quiz_without_standard_scoring(p_quiz);
  v_quiz_id := (v_saved ->> 'id')::uuid;
  v_quiz_type := v_saved ->> 'quizType';

  if v_quiz_type = 'head-to-head' and exists (
    select 1
    from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb)) item(value)
    where coalesce((item.value ->> 'speedScoringEnabled')::boolean, false)
      or coalesce((item.value ->> 'doubleScore')::boolean, false)
  ) then
    raise exception 'Head-to-Head questions cannot use Speed Scoring or Double Score';
  end if;

  for v_question in
    select value from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb))
  loop
    update public.questions
    set speed_scoring_enabled = case
          when v_quiz_type = 'head-to-head' then false
          when v_question ? 'speedScoringEnabled' then (v_question ->> 'speedScoringEnabled')::boolean
          else speed_scoring_enabled
        end,
        double_score = case
          when v_quiz_type = 'head-to-head' then false
          when v_question ? 'doubleScore' then (v_question ->> 'doubleScore')::boolean
          else double_score
        end
    where id = (v_question ->> 'id')::uuid and quiz_id = v_quiz_id;
  end loop;

  return public.quiz_to_json(v_quiz_id);
end;
$$;

revoke all on function public.host_save_quiz(jsonb) from public, anon;
grant execute on function public.host_save_quiz(jsonb) to authenticated;

create or replace function public.submit_answer(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_answer jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_question public.questions; v_player public.players;
  v_quiz_type text; v_correct boolean := false; v_points integer := 0; v_response_ms integer;
  v_selected text[]; v_correct_ids text[]; v_value numeric; v_x numeric; v_y numeric; v_assigned boolean;
  v_text text; v_normalised text; v_now timestamptz; v_available_ms integer; v_scoring_response_ms integer;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code and status = 'active' for update;
  if not found then raise exception 'This room is not active.'; end if;
  if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  v_now := clock_timestamp();
  if v_quiz_type = 'standard' and (v_session.question_opened_at is null or v_now < v_session.question_opened_at) then
    raise exception 'Wait for the question to open.';
  end if;
  if v_quiz_type = 'standard' and (v_session.question_closes_at is null or v_now > v_session.question_closes_at) then
    raise exception 'Time is up for this question.';
  end if;
  select * into v_player from public.players where id = p_player_id and game_session_id = v_session.id
    and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256');
  if not found then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if exists (select 1 from public.player_answers where player_id = p_player_id and question_id = v_session.current_question_id)
  then raise exception 'You have already resolved this question.' using errcode = '23505'; end if;
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
      v_correct := sqrt(power(v_x - (v_question.answer_key ->> 'targetX')::numeric, 2)
        + power(v_y - (v_question.answer_key ->> 'targetY')::numeric, 2)) <= (v_question.answer_key ->> 'targetRadius')::numeric;
    when 'typed-answer' then
      if jsonb_typeof(p_answer -> 'value') <> 'string' then raise exception 'A text answer is required'; end if;
      v_text := trim(p_answer ->> 'value');
      v_normalised := public.normalise_typed_answer(v_text);
      if char_length(v_text) > 120 or v_normalised = '' then raise exception 'Enter an answer of at most 120 characters'; end if;
      select exists (
        select 1
        from jsonb_array_elements_text(
          jsonb_build_array(v_question.answer_key ->> 'correctAnswer')
          || coalesce(v_question.answer_key -> 'acceptedAnswers', '[]'::jsonb)
        ) accepted(value)
        where public.normalise_typed_answer(accepted.value) = v_normalised
      ) into v_correct;
      p_answer := jsonb_set(p_answer, '{value}', to_jsonb(v_text));
    when 'mashup' then
      select array_agg(value) into v_selected from jsonb_array_elements_text(p_answer -> 'memberIds');
      select array_agg(value) into v_correct_ids from jsonb_array_elements_text(v_question.answer_key -> 'correctMemberIds');
      if cardinality(v_selected) <> 2 or v_selected[1] = v_selected[2]
        or (select count(*) from public.roster_members where quiz_id = v_session.quiz_id and active and id::text = any(v_selected)) <> 2
      then raise exception 'Select exactly two different active people'; end if;
      v_correct := v_selected @> v_correct_ids and v_correct_ids @> v_selected;
    else
      raise exception 'Unsupported question type: %', v_question.question_type;
  end case;

  v_assigned := v_player.competitor_id is not null and v_player.competitor_id = v_question.assigned_competitor_id;
  if v_quiz_type = 'head-to-head' then
    v_points := case when v_assigned and v_correct then 1 else 0 end;
  elsif v_correct then
    v_points := v_question.points;
  end if;

  v_response_ms := greatest(0, floor(extract(epoch from (v_now - v_session.question_opened_at)) * 1000)::integer);
  if v_quiz_type = 'standard' and v_points > 0 then
    if v_question.double_score then v_points := v_points * 2; end if;
    if v_question.speed_scoring_enabled then
      v_available_ms := greatest(1, floor(extract(epoch from (
        v_session.question_closes_at - v_session.question_opened_at
      )) * 1000)::integer);
      v_scoring_response_ms := least(v_available_ms, greatest(0, v_response_ms));
      v_points := floor(v_points * (1 - (0.5 * v_scoring_response_ms::numeric / v_available_ms)))::integer;
    end if;
  end if;

  insert into public.player_answers (
    game_session_id, question_id, player_id, answer_payload, resolution_status,
    response_time_ms, correct, points_awarded
  ) values (
    v_session.id, v_question.id, p_player_id, p_answer, 'answered',
    v_response_ms, v_correct, v_points
  );
  update public.players set total_score = total_score + v_points,
    correct_answer_count = correct_answer_count + case when v_correct and (v_quiz_type = 'standard' or v_assigned) then 1 else 0 end,
    total_correct_response_ms = total_correct_response_ms + case when v_correct and v_quiz_type = 'standard' then v_response_ms else 0 end,
    last_seen_at = now() where id = p_player_id;
  if v_quiz_type = 'head-to-head' then perform public.reveal_head_to_head_if_complete(v_session.id, v_question.id); end if;
end;
$$;

create or replace function public.host_change_phase(p_session_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_question public.questions; v_count integer;
  v_is_final boolean; v_quiz_type text; v_now timestamptz; v_opened_at timestamptz;
begin
  v_session := public.require_session_owner(p_session_id);
  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  if v_quiz_type = 'head-to-head' and p_action <> 'close' then
    raise exception 'Head-to-Head progression is controlled by the competitors.';
  end if;
  if v_session.status <> 'active' and p_action <> 'restart' then raise exception 'This room is closed.'; end if;
  select count(*) into v_count from public.questions where quiz_id = v_session.quiz_id;
  v_is_final := v_count > 0 and v_session.current_question_index + 1 >= v_count;
  v_now := clock_timestamp();
  case p_action
    when 'start' then
      if v_session.phase <> 'lobby' then raise exception 'The game has already started.'; end if;
      select * into v_question from public.questions where quiz_id = v_session.quiz_id order by display_order limit 1;
      if not found then raise exception 'This quiz has no questions.'; end if;
      v_opened_at := v_now + case when v_question.double_score then interval '1500 milliseconds' else interval '0 milliseconds' end;
      update public.game_sessions set phase = 'question', current_question_id = v_question.id, current_question_index = 0,
        started_at = coalesce(started_at, v_now), question_opened_at = v_opened_at,
        question_closes_at = v_opened_at + make_interval(secs => v_question.time_limit_seconds) where id = p_session_id;
    when 'lock' then
      if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
      if v_session.question_opened_at is not null and v_now < v_session.question_opened_at then
        raise exception 'Wait for the Double Score intro to finish.';
      end if;
      update public.game_sessions set phase = 'locked', question_closes_at = least(coalesce(question_closes_at, v_now), v_now) where id = p_session_id;
    when 'reveal' then
      if v_session.phase <> 'locked' then raise exception 'Lock answers before the reveal.'; end if;
      update public.game_sessions set phase = 'reveal' where id = p_session_id;
    when 'leaderboard' then
      if v_session.phase <> 'reveal' then raise exception 'Reveal the answer first.'; end if;
      if v_is_final then raise exception 'Reveal the final results instead.'; end if;
      update public.game_sessions set phase = 'leaderboard' where id = p_session_id;
    when 'next' then
      if v_session.phase <> 'leaderboard' then raise exception 'Show the leaderboard first.'; end if;
      if v_is_final then raise exception 'There is no next question.'; end if;
      select * into v_question from public.questions where quiz_id = v_session.quiz_id order by display_order offset v_session.current_question_index + 1 limit 1;
      v_opened_at := v_now + case when v_question.double_score then interval '1500 milliseconds' else interval '0 milliseconds' end;
      update public.game_sessions set phase = 'question', current_question_id = v_question.id,
        current_question_index = v_session.current_question_index + 1, question_opened_at = v_opened_at,
        question_closes_at = v_opened_at + make_interval(secs => v_question.time_limit_seconds) where id = p_session_id;
    when 'finish' then
      if v_session.phase = 'question' and v_session.question_opened_at is not null and v_now < v_session.question_opened_at then
        raise exception 'Wait for the Double Score intro to finish.';
      end if;
      if v_session.phase = 'reveal' and not v_is_final then raise exception 'Show the leaderboard before continuing.'; end if;
      if v_session.phase not in ('question', 'locked', 'reveal') then raise exception 'The game cannot be finished from this phase.'; end if;
      update public.game_sessions set phase = 'finished', ended_at = v_now,
        question_closes_at = least(coalesce(question_closes_at, v_now), v_now) where id = p_session_id;
    when 'restart' then
      if v_session.phase <> 'finished' then raise exception 'Finish the game before restarting it.'; end if;
      delete from public.player_answers where game_session_id = p_session_id;
      update public.players set total_score = 0, correct_answer_count = 0, total_correct_response_ms = 0 where game_session_id = p_session_id;
      update public.game_sessions set status = 'active', phase = 'lobby', current_question_id = null,
        current_question_index = 0, question_opened_at = null, question_closes_at = null,
        started_at = null, ended_at = null where id = p_session_id;
    when 'close' then
      update public.game_sessions set status = 'closed', phase = 'finished', ended_at = v_now where id = p_session_id;
    else raise exception 'Unknown host action';
  end case;
end;
$$;
