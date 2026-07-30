-- Katwed! version 1 schema and authoritative game functions.
-- Apply with `supabase db push` after linking a Supabase project.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roster_members (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  short_name text not null default '' check (char_length(short_name) <= 30),
  active boolean not null default true,
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, id),
  unique (quiz_id, display_order)
);

create unique index roster_members_unique_name_ci
  on public.roster_members (quiz_id, lower(display_name));

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  image_path text not null check (char_length(trim(image_path)) > 0),
  first_correct_member_id uuid not null references public.roster_members(id) on delete restrict,
  second_correct_member_id uuid not null references public.roster_members(id) on delete restrict,
  time_limit_seconds integer not null default 30 check (time_limit_seconds between 5 and 180),
  display_order integer not null check (display_order >= 0),
  reveal_caption text not null default '' check (char_length(reveal_caption) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_correct_member_id <> second_correct_member_id),
  unique (quiz_id, id),
  unique (quiz_id, display_order),
  foreign key (quiz_id, first_correct_member_id) references public.roster_members(quiz_id, id) on delete restrict,
  foreign key (quiz_id, second_correct_member_id) references public.roster_members(quiz_id, id) on delete restrict
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  room_code text not null check (room_code ~ '^[0-9]{6}$'),
  status text not null default 'active' check (status in ('active', 'closed')),
  phase text not null default 'lobby' check (phase in ('lobby', 'question', 'locked', 'reveal', 'leaderboard', 'finished')),
  current_question_id uuid references public.questions(id) on delete set null,
  current_question_index integer not null default 0 check (current_question_index >= 0),
  question_opened_at timestamptz,
  question_closes_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index game_sessions_one_active_room_code
  on public.game_sessions (room_code) where status = 'active';
create index game_sessions_quiz_status on public.game_sessions (quiz_id, status);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 30),
  reconnect_token_hash bytea not null,
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_score integer not null default 0 check (total_score >= 0),
  correct_answer_count integer not null default 0 check (correct_answer_count >= 0),
  total_correct_response_ms bigint not null default 0 check (total_correct_response_ms >= 0)
);

create unique index players_unique_nickname_ci
  on public.players (game_session_id, lower(nickname));
create index players_session on public.players (game_session_id);

create table public.player_answers (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  first_selected_member_id uuid not null references public.roster_members(id) on delete restrict,
  second_selected_member_id uuid not null references public.roster_members(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  response_time_ms integer not null check (response_time_ms >= 0),
  correct boolean not null,
  points_awarded integer not null check (points_awarded in (0, 1)),
  check (first_selected_member_id <> second_selected_member_id),
  check ((correct and points_awarded = 1) or (not correct and points_awarded = 0)),
  unique (player_id, question_id)
);

create index player_answers_session_question on public.player_answers (game_session_id, question_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger quizzes_set_updated_at before update on public.quizzes
for each row execute function public.set_updated_at();
create trigger roster_members_set_updated_at before update on public.roster_members
for each row execute function public.set_updated_at();
create trigger questions_set_updated_at before update on public.questions
for each row execute function public.set_updated_at();
create trigger game_sessions_set_updated_at before update on public.game_sessions
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_user();

alter table public.profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.roster_members enable row level security;
alter table public.questions enable row level security;
alter table public.game_sessions enable row level security;
alter table public.players enable row level security;
alter table public.player_answers enable row level security;

create policy "profiles_read_self" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "hosts_manage_own_quizzes" on public.quizzes for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "hosts_manage_own_roster" on public.roster_members for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()));
create policy "hosts_manage_own_questions" on public.questions for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()));
create policy "hosts_manage_own_sessions" on public.game_sessions for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()));
create policy "hosts_read_own_players" on public.players for select to authenticated
  using (exists (
    select 1 from public.game_sessions gs join public.quizzes q on q.id = gs.quiz_id
    where gs.id = game_session_id and q.owner_id = auth.uid()
  ));
