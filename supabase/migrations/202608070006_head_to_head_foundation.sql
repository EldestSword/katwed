-- Add the authored Head-to-Head quiz definition. Live Head-to-Head gameplay is
-- intentionally not part of this migration and is guarded at launch.

alter table public.quizzes
  add column quiz_type text not null default 'standard'
  check (quiz_type in ('standard', 'head-to-head'));

create table public.quiz_competitors (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 30),
  display_order integer not null check (display_order in (0, 1)),
  unique (quiz_id, id),
  unique (quiz_id, display_order)
);

create unique index quiz_competitors_unique_name_ci
  on public.quiz_competitors (quiz_id, lower(trim(display_name)));

alter table public.questions
  add column assigned_competitor_id uuid;

alter table public.questions
  add constraint questions_assigned_competitor_same_quiz
  foreign key (quiz_id, assigned_competitor_id)
  references public.quiz_competitors(quiz_id, id);

alter table public.quiz_competitors enable row level security;

create policy "hosts_manage_own_quiz_competitors" on public.quiz_competitors
for all to authenticated
using (exists (
  select 1 from public.quizzes q
  where q.id = quiz_id and q.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.quizzes q
  where q.id = quiz_id and q.owner_id = auth.uid()
));

revoke all on public.quiz_competitors from anon;
grant select, insert, update, delete on public.quiz_competitors to authenticated;

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

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'title', q.title, 'quizType', q.quiz_type,
    'headToHeadCompetitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'quizId', c.quiz_id, 'displayName', c.display_name,
        'displayOrder', c.display_order
      ) order by c.display_order)
      from public.quiz_competitors c where c.quiz_id = q.id
    ), '[]'::jsonb),
    'coverImagePath', q.cover_image_path,
    'themeId', q.theme_id, 'backgroundId', q.background_id,
    'archivedAt', q.archived_at, 'createdAt', q.created_at, 'updatedAt', q.updated_at,
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
    v_answer := case v_type
      when 'single-choice' then jsonb_build_object('correctOptionId', v_question ->> 'correctOptionId')
      when 'multiple-select' then jsonb_build_object('correctOptionIds', v_question -> 'correctOptionIds')
      when 'true-false' then jsonb_build_object('correctValue', (v_question ->> 'correctValue')::boolean)
      when 'slider' then jsonb_build_object('correctValue', (v_question ->> 'correctValue')::numeric, 'tolerance', (v_question ->> 'tolerance')::numeric)
      when 'pinpoint' then jsonb_build_object('targetX', (v_question ->> 'targetX')::numeric, 'targetY', (v_question ->> 'targetY')::numeric, 'targetRadius', (v_question ->> 'targetRadius')::numeric)
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

create or replace function public.host_launch_game(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_code text;
  v_archived_at timestamptz;
  v_quiz_type text;
begin
  select q.archived_at, q.quiz_type into v_archived_at, v_quiz_type
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Quiz not found or unauthorised' using errcode = '42501';
  end if;
  if v_archived_at is not null then
    raise exception 'Restore this quiz before launching it.';
  end if;
  if v_quiz_type = 'head-to-head' then
    raise exception 'Head-to-Head live play is not available in this build yet.';
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

-- These helpers are not public player endpoints. Player-safe state continues
-- to omit competitor assignment by calling question_to_json(..., false).
revoke all on function public.question_to_json(uuid, boolean) from public, anon;
revoke all on function public.quiz_to_json(uuid) from public, anon;
revoke all on function public.host_save_quiz(jsonb) from public, anon;
revoke all on function public.host_launch_game(uuid) from public, anon;

grant execute on function public.host_save_quiz(jsonb) to authenticated;
grant execute on function public.host_launch_game(uuid) to authenticated;
