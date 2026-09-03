-- Core Rounds. Apply once, in chronological order after Visual Pinpoint Targets.
-- The legacy round ID equals the quiz ID (separate identity namespaces), making
-- the backfill deterministic without changing any question order or intro timing.
create table public.quiz_rounds (
  id uuid primary key,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 80),
  subtitle text not null default '' check (length(subtitle) <= 200),
  display_order integer not null check (display_order >= 0),
  intro_enabled boolean not null default false,
  unique (quiz_id, id),
  unique (quiz_id, display_order) deferrable initially deferred
);
alter table public.quiz_rounds enable row level security;
revoke all on public.quiz_rounds from public, anon, authenticated;
grant select on public.quiz_rounds to authenticated;
create policy "Owners read quiz rounds" on public.quiz_rounds for select to authenticated
using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = (select auth.uid())));

insert into public.quiz_rounds(id, quiz_id, title, display_order)
select id, id, 'Round 1', 0 from public.quizzes;
alter table public.questions add column round_id uuid;
update public.questions set round_id = quiz_id;
alter table public.questions alter column round_id set not null;
alter table public.questions add constraint questions_round_same_quiz_fk
  foreign key (quiz_id, round_id) references public.quiz_rounds(quiz_id, id);
create index questions_round_order_idx on public.questions(quiz_id, round_id, display_order);

alter table public.game_sessions add column current_round_id uuid;
update public.game_sessions s set current_round_id = coalesce(
  (select x.round_id from public.questions x where x.id = s.current_question_id and x.quiz_id = s.quiz_id), s.quiz_id);
alter table public.game_sessions add constraint sessions_round_same_quiz_fk
  foreign key (quiz_id, current_round_id) references public.quiz_rounds(quiz_id, id)
  on delete set null (current_round_id);
create index game_sessions_round_idx on public.game_sessions(quiz_id, current_round_id);
alter table public.game_sessions drop constraint game_sessions_phase_check;
alter table public.game_sessions add constraint game_sessions_phase_check
  check (phase in ('lobby', 'round-intro', 'question', 'locked', 'reveal', 'leaderboard', 'finished'));
alter table public.game_sessions add constraint round_intro_has_no_live_question check (
  phase <> 'round-intro' or (current_round_id is not null and current_question_id is null
    and question_opened_at is null and question_closes_at is null));

create function public.create_default_quiz_round() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.quiz_rounds(id, quiz_id, title, display_order) values (new.id, new.id, 'Round 1', 0);
  return new;
end;
$$;
revoke all on function public.create_default_quiz_round() from public, anon, authenticated;
create trigger quizzes_default_round after insert on public.quizzes
for each row execute function public.create_default_quiz_round();

-- Deferred checks allow moving questions and replacing the initial default in
-- one atomic save, but reject a committed zero-round or multi-round H2H quiz.
create function public.check_quiz_round_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_type text; v_count integer;
begin
  if tg_table_name = 'quizzes' then v_id := new.id;
  else v_id := coalesce(new.quiz_id, old.quiz_id); end if;
  select quiz_type into v_type from public.quizzes where id = v_id;
  if not found then return null; end if;
  select count(*) into v_count from public.quiz_rounds where quiz_id = v_id;
  if v_count = 0 or (v_type = 'head-to-head' and v_count <> 1) then
    raise exception 'A quiz needs at least one round; Head-to-Head requires exactly one.';
  end if;
  return null;
end;
$$;
revoke all on function public.check_quiz_round_count() from public, anon, authenticated;
create constraint trigger rounds_count_check after insert or update or delete on public.quiz_rounds
deferrable initially deferred for each row execute function public.check_quiz_round_count();
create constraint trigger quizzes_round_count_check after insert or update on public.quizzes
deferrable initially deferred for each row execute function public.check_quiz_round_count();