create policy "hosts_read_own_answers" on public.player_answers for select to authenticated
  using (exists (
    select 1 from public.game_sessions gs join public.quizzes q on q.id = gs.quiz_id
    where gs.id = game_session_id and q.owner_id = auth.uid()
  ));

revoke all on public.quizzes, public.roster_members, public.questions, public.game_sessions, public.players, public.player_answers from anon;

create or replace function public.require_session_owner(p_session_id uuid)
returns public.game_sessions language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions;
begin
  select gs.* into v_session
  from public.game_sessions gs join public.quizzes q on q.id = gs.quiz_id
  where gs.id = p_session_id and q.owner_id = auth.uid();
  if not found then raise exception 'Unauthorised host action' using errcode = '42501'; end if;
  return v_session;
end;
$$;

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id,
    'title', q.title,
    'createdAt', q.created_at,
    'updatedAt', q.updated_at,
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'quizId', r.quiz_id, 'displayName', r.display_name, 'shortName', r.short_name,
        'active', r.active, 'displayOrder', r.display_order
      ) order by r.display_order)
      from public.roster_members r where r.quiz_id = q.id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'quizId', x.quiz_id, 'imagePath', x.image_path,
        'correctMemberIds', jsonb_build_array(x.first_correct_member_id, x.second_correct_member_id),
        'timeLimitSeconds', x.time_limit_seconds, 'displayOrder', x.display_order,
        'revealCaption', x.reveal_caption
      ) order by x.display_order)
      from public.questions x where x.quiz_id = q.id
    ), '[]'::jsonb)
  )
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
$$;

create or replace function public.session_to_json(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', gs.id, 'quizId', gs.quiz_id, 'roomCode', gs.room_code, 'status', gs.status, 'phase', gs.phase,
    'currentQuestionIndex', gs.current_question_index, 'questionOpenedAt', gs.question_opened_at,
    'questionClosesAt', gs.question_closes_at, 'startedAt', gs.started_at, 'endedAt', gs.ended_at,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'sessionId', p.game_session_id, 'nickname', p.nickname, 'connected', p.connected,
        'joinedAt', p.joined_at, 'totalScore', p.total_score, 'correctAnswerCount', p.correct_answer_count,
        'totalCorrectResponseMs', p.total_correct_response_ms
      ) order by p.joined_at)
      from public.players p where p.game_session_id = gs.id
    ), '[]'::jsonb),
    'answers', '[]'::jsonb
  )
  from public.game_sessions gs join public.quizzes q on q.id = gs.quiz_id
  where gs.id = p_session_id and q.owner_id = auth.uid()
$$;

create or replace function public.host_list_quizzes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.quiz_to_json(q.id) order by q.updated_at desc), '[]'::jsonb)
  from public.quizzes q where q.owner_id = auth.uid()
$$;

