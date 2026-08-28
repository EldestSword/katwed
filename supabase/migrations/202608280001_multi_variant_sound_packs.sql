-- Add generic multi-variant Sound Packs while preserving every deployed launch overload.
-- The browser registry owns asset paths; PostgreSQL accepts only a safe pack slug and
-- bounded Double Score durations, then selects the authoritative sting index per event.

alter table public.quizzes
  drop constraint quizzes_sound_pack_id_check,
  add constraint quizzes_sound_pack_id_check check (
    length(sound_pack_id) between 1 and 64 and
    sound_pack_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  );

alter table public.game_sessions
  drop constraint game_sessions_sound_pack_id_check,
  add column double_score_variant_durations_ms integer[] not null default array[5000],
  add column double_score_variant_order integer[] not null default array[0],
  add column double_score_variant_cursor integer not null default 0,
  add column current_double_score_variant_index integer,
  add constraint game_sessions_sound_pack_id_check check (
    length(sound_pack_id) between 1 and 64 and
    sound_pack_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  add constraint game_sessions_double_score_variant_durations_check check (
    cardinality(double_score_variant_durations_ms) between 1 and 64 and
    500 <= all(double_score_variant_durations_ms) and
    30000 >= all(double_score_variant_durations_ms)
  ),
  add constraint game_sessions_double_score_variant_cursor_check check (double_score_variant_cursor >= 0),
  add constraint game_sessions_current_double_score_variant_check check (
    current_double_score_variant_index is null or current_double_score_variant_index >= 0
  );

update public.game_sessions
set double_score_variant_durations_ms = array[double_score_intro_ms],
    double_score_variant_order = array[0],
    double_score_variant_cursor = 0,
    current_double_score_variant_index = null;

-- Keep the established save chain and stale-client behaviour while allowing every
-- browser-registered pack ID that satisfies the same bounded slug rule as launch.
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
    if length(v_sound_pack_id) not between 1 and 64 or
      v_sound_pack_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Unsupported sound pack ID';
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

create or replace function public.consume_double_score_variant(p_session_id uuid)
returns table(variant_index integer, duration_ms integer)
language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_count integer;
  v_order integer[];
  v_cursor integer;
  v_index integer;
  v_previous integer;
  v_swap integer;
begin
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if not found then raise exception 'Game session not found'; end if;
  v_count := cardinality(v_session.double_score_variant_durations_ms);
  if v_count < 1 or v_count > 64 then raise exception 'Invalid Double Score variant metadata'; end if;
  v_order := v_session.double_score_variant_order;
  v_cursor := v_session.double_score_variant_cursor;
  v_previous := v_session.current_double_score_variant_index;

  if cardinality(v_order) <> v_count or v_cursor >= cardinality(v_order) or
    cardinality(array(select distinct unnest(v_order))) <> v_count or
    exists (select 1 from unnest(v_order) value where value < 0 or value >= v_count) then
    select array_agg(value order by random()) into v_order from generate_series(0, v_count - 1) value;
    if v_count > 1 and v_order[1] = v_previous then
      v_swap := v_order[1]; v_order[1] := v_order[2]; v_order[2] := v_swap;
    end if;
    v_cursor := 0;
  end if;

  v_index := v_order[v_cursor + 1];
  variant_index := v_index;
  duration_ms := v_session.double_score_variant_durations_ms[v_index + 1];
  update public.game_sessions set
    double_score_variant_order = v_order,
    double_score_variant_cursor = v_cursor + 1,
    current_double_score_variant_index = v_index,
    double_score_intro_ms = duration_ms
  where id = p_session_id;
  return next;
end;
$$;

revoke all on function public.consume_double_score_variant(uuid) from public, anon, authenticated;

create or replace function public.session_to_json(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.session_to_json_without_launch_settings(p_session_id) || jsonb_build_object(
    'settings', jsonb_build_object(
      'soundPackId', s.sound_pack_id,
      'doubleScoreIntroMs', s.double_score_intro_ms,
      'doubleScoreVariantDurationsMs', to_jsonb(s.double_score_variant_durations_ms),
      'shuffleQuestionOrder', s.shuffle_question_order,
      'shuffleAnswerOptions', s.shuffle_answer_options,
      'autoLockWhenAllAnswered', s.auto_lock_when_all_answered,
      'showPlayerAnswersToHost', s.show_player_answers_to_host,
      'questionTypeIntrosEnabled', s.question_type_intros_enabled,
      'answerOptionSeed', s.answer_option_seed
    ),
    'questionOrder', to_jsonb(s.question_order),
    'doubleScoreVariantOrder', to_jsonb(s.double_score_variant_order),
    'doubleScoreVariantCursor', s.double_score_variant_cursor,
    'currentDoubleScoreVariantIndex', s.current_double_score_variant_index,
    'hostResponses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'sessionId', a.game_session_id, 'questionId', a.question_id,
        'playerId', a.player_id, 'resolutionStatus', a.resolution_status, 'submittedAt', a.submitted_at
      ) order by a.submitted_at)
      from public.player_answers a
      where a.game_session_id = s.id and a.question_id = s.current_question_id
    ), '[]'::jsonb),
    'answers', case
      when s.show_player_answers_to_host and (
        select count(*) from public.players p where p.game_session_id = s.id
      ) <= 15 then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'sessionId', a.game_session_id, 'questionId', a.question_id,
          'playerId', a.player_id, 'payload', a.answer_payload,
          'resolutionStatus', a.resolution_status, 'submittedAt', a.submitted_at,
          'responseTimeMs', a.response_time_ms, 'automaticCorrect', a.automatic_correct,
          'hostCorrectOverride', a.host_correct_override, 'correct', a.correct,
          'pointsAwarded', a.points_awarded
        ) order by a.submitted_at)
        from public.player_answers a
        where a.game_session_id = s.id and a.question_id = s.current_question_id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  from public.game_sessions s
  join public.quizzes q on q.id = s.quiz_id
  where s.id = p_session_id and q.owner_id = auth.uid()
