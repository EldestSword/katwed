-- Add the seventh knowledge-scored question type without changing existing live-game semantics.
-- This migration is intentionally pending until a deliberate database-first production release.

alter table public.questions
  drop constraint questions_type_check,
  add constraint questions_type_check check (question_type in (
    'single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'typed-answer', 'mashup'
  ));

create or replace function public.normalise_typed_answer(p_value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select regexp_replace(lower(normalize(p_value, NFKC)), '[^[:alnum:]]+', '', 'g')
$$;

revoke all on function public.normalise_typed_answer(text) from public, anon, authenticated;

create or replace function public.question_to_json(p_question_id uuid, p_include_answer boolean default true)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', x.id, 'quizId', x.quiz_id, 'type', x.question_type, 'prompt', x.prompt,
      'supportingText', x.supporting_text, 'timeLimitSeconds', x.time_limit_seconds,
      'points', x.points, 'displayOrder', x.display_order, 'revealCaption', x.reveal_caption,
      'media', x.media, 'mediaVisibility', x.media_visibility,
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

create or replace function public.host_save_quiz(p_quiz jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quiz_id uuid;
  v_quiz_type text;
  v_existing_quiz_type text;
  v_member jsonb;
  v_competitor jsonb;
  v_question jsonb;
  v_option jsonb;
  v_question_id uuid;
  v_type text;
  v_config jsonb;
  v_answer jsonb;
  v_assigned_competitor_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if nullif(trim(p_quiz ->> 'title'), '') is null then raise exception 'Quiz title is required'; end if;

  if nullif(p_quiz ->> 'id', '') is null then
    v_quiz_type := case when p_quiz ? 'quizType' then p_quiz ->> 'quizType' else 'standard' end;
    if v_quiz_type not in ('standard', 'head-to-head') then raise exception 'Unsupported quiz type'; end if;
    insert into public.quizzes (owner_id, title, quiz_type, cover_image_path, theme_id, background_id)
    values (
      auth.uid(),
      trim(p_quiz ->> 'title'),
      v_quiz_type,
      nullif(trim(p_quiz ->> 'coverImagePath'), ''),
      case when p_quiz ? 'themeId' then p_quiz ->> 'themeId' else 'katwed' end,
      case when p_quiz ? 'backgroundId' then p_quiz ->> 'backgroundId' else null end
    )
    returning id into v_quiz_id;
  else
    v_quiz_id := (p_quiz ->> 'id')::uuid;
    select q.quiz_type into v_existing_quiz_type
    from public.quizzes q
    where q.id = v_quiz_id and q.owner_id = auth.uid()
    for update;
    if not found then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
    v_quiz_type := case when p_quiz ? 'quizType' then p_quiz ->> 'quizType' else v_existing_quiz_type end;
    if v_quiz_type not in ('standard', 'head-to-head') then raise exception 'Unsupported quiz type'; end if;
    update public.quizzes
    set title = trim(p_quiz ->> 'title'),
        quiz_type = v_quiz_type,
        cover_image_path = nullif(trim(p_quiz ->> 'coverImagePath'), ''),
        theme_id = case
          when p_quiz ? 'themeId' then p_quiz ->> 'themeId'
          else theme_id
        end,
        background_id = case
          when p_quiz ? 'backgroundId' then p_quiz ->> 'backgroundId'
          when p_quiz ? 'themeId' and background_id is not null and not (
            (p_quiz ->> 'themeId' = 'katwed' and background_id in (
              'katwed-bubbles', 'katwed-confetti', 'katwed-ribbons'
            ))
            or (p_quiz ->> 'themeId' = 'midnight' and background_id in (
              'midnight-aurora', 'midnight-glow', 'midnight-stars'
            ))
            or (p_quiz ->> 'themeId' = 'sunset' and background_id in (
              'sunset-horizon', 'sunset-lights', 'sunset-ribbons'
            ))
            or (p_quiz ->> 'themeId' = 'arcade' and background_id in (
              'arcade-circuit', 'arcade-grid', 'arcade-neon'
            ))
            or (p_quiz ->> 'themeId' = 'mint' and background_id in (
              'mint-depth', 'mint-shapes', 'mint-waves'
            ))
            or (p_quiz ->> 'themeId' = 'paper' and background_id in (
              'paper-collage', 'paper-geometry', 'paper-notebook'
            ))
          ) then null
          else background_id
        end
    where id = v_quiz_id;
  end if;

  if v_quiz_type = 'standard' then
    if p_quiz ? 'headToHeadCompetitors'
      and jsonb_array_length(p_quiz -> 'headToHeadCompetitors') <> 0
    then raise exception 'Standard quizzes cannot contain Head-to-Head competitors.'; end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb)) as item(value)
      where item.value ? 'assignedCompetitorId'
        and nullif(item.value ->> 'assignedCompetitorId', '') is not null
    ) then raise exception 'Standard questions cannot be assigned to Head-to-Head competitors.'; end if;
  end if;

  delete from public.questions where quiz_id = v_quiz_id and id not in (
    select (value ->> 'id')::uuid from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb))
  );
  delete from public.roster_members where quiz_id = v_quiz_id and id not in (
    select (value ->> 'id')::uuid from jsonb_array_elements(coalesce(p_quiz -> 'roster', '[]'::jsonb))
  );
  update public.roster_members set display_order = display_order + 100000 where quiz_id = v_quiz_id;
  update public.questions set display_order = display_order + 100000 where quiz_id = v_quiz_id;

  for v_member in select value from jsonb_array_elements(coalesce(p_quiz -> 'roster', '[]'::jsonb)) loop
    insert into public.roster_members (id, quiz_id, display_name, short_name, active, display_order)
    values (
      (v_member ->> 'id')::uuid, v_quiz_id, trim(v_member ->> 'displayName'),
      coalesce(v_member ->> 'shortName', ''), coalesce((v_member ->> 'active')::boolean, true),
      (v_member ->> 'displayOrder')::integer
    )
    on conflict (id) do update set display_name = excluded.display_name, short_name = excluded.short_name,
      active = excluded.active, display_order = excluded.display_order
    where public.roster_members.quiz_id = v_quiz_id;
  end loop;

  if p_quiz ? 'headToHeadCompetitors' then
    update public.questions set assigned_competitor_id = null where quiz_id = v_quiz_id;
    delete from public.quiz_competitors where quiz_id = v_quiz_id;
    for v_competitor in select value from jsonb_array_elements(p_quiz -> 'headToHeadCompetitors') loop
      insert into public.quiz_competitors (id, quiz_id, display_name, display_order)
      values (
        (v_competitor ->> 'id')::uuid, v_quiz_id,
        trim(v_competitor ->> 'displayName'), (v_competitor ->> 'displayOrder')::integer
      );
    end loop;
  end if;

  for v_question in select value from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb)) loop
    v_question_id := (v_question ->> 'id')::uuid;
    v_type := v_question ->> 'type';
    v_config := case v_type
      when 'multiple-select' then jsonb_build_object(
        'minimumSelections', (v_question ->> 'minimumSelections')::integer,
        'maximumSelections', (v_question ->> 'maximumSelections')::integer,
        'scoringMode', v_question ->> 'scoringMode',
        'randomiseOptions', coalesce((v_question ->> 'randomiseOptions')::boolean, false)
      )
      when 'single-choice' then jsonb_build_object('randomiseOptions', coalesce((v_question ->> 'randomiseOptions')::boolean, false))
      when 'slider' then jsonb_build_object(
        'minimum', (v_question ->> 'minimum')::numeric, 'maximum', (v_question ->> 'maximum')::numeric,
        'step', (v_question ->> 'step')::numeric, 'prefix', coalesce(v_question ->> 'prefix', ''),
        'suffix', coalesce(v_question ->> 'suffix', ''), 'unitLabel', coalesce(v_question ->> 'unitLabel', '')
      )
      else '{}'::jsonb end;
    if v_type = 'typed-answer' then
      if jsonb_typeof(v_question -> 'correctAnswer') <> 'string'
        or char_length(v_question ->> 'correctAnswer') > 120
        or public.normalise_typed_answer(v_question ->> 'correctAnswer') = ''
      then raise exception 'Typed Answer needs a primary answer of 1-120 meaningful characters'; end if;
      if jsonb_typeof(v_question -> 'acceptedAnswers') <> 'array'
        or jsonb_array_length(v_question -> 'acceptedAnswers') > 19
        or exists (
          select 1 from jsonb_array_elements(v_question -> 'acceptedAnswers') answer(value)
          where jsonb_typeof(answer.value) <> 'string'
            or char_length(answer.value #>> '{}') > 120
            or public.normalise_typed_answer(answer.value #>> '{}') = ''
        )
      then raise exception 'Typed Answer alternatives must contain up to 19 meaningful answers of at most 120 characters'; end if;
      if exists (
        select 1
        from jsonb_array_elements_text(
          jsonb_build_array(v_question ->> 'correctAnswer') || (v_question -> 'acceptedAnswers')
        ) answer(value)
        group by public.normalise_typed_answer(answer.value)
        having count(*) > 1
      ) then raise exception 'Typed answers must be unique after normalisation'; end if;
    end if;
    v_answer := case v_type
      when 'single-choice' then jsonb_build_object('correctOptionId', v_question ->> 'correctOptionId')
      when 'multiple-select' then jsonb_build_object('correctOptionIds', v_question -> 'correctOptionIds')
      when 'true-false' then jsonb_build_object('correctValue', (v_question ->> 'correctValue')::boolean)
      when 'slider' then jsonb_build_object('correctValue', (v_question ->> 'correctValue')::numeric, 'tolerance', (v_question ->> 'tolerance')::numeric)
      when 'pinpoint' then jsonb_build_object('targetX', (v_question ->> 'targetX')::numeric, 'targetY', (v_question ->> 'targetY')::numeric, 'targetRadius', (v_question ->> 'targetRadius')::numeric)
      when 'typed-answer' then jsonb_build_object(
        'correctAnswer', trim(v_question ->> 'correctAnswer'),
        'acceptedAnswers', coalesce(v_question -> 'acceptedAnswers', '[]'::jsonb)
      )
      when 'mashup' then jsonb_build_object('correctMemberIds', v_question -> 'correctMemberIds')
    end;
    v_assigned_competitor_id := case
      when v_quiz_type = 'standard' then null
      when v_question ? 'assignedCompetitorId' then nullif(v_question ->> 'assignedCompetitorId', '')::uuid
      else (
        select x.assigned_competitor_id from public.questions x
        where x.id = v_question_id and x.quiz_id = v_quiz_id
      )
    end;
    insert into public.questions (
      id, quiz_id, question_type, prompt, supporting_text, time_limit_seconds, points,
      display_order, reveal_caption, media, media_visibility, presentation_choice_visibility,
      type_config, answer_key, image_path, first_correct_member_id, second_correct_member_id,
      assigned_competitor_id
    ) values (
      v_question_id, v_quiz_id, v_type, trim(v_question ->> 'prompt'), coalesce(v_question ->> 'supportingText', ''),
      (v_question ->> 'timeLimitSeconds')::integer, (v_question ->> 'points')::integer,
      (v_question ->> 'displayOrder')::integer, coalesce(v_question ->> 'revealCaption', ''),
      v_question -> 'media', v_question ->> 'mediaVisibility', v_question ->> 'presentationChoiceVisibility',
      v_config, v_answer,
      case when v_question -> 'media' ->> 'type' = 'image' then v_question -> 'media' ->> 'path' end,
      case when v_type = 'mashup' then (v_question -> 'correctMemberIds' ->> 0)::uuid end,
      case when v_type = 'mashup' then (v_question -> 'correctMemberIds' ->> 1)::uuid end,
      v_assigned_competitor_id
    )
    on conflict (id) do update set
      question_type = excluded.question_type, prompt = excluded.prompt, supporting_text = excluded.supporting_text,
      time_limit_seconds = excluded.time_limit_seconds, points = excluded.points, display_order = excluded.display_order,
      reveal_caption = excluded.reveal_caption, media = excluded.media, media_visibility = excluded.media_visibility,
      presentation_choice_visibility = excluded.presentation_choice_visibility, type_config = excluded.type_config,
      answer_key = excluded.answer_key, image_path = excluded.image_path,
      first_correct_member_id = excluded.first_correct_member_id, second_correct_member_id = excluded.second_correct_member_id,
      assigned_competitor_id = excluded.assigned_competitor_id
    where public.questions.quiz_id = v_quiz_id;

    delete from public.question_options where question_id = v_question_id;
    if v_type in ('single-choice', 'multiple-select') then
      for v_option in select value from jsonb_array_elements(v_question -> 'options') loop
        insert into public.question_options (id, question_id, label, image_path, image_alt, display_order)
        values (
          (v_option ->> 'id')::uuid, v_question_id, coalesce(v_option ->> 'label', ''),
          nullif(v_option ->> 'imagePath', ''), coalesce(v_option ->> 'imageAlt', ''),
          coalesce((v_option ->> 'displayOrder')::integer, (
            select count(*) from public.question_options where question_id = v_question_id
          ))
        );
      end loop;
    end if;
    if v_type = 'single-choice' and not exists (
      select 1 from public.question_options
      where question_id = v_question_id and id = (v_question ->> 'correctOptionId')::uuid
    ) then raise exception 'The correct option must belong to the question'; end if;
    if v_type = 'multiple-select' and (
      select count(*) from public.question_options o
      where o.question_id = v_question_id
        and o.id::text in (select value from jsonb_array_elements_text(v_question -> 'correctOptionIds'))
    ) <> jsonb_array_length(v_question -> 'correctOptionIds')
    then raise exception 'Every correct option must belong to the question'; end if;
    if v_type = 'mashup' and (
      select count(*) from public.roster_members r
      where r.quiz_id = v_quiz_id and r.active
        and r.id::text in (select value from jsonb_array_elements_text(v_question -> 'correctMemberIds'))
    ) <> 2 then raise exception 'Both correct people must be active members of the people bank'; end if;
  end loop;

  if v_quiz_type = 'standard' then
    update public.questions set assigned_competitor_id = null where quiz_id = v_quiz_id;
    delete from public.quiz_competitors where quiz_id = v_quiz_id;
  else
    if (select count(*) from public.quiz_competitors where quiz_id = v_quiz_id) <> 2 then
      raise exception 'Head-to-Head quizzes need exactly two competitors.';
    end if;
    if exists (
      select 1 from public.questions
      where quiz_id = v_quiz_id and assigned_competitor_id is null
    ) then raise exception 'Assign every question to a competitor.'; end if;
  end if;

  return public.quiz_to_json(v_quiz_id);
end;
$$;

create or replace function public.submit_answer(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_answer jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_question public.questions; v_player public.players;
  v_quiz_type text; v_correct boolean := false; v_points integer := 0; v_response_ms integer;
  v_selected text[]; v_correct_ids text[]; v_value numeric; v_x numeric; v_y numeric; v_assigned boolean;
  v_text text; v_normalised text;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code and status = 'active' for update;
  if not found then raise exception 'This room is not active.'; end if;
  if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  if v_quiz_type = 'standard' and (v_session.question_closes_at is null or clock_timestamp() > v_session.question_closes_at) then
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
  end case;

  v_assigned := v_player.competitor_id is not null and v_player.competitor_id = v_question.assigned_competitor_id;
  if v_quiz_type = 'head-to-head' then
    v_points := case when v_assigned and v_correct then 1 else 0 end;
  elsif v_correct then
    v_points := v_question.points;
  end if;
  v_response_ms := greatest(0, floor(extract(epoch from (clock_timestamp() - v_session.question_opened_at)) * 1000)::integer);
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

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_quiz public.quizzes; v_question public.questions;
  v_safe jsonb := null; v_reveal jsonb := null; v_scores_visible boolean; v_head_to_head boolean;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then return null; end if;
  select * into v_quiz from public.quizzes where id = v_session.quiz_id;
  v_head_to_head := v_quiz.quiz_type = 'head-to-head';
  if v_session.current_question_id is not null then select * into v_question from public.questions where id = v_session.current_question_id; end if;
  v_scores_visible := v_head_to_head or v_session.phase in ('leaderboard', 'finished');

  if v_question.id is not null then
    v_safe := public.question_to_json(v_question.id, false) - 'quizId' - 'revealCaption' - 'scoringMode'
      || jsonb_build_object('assignedCompetitorId', case when v_head_to_head then v_question.assigned_competitor_id else null end,
        'questionNumber', v_session.current_question_index + 1,
        'totalQuestions', (select count(*) from public.questions where quiz_id = v_session.quiz_id));
  end if;

  if v_session.phase in ('reveal', 'leaderboard', 'finished') and v_question.id is not null then
    v_reveal := jsonb_build_object('type', v_question.question_type, 'caption', v_question.reveal_caption) || (v_question.answer_key - 'acceptedAnswers');
    if v_question.question_type = 'mashup' then
      v_reveal := v_reveal || jsonb_build_object('correctNames', jsonb_build_array(
        (select display_name from public.roster_members where id = (v_question.answer_key -> 'correctMemberIds' ->> 0)::uuid),
        (select display_name from public.roster_members where id = (v_question.answer_key -> 'correctMemberIds' ->> 1)::uuid)));
    elsif v_question.question_type = 'single-choice' then
      v_reveal := v_reveal || jsonb_build_object('optionCounts', coalesce((select jsonb_object_agg(o.id, coalesce(c.total, 0))
        from public.question_options o left join (select (answer_payload ->> 'optionId')::uuid id, count(*) total
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered' group by 1) c on c.id = o.id
        where o.question_id = v_question.id), '{}'::jsonb));
    elsif v_question.question_type = 'multiple-select' then
      v_reveal := v_reveal || jsonb_build_object('scoringMode', v_question.type_config ->> 'scoringMode', 'optionCounts', coalesce((
        select jsonb_object_agg(o.id, coalesce(c.total, 0)) from public.question_options o left join (
          select selected.id::uuid id, count(*) total from public.player_answers a
          cross join lateral jsonb_array_elements_text(a.answer_payload -> 'optionIds') selected(id)
          where a.game_session_id = v_session.id and a.question_id = v_question.id and a.resolution_status = 'answered' group by 1
        ) c on c.id = o.id where o.question_id = v_question.id), '{}'::jsonb));
    elsif v_question.question_type = 'true-false' then
      v_reveal := v_reveal || jsonb_build_object('counts', jsonb_build_object(
        'true', (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered' and (answer_payload ->> 'value')::boolean),
        'false', (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered' and not (answer_payload ->> 'value')::boolean)));
    elsif v_question.question_type = 'slider' then
      v_reveal := v_reveal || jsonb_build_object('values', coalesce((select jsonb_agg((answer_payload ->> 'value')::numeric order by submitted_at)
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered'), '[]'::jsonb));
    elsif v_question.question_type = 'pinpoint' then
      v_reveal := v_reveal || jsonb_build_object('points', coalesce((select jsonb_agg(jsonb_build_object(
        'x', (answer_payload ->> 'x')::numeric, 'y', (answer_payload ->> 'y')::numeric) order by submitted_at)
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered'), '[]'::jsonb));
    end if;
  end if;

  return jsonb_build_object(
    'sessionId', v_session.id, 'quizTitle', v_quiz.title, 'quizType', v_quiz.quiz_type,
    'themeId', v_quiz.theme_id, 'backgroundId', v_quiz.background_id, 'roomCode', v_session.room_code,
    'status', v_session.status, 'phase', v_session.phase, 'currentQuestion', v_safe,
    'roster', case when v_question.question_type = 'mashup' then coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'quizId', r.quiz_id, 'displayName', r.display_name, 'shortName', r.short_name,
      'active', r.active, 'displayOrder', r.display_order) order by r.display_order)
      from public.roster_members r where r.quiz_id = v_session.quiz_id and r.active), '[]'::jsonb) else '[]'::jsonb end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'sessionId', p.game_session_id, 'nickname', p.nickname, 'competitorId', p.competitor_id,
      'connected', p.connected, 'joinedAt', p.joined_at,
      'totalScore', case when v_scores_visible then p.total_score else 0 end,
      'correctAnswerCount', case when v_scores_visible then p.correct_answer_count else 0 end,
      'totalCorrectResponseMs', case when v_scores_visible then p.total_correct_response_ms else 0 end) order by p.joined_at)
      from public.players p where p.game_session_id = v_session.id), '[]'::jsonb),
    'headToHeadCompetitors', case when v_head_to_head then coalesce((select jsonb_agg(jsonb_build_object(
      'competitorId', c.id, 'displayName', c.display_name, 'displayOrder', c.display_order,
      'claimed', p.id is not null, 'connected', coalesce(p.connected, false), 'playerId', p.id,
      'totalScore', coalesce(p.total_score, 0), 'correctAnswerCount', coalesce(p.correct_answer_count, 0)) order by c.display_order)
      from public.quiz_competitors c left join public.players p on p.game_session_id = v_session.id and p.competitor_id = c.id
      where c.quiz_id = v_session.quiz_id), '[]'::jsonb) else '[]'::jsonb end,
    'headToHeadResolutions', case when v_head_to_head and v_question.id is not null then coalesce((select jsonb_agg(jsonb_build_object(
      'playerId', a.player_id, 'competitorId', p.competitor_id, 'status', a.resolution_status) order by p.joined_at)
      from public.player_answers a join public.players p on p.id = a.player_id
      where a.game_session_id = v_session.id and a.question_id = v_question.id), '[]'::jsonb) else '[]'::jsonb end,
    'headToHeadResults', case when v_head_to_head and v_session.phase in ('reveal', 'finished') and v_question.id is not null then coalesce((
      select jsonb_agg(jsonb_build_object('competitorId', p.competitor_id,
        'assigned', p.competitor_id = v_question.assigned_competitor_id,
        'status', case when a.resolution_status = 'skipped' then 'skipped' when a.correct then 'correct' else 'incorrect' end,
        'pointsAwarded', a.points_awarded) order by p.joined_at)
      from public.player_answers a join public.players p on p.id = a.player_id
      where a.game_session_id = v_session.id and a.question_id = v_question.id), '[]'::jsonb) else '[]'::jsonb end,
    'submittedCount', case when v_question.id is null then 0 else (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id) end,
    'leaderboard', case when not v_head_to_head and v_scores_visible then coalesce((select jsonb_agg(jsonb_build_object(
      'playerId', ranked.id, 'nickname', ranked.nickname, 'totalScore', ranked.total_score,
      'correctAnswerCount', ranked.correct_answer_count, 'totalCorrectResponseMs', ranked.total_correct_response_ms,
      'rank', ranked.rank) order by ranked.rank) from (select p.*, row_number() over (
        order by p.total_score desc, p.correct_answer_count desc, p.total_correct_response_ms asc, lower(p.nickname) asc) rank
        from public.players p where p.game_session_id = v_session.id) ranked), '[]'::jsonb) else '[]'::jsonb end,
    'reveal', v_reveal, 'questionOpenedAt', v_session.question_opened_at,
    'questionClosesAt', case when v_head_to_head then null else v_session.question_closes_at end
  );
end;
$$;

revoke all on function public.question_to_json(uuid, boolean) from public, anon;
revoke all on function public.host_save_quiz(jsonb) from public, anon;
revoke all on function public.submit_answer(text, uuid, text, jsonb) from public;
revoke all on function public.get_player_game_state(text) from public;

grant execute on function public.host_save_quiz(jsonb) to authenticated;
grant execute on function public.submit_answer(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