-- Called inside the retained save only AFTER its owner check and quiz row lock.
-- Incoming quizId fields describe a portable/duplicate draft; child IDs and
-- round references must still be unique and cannot reuse another quiz's rows.
create function public.prepare_quiz_round_save(p_quiz_id uuid, p_quiz jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare v_round jsonb; v_rounds jsonb; v_question jsonb; v_questions jsonb := '[]'; v_default uuid; v_type text;
begin
  select quiz_type into v_type from public.quizzes where id = p_quiz_id and owner_id = auth.uid();
  if not found then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
  if not (p_quiz ? 'rounds') then
    if (select count(*) from public.quiz_rounds where quiz_id = p_quiz_id) <> 1 then
      raise exception 'Reload the editor before saving a quiz with multiple rounds.';
    end if;
    select id into v_default from public.quiz_rounds where quiz_id = p_quiz_id;
    select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'subtitle', subtitle,
      'displayOrder', display_order, 'introEnabled', intro_enabled)) into v_rounds
    from public.quiz_rounds where quiz_id = p_quiz_id;
  else
    v_rounds := p_quiz->'rounds';
  end if;
  if jsonb_typeof(v_rounds) is distinct from 'array' then raise exception 'Rounds must be an array.'; end if;
  if jsonb_array_length(v_rounds) = 0 or (v_type = 'head-to-head' and jsonb_array_length(v_rounds) <> 1) then
    raise exception 'A quiz needs at least one round; Head-to-Head requires exactly one.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rounds) r group by r->>'id' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(v_rounds) r group by r->>'displayOrder' having count(*) > 1)
  then raise exception 'Round IDs and positions must be unique.'; end if;
  for v_round in select value from jsonb_array_elements(v_rounds) loop
    if jsonb_typeof(v_round) is distinct from 'object'
      or jsonb_typeof(v_round->'id') is distinct from 'string'
      or jsonb_typeof(v_round->'title') is distinct from 'string'
      or jsonb_typeof(v_round->'subtitle') is distinct from 'string'
      or jsonb_typeof(v_round->'introEnabled') is distinct from 'boolean'
      or jsonb_typeof(v_round->'displayOrder') is distinct from 'number'
      or (v_round->>'displayOrder') !~ '^[0-9]+$'
    then raise exception 'Invalid round metadata.'; end if;
    if exists (select 1 from public.quiz_rounds where id = (v_round->>'id')::uuid and quiz_id <> p_quiz_id) then
      raise exception 'Round belongs to another quiz.' using errcode = '42501';
    end if;
    insert into public.quiz_rounds(id, quiz_id, title, subtitle, display_order, intro_enabled)
    values ((v_round->>'id')::uuid, p_quiz_id, v_round->>'title', v_round->>'subtitle',
      (v_round->>'displayOrder')::integer, (v_round->>'introEnabled')::boolean)
    on conflict(id) do update set title = excluded.title, subtitle = excluded.subtitle,
      display_order = excluded.display_order, intro_enabled = excluded.intro_enabled
    where public.quiz_rounds.quiz_id = p_quiz_id;
  end loop;
  for v_question in select value from jsonb_array_elements(coalesce(p_quiz->'questions', '[]')) loop
    if not (p_quiz ? 'rounds') then v_question := v_question || jsonb_build_object('roundId', v_default); end if;
    if jsonb_typeof(v_question->'roundId') is distinct from 'string' or not exists (
      select 1 from jsonb_array_elements(v_rounds) r where r->>'id' = v_question->>'roundId'
    ) then raise exception 'Every question must reference a round in this quiz.'; end if;
    if exists (select 1 from public.questions where id = (v_question->>'id')::uuid and quiz_id <> p_quiz_id) then
      raise exception 'Question belongs to another quiz.' using errcode = '42501';
    end if;
    v_questions := v_questions || jsonb_build_array(v_question);
  end loop;
  -- Keep the existing global display_order constraint, deriving it from the
  -- round order and authored within-round positions rather than trusting input.
  select coalesce(jsonb_agg(q || jsonb_build_object('displayOrder', n - 1) order by n), '[]') into v_questions from (
    select q, row_number() over (order by (r->>'displayOrder')::integer, (q->>'displayOrder')::integer, q->>'id') n
    from jsonb_array_elements(v_questions) q join jsonb_array_elements(v_rounds) r on r->>'id' = q->>'roundId'
  ) ordered;
  return p_quiz || jsonb_build_object('rounds', v_rounds, 'questions', v_questions);
end;
$$;
revoke all on function public.prepare_quiz_round_save(uuid,jsonb) from public, anon, authenticated;

create function public.safe_round_to_json(p_quiz_id uuid, p_round_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', r.id, 'title', r.title, 'subtitle', r.subtitle,
    'introEnabled', r.intro_enabled, 'roundNumber', r.number, 'totalRounds', r.total,
    'questionCount', (select count(*) from public.questions x where x.quiz_id = p_quiz_id and x.round_id = r.id))
  from (select *, row_number() over (order by display_order, id) number, count(*) over () total
    from public.quiz_rounds where quiz_id = p_quiz_id) r where r.id = p_round_id
$$;
revoke all on function public.safe_round_to_json(uuid,uuid) from public, anon, authenticated;

-- Patch exact retained definitions in place: their wrapper identities, owner
-- checks and grants remain unchanged. Every replacement is required to match.
create function pg_temp.patch_round_function(p_signature text, p_old text, p_new text) returns void
language plpgsql as $$
declare v_definition text;
begin
  v_definition := replace(pg_get_functiondef(p_signature::regprocedure), E'\r\n', E'\n');
  if position(p_old in v_definition) = 0 then raise exception 'Expected Core Rounds patch missing in %: %', p_signature, p_old; end if;
  execute replace(v_definition, p_old, p_new);