$$;

revoke all on function public.session_to_json(uuid) from public, anon;
grant execute on function public.session_to_json(uuid) to authenticated;

create or replace function public.host_launch_game(p_quiz_id uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quiz public.quizzes;
  v_session_id uuid;
  v_code text;
  v_pack text;
  v_double_score_ms integer;
  v_double_score_durations integer[];
  v_double_score_order integer[];
  v_shuffle_questions boolean;
  v_shuffle_answers boolean;
  v_auto_lock boolean;
  v_show_answers boolean;
  v_mixed_types boolean;
  v_question_order uuid[];
  v_answer_seed text;
  v_question_count integer;
begin
  if p_settings is null then p_settings := '{}'::jsonb; end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Launch settings must be an object'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_settings) as setting(key)
    where setting.key not in (
      'soundPackId', 'doubleScoreVariantDurationsMs', 'shuffleQuestionOrder', 'shuffleAnswerOptions',
      'autoLockWhenAllAnswered', 'showPlayerAnswersToHost'
    )
  ) then raise exception 'Unsupported launch setting'; end if;

  select q.* into v_quiz from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid() for update;
  if not found then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
  if v_quiz.archived_at is not null then raise exception 'Restore this quiz before launching it.'; end if;

  select count(*) into v_question_count from public.questions where quiz_id = p_quiz_id;
  if v_question_count = 0 then raise exception 'Add at least one valid question before launching'; end if;
  if v_quiz.quiz_type = 'head-to-head' then
    if (select count(*) from public.quiz_competitors where quiz_id = p_quiz_id) <> 2 then
      raise exception 'Head-to-Head quizzes need exactly two competitors.';
    end if;
    if exists (
      select 1 from public.questions x where x.quiz_id = p_quiz_id and (
        x.assigned_competitor_id is null or not exists (
          select 1 from public.quiz_competitors c
          where c.quiz_id = p_quiz_id and c.id = x.assigned_competitor_id
        )
      )
    ) then raise exception 'Assign every question to a valid competitor before launching.'; end if;
  end if;

  select id into v_session_id from public.game_sessions
  where quiz_id = p_quiz_id and status = 'active'
  order by created_at desc limit 1;
  if v_session_id is not null then return public.session_to_json(v_session_id); end if;

  if p_settings ? 'soundPackId' and jsonb_typeof(p_settings -> 'soundPackId') <> 'string' then
    raise exception 'Sound pack ID must be text';
  end if;
  v_pack := coalesce(p_settings ->> 'soundPackId', v_quiz.sound_pack_id);
  if length(v_pack) not between 1 and 64 or v_pack !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Unsupported sound pack ID';
  end if;

  if p_settings ? 'doubleScoreVariantDurationsMs' then
    if jsonb_typeof(p_settings -> 'doubleScoreVariantDurationsMs') <> 'array' or
      jsonb_array_length(p_settings -> 'doubleScoreVariantDurationsMs') not between 1 and 64 then
      raise exception 'Double Score variants must be a non-empty bounded array';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_settings -> 'doubleScoreVariantDurationsMs') value
      where jsonb_typeof(value) <> 'number' or value::text !~ '^[0-9]+$' or
        (value::text)::integer not between 500 and 30000
    ) then raise exception 'Invalid Double Score variant duration'; end if;
    select array_agg((value::text)::integer order by ordinality)
      into v_double_score_durations
    from jsonb_array_elements(p_settings -> 'doubleScoreVariantDurationsMs') with ordinality as item(value, ordinality);
  else
    v_double_score_durations := array[5000];
  end if;
  v_double_score_ms := v_double_score_durations[1];
  select array_agg(value order by random()) into v_double_score_order
  from generate_series(0, cardinality(v_double_score_durations) - 1) value;

  if p_settings ? 'shuffleQuestionOrder' and jsonb_typeof(p_settings -> 'shuffleQuestionOrder') <> 'boolean' then
    raise exception 'Shuffle question order must be Boolean';
  end if;
  if p_settings ? 'shuffleAnswerOptions' and jsonb_typeof(p_settings -> 'shuffleAnswerOptions') <> 'boolean' then
    raise exception 'Shuffle answer options must be Boolean';
  end if;
  if p_settings ? 'autoLockWhenAllAnswered' and jsonb_typeof(p_settings -> 'autoLockWhenAllAnswered') <> 'boolean' then
    raise exception 'Auto-lock setting must be Boolean';
  end if;
  if p_settings ? 'showPlayerAnswersToHost' and jsonb_typeof(p_settings -> 'showPlayerAnswersToHost') <> 'boolean' then
    raise exception 'Host answer visibility setting must be Boolean';
  end if;
  v_shuffle_questions := coalesce((p_settings ->> 'shuffleQuestionOrder')::boolean, false);
  v_shuffle_answers := coalesce((p_settings ->> 'shuffleAnswerOptions')::boolean, false);
  v_auto_lock := coalesce((p_settings ->> 'autoLockWhenAllAnswered')::boolean, true);
  v_show_answers := coalesce((p_settings ->> 'showPlayerAnswersToHost')::boolean, true);
  select count(distinct question_type) > 1 into v_mixed_types from public.questions where quiz_id = p_quiz_id;
  select array_agg(x.id order by case when v_shuffle_questions then random() end, x.display_order)
    into v_question_order from public.questions x where x.quiz_id = p_quiz_id;
  if cardinality(v_question_order) <> v_question_count or cardinality(array(select distinct unnest(v_question_order))) <> v_question_count then
    raise exception 'The generated question order is invalid';
  end if;
  v_answer_seed := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');

  loop
    v_code := lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
    exit when not exists (select 1 from public.game_sessions where room_code = v_code);
  end loop;
  insert into public.game_sessions (
    quiz_id, room_code, sound_pack_id, double_score_intro_ms,
    double_score_variant_durations_ms, double_score_variant_order, double_score_variant_cursor,
    shuffle_question_order, question_order, shuffle_answer_options,
    answer_option_seed, auto_lock_when_all_answered, show_player_answers_to_host,
    question_type_intros_enabled
  ) values (
    p_quiz_id, v_code, v_pack, v_double_score_ms,
    v_double_score_durations, v_double_score_order, 0,
    v_shuffle_questions, v_question_order, v_shuffle_answers,
    v_answer_seed, v_auto_lock, v_show_answers, v_mixed_types
  ) returning id into v_session_id;
  return public.session_to_json(v_session_id);
