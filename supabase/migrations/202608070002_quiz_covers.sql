-- Add optional quiz covers to the existing quiz read/save lifecycle and include
-- them in cross-quiz shared-media protection during permanent deletion.

alter table public.quizzes
  add column cover_image_path text;

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'title', q.title, 'coverImagePath', q.cover_image_path,
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
    insert into public.quizzes (owner_id, title, cover_image_path)
    values (
      auth.uid(),
      trim(p_quiz ->> 'title'),
      nullif(trim(p_quiz ->> 'coverImagePath'), '')
    )
    returning id into v_quiz_id;
  else
    v_quiz_id := (p_quiz ->> 'id')::uuid;
    update public.quizzes
    set title = trim(p_quiz ->> 'title'),
        cover_image_path = nullif(trim(p_quiz ->> 'coverImagePath'), '')
    where id = v_quiz_id and owner_id = auth.uid();
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

create or replace function public.host_permanently_delete_quiz(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quiz public.quizzes;
  v_media_paths text[];
begin
  select q.* into v_quiz
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Quiz not found or unauthorised' using errcode = '42501';
  end if;
  if v_quiz.archived_at is null then
    raise exception 'Archive this quiz before permanently deleting it.';
  end if;
  if exists (
    select 1 from public.game_sessions gs
    where gs.quiz_id = p_quiz_id and gs.status = 'active'
  ) then
    raise exception 'Close the active game before permanently deleting this quiz.';
  end if;

  with all_media_references as (
    select q.id as quiz_id, q.cover_image_path as reference
    from public.quizzes q
    union all
    select x.quiz_id, x.media ->> 'path' as reference
    from public.questions x
    where x.media ->> 'type' = 'image'
    union all
    select x.quiz_id, x.image_path as reference
    from public.questions x
    union all
    select x.quiz_id, o.image_path as reference
    from public.question_options o
    join public.questions x on x.id = o.question_id
  ),
  target_references as (
    select distinct trim(a.reference) as reference
    from all_media_references a
    where a.quiz_id = p_quiz_id and nullif(trim(a.reference), '') is not null
  )
  select coalesce(array_agg(t.reference order by t.reference), array[]::text[])
  into v_media_paths
  from target_references t
  where not exists (
    select 1
    from all_media_references other
    where other.quiz_id <> p_quiz_id
      and nullif(trim(other.reference), '') = t.reference
  );

  -- Cascades remove questions, options, game sessions, players and answers.
  -- Storage removal happens afterwards in the authenticated browser client.
  delete from public.quizzes where id = p_quiz_id;

  return jsonb_build_object('mediaPaths', to_jsonb(v_media_paths));
end;
$$;

revoke all on function public.quiz_to_json(uuid) from public, anon;
revoke all on function public.host_save_quiz(jsonb) from public, anon;
revoke all on function public.host_permanently_delete_quiz(uuid) from public, anon;

grant execute on function public.host_save_quiz(jsonb) to authenticated;
grant execute on function public.host_permanently_delete_quiz(uuid) to authenticated;
