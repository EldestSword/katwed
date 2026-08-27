-- Keep authenticated host refresh payloads bounded to the current question.
-- Lightweight response records preserve named submission status even when raw
-- answer detail is disabled or the room is above the controller detail limit.

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
    'hostResponses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'sessionId', a.game_session_id,
        'questionId', a.question_id,
        'playerId', a.player_id,
        'resolutionStatus', a.resolution_status,
        'submittedAt', a.submitted_at
      ) order by a.submitted_at)
      from public.player_answers a
      where a.game_session_id = s.id and a.question_id = s.current_question_id
    ), '[]'::jsonb),
    'answers', case
      when s.show_player_answers_to_host and (
        select count(*) from public.players p where p.game_session_id = s.id
      ) <= 15 then coalesce((
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
