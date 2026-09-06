-- Host-only post-question review surface for Typed Answer. This reader is
-- deliberately separate from the bounded live controller payload so a host can
-- review genuine incorrect spellings after answers close even in larger rooms.
create function public.host_get_typed_answer_review(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'answerId', a.id,
    'playerId', p.id,
    'nickname', p.nickname,
    'value', a.answer_payload->>'value',
    'submittedAt', a.submitted_at
  ) order by lower(p.nickname), p.id), '[]'::jsonb)
  from public.game_sessions s
  join public.quizzes q on q.id = s.quiz_id
  join public.questions question on question.id = s.current_question_id and question.quiz_id = s.quiz_id
  join public.player_answers a on a.game_session_id = s.id and a.question_id = question.id
  join public.players p on p.id = a.player_id and p.game_session_id = s.id
  where s.id = p_session_id
    and q.owner_id = auth.uid()
    and question.question_type = 'typed-answer'
    and s.phase in ('locked','reveal','leaderboard','finished')
    and a.answer_payload->>'type' = 'typed-answer'
    and a.automatic_correct is false
    and coalesce(a.host_correct_override, false) is false
$$;

revoke all on function public.host_get_typed_answer_review(uuid) from public, anon;
grant execute on function public.host_get_typed_answer_review(uuid) to authenticated;
