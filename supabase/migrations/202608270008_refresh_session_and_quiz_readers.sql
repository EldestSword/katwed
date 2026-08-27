-- Rebind owner-facing readers to the current quiz/session serialiser OIDs after
-- the compatibility wrappers introduced by Audio Pass 1 and Game Preflight.

create or replace function public.host_list_quizzes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.quiz_to_json(q.id) order by q.updated_at desc), '[]'::jsonb)
  from public.quizzes q
  where q.owner_id = auth.uid() and q.archived_at is null
$$;

create or replace function public.host_list_archived_quizzes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.quiz_to_json(q.id) order by q.archived_at desc), '[]'::jsonb)
  from public.quizzes q
  where q.owner_id = auth.uid() and q.archived_at is not null
$$;

create or replace function public.host_get_quiz(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.quiz_to_json(q.id)
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
$$;

create or replace function public.host_get_game(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'session', public.session_to_json(gs.id),
    'quiz', public.quiz_to_json(gs.quiz_id)
  )
  from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id
  where gs.id = p_session_id and q.owner_id = auth.uid()
$$;

create or replace function public.host_get_active_game(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.session_to_json(gs.id)
  from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id
  where gs.quiz_id = p_quiz_id and gs.status = 'active' and q.owner_id = auth.uid()
  order by gs.created_at desc
  limit 1
$$;

revoke all on function public.host_list_quizzes() from public, anon;
revoke all on function public.host_list_archived_quizzes() from public, anon;
revoke all on function public.host_get_quiz(uuid) from public, anon;
revoke all on function public.host_get_game(uuid) from public, anon;
revoke all on function public.host_get_active_game(uuid) from public, anon;
grant execute on function public.host_list_quizzes() to authenticated;
grant execute on function public.host_list_archived_quizzes() to authenticated;
grant execute on function public.host_get_quiz(uuid) to authenticated;
grant execute on function public.host_get_game(uuid) to authenticated;
grant execute on function public.host_get_active_game(uuid) to authenticated;