create or replace function public.host_get_quiz(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.quiz_to_json(p_quiz_id)
$$;

create or replace function public.host_save_quiz(p_quiz jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quiz_id uuid;
  v_member jsonb;
  v_question jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if nullif(trim(p_quiz ->> 'title'), '') is null then raise exception 'Quiz title is required'; end if;

  if nullif(p_quiz ->> 'id', '') is null then
    insert into public.quizzes (owner_id, title) values (auth.uid(), trim(p_quiz ->> 'title')) returning id into v_quiz_id;
  else
    v_quiz_id := (p_quiz ->> 'id')::uuid;
    update public.quizzes set title = trim(p_quiz ->> 'title')
    where id = v_quiz_id and owner_id = auth.uid();
    if not found then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
  end if;

  delete from public.questions
  where quiz_id = v_quiz_id
    and id not in (select (value ->> 'id')::uuid from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb)));

  delete from public.roster_members
  where quiz_id = v_quiz_id
    and id not in (select (value ->> 'id')::uuid from jsonb_array_elements(coalesce(p_quiz -> 'roster', '[]'::jsonb)));

  -- Move existing positions out of the way so an order swap does not collide
  -- with the unique display-order constraints during row-by-row upserts.
  update public.roster_members set display_order = display_order + 100000 where quiz_id = v_quiz_id;
  update public.questions set display_order = display_order + 100000 where quiz_id = v_quiz_id;

  for v_member in select value from jsonb_array_elements(coalesce(p_quiz -> 'roster', '[]'::jsonb))
  loop
    insert into public.roster_members (id, quiz_id, display_name, short_name, active, display_order)
    values (
      (v_member ->> 'id')::uuid, v_quiz_id, trim(v_member ->> 'displayName'),
      coalesce(v_member ->> 'shortName', ''), coalesce((v_member ->> 'active')::boolean, true),
      coalesce((v_member ->> 'displayOrder')::integer, 0)
    )
    on conflict (id) do update set
      display_name = excluded.display_name, short_name = excluded.short_name,
      active = excluded.active, display_order = excluded.display_order
    where public.roster_members.quiz_id = v_quiz_id;
  end loop;

  for v_question in select value from jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb))
  loop
    if jsonb_array_length(v_question -> 'correctMemberIds') <> 2
      or (v_question -> 'correctMemberIds' ->> 0) = (v_question -> 'correctMemberIds' ->> 1)
    then raise exception 'Every question requires exactly two different correct people'; end if;
    if not exists (
      select 1 from public.roster_members r where r.quiz_id = v_quiz_id and r.active
      and r.id in ((v_question -> 'correctMemberIds' ->> 0)::uuid, (v_question -> 'correctMemberIds' ->> 1)::uuid)
      having count(*) = 2
    ) then raise exception 'Both correct people must be active members of this quiz'; end if;

    insert into public.questions (
      id, quiz_id, image_path, first_correct_member_id, second_correct_member_id,
      time_limit_seconds, display_order, reveal_caption
    ) values (
      (v_question ->> 'id')::uuid, v_quiz_id, trim(v_question ->> 'imagePath'),
      (v_question -> 'correctMemberIds' ->> 0)::uuid, (v_question -> 'correctMemberIds' ->> 1)::uuid,
      (v_question ->> 'timeLimitSeconds')::integer,
      coalesce((v_question ->> 'displayOrder')::integer, 0), coalesce(v_question ->> 'revealCaption', '')
    )
    on conflict (id) do update set
      image_path = excluded.image_path,
      first_correct_member_id = excluded.first_correct_member_id,
      second_correct_member_id = excluded.second_correct_member_id,
      time_limit_seconds = excluded.time_limit_seconds,
      display_order = excluded.display_order,
      reveal_caption = excluded.reveal_caption
    where public.questions.quiz_id = v_quiz_id;
  end loop;

  return public.quiz_to_json(v_quiz_id);
end;
$$;

