-- Generalise Katwed! questions and answers while preserving existing mash-up data.
-- This is a forward-only migration. Existing hardened ownership, RLS and phase
-- functions remain in force unless explicitly replaced below.

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 240),
  image_path text,
  image_alt text not null default '' check (char_length(image_alt) <= 300),
  display_order integer not null check (display_order between 0 and 7),
  unique (question_id, display_order),
  unique (question_id, id),
  check (char_length(trim(label)) > 0 or nullif(trim(image_path), '') is not null)
);

alter table public.question_options enable row level security;
create policy "hosts_manage_own_question_options" on public.question_options for all to authenticated
  using (exists (
    select 1 from public.questions x join public.quizzes q on q.id = x.quiz_id
    where x.id = question_id and q.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.questions x join public.quizzes q on q.id = x.quiz_id
    where x.id = question_id and q.owner_id = auth.uid()
  ));
revoke all on public.question_options from anon;

alter table public.questions
  add column question_type text,
  add column prompt text,
  add column supporting_text text not null default '',
  add column points integer,
  add column media jsonb,
  add column media_visibility text,
  add column presentation_choice_visibility text,
  add column type_config jsonb,
  add column answer_key jsonb;

update public.questions set
  question_type = 'mashup',
  prompt = 'Who is in this mash-up?',
  points = 1,
  media = jsonb_build_object(
    'type', 'image', 'path', image_path,
    'altText', 'AI-generated merged portrait for the current question.',
    'revealEffect', 'immediate', 'revealDurationSeconds', 0
  ),
  media_visibility = 'both',
  presentation_choice_visibility = 'hide',
  type_config = '{}'::jsonb,
  answer_key = jsonb_build_object(
    'correctMemberIds', jsonb_build_array(first_correct_member_id, second_correct_member_id)
  );

alter table public.questions
  alter column question_type set not null,
  alter column prompt set not null,
  alter column points set not null,
  alter column media set not null,
  alter column media_visibility set not null,
  alter column presentation_choice_visibility set not null,
  alter column type_config set not null,
  alter column answer_key set not null,
  alter column image_path drop not null,
  alter column first_correct_member_id drop not null,
  alter column second_correct_member_id drop not null,
  alter column time_limit_seconds set default 30,
  drop constraint questions_time_limit_seconds_check,
  add constraint questions_time_limit_seconds_check check (time_limit_seconds between 5 and 300),
  drop constraint questions_reveal_caption_check,
  add constraint questions_reveal_caption_check check (char_length(reveal_caption) <= 500),
  add constraint questions_type_check check (question_type in (
    'single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'mashup'
  )),
  add constraint questions_prompt_check check (char_length(trim(prompt)) between 1 and 300),
  add constraint questions_points_check check (points between 1 and 100000),
  add constraint questions_media_visibility_check check (media_visibility in ('presentation', 'players', 'both')),
  add constraint questions_choice_visibility_check check (presentation_choice_visibility in ('show', 'hide', 'after-lock')),
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
  );

alter table public.player_answers
  add column answer_payload jsonb,
  alter column first_selected_member_id drop not null,
  alter column second_selected_member_id drop not null,
  drop constraint player_answers_points_awarded_check,
  add constraint player_answers_points_awarded_check check (points_awarded >= 0);

-- Remove the v1 implication that every correct answer is exactly one point.
do $$
declare v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.player_answers'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%correct%'
    and pg_get_constraintdef(oid) like '%points_awarded%';
  if v_constraint is not null then
    execute format('alter table public.player_answers drop constraint %I', v_constraint);
  end if;
end $$;

update public.player_answers set answer_payload = jsonb_build_object(
  'type', 'mashup',
  'memberIds', jsonb_build_array(first_selected_member_id, second_selected_member_id)
);
alter table public.player_answers alter column answer_payload set not null;

create or replace function public.validate_question_json()
returns trigger language plpgsql set search_path = public as $$
declare
  v_min numeric;
  v_max numeric;
  v_step numeric;
  v_correct numeric;
  v_tolerance numeric;
