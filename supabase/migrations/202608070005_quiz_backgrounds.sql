-- Persist an optional curated built-in background per quiz. Backgrounds are
-- theme-bound static application assets, not Supabase Storage references.

alter table public.quizzes
  add column background_id text;

alter table public.quizzes
  add constraint quizzes_background_theme_check
  check (
    background_id is null
    or (theme_id = 'katwed' and background_id in (
      'katwed-bubbles', 'katwed-confetti', 'katwed-ribbons'
    ))
    or (theme_id = 'midnight' and background_id in (
      'midnight-aurora', 'midnight-glow', 'midnight-stars'
    ))
    or (theme_id = 'sunset' and background_id in (
      'sunset-horizon', 'sunset-lights', 'sunset-ribbons'
    ))
    or (theme_id = 'arcade' and background_id in (
      'arcade-circuit', 'arcade-grid', 'arcade-neon'
    ))
    or (theme_id = 'mint' and background_id in (
      'mint-depth', 'mint-shapes', 'mint-waves'
    ))
    or (theme_id = 'paper' and background_id in (
      'paper-collage', 'paper-geometry', 'paper-notebook'
    ))
  );

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'title', q.title, 'coverImagePath', q.cover_image_path,
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
    insert into public.quizzes (owner_id, title, cover_image_path, theme_id, background_id)
    values (
      auth.uid(),
      trim(p_quiz ->> 'title'),
      nullif(trim(p_quiz ->> 'coverImagePath'), ''),
      case when p_quiz ? 'themeId' then p_quiz ->> 'themeId' else 'katwed' end,
      case when p_quiz ? 'backgroundId' then p_quiz ->> 'backgroundId' else null end
    )
    returning id into v_quiz_id;
  else
    v_quiz_id := (p_quiz ->> 'id')::uuid;
    update public.quizzes
    set title = trim(p_quiz ->> 'title'),
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

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_quiz public.quizzes;
  v_question public.questions;
  v_safe jsonb := null;
  v_reveal jsonb := null;
  v_scores_visible boolean;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then return null; end if;
  select * into v_quiz from public.quizzes where id = v_session.quiz_id;
  if v_session.current_question_id is not null then
    select * into v_question from public.questions where id = v_session.current_question_id;
  end if;
  v_scores_visible := v_session.phase in ('leaderboard', 'finished');

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
      v_reveal := v_reveal || jsonb_build_object(
        'scoringMode', v_question.type_config ->> 'scoringMode',
        'optionCounts', coalesce((
          select jsonb_object_agg(o.id, coalesce(c.total, 0)) from public.question_options o
          left join (
            select selected.id::uuid id, count(*) total
            from public.player_answers a
            cross join lateral jsonb_array_elements_text(a.answer_payload -> 'optionIds') selected(id)
            where a.game_session_id = v_session.id and a.question_id = v_question.id
            group by 1
          ) c on c.id = o.id where o.question_id = v_question.id
        ), '{}'::jsonb)
      );
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
    'sessionId', v_session.id, 'quizTitle', v_quiz.title, 'themeId', v_quiz.theme_id,
    'backgroundId', v_quiz.background_id, 'roomCode', v_session.room_code,
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
        'joinedAt', p.joined_at,
        'totalScore', case when v_scores_visible then p.total_score else 0 end,
        'correctAnswerCount', case when v_scores_visible then p.correct_answer_count else 0 end,
        'totalCorrectResponseMs', case when v_scores_visible then p.total_correct_response_ms else 0 end
      ) order by p.joined_at) from public.players p where p.game_session_id = v_session.id
    ), '[]'::jsonb),
    'submittedCount', case when v_question.id is null then 0 else (
      select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id
    ) end,
    'leaderboard', case when v_scores_visible then coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', ranked.id, 'nickname', ranked.nickname, 'totalScore', ranked.total_score,
        'correctAnswerCount', ranked.correct_answer_count, 'totalCorrectResponseMs', ranked.total_correct_response_ms,
        'rank', ranked.rank
      ) order by ranked.rank) from (
        select p.*, row_number() over (
          order by p.total_score desc, p.correct_answer_count desc,
            p.total_correct_response_ms asc, lower(p.nickname) asc
        ) rank
        from public.players p where p.game_session_id = v_session.id
      ) ranked
    ), '[]'::jsonb) else '[]'::jsonb end,
    'reveal', v_reveal, 'questionOpenedAt', v_session.question_opened_at,
    'questionClosesAt', v_session.question_closes_at
  );
end;
$$;

revoke all on function public.quiz_to_json(uuid) from public, anon;
revoke all on function public.host_save_quiz(jsonb) from public, anon;
revoke all on function public.get_player_game_state(text) from public;

grant execute on function public.host_save_quiz(jsonb) to authenticated;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