create or replace function public.host_delete_quiz(p_quiz_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.quizzes q where q.id = p_quiz_id and q.owner_id = auth.uid();
  if not found then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
end;
$$;

create or replace function public.host_launch_game(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session_id uuid; v_code text;
begin
  if not exists (select 1 from public.quizzes q where q.id = p_quiz_id and q.owner_id = auth.uid())
  then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.questions x where x.quiz_id = p_quiz_id)
  then raise exception 'Add at least one valid question before launching'; end if;
  select id into v_session_id from public.game_sessions where quiz_id = p_quiz_id and status = 'active' limit 1;
  if v_session_id is null then
    loop
      v_code := lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
      exit when not exists (select 1 from public.game_sessions where room_code = v_code and status = 'active');
    end loop;
    insert into public.game_sessions (quiz_id, room_code) values (p_quiz_id, v_code) returning id into v_session_id;
  end if;
  return public.session_to_json(v_session_id);
end;
$$;

create or replace function public.host_get_game(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_session public.game_sessions;
begin
  v_session := public.require_session_owner(p_session_id);
  return jsonb_build_object('session', public.session_to_json(p_session_id), 'quiz', public.quiz_to_json(v_session.quiz_id));
end;
$$;

create or replace function public.host_get_active_game(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.session_to_json(gs.id)
  from public.game_sessions gs join public.quizzes q on q.id = gs.quiz_id
  where gs.quiz_id = p_quiz_id and gs.status = 'active' and q.owner_id = auth.uid()
  order by gs.created_at desc limit 1
$$;

create or replace function public.join_room(p_room_code text, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_player public.players; v_token text;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then raise exception 'We could not find that room.' using errcode = 'P0001'; end if;
  if v_session.status <> 'active' then raise exception 'That room has closed.'; end if;
  if v_session.phase <> 'lobby' then raise exception 'That game has already started.'; end if;
  if char_length(trim(p_nickname)) not between 1 and 30 then raise exception 'Enter a nickname of 1–30 characters.'; end if;
  if exists (select 1 from public.players where game_session_id = v_session.id and lower(nickname) = lower(trim(p_nickname)))
  then raise exception 'That nickname is already in this game.' using errcode = '23505'; end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.players (game_session_id, nickname, reconnect_token_hash)
  values (v_session.id, trim(regexp_replace(p_nickname, '\s+', ' ', 'g')), digest(v_token, 'sha256'))
  returning * into v_player;
  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id, 'sessionId', v_player.game_session_id, 'nickname', v_player.nickname,
      'connected', v_player.connected, 'joinedAt', v_player.joined_at, 'totalScore', 0,
      'correctAnswerCount', 0, 'totalCorrectResponseMs', 0
    ),
    'reconnectToken', v_token
  );
end;
$$;

create or replace function public.reconnect_player(p_room_code text, p_player_id uuid, p_reconnect_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_player public.players;
begin
  update public.players p set connected = true, last_seen_at = now()
  from public.game_sessions gs
  where p.id = p_player_id and p.game_session_id = gs.id and gs.room_code = p_room_code
    and gs.status = 'active' and p.reconnect_token_hash = digest(p_reconnect_token, 'sha256')
  returning p.* into v_player;
  if not found then return null; end if;
  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id, 'sessionId', v_player.game_session_id, 'nickname', v_player.nickname,
      'connected', true, 'joinedAt', v_player.joined_at, 'totalScore', v_player.total_score,
      'correctAnswerCount', v_player.correct_answer_count, 'totalCorrectResponseMs', v_player.total_correct_response_ms
    ),
    'reconnectToken', p_reconnect_token
  );
end;
$$;

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_session public.game_sessions; v_quiz public.quizzes; v_question public.questions; v_reveal jsonb := null;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then return null; end if;
  select * into v_quiz from public.quizzes where id = v_session.quiz_id;
  if v_session.current_question_id is not null then select * into v_question from public.questions where id = v_session.current_question_id; end if;
  if v_session.phase in ('reveal', 'leaderboard', 'finished') and v_question.id is not null then
    v_reveal := jsonb_build_object(
      'correctMemberIds', jsonb_build_array(v_question.first_correct_member_id, v_question.second_correct_member_id),
      'correctNames', jsonb_build_array(
        (select display_name from public.roster_members where id = v_question.first_correct_member_id),
        (select display_name from public.roster_members where id = v_question.second_correct_member_id)
      ),
      'caption', v_question.reveal_caption
    );
  end if;
  return jsonb_build_object(
    'sessionId', v_session.id, 'quizTitle', v_quiz.title, 'roomCode', v_session.room_code,
    'status', v_session.status, 'phase', v_session.phase,
    'currentQuestion', case when v_question.id is null then null else jsonb_build_object(
      'id', v_question.id, 'imagePath', v_question.image_path,
      'questionNumber', v_session.current_question_index + 1,
      'totalQuestions', (select count(*) from public.questions where quiz_id = v_session.quiz_id),
      'timeLimitSeconds', v_question.time_limit_seconds
    ) end,
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'quizId', r.quiz_id, 'displayName', r.display_name, 'shortName', r.short_name,
        'active', r.active, 'displayOrder', r.display_order
      ) order by r.display_order) from public.roster_members r where r.quiz_id = v_session.quiz_id and r.active
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'sessionId', p.game_session_id, 'nickname', p.nickname, 'connected', p.connected,
        'joinedAt', p.joined_at, 'totalScore', p.total_score, 'correctAnswerCount', p.correct_answer_count,
        'totalCorrectResponseMs', p.total_correct_response_ms
      ) order by p.joined_at) from public.players p where p.game_session_id = v_session.id
    ), '[]'::jsonb),
    'submittedCount', case when v_question.id is null then 0 else (
      select count(*) from public.player_answers a where a.game_session_id = v_session.id and a.question_id = v_question.id
    ) end,
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', ranked.id, 'nickname', ranked.nickname, 'totalScore', ranked.total_score,
        'correctAnswerCount', ranked.correct_answer_count,
        'totalCorrectResponseMs', ranked.total_correct_response_ms, 'rank', ranked.rank
      ) order by ranked.rank)
      from (
        select p.*, row_number() over (
          order by p.total_score desc, p.correct_answer_count desc, p.total_correct_response_ms asc, lower(p.nickname) asc
        ) as rank from public.players p where p.game_session_id = v_session.id
      ) ranked
    ), '[]'::jsonb),
    'reveal', v_reveal,
    'questionOpenedAt', v_session.question_opened_at, 'questionClosesAt', v_session.question_closes_at
  );