end;
$$;

select pg_temp.patch_round_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$  if v_quiz_type = 'standard' then$old$,
  $new$  p_quiz := public.prepare_quiz_round_save(v_quiz_id, p_quiz);
  if v_quiz_type = 'standard' then$new$);
-- The preceding fragment occurs twice in the retained function. The second call
-- is harmless, but avoid it: only prepare before the initial Standard validation.
select pg_temp.patch_round_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$  end loop;

  p_quiz := public.prepare_quiz_round_save(v_quiz_id, p_quiz);$old$,
  $new$  end loop;$new$);
select pg_temp.patch_round_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$id, quiz_id, question_type, prompt$old$, $new$id, quiz_id, round_id, question_type, prompt$new$);
select pg_temp.patch_round_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$v_question_id, v_quiz_id, v_type, trim$old$, $new$v_question_id, v_quiz_id, (v_question->>'roundId')::uuid, v_type, trim$new$);
select pg_temp.patch_round_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$question_type = excluded.question_type, prompt$old$, $new$round_id = excluded.round_id, question_type = excluded.question_type, prompt$new$);
select pg_temp.patch_round_function('public.host_save_quiz_without_standard_scoring(jsonb)',
  $old$  return public.quiz_to_json(v_quiz_id);$old$,
  $new$  delete from public.quiz_rounds where quiz_id = v_quiz_id and id not in (
    select (r->>'id')::uuid from jsonb_array_elements(p_quiz->'rounds') r);
  return public.quiz_to_json(v_quiz_id);$new$);

select pg_temp.patch_round_function('public.question_to_json(uuid,boolean)',
  $old$'quizId', x.quiz_id,$old$, $new$'quizId', x.quiz_id, 'roundId', x.round_id,$new$);
select pg_temp.patch_round_function('public.quiz_to_json(uuid)',
  $old$'soundPackId', q.sound_pack_id$old$,
  $new$'soundPackId', q.sound_pack_id,
    'rounds', (select jsonb_agg(jsonb_build_object('id', r.id, 'quizId', r.quiz_id,
      'title', r.title, 'subtitle', r.subtitle, 'introEnabled', r.intro_enabled,
      'displayOrder', r.display_order) order by r.display_order, r.id) from public.quiz_rounds r where r.quiz_id = q.id),
    'questions', coalesce((select jsonb_agg(public.question_to_json(x.id, true) order by r.display_order, x.display_order, x.id)
      from public.questions x join public.quiz_rounds r on r.id = x.round_id and r.quiz_id = x.quiz_id where x.quiz_id = q.id), '[]'::jsonb)$new$);
select pg_temp.patch_round_function('public.session_to_json(uuid)',
  $old$'questionOrder', to_jsonb(s.question_order),$old$, $new$'questionOrder', to_jsonb(s.question_order), 'currentRoundId', s.current_round_id,$new$);
select pg_temp.patch_round_function('public.get_player_game_state(text)',
  $old$'soundPackId', v_session.sound_pack_id,$old$,
  $new$'soundPackId', v_session.sound_pack_id,
    'currentRound', public.safe_round_to_json(v_session.quiz_id, v_session.current_round_id),$new$);
