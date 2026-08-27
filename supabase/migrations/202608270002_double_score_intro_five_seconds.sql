-- Extend the Standard Double Score intro from 1.5 seconds to 5 seconds.
-- The question opens only after the intro, so the full configured answer time is preserved.

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
      v_opened_at := v_now + case when v_question.double_score then interval '5 seconds' else interval '0 seconds' end;
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
      v_opened_at := v_now + case when v_question.double_score then interval '5 seconds' else interval '0 seconds' end;
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