end;
$$;

create or replace function public.submit_answer(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_selected_member_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_question public.questions; v_correct boolean; v_response_ms integer;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code and status = 'active' for update;
  if not found then raise exception 'This room is not active.'; end if;
  if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
  if v_session.question_closes_at is null or clock_timestamp() > v_session.question_closes_at
  then raise exception 'Time is up for this question.'; end if;
  if not exists (
    select 1 from public.players where id = p_player_id and game_session_id = v_session.id
      and reconnect_token_hash = digest(p_reconnect_token, 'sha256')
  ) then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if cardinality(p_selected_member_ids) <> 2 or p_selected_member_ids[1] = p_selected_member_ids[2]
  then raise exception 'Select exactly two different people.'; end if;
  if (select count(*) from public.roster_members r
      where r.quiz_id = v_session.quiz_id and r.active and r.id = any(p_selected_member_ids)) <> 2
  then raise exception 'Both selections must be active members of this quiz.'; end if;
  if exists (select 1 from public.player_answers where player_id = p_player_id and question_id = v_session.current_question_id)
  then raise exception 'You have already answered this question.' using errcode = '23505'; end if;

  select * into v_question from public.questions where id = v_session.current_question_id and quiz_id = v_session.quiz_id;
  if not found then raise exception 'The active question is invalid.'; end if;
  v_correct := p_selected_member_ids @> array[v_question.first_correct_member_id, v_question.second_correct_member_id]
    and array[v_question.first_correct_member_id, v_question.second_correct_member_id] @> p_selected_member_ids;
  v_response_ms := greatest(0, floor(extract(epoch from (clock_timestamp() - v_session.question_opened_at)) * 1000)::integer);

  insert into public.player_answers (
    game_session_id, question_id, player_id, first_selected_member_id, second_selected_member_id,
    response_time_ms, correct, points_awarded
  ) values (
    v_session.id, v_question.id, p_player_id, p_selected_member_ids[1], p_selected_member_ids[2],
    v_response_ms, v_correct, case when v_correct then 1 else 0 end
  );
  if v_correct then
    update public.players set
      total_score = total_score + 1,
      correct_answer_count = correct_answer_count + 1,
      total_correct_response_ms = total_correct_response_ms + v_response_ms,
      last_seen_at = now()
    where id = p_player_id;
  else
    update public.players set last_seen_at = now() where id = p_player_id;
  end if;
end;
$$;

create or replace function public.host_change_phase(p_session_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_question public.questions; v_count integer;
begin
  v_session := public.require_session_owner(p_session_id);
  if v_session.status <> 'active' and p_action <> 'restart' then raise exception 'This room is closed.'; end if;
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
      update public.game_sessions set phase = 'locked', question_closes_at = least(coalesce(question_closes_at, now()), now()) where id = p_session_id;
    when 'reveal' then
      if v_session.phase <> 'locked' then raise exception 'Lock answers before the reveal.'; end if;
      update public.game_sessions set phase = 'reveal' where id = p_session_id;
    when 'leaderboard' then
      if v_session.phase <> 'reveal' then raise exception 'Reveal the answer first.'; end if;
      update public.game_sessions set phase = 'leaderboard' where id = p_session_id;
    when 'next' then
      if v_session.phase <> 'leaderboard' then raise exception 'Show the leaderboard first.'; end if;
      select count(*) into v_count from public.questions where quiz_id = v_session.quiz_id;
      if v_session.current_question_index + 1 >= v_count then
        update public.game_sessions set phase = 'finished', ended_at = now() where id = p_session_id;
      else
        select * into v_question from public.questions where quiz_id = v_session.quiz_id
          order by display_order offset v_session.current_question_index + 1 limit 1;
        update public.game_sessions set phase = 'question', current_question_id = v_question.id,
          current_question_index = v_session.current_question_index + 1, question_opened_at = now(),
          question_closes_at = now() + make_interval(secs => v_question.time_limit_seconds)
        where id = p_session_id;
      end if;
    when 'finish' then
      update public.game_sessions set phase = 'finished', ended_at = now(), question_closes_at = least(coalesce(question_closes_at, now()), now()) where id = p_session_id;
    when 'restart' then
      delete from public.player_answers where game_session_id = p_session_id;
      update public.players set total_score = 0, correct_answer_count = 0, total_correct_response_ms = 0 where game_session_id = p_session_id;
      update public.game_sessions set status = 'active', phase = 'lobby', current_question_id = null, current_question_index = 0,
        question_opened_at = null, question_closes_at = null, started_at = null, ended_at = null where id = p_session_id;
    when 'close' then
      update public.game_sessions set status = 'closed', phase = 'finished', ended_at = now() where id = p_session_id;
    else raise exception 'Unknown host action';
  end case;
end;
$$;

create or replace function public.host_start_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'start') $$;
create or replace function public.host_lock_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'lock') $$;
create or replace function public.host_reveal_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'reveal') $$;
create or replace function public.host_leaderboard_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'leaderboard') $$;
create or replace function public.host_next_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'next') $$;
create or replace function public.host_finish_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'finish') $$;
create or replace function public.host_restart_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'restart') $$;
create or replace function public.host_close_game(p_session_id uuid) returns void language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'close') $$;

