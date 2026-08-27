-- Add private host response intelligence and session-only Typed Answer review.
-- This migration is additive and keeps both established host_launch_game overloads.

alter table public.game_sessions
  add column show_player_answers_to_host boolean not null default true;

alter table public.player_answers
  add column automatic_correct boolean,
  add column host_correct_override boolean,
  add constraint player_answers_host_correct_override_check
    check (host_correct_override is null or host_correct_override);

update public.player_answers set automatic_correct = correct where automatic_correct is null;

create or replace function public.capture_automatic_answer_judgement()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.automatic_correct is null then new.automatic_correct := new.correct; end if;
  return new;
end;
$$;

create trigger player_answers_capture_automatic_judgement
before insert on public.player_answers
for each row execute function public.capture_automatic_answer_judgement();

revoke all on function public.capture_automatic_answer_judgement() from public, anon, authenticated;

alter table public.player_answers alter column automatic_correct set not null;

create or replace function public.session_to_json(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.session_to_json_without_launch_settings(p_session_id) || jsonb_build_object(
    'settings', jsonb_build_object(
      'soundPackId', s.sound_pack_id,
      'doubleScoreIntroMs', s.double_score_intro_ms,
      'shuffleQuestionOrder', s.shuffle_question_order,
      'shuffleAnswerOptions', s.shuffle_answer_options,
      'autoLockWhenAllAnswered', s.auto_lock_when_all_answered,
      'showPlayerAnswersToHost', s.show_player_answers_to_host,
      'questionTypeIntrosEnabled', s.question_type_intros_enabled,
      'answerOptionSeed', s.answer_option_seed
    ),
    'questionOrder', to_jsonb(s.question_order),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'sessionId', a.game_session_id,
        'questionId', a.question_id,
        'playerId', a.player_id,
        'payload', a.answer_payload,
        'resolutionStatus', a.resolution_status,
        'submittedAt', a.submitted_at,
        'responseTimeMs', a.response_time_ms,
        'automaticCorrect', a.automatic_correct,
        'hostCorrectOverride', a.host_correct_override,
        'correct', a.correct,
        'pointsAwarded', a.points_awarded
      ) order by a.submitted_at)
      from public.player_answers a where a.game_session_id = s.id
    ), '[]'::jsonb)
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
      'soundPackId', 'shuffleQuestionOrder', 'shuffleAnswerOptions',
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
  if v_pack not in ('katwed', 'none') then raise exception 'Unsupported sound pack'; end if;
  v_double_score_ms := case v_pack when 'katwed' then 5000 when 'none' then 5000 end;
  if v_double_score_ms not between 500 and 30000 then raise exception 'Invalid Double Score duration'; end if;

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
    shuffle_question_order, question_order, shuffle_answer_options,
    answer_option_seed, auto_lock_when_all_answered, show_player_answers_to_host,
    question_type_intros_enabled
  ) values (
    p_quiz_id, v_code, v_pack, v_double_score_ms,
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

create or replace function public.host_set_typed_answer_override(
  p_session_id uuid,
  p_answer_id uuid,
  p_correct_override boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_answer public.player_answers;
  v_question public.questions;
  v_quiz_type text;
  v_previous_correct boolean;
  v_previous_points integer;
  v_next_correct boolean;
  v_next_points integer := 0;
  v_duration_ms integer;
  v_scoring_response_ms integer;
begin
  if p_correct_override is false then
    raise exception 'Typed Answer overrides may only accept an answer or be undone.';
  end if;

  select gs.* into v_session
  from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id
  where gs.id = p_session_id and q.owner_id = auth.uid()
  for update of gs;
  if not found then raise exception 'Unauthorised host action' using errcode = '42501'; end if;
  if v_session.status <> 'active' or v_session.phase not in ('locked', 'reveal', 'leaderboard') then
    raise exception 'Lock answers before reviewing Typed Answers.';
  end if;

  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  if v_quiz_type <> 'standard' then
    raise exception 'Typed Answer review is available for Standard games only.';
  end if;

  select a.* into v_answer from public.player_answers a
  where a.id = p_answer_id and a.game_session_id = v_session.id
  for update;
  if not found then raise exception 'That submitted answer could not be found.'; end if;
  if v_answer.question_id <> v_session.current_question_id or
    not exists (select 1 from public.players p where p.id = v_answer.player_id and p.game_session_id = v_session.id) then
    raise exception 'Only an answer for the current question can be reviewed.';
  end if;

  select q.* into v_question from public.questions q
  where q.id = v_answer.question_id and q.quiz_id = v_session.quiz_id;
  if not found or v_question.question_type <> 'typed-answer' or
    v_answer.resolution_status <> 'answered' or v_answer.answer_payload ->> 'type' <> 'typed-answer' then
    raise exception 'Only a submitted Typed Answer can be reviewed.';
  end if;

  v_previous_correct := v_answer.correct;
  v_previous_points := v_answer.points_awarded;
  v_next_correct := coalesce(
    case when p_correct_override is true and not v_answer.automatic_correct then true else null end,
    v_answer.automatic_correct
  );

  if v_next_correct then
    v_next_points := v_question.points;
    if v_question.double_score then v_next_points := v_next_points * 2; end if;
    if v_question.speed_scoring_enabled then
      v_duration_ms := greatest(1, v_question.time_limit_seconds * 1000);
      v_scoring_response_ms := least(v_duration_ms, greatest(0, v_answer.response_time_ms));
      v_next_points := floor(v_next_points * (1 - (0.5 * v_scoring_response_ms::numeric / v_duration_ms)))::integer;
    end if;
  end if;

  update public.player_answers set
    host_correct_override = case
      when p_correct_override is true and not automatic_correct then true
      else null
    end,
    correct = v_next_correct,
    points_awarded = v_next_points
  where id = v_answer.id;

  update public.players set
    total_score = total_score + (v_next_points - v_previous_points),
    correct_answer_count = correct_answer_count +
      ((case when v_next_correct then 1 else 0 end) - (case when v_previous_correct then 1 else 0 end)),
    total_correct_response_ms = total_correct_response_ms +
      ((case when v_next_correct then v_answer.response_time_ms else 0 end) -
       (case when v_previous_correct then v_answer.response_time_ms else 0 end))
  where id = v_answer.player_id and game_session_id = v_session.id;
end;
$$;

revoke all on function public.host_set_typed_answer_override(uuid, uuid, boolean) from public, anon;
grant execute on function public.host_set_typed_answer_override(uuid, uuid, boolean) to authenticated;