-- The soundPackId fragment also occurs inside sessionSettings; remove that
-- duplicate insertion so safe round metadata has one defined top-level home.
select pg_temp.patch_round_function('public.get_player_game_state(text)',
  $old$'sessionSettings', jsonb_build_object(
      'soundPackId', v_session.sound_pack_id,
    'currentRound', public.safe_round_to_json(v_session.quiz_id, v_session.current_round_id),$old$,
  $new$'sessionSettings', jsonb_build_object(
      'soundPackId', v_session.sound_pack_id,$new$);

select pg_temp.patch_round_function('public.host_launch_game(uuid,jsonb)',
  $old$  select array_agg(x.id order by case when v_shuffle_questions then random() end, x.display_order)
    into v_question_order from public.questions x where x.quiz_id = p_quiz_id;$old$,
  $new$  if exists (select 1 from public.quiz_rounds r where r.quiz_id = p_quiz_id and not exists (
    select 1 from public.questions x where x.quiz_id = p_quiz_id and x.round_id = r.id)) then
    raise exception 'Add a question to every round before launching.';
  end if;
  select array_agg(x.id order by r.display_order, r.id, case when v_shuffle_questions then random() end, x.display_order, x.id)
    into v_question_order from public.questions x join public.quiz_rounds r on r.id = x.round_id and r.quiz_id = x.quiz_id
    where x.quiz_id = p_quiz_id;$new$);
select pg_temp.patch_round_function('public.host_launch_game(uuid,jsonb)',
  $old$quiz_id, room_code, sound_pack_id, double_score_intro_ms,$old$,
  $new$quiz_id, current_round_id, room_code, sound_pack_id, double_score_intro_ms,$new$);
select pg_temp.patch_round_function('public.host_launch_game(uuid,jsonb)',
  $old$p_quiz_id, v_code, v_pack, v_double_score_ms,$old$,
  $new$p_quiz_id, (select round_id from public.questions where id = v_question_order[1]), v_code, v_pack, v_double_score_ms,$new$);

-- Serialise competing host actions BEFORE testing phase/index. Submission's
-- existing shared row locks still conflict with this exclusive phase lock.
select pg_temp.patch_round_function('public.host_change_phase(uuid,text)',
  $old$v_session := public.require_session_owner(p_session_id);$old$,
  $new$v_session := public.require_session_owner(p_session_id);
  select * into v_session from public.game_sessions where id = p_session_id for update;$new$);
select pg_temp.patch_round_function('public.host_change_phase(uuid,text)',
  $old$when 'start' then
      if v_session.phase <> 'lobby' then raise exception 'The game has already started.'; end if;
      select * into v_question from public.questions where id = v_session.question_order[1] and quiz_id = v_session.quiz_id;$old$,
  $new$when 'start', 'start-round' then
      if (p_action = 'start' and v_session.phase <> 'lobby') or
        (p_action = 'start-round' and v_session.phase <> 'round-intro') then raise exception 'The game cannot start from this phase.'; end if;
      select * into v_question from public.questions where id = v_session.question_order[
        case when p_action = 'start' then 1 else v_session.current_question_index + 1 end] and quiz_id = v_session.quiz_id;$new$);
select pg_temp.patch_round_function('public.host_change_phase(uuid,text)',
  $old$      if not found then raise exception 'This quiz has no questions.'; end if;$old$,
  $new$      if not found then raise exception 'This quiz has no questions.'; end if;
      if p_action = 'start' and (select intro_enabled from public.quiz_rounds where id = v_question.round_id) then
        update public.game_sessions set phase = 'round-intro', current_round_id = v_question.round_id,
          current_question_id = null, current_question_index = 0, started_at = coalesce(started_at, v_now),
          question_opened_at = null, question_closes_at = null, current_double_score_variant_index = null where id = p_session_id;
        return;
      end if;$new$);
select pg_temp.patch_round_function('public.host_change_phase(uuid,text)',
  $old$current_question_id = v_question.id, current_question_index = 0,$old$,
  $new$current_question_id = v_question.id, current_round_id = v_question.round_id,
        current_question_index = case when p_action = 'start' then 0 else v_session.current_question_index end,$new$);
select pg_temp.patch_round_function('public.host_change_phase(uuid,text)',
  $old$      if not found then raise exception 'The next question is unavailable.'; end if;$old$,
  $new$      if not found then raise exception 'The next question is unavailable.'; end if;
      if v_question.round_id is distinct from v_session.current_round_id and
        (select intro_enabled from public.quiz_rounds where id = v_question.round_id) then
        update public.game_sessions set phase = 'round-intro', current_round_id = v_question.round_id,
          current_question_id = null, current_question_index = v_session.current_question_index + 1,
          question_opened_at = null, question_closes_at = null, current_double_score_variant_index = null where id = p_session_id;
        return;
      end if;$new$);
select pg_temp.patch_round_function('public.host_change_phase(uuid,text)',
  $old$current_question_id = v_question.id,
        current_question_index = v_session.current_question_index + 1$old$,
  $new$current_question_id = v_question.id, current_round_id = v_question.round_id,
        current_question_index = v_session.current_question_index + 1$new$);
select pg_temp.patch_round_function('public.host_change_phase(uuid,text)',
  $old$current_question_index = 0, question_opened_at = null, question_closes_at = null,$old$,
  $new$current_question_index = 0, current_round_id = (select round_id from public.questions where id = v_session.question_order[1]),
        question_opened_at = null, question_closes_at = null,$new$);

create function public.host_start_round_game(p_session_id uuid) returns void
language sql security definer set search_path = public as $$ select public.host_change_phase(p_session_id, 'start-round') $$;
revoke all on function public.host_start_round_game(uuid) from public, anon;
grant execute on function public.host_start_round_game(uuid) to authenticated;

-- Existing GameSession broadcasts watch phase and current_question_index. Every
-- intro/start/next transition changes these columns, so no new channel or fan-out
-- is needed. Head-to-Head retains its existing one-round competitor flow.
drop function pg_temp.patch_round_function(text,text,text);