end;
$$;

create or replace function public.host_launch_game(p_quiz_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.host_launch_game(p_quiz_id, '{}'::jsonb)
$$;

revoke all on function public.host_launch_game(uuid, jsonb) from public, anon;
revoke all on function public.host_launch_game(uuid) from public, anon;
grant execute on function public.host_launch_game(uuid, jsonb) to authenticated;
grant execute on function public.host_launch_game(uuid) to authenticated;

create or replace function public.host_change_phase(p_session_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_question public.questions; v_count integer;
  v_is_final boolean; v_quiz_type text; v_now timestamptz; v_opened_at timestamptz;
  v_prelude_ms integer; v_variant_index integer;
begin
  v_session := public.require_session_owner(p_session_id);
  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  if v_quiz_type = 'head-to-head' and p_action <> 'close' then
    raise exception 'Head-to-Head progression is controlled by the competitors.';
  end if;
  if v_session.status <> 'active' and p_action <> 'restart' then raise exception 'This room is closed.'; end if;
  v_count := cardinality(v_session.question_order);
  v_is_final := v_count > 0 and v_session.current_question_index + 1 >= v_count;
  v_now := clock_timestamp();
  case p_action
    when 'start' then
      if v_session.phase <> 'lobby' then raise exception 'The game has already started.'; end if;
      select * into v_question from public.questions where id = v_session.question_order[1] and quiz_id = v_session.quiz_id;
      if not found then raise exception 'This quiz has no questions.'; end if;
      if v_question.double_score then
        select variant_index, duration_ms into v_variant_index, v_prelude_ms from public.consume_double_score_variant(p_session_id);
      else
        v_prelude_ms := case when v_session.question_type_intros_enabled then 1750 else 0 end;
        update public.game_sessions set current_double_score_variant_index = null where id = p_session_id;
      end if;
      v_opened_at := v_now + (v_prelude_ms * interval '1 millisecond');
      update public.game_sessions set phase = 'question', current_question_id = v_question.id, current_question_index = 0,
        started_at = coalesce(started_at, v_now), question_opened_at = v_opened_at,
        question_closes_at = v_opened_at + make_interval(secs => v_question.time_limit_seconds)
      where id = p_session_id;
    when 'lock' then
      if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
      if v_session.question_opened_at is not null and v_now < v_session.question_opened_at then raise exception 'Wait for the question intro to finish.'; end if;
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
      select * into v_question from public.questions
      where id = v_session.question_order[v_session.current_question_index + 2] and quiz_id = v_session.quiz_id;
      if not found then raise exception 'The next question is unavailable.'; end if;
      if v_question.double_score then
        select variant_index, duration_ms into v_variant_index, v_prelude_ms from public.consume_double_score_variant(p_session_id);
      else
        v_prelude_ms := case when v_session.question_type_intros_enabled then 1750 else 0 end;
        update public.game_sessions set current_double_score_variant_index = null where id = p_session_id;
      end if;
      v_opened_at := v_now + (v_prelude_ms * interval '1 millisecond');
      update public.game_sessions set phase = 'question', current_question_id = v_question.id,
        current_question_index = v_session.current_question_index + 1, question_opened_at = v_opened_at,
        question_closes_at = v_opened_at + make_interval(secs => v_question.time_limit_seconds)
      where id = p_session_id;
    when 'finish' then
      if v_session.phase = 'question' and v_session.question_opened_at is not null and v_now < v_session.question_opened_at then
        raise exception 'Wait for the question intro to finish.';
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
        current_double_score_variant_index = null, started_at = null, ended_at = null where id = p_session_id;
    when 'close' then
      update public.game_sessions set status = 'closed', phase = 'finished', ended_at = v_now where id = p_session_id;
    else raise exception 'Unknown host action';
  end case;
end;
$$;

create or replace function public.start_head_to_head_game(
  p_room_code text, p_player_id uuid, p_reconnect_token text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_question public.questions; v_now timestamptz; v_opened_at timestamptz;
  v_prelude_ms integer; v_variant_index integer;
begin
  select gs.* into v_session from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id and q.quiz_type = 'head-to-head'
  where gs.room_code = p_room_code and gs.status = 'active' for update of gs;
  if not found then raise exception 'This Head-to-Head room is not active.'; end if;
  if not exists (select 1 from public.players where id = p_player_id and game_session_id = v_session.id and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256'))
  then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if v_session.phase <> 'lobby' then return; end if;
  if (select count(*) from public.players where game_session_id = v_session.id and competitor_id is not null) <> 2 then
    raise exception 'Both competitors must join before the game can start.';
  end if;
  select * into v_question from public.questions where id = v_session.question_order[1] and quiz_id = v_session.quiz_id;
  if not found then raise exception 'This quiz has no questions.'; end if;
  v_now := clock_timestamp();
  if v_question.double_score then
    select variant_index, duration_ms into v_variant_index, v_prelude_ms from public.consume_double_score_variant(v_session.id);
  else
    v_prelude_ms := case when v_session.question_type_intros_enabled then 1750 else 0 end;
    update public.game_sessions set current_double_score_variant_index = null where id = v_session.id;
  end if;
  v_opened_at := v_now + (v_prelude_ms * interval '1 millisecond');
  update public.game_sessions set phase = 'question', current_question_id = v_question.id,
    current_question_index = 0, started_at = coalesce(started_at, v_now),
    question_opened_at = v_opened_at, question_closes_at = null
  where id = v_session.id;
end;
$$;

create or replace function public.continue_head_to_head_game(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_expected_question_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_next public.questions; v_count integer; v_now timestamptz; v_opened_at timestamptz;
  v_prelude_ms integer; v_variant_index integer;
begin
  select gs.* into v_session from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id and q.quiz_type = 'head-to-head'
  where gs.room_code = p_room_code and gs.status = 'active' for update of gs;
  if not found then raise exception 'This Head-to-Head room is not active.'; end if;
  if not exists (select 1 from public.players where id = p_player_id and game_session_id = v_session.id and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256'))
  then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if v_session.phase = 'finished' or v_session.current_question_id <> p_expected_question_id then return; end if;
  if v_session.phase <> 'reveal' then raise exception 'Wait for both competitors to resolve the question.'; end if;
  v_count := cardinality(v_session.question_order);
  if v_session.current_question_index + 1 >= v_count then
    update public.game_sessions set phase = 'finished', ended_at = clock_timestamp(), question_closes_at = null where id = v_session.id;
  else
    select * into v_next from public.questions
    where id = v_session.question_order[v_session.current_question_index + 2] and quiz_id = v_session.quiz_id;
    if not found then raise exception 'The next question is unavailable.'; end if;
    v_now := clock_timestamp();
    if v_next.double_score then
      select variant_index, duration_ms into v_variant_index, v_prelude_ms from public.consume_double_score_variant(v_session.id);
    else
      v_prelude_ms := case when v_session.question_type_intros_enabled then 1750 else 0 end;
      update public.game_sessions set current_double_score_variant_index = null where id = v_session.id;
    end if;
    v_opened_at := v_now + (v_prelude_ms * interval '1 millisecond');
    update public.game_sessions set phase = 'question', current_question_id = v_next.id,
      current_question_index = v_session.current_question_index + 1,
      question_opened_at = v_opened_at, question_closes_at = null
    where id = v_session.id;
  end if;
end;
$$;

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_state jsonb; v_session public.game_sessions; v_question public.questions;
  v_prelude text; v_correct_player_ids jsonb;
begin
  v_state := public.get_player_game_state_without_session_settings(p_room_code);
  if v_state is null then return null; end if;
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if v_session.current_question_id is not null then select * into v_question from public.questions where id = v_session.current_question_id; end if;
  v_prelude := case
    when v_session.phase <> 'question' or v_question.id is null then null
    when v_question.double_score then 'double-score'
    when v_session.question_type_intros_enabled then 'question-type'
    else null
  end;
  if v_question.id is not null then
    v_state := jsonb_set(v_state, '{currentQuestion}', coalesce(v_state -> 'currentQuestion', '{}'::jsonb) || jsonb_build_object(
      'forceRandomiseOptions', v_session.shuffle_answer_options,
      'optionOrderSeed', case when v_session.shuffle_answer_options then v_session.answer_option_seed || ':' || v_question.id::text else null end
    ));
  end if;
  if v_session.phase in ('reveal', 'leaderboard', 'finished') and v_question.question_type = 'typed-answer' then
    select coalesce(jsonb_agg(a.player_id order by a.submitted_at), '[]'::jsonb) into v_correct_player_ids
    from public.player_answers a where a.game_session_id = v_session.id and a.question_id = v_question.id and a.correct;
    v_state := jsonb_set(v_state, '{reveal,correctPlayerIds}', v_correct_player_ids, true);
  end if;
  return v_state || jsonb_build_object(
    'soundPackId', v_session.sound_pack_id,
    'questionPreludeKind', v_prelude,
    'doubleScoreVariantIndex', v_session.current_double_score_variant_index,
    'sessionSettings', jsonb_build_object(
      'soundPackId', v_session.sound_pack_id,
      'doubleScoreIntroMs', v_session.double_score_intro_ms,
      'doubleScoreVariantDurationsMs', to_jsonb(v_session.double_score_variant_durations_ms),
      'shuffleQuestionOrder', v_session.shuffle_question_order,
      'shuffleAnswerOptions', v_session.shuffle_answer_options,
      'autoLockWhenAllAnswered', v_session.auto_lock_when_all_answered,
      'questionTypeIntrosEnabled', v_session.question_type_intros_enabled,
      'answerOptionSeed', v_session.answer_option_seed
    )
  );
end;
$$;

revoke all on function public.start_head_to_head_game(text, uuid, text) from public;
revoke all on function public.continue_head_to_head_game(text, uuid, text, uuid) from public;
revoke all on function public.get_player_game_state(text) from public;
grant execute on function public.start_head_to_head_game(text, uuid, text) to anon, authenticated;
grant execute on function public.continue_head_to_head_game(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