revoke all on function public.require_session_owner(uuid) from public, anon;
revoke all on function public.quiz_to_json(uuid) from public, anon;
revoke all on function public.session_to_json(uuid) from public, anon;
grant execute on function public.host_list_quizzes() to authenticated;
grant execute on function public.host_get_quiz(uuid) to authenticated;
grant execute on function public.host_save_quiz(jsonb) to authenticated;
grant execute on function public.host_delete_quiz(uuid) to authenticated;
grant execute on function public.host_launch_game(uuid) to authenticated;
grant execute on function public.host_get_game(uuid) to authenticated;
grant execute on function public.host_get_active_game(uuid) to authenticated;
grant execute on function public.host_start_game(uuid) to authenticated;
grant execute on function public.host_lock_game(uuid) to authenticated;
grant execute on function public.host_reveal_game(uuid) to authenticated;
grant execute on function public.host_leaderboard_game(uuid) to authenticated;
grant execute on function public.host_next_game(uuid) to authenticated;
grant execute on function public.host_finish_game(uuid) to authenticated;
grant execute on function public.host_restart_game(uuid) to authenticated;
grant execute on function public.host_close_game(uuid) to authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.reconnect_player(text, uuid, text) to anon, authenticated;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
grant execute on function public.submit_answer(text, uuid, text, uuid[]) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.game_sessions;
  alter publication supabase_realtime add table public.players;
  alter publication supabase_realtime add table public.player_answers;
exception when duplicate_object then null;
end $$;
