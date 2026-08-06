-- Add an archive-first quiz lifecycle and return only unreferenced media for
-- best-effort cleanup through the authenticated Supabase Storage client.

alter table public.quizzes
  add column archived_at timestamptz;

create index quizzes_owner_archive_updated
  on public.quizzes (owner_id, archived_at, updated_at desc);

create or replace function public.enforce_quiz_archive_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
    and old.archived_at is null
    and new.archived_at is not null
    and exists (
      select 1 from public.game_sessions gs
      where gs.quiz_id = old.id and gs.status = 'active'
    )
  then
    raise exception 'Close the active game before archiving this quiz.';
  end if;

  if tg_op = 'DELETE' and auth.uid() is not null then
    if old.archived_at is null then
      raise exception 'Archive this quiz before permanently deleting it.';
    end if;
    if exists (
      select 1 from public.game_sessions gs
      where gs.quiz_id = old.id and gs.status = 'active'
    ) then
      raise exception 'Close the active game before permanently deleting this quiz.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger quizzes_enforce_archive_lifecycle
before update of archived_at or delete on public.quizzes
for each row execute function public.enforce_quiz_archive_lifecycle();

revoke all on function public.enforce_quiz_archive_lifecycle() from public, anon, authenticated;

create or replace function public.quiz_to_json(p_quiz_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'title', q.title, 'archivedAt', q.archived_at,
    'createdAt', q.created_at, 'updatedAt', q.updated_at,
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

create or replace function public.host_archive_quiz(p_quiz_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_quiz public.quizzes;
begin
  select q.* into v_quiz
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Quiz not found or unauthorised' using errcode = '42501';
  end if;
  if v_quiz.archived_at is not null then
    raise exception 'That quiz is already archived.';
  end if;
  if exists (
    select 1 from public.game_sessions gs
    where gs.quiz_id = p_quiz_id and gs.status = 'active'
  ) then
    raise exception 'Close the active game before archiving this quiz.';
  end if;

  update public.quizzes set archived_at = now() where id = p_quiz_id;
end;
$$;

create or replace function public.host_restore_quiz(p_quiz_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_quiz public.quizzes;
begin
  select q.* into v_quiz
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Quiz not found or unauthorised' using errcode = '42501';
  end if;
  if v_quiz.archived_at is null then
    raise exception 'That quiz is not archived.';
  end if;

  update public.quizzes set archived_at = null where id = p_quiz_id;
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
begin
  select q.archived_at into v_archived_at
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Quiz not found or unauthorised' using errcode = '42501';
  end if;
  if v_archived_at is not null then
    raise exception 'Restore this quiz before launching it.';
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

-- The original delete RPC must not bypass the archive-first lifecycle.
revoke all on function public.host_delete_quiz(uuid) from public, anon, authenticated;

revoke all on function public.host_list_archived_quizzes() from public, anon;
revoke all on function public.host_archive_quiz(uuid) from public, anon;
revoke all on function public.host_restore_quiz(uuid) from public, anon;
revoke all on function public.host_permanently_delete_quiz(uuid) from public, anon;

grant execute on function public.host_list_archived_quizzes() to authenticated;
grant execute on function public.host_archive_quiz(uuid) to authenticated;
grant execute on function public.host_restore_quiz(uuid) to authenticated;
grant execute on function public.host_permanently_delete_quiz(uuid) to authenticated;