begin
  if jsonb_typeof(new.type_config) <> 'object' or jsonb_typeof(new.answer_key) <> 'object' then
    raise exception 'Question configuration must be a JSON object';
  end if;
  case new.question_type
    when 'single-choice' then
      if nullif(new.answer_key ->> 'correctOptionId', '') is null then raise exception 'Single choice requires one correct option'; end if;
    when 'multiple-select' then
      if jsonb_typeof(new.answer_key -> 'correctOptionIds') <> 'array'
        or jsonb_array_length(new.answer_key -> 'correctOptionIds') < 2
        or (new.type_config ->> 'minimumSelections')::integer < 1
        or (new.type_config ->> 'maximumSelections')::integer < (new.type_config ->> 'minimumSelections')::integer
        or new.type_config ->> 'scoringMode' not in ('exact', 'partial-wipeout')
      then raise exception 'Invalid multiple-select configuration'; end if;
    when 'true-false' then
      if jsonb_typeof(new.answer_key -> 'correctValue') <> 'boolean' then raise exception 'True/false requires a Boolean answer'; end if;
    when 'slider' then
      v_min := (new.type_config ->> 'minimum')::numeric;
      v_max := (new.type_config ->> 'maximum')::numeric;
      v_step := (new.type_config ->> 'step')::numeric;
      v_correct := (new.answer_key ->> 'correctValue')::numeric;
      v_tolerance := (new.answer_key ->> 'tolerance')::numeric;
      if v_min >= v_max or v_step <= 0 or v_correct not between v_min and v_max or v_tolerance < 0
      then raise exception 'Invalid slider configuration'; end if;
    when 'pinpoint' then
      if new.media ->> 'type' <> 'image'
        or (new.answer_key ->> 'targetX')::numeric not between 0 and 1
        or (new.answer_key ->> 'targetY')::numeric not between 0 and 1
        or (new.answer_key ->> 'targetRadius')::numeric not between 0.000001 and 1
      then raise exception 'Invalid pinpoint configuration'; end if;
    when 'mashup' then
      if new.media ->> 'type' <> 'image'
        or jsonb_typeof(new.answer_key -> 'correctMemberIds') <> 'array'
        or jsonb_array_length(new.answer_key -> 'correctMemberIds') <> 2
        or new.answer_key -> 'correctMemberIds' ->> 0 = new.answer_key -> 'correctMemberIds' ->> 1
      then raise exception 'Mash-up requires exactly two different correct people'; end if;
  end case;
  return new;
end;
$$;

create trigger questions_validate_multiformat
before insert or update on public.questions
for each row execute function public.validate_question_json();

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
  )
  from public.questions x
  where x.id = p_question_id
$$;

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'title', q.title, 'createdAt', q.created_at, 'updatedAt', q.updated_at,
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'quizId', r.quiz_id, 'displayName', r.display_name, 'shortName', r.short_name,
        'active', r.active, 'displayOrder', r.display_order
      ) order by r.display_order) from public.roster_members r where r.quiz_id = q.id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(public.question_to_json(x.id, true) order by x.display_order)
      from public.questions x where x.quiz_id = q.id
    ), '[]'::jsonb)
  )
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
$$;

