-- Keep answer keys private until reveal and final totals private until the host
-- deliberately reveals the finished state. The final question skips leaderboard.

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
    and gs.status = 'active' and p.reconnect_token_hash = digest(p_reconnect_token, 'sha256')
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

create or replace function public.host_change_phase(p_session_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_question public.questions;
  v_count integer;
  v_is_final boolean;
begin
  v_session := public.require_session_owner(p_session_id);
  if v_session.status <> 'active' and p_action <> 'restart' then
    raise exception 'This room is closed.';
  end if;
  select count(*) into v_count from public.questions where quiz_id = v_session.quiz_id;
  v_is_final := v_count > 0 and v_session.current_question_index + 1 >= v_count;

  case p_action
    when 'start' then
      if v_session.phase <> 'lobby' then raise exception 'The game has already started.'; end if;
      select * into v_question from public.questions where quiz_id = v_session.quiz_id order by display_order limit 1;
      if not found then raise exception 'This quiz has no questions.'; end if;
      update public.game_sessions set phase = 'question', current_question_id = v_question.id, current_question_index = 0,
        started_at = coalesce(started_at, now()), question_opened_at = now(),
        question_closes_at = now() + make_interval(secs => v_question.time_limit_seconds)
      where id = p_session_id;
    when 'lock' then
      if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
      update public.game_sessions set phase = 'locked',
        question_closes_at = least(coalesce(question_closes_at, now()), now())
      where id = p_session_id;
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
      select * into v_question from public.questions where quiz_id = v_session.quiz_id
        order by display_order offset v_session.current_question_index + 1 limit 1;
      update public.game_sessions set phase = 'question', current_question_id = v_question.id,
        current_question_index = v_session.current_question_index + 1, question_opened_at = now(),
        question_closes_at = now() + make_interval(secs => v_question.time_limit_seconds)
      where id = p_session_id;
    when 'finish' then
      if v_session.phase = 'reveal' and not v_is_final then
        raise exception 'Show the leaderboard before continuing.';
      end if;
      if v_session.phase not in ('question', 'locked', 'reveal') then
        raise exception 'The game cannot be finished from this phase.';
      end if;
      update public.game_sessions set phase = 'finished', ended_at = now(),
        question_closes_at = least(coalesce(question_closes_at, now()), now())
      where id = p_session_id;
    when 'restart' then
      if v_session.phase <> 'finished' then raise exception 'Finish the game before restarting it.'; end if;
      delete from public.player_answers where game_session_id = p_session_id;
      update public.players set total_score = 0, correct_answer_count = 0, total_correct_response_ms = 0
      where game_session_id = p_session_id;
      update public.game_sessions set status = 'active', phase = 'lobby', current_question_id = null,
        current_question_index = 0, question_opened_at = null, question_closes_at = null,
        started_at = null, ended_at = null where id = p_session_id;
    when 'close' then
      update public.game_sessions set status = 'closed', phase = 'finished', ended_at = now()
      where id = p_session_id;
    else
      raise exception 'Unknown host action';
  end case;
end;
$$;
