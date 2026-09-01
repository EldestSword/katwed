begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select ok(
  not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.players'::regclass
      and tgname = 'players_broadcast_refresh'
      and not tgisinternal
  ),
  'players no longer broadcasts every change'
);

select ok(
  not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.player_answers'::regclass
      and tgname = 'player_answers_broadcast_refresh'
      and not tgisinternal
  ),
  'player_answers no longer broadcasts every insert'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.game_sessions'::regclass
      and tgname = 'game_sessions_broadcast_refresh'
      and not tgisinternal
  ),
  'the bounded game_sessions broadcast trigger exists'
);

select is(
  (
    select array_agg(a.attname::text order by watched.ordinality)
    from pg_trigger t
    cross join lateral unnest(t.tgattr::smallint[]) with ordinality as watched(attnum, ordinality)
    join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = watched.attnum
    where t.tgrelid = 'public.game_sessions'::regclass
      and t.tgname = 'game_sessions_broadcast_refresh'
  ),
  array[
    'status', 'phase', 'current_question_id', 'current_question_index',
    'question_opened_at', 'question_closes_at', 'started_at', 'ended_at'
  ]::text[],
  'the session trigger watches only the intended phase and lifecycle columns'
);

select ok(
  position('AFTER INSERT OR DELETE OR UPDATE OF' in (
    select pg_get_triggerdef(oid)
    from pg_trigger
    where tgrelid = 'public.game_sessions'::regclass
      and tgname = 'game_sessions_broadcast_refresh'
  )) > 0,
  'the session trigger also covers inserts and deletes'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.players'::regclass
      and tgname = 'head_to_head_players_broadcast_refresh'
      and not tgisinternal
  ),
  'the narrow Head-to-Head player broadcast trigger remains'
);

select ok(to_regprocedure('public.broadcast_head_to_head_player_refresh()') is not null,
  'the Head-to-Head broadcast function exists');
select ok(to_regprocedure('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)') is not null,
  'the isolated JSON answer implementation exists');
select ok(to_regprocedure('public.submit_answer(text,uuid,text,uuid[])') is not null,
  'the legacy UUID-array answer overload exists');
select ok(to_regprocedure('public.submit_answer(text,uuid,text,jsonb)') is not null,
  'the public JSON answer wrapper exists');

select ok(
  position('for share' in lower(pg_get_functiondef(
    'public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure
  ))) > 0,
  'the isolated JSON implementation takes a shared session lock'
);
select ok(
  position('for update' in lower(pg_get_functiondef(
    'public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure
  ))) = 0,
  'the isolated JSON implementation has no exclusive session lock'
);
select ok(
  position('for share' in lower(pg_get_functiondef(
    'public.submit_answer(text,uuid,text,uuid[])'::regprocedure
  ))) > 0,
  'the legacy UUID-array overload takes a shared session lock'
);
select ok(
  position('for update' in lower(pg_get_functiondef(
    'public.submit_answer(text,uuid,text,uuid[])'::regprocedure
  ))) = 0,
  'the legacy UUID-array overload has no exclusive session lock'
);

select ok(
  position('head-to-head' in lower(pg_get_functiondef(
    'public.submit_answer(text,uuid,text,jsonb)'::regprocedure
  ))) > 0,
  'the JSON wrapper retains its Head-to-Head-only branch'
);
select ok(
  position('for update' in lower(pg_get_functiondef(
    'public.submit_answer(text,uuid,text,jsonb)'::regprocedure
  ))) > 0,
  'the JSON wrapper retains exclusive locking for Head-to-Head'
);
select ok(
  position('submit_answer_without_session_prelude' in lower(pg_get_functiondef(
    'public.submit_answer(text,uuid,text,jsonb)'::regprocedure
  ))) > 0,
  'the JSON wrapper delegates to the shared-lock implementation'
);

select ok(has_function_privilege('anon', 'public.submit_answer(text,uuid,text,jsonb)', 'EXECUTE'),
  'anon can execute the public JSON answer RPC');
select ok(has_function_privilege('authenticated', 'public.submit_answer(text,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated users can execute the public JSON answer RPC');
select ok(has_function_privilege('anon', 'public.submit_answer(text,uuid,text,uuid[])', 'EXECUTE'),
  'anon can execute the legacy UUID-array answer RPC');
select ok(has_function_privilege('authenticated', 'public.submit_answer(text,uuid,text,uuid[])', 'EXECUTE'),
  'authenticated users can execute the legacy UUID-array answer RPC');
select ok(not has_function_privilege('anon', 'public.submit_answer_without_session_prelude(text,uuid,text,jsonb)', 'EXECUTE'),
  'anon cannot execute the internal answer implementation');
select ok(not has_function_privilege('authenticated', 'public.submit_answer_without_session_prelude(text,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated users cannot execute the internal answer implementation');

select ok(to_regprocedure('public.host_get_live_session(uuid)') is not null,
  'the lightweight owner-only live-session RPC exists');
select ok(not has_function_privilege('anon', 'public.host_get_live_session(uuid)', 'EXECUTE'),
  'anon cannot execute the live-session RPC');
select ok(has_function_privilege('authenticated', 'public.host_get_live_session(uuid)', 'EXECUTE'),
  'authenticated users can execute the live-session RPC');
select ok(
  position('q.owner_id = auth.uid()' in pg_get_functiondef(
    'public.host_get_live_session(uuid)'::regprocedure
  )) > 0,
  'the live-session RPC applies its explicit owner predicate'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.host_get_live_session(uuid)'::regprocedure),
  'the live-session RPC remains SECURITY DEFINER'
);

select ok(not has_table_privilege('anon', 'public.players', 'SELECT'),
  'anon has no direct SELECT privilege on players');
select ok(not has_table_privilege('anon', 'public.player_answers', 'SELECT'),
  'anon has no direct SELECT privilege on player_answers');
select ok(not has_function_privilege('anon', 'public.broadcast_head_to_head_player_refresh()', 'EXECUTE'),
  'anon cannot invoke the Head-to-Head broadcast trigger function');
select ok(not has_function_privilege('authenticated', 'public.broadcast_head_to_head_player_refresh()', 'EXECUTE'),
  'authenticated users cannot invoke the Head-to-Head broadcast trigger function');

select * from finish();
rollback;