create or replace function public.host_save_quiz(p_quiz jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quiz_id uuid;
  v_member jsonb;
  v_question jsonb;
  v_option jsonb;
  v_question_id uuid;
  v_type text;
  v_config jsonb;
  v_answer jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if nullif(trim(p_quiz ->> 'title'), '') is null then raise exception 'Quiz title is required'; end if;
  if nullif(p_quiz ->> 'id', '') is null then
    insert into public.quizzes (owner_id, title) values (auth.uid(), trim(p_quiz ->> 'title')) returning id into v_quiz_id;
  else
    v_quiz_id := (p_quiz ->> 'id')::uuid;
    update public.quizzes set title = trim(p_quiz ->> 'title') where id = v_quiz_id and owner_id = auth.uid();
    if not found then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
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
    v_answer := case v_type
      when 'single-choice' then jsonb_build_object('correctOptionId', v_question ->> 'correctOptionId')
      when 'multiple-select' then jsonb_build_object('correctOptionIds', v_question -> 'correctOptionIds')
      when 'true-false' then jsonb_build_object('correctValue', (v_question ->> 'correctValue')::boolean)
      when 'slider' then jsonb_build_object('correctValue', (v_question ->> 'correctValue')::numeric, 'tolerance', (v_question ->> 'tolerance')::numeric)
      when 'pinpoint' then jsonb_build_object('targetX', (v_question ->> 'targetX')::numeric, 'targetY', (v_question ->> 'targetY')::numeric, 'targetRadius', (v_question ->> 'targetRadius')::numeric)
      when 'mashup' then jsonb_build_object('correctMemberIds', v_question -> 'correctMemberIds')
    end;
    insert into public.questions (
      id, quiz_id, question_type, prompt, supporting_text, time_limit_seconds, points,
      display_order, reveal_caption, media, media_visibility, presentation_choice_visibility,
      type_config, answer_key, image_path, first_correct_member_id, second_correct_member_id
    ) values (
      v_question_id, v_quiz_id, v_type, trim(v_question ->> 'prompt'), coalesce(v_question ->> 'supportingText', ''),
      (v_question ->> 'timeLimitSeconds')::integer, (v_question ->> 'points')::integer,
      (v_question ->> 'displayOrder')::integer, coalesce(v_question ->> 'revealCaption', ''),
      v_question -> 'media', v_question ->> 'mediaVisibility', v_question ->> 'presentationChoiceVisibility',
      v_config, v_answer,
      case when v_question -> 'media' ->> 'type' = 'image' then v_question -> 'media' ->> 'path' end,
      case when v_type = 'mashup' then (v_question -> 'correctMemberIds' ->> 0)::uuid end,
      case when v_type = 'mashup' then (v_question -> 'correctMemberIds' ->> 1)::uuid end
    )
    on conflict (id) do update set
      question_type = excluded.question_type, prompt = excluded.prompt, supporting_text = excluded.supporting_text,
      time_limit_seconds = excluded.time_limit_seconds, points = excluded.points, display_order = excluded.display_order,
      reveal_caption = excluded.reveal_caption, media = excluded.media, media_visibility = excluded.media_visibility,
      presentation_choice_visibility = excluded.presentation_choice_visibility, type_config = excluded.type_config,
      answer_key = excluded.answer_key, image_path = excluded.image_path,
      first_correct_member_id = excluded.first_correct_member_id, second_correct_member_id = excluded.second_correct_member_id
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
  return public.quiz_to_json(v_quiz_id);
end;
$$;

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_quiz public.quizzes;
  v_question public.questions;
  v_safe jsonb := null;
  v_reveal jsonb := null;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then return null; end if;
  select * into v_quiz from public.quizzes where id = v_session.quiz_id;
  if v_session.current_question_id is not null then select * into v_question from public.questions where id = v_session.current_question_id; end if;
  if v_question.id is not null then
    v_safe := public.question_to_json(v_question.id, false)
      - 'quizId' - 'revealCaption' - 'scoringMode'
      || jsonb_build_object(
        'questionNumber', v_session.current_question_index + 1,
        'totalQuestions', (select count(*) from public.questions where quiz_id = v_session.quiz_id)
      );
  end if;
  if v_session.phase in ('reveal', 'leaderboard', 'finished') and v_question.id is not null then
    v_reveal := jsonb_build_object('type', v_question.question_type, 'caption', v_question.reveal_caption)
      || v_question.answer_key;
    if v_question.question_type = 'mashup' then
      v_reveal := v_reveal || jsonb_build_object('correctNames', jsonb_build_array(
        (select display_name from public.roster_members where id = (v_question.answer_key -> 'correctMemberIds' ->> 0)::uuid),
        (select display_name from public.roster_members where id = (v_question.answer_key -> 'correctMemberIds' ->> 1)::uuid)
      ));
    elsif v_question.question_type = 'single-choice' then
      v_reveal := v_reveal || jsonb_build_object('optionCounts', coalesce((
        select jsonb_object_agg(o.id, coalesce(c.total, 0)) from public.question_options o
        left join (
          select (answer_payload ->> 'optionId')::uuid id, count(*) total
          from public.player_answers where game_session_id = v_session.id and question_id = v_question.id
          group by 1
        ) c on c.id = o.id where o.question_id = v_question.id
      ), '{}'::jsonb));
    elsif v_question.question_type = 'multiple-select' then
      v_reveal := v_reveal || jsonb_build_object('optionCounts', coalesce((
        select jsonb_object_agg(o.id, coalesce(c.total, 0)) from public.question_options o
        left join (
          select selected.id::uuid id, count(*) total
          from public.player_answers a
          cross join lateral jsonb_array_elements_text(a.answer_payload -> 'optionIds') selected(id)
          where a.game_session_id = v_session.id and a.question_id = v_question.id
          group by 1
        ) c on c.id = o.id where o.question_id = v_question.id
      ), '{}'::jsonb));
    elsif v_question.question_type = 'true-false' then
      v_reveal := v_reveal || jsonb_build_object('counts', jsonb_build_object(
        'true', (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and (answer_payload ->> 'value')::boolean),
        'false', (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and not (answer_payload ->> 'value')::boolean)
      ));
    elsif v_question.question_type = 'slider' then
      v_reveal := v_reveal || jsonb_build_object('values', coalesce((
        select jsonb_agg((answer_payload ->> 'value')::numeric order by submitted_at)
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id
      ), '[]'::jsonb));
    elsif v_question.question_type = 'pinpoint' then
      v_reveal := v_reveal || jsonb_build_object('points', coalesce((
        select jsonb_agg(jsonb_build_object(
          'x', (answer_payload ->> 'x')::numeric,
          'y', (answer_payload ->> 'y')::numeric
        ) order by submitted_at)
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id
      ), '[]'::jsonb));
    end if;
  end if;
  return jsonb_build_object(
    'sessionId', v_session.id, 'quizTitle', v_quiz.title, 'roomCode', v_session.room_code,
    'status', v_session.status, 'phase', v_session.phase, 'currentQuestion', v_safe,
    'roster', case when v_question.question_type = 'mashup' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'quizId', r.quiz_id, 'displayName', r.display_name, 'shortName', r.short_name,
        'active', r.active, 'displayOrder', r.display_order
      ) order by r.display_order) from public.roster_members r where r.quiz_id = v_session.quiz_id and r.active
    ), '[]'::jsonb) else '[]'::jsonb end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'sessionId', p.game_session_id, 'nickname', p.nickname, 'connected', p.connected,
        'joinedAt', p.joined_at, 'totalScore', p.total_score, 'correctAnswerCount', p.correct_answer_count,
        'totalCorrectResponseMs', p.total_correct_response_ms
      ) order by p.joined_at) from public.players p where p.game_session_id = v_session.id
    ), '[]'::jsonb),
    'submittedCount', case when v_question.id is null then 0 else (
      select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id
    ) end,
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', ranked.id, 'nickname', ranked.nickname, 'totalScore', ranked.total_score,
        'correctAnswerCount', ranked.correct_answer_count, 'totalCorrectResponseMs', ranked.total_correct_response_ms,
        'rank', ranked.rank
      ) order by ranked.rank) from (
        select p.*, row_number() over (order by p.total_score desc, p.correct_answer_count desc, p.total_correct_response_ms asc, lower(p.nickname) asc) rank
        from public.players p where p.game_session_id = v_session.id
      ) ranked
    ), '[]'::jsonb),
    'reveal', v_reveal, 'questionOpenedAt', v_session.question_opened_at, 'questionClosesAt', v_session.question_closes_at
  );
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
  if not exists (select 1 from public.players where id = p_player_id and game_session_id = v_session.id and reconnect_token_hash = digest(p_reconnect_token, 'sha256'))
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

revoke all on function public.submit_answer(text, uuid, text, jsonb) from public;
grant execute on function public.submit_answer(text, uuid, text, jsonb) to anon, authenticated;
