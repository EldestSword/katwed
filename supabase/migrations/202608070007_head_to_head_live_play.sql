-- Enable two-player Head-to-Head live play on top of the authored foundation.
-- Standard games retain their existing host-controlled timed phase loop.

alter table public.players
  add column competitor_id uuid references public.quiz_competitors(id) on delete restrict;

create unique index players_one_claim_per_competitor
  on public.players (game_session_id, competitor_id)
  where competitor_id is not null;

alter table public.player_answers
  add column resolution_status text not null default 'answered'
  check (resolution_status in ('answered', 'skipped'));

create or replace function public.validate_player_competitor()
returns trigger language plpgsql set search_path = public as $$
declare
  v_quiz_id uuid;
  v_quiz_type text;
begin
  select gs.quiz_id, q.quiz_type into v_quiz_id, v_quiz_type
  from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id
  where gs.id = new.game_session_id;

  if v_quiz_type = 'head-to-head' then
    if new.competitor_id is null or not exists (
      select 1 from public.quiz_competitors c
      where c.id = new.competitor_id and c.quiz_id = v_quiz_id
    ) then
      raise exception 'A Head-to-Head player must claim a competitor from this quiz.';
    end if;
  elsif new.competitor_id is not null then
    raise exception 'Standard players cannot claim a Head-to-Head competitor.';
  end if;
  return new;
end;
$$;

create trigger players_validate_competitor
before insert or update of game_session_id, competitor_id on public.players
for each row execute function public.validate_player_competitor();

create or replace function public.host_launch_game(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session_id uuid;
  v_code text;
  v_archived_at timestamptz;
  v_quiz_type text;
begin
  select q.archived_at, q.quiz_type into v_archived_at, v_quiz_type
  from public.quizzes q
  where q.id = p_quiz_id and q.owner_id = auth.uid()
  for update;
  if not found then raise exception 'Quiz not found or unauthorised' using errcode = '42501'; end if;
  if v_archived_at is not null then raise exception 'Restore this quiz before launching it.'; end if;
  if not exists (select 1 from public.questions x where x.quiz_id = p_quiz_id) then
    raise exception 'Add at least one valid question before launching';
  end if;
  if v_quiz_type = 'head-to-head' then
    if (select count(*) from public.quiz_competitors where quiz_id = p_quiz_id) <> 2 then
      raise exception 'Head-to-Head quizzes need exactly two competitors.';
    end if;
    if exists (
      select 1 from public.questions x
      where x.quiz_id = p_quiz_id and (
        x.assigned_competitor_id is null or not exists (
          select 1 from public.quiz_competitors c
          where c.quiz_id = p_quiz_id and c.id = x.assigned_competitor_id
        )
      )
    ) then raise exception 'Assign every question to a valid competitor before launching.'; end if;
  end if;

  select id into v_session_id from public.game_sessions
  where quiz_id = p_quiz_id and status = 'active'
  order by created_at desc limit 1;

  if v_session_id is null then
    loop
      v_code := lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
      exit when not exists (select 1 from public.game_sessions where room_code = v_code);
    end loop;
    insert into public.game_sessions (quiz_id, room_code)
    values (p_quiz_id, v_code) returning id into v_session_id;
  end if;
  return public.session_to_json(v_session_id);
end;
$$;

create or replace function public.get_room_join_info(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_quiz public.quizzes;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then return null; end if;
  select * into v_quiz from public.quizzes where id = v_session.quiz_id;
  return jsonb_build_object(
    'roomCode', v_session.room_code,
    'quizTitle', v_quiz.title,
    'quizType', v_quiz.quiz_type,
    'status', v_session.status,
    'phase', v_session.phase,
    'headToHeadCompetitors', case when v_quiz.quiz_type = 'head-to-head' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'competitorId', c.id,
        'displayName', c.display_name,
        'displayOrder', c.display_order,
        'claimed', p.id is not null,
        'connected', coalesce(p.connected, false)
      ) order by c.display_order)
      from public.quiz_competitors c
      left join public.players p on p.game_session_id = v_session.id and p.competitor_id = c.id
      where c.quiz_id = v_quiz.id
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.join_room(p_room_code text, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_player public.players; v_token text; v_quiz_type text;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code for update;
  if not found then raise exception 'We could not find that room.' using errcode = 'P0001'; end if;
  if v_session.status <> 'active' then raise exception 'That room has closed.'; end if;
  if v_session.phase <> 'lobby' then raise exception 'That game has already started.'; end if;
  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  if v_quiz_type = 'head-to-head' then raise exception 'Choose one of the two Head-to-Head competitors instead.'; end if;
  if char_length(trim(p_nickname)) not between 1 and 30 then raise exception 'Enter a nickname of 1–30 characters.'; end if;
  if exists (select 1 from public.players where game_session_id = v_session.id and lower(nickname) = lower(trim(p_nickname)))
  then raise exception 'That nickname is already in this game.' using errcode = '23505'; end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.players (game_session_id, nickname, reconnect_token_hash, competitor_id)
  values (v_session.id, trim(regexp_replace(p_nickname, '\s+', ' ', 'g')), extensions.digest(v_token, 'sha256'), null)
  returning * into v_player;
  return jsonb_build_object('player', jsonb_build_object(
    'id', v_player.id, 'sessionId', v_player.game_session_id, 'nickname', v_player.nickname,
    'competitorId', null, 'connected', v_player.connected, 'joinedAt', v_player.joined_at,
    'totalScore', 0, 'correctAnswerCount', 0, 'totalCorrectResponseMs', 0
  ), 'reconnectToken', v_token);
end;
$$;

create or replace function public.join_head_to_head_room(p_room_code text, p_competitor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_player public.players;
  v_competitor public.quiz_competitors;
  v_token text;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code for update;
  if not found then raise exception 'We could not find that room.' using errcode = 'P0001'; end if;
  if v_session.status <> 'active' then raise exception 'That room has closed.'; end if;
  if v_session.phase <> 'lobby' then raise exception 'That game has already started.'; end if;
  if not exists (select 1 from public.quizzes where id = v_session.quiz_id and quiz_type = 'head-to-head') then
    raise exception 'This room uses ordinary nickname joining.';
  end if;
  select * into v_competitor from public.quiz_competitors
  where id = p_competitor_id and quiz_id = v_session.quiz_id;
  if not found then raise exception 'Choose a valid competitor.'; end if;
  if exists (select 1 from public.players where game_session_id = v_session.id and competitor_id = p_competitor_id) then
    raise exception '% has already joined this game.', v_competitor.display_name using errcode = '23505';
  end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.players (game_session_id, nickname, reconnect_token_hash, competitor_id)
  values (v_session.id, v_competitor.display_name, extensions.digest(v_token, 'sha256'), v_competitor.id)
  returning * into v_player;
  return jsonb_build_object('player', jsonb_build_object(
    'id', v_player.id, 'sessionId', v_player.game_session_id, 'nickname', v_player.nickname,
    'competitorId', v_player.competitor_id, 'connected', v_player.connected, 'joinedAt', v_player.joined_at,
    'totalScore', 0, 'correctAnswerCount', 0, 'totalCorrectResponseMs', 0
  ), 'reconnectToken', v_token);
end;
$$;

create or replace function public.reconnect_player(p_room_code text, p_player_id uuid, p_reconnect_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_player public.players; v_scores_visible boolean; v_quiz_type text;
begin
  update public.players p set connected = true, last_seen_at = now()
  from public.game_sessions gs
  where p.id = p_player_id and p.game_session_id = gs.id and gs.room_code = p_room_code
    and gs.status = 'active' and p.reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256')
  returning p.* into v_player;
  if not found then return null; end if;
  select gs.phase in ('leaderboard', 'finished'), q.quiz_type into v_scores_visible, v_quiz_type
  from public.game_sessions gs join public.quizzes q on q.id = gs.quiz_id
  where gs.id = v_player.game_session_id;
  v_scores_visible := v_scores_visible or v_quiz_type = 'head-to-head';
  return jsonb_build_object('player', jsonb_build_object(
    'id', v_player.id, 'sessionId', v_player.game_session_id, 'nickname', v_player.nickname,
    'competitorId', v_player.competitor_id, 'connected', true, 'joinedAt', v_player.joined_at,
    'totalScore', case when v_scores_visible then v_player.total_score else 0 end,
    'correctAnswerCount', case when v_scores_visible then v_player.correct_answer_count else 0 end,
    'totalCorrectResponseMs', case when v_scores_visible then v_player.total_correct_response_ms else 0 end
  ), 'reconnectToken', p_reconnect_token);
end;
$$;

create or replace function public.start_head_to_head_game(
  p_room_code text, p_player_id uuid, p_reconnect_token text
) returns void language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_question public.questions;
begin
  select gs.* into v_session from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id and q.quiz_type = 'head-to-head'
  where gs.room_code = p_room_code and gs.status = 'active' for update of gs;
  if not found then raise exception 'This Head-to-Head room is not active.'; end if;
  if not exists (select 1 from public.players where id = p_player_id and game_session_id = v_session.id and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256'))
  then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if v_session.phase <> 'lobby' then return; end if;
  if (select count(*) from public.players where game_session_id = v_session.id and competitor_id is not null) <> 2 then
    raise exception 'Both competitors must join before the game can start.';
  end if;
  select * into v_question from public.questions where quiz_id = v_session.quiz_id order by display_order limit 1;
  if not found then raise exception 'This quiz has no questions.'; end if;
  update public.game_sessions set phase = 'question', current_question_id = v_question.id,
    current_question_index = 0, started_at = coalesce(started_at, now()),
    question_opened_at = now(), question_closes_at = null
  where id = v_session.id;
end;
$$;

create or replace function public.reveal_head_to_head_if_complete(p_session_id uuid, p_question_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.players where game_session_id = p_session_id) = 2
    and (select count(*) from public.player_answers where game_session_id = p_session_id and question_id = p_question_id) = 2
  then
    update public.game_sessions set phase = 'reveal'
    where id = p_session_id and phase = 'question' and current_question_id = p_question_id;
  end if;
end;
$$;

create or replace function public.submit_answer(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_answer jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_question public.questions; v_player public.players;
  v_quiz_type text; v_correct boolean := false; v_points integer := 0; v_response_ms integer;
  v_selected text[]; v_correct_ids text[]; v_value numeric; v_x numeric; v_y numeric; v_assigned boolean;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code and status = 'active' for update;
  if not found then raise exception 'This room is not active.'; end if;
  if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  if v_quiz_type = 'standard' and (v_session.question_closes_at is null or clock_timestamp() > v_session.question_closes_at) then
    raise exception 'Time is up for this question.';
  end if;
  select * into v_player from public.players where id = p_player_id and game_session_id = v_session.id
    and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256');
  if not found then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if exists (select 1 from public.player_answers where player_id = p_player_id and question_id = v_session.current_question_id)
  then raise exception 'You have already resolved this question.' using errcode = '23505'; end if;
  select * into v_question from public.questions where id = v_session.current_question_id and quiz_id = v_session.quiz_id;
  if p_answer ->> 'type' <> v_question.question_type then raise exception 'Answer type does not match the question'; end if;

  case v_question.question_type
    when 'single-choice' then
      if not exists (select 1 from public.question_options where question_id = v_question.id and id = (p_answer ->> 'optionId')::uuid)
      then raise exception 'Invalid option'; end if;
      v_correct := p_answer ->> 'optionId' = v_question.answer_key ->> 'correctOptionId';
    when 'multiple-select' then
      select array_agg(value) into v_selected from jsonb_array_elements_text(p_answer -> 'optionIds');
      select array_agg(value) into v_correct_ids from jsonb_array_elements_text(v_question.answer_key -> 'correctOptionIds');
      if cardinality(v_selected) not between (v_question.type_config ->> 'minimumSelections')::integer and (v_question.type_config ->> 'maximumSelections')::integer
        or cardinality(v_selected) <> cardinality(array(select distinct unnest(v_selected)))
        or exists (select 1 from unnest(v_selected) id where not exists (select 1 from public.question_options where question_id = v_question.id and question_options.id = id::uuid))
      then raise exception 'Invalid option selection'; end if;
      v_correct := v_selected @> v_correct_ids and v_correct_ids @> v_selected;
      if v_question.type_config ->> 'scoringMode' = 'partial-wipeout'
        and not exists (select 1 from unnest(v_selected) id where not id = any(v_correct_ids))
      then v_points := floor(v_question.points * cardinality(v_selected)::numeric / cardinality(v_correct_ids)); end if;
    when 'true-false' then
      if jsonb_typeof(p_answer -> 'value') <> 'boolean' then raise exception 'A Boolean answer is required'; end if;
      v_correct := (p_answer ->> 'value')::boolean = (v_question.answer_key ->> 'correctValue')::boolean;
    when 'slider' then
      v_value := (p_answer ->> 'value')::numeric;
      if v_value not between (v_question.type_config ->> 'minimum')::numeric and (v_question.type_config ->> 'maximum')::numeric
        or abs(mod(v_value - (v_question.type_config ->> 'minimum')::numeric, (v_question.type_config ->> 'step')::numeric)) > 0.00000001
      then raise exception 'Invalid slider value'; end if;
      v_correct := abs(v_value - (v_question.answer_key ->> 'correctValue')::numeric) <= (v_question.answer_key ->> 'tolerance')::numeric;
    when 'pinpoint' then
      v_x := (p_answer ->> 'x')::numeric; v_y := (p_answer ->> 'y')::numeric;
      if v_x not between 0 and 1 or v_y not between 0 and 1 then raise exception 'Coordinates must be between 0 and 1'; end if;
      v_correct := sqrt(power(v_x - (v_question.answer_key ->> 'targetX')::numeric, 2)
        + power(v_y - (v_question.answer_key ->> 'targetY')::numeric, 2)) <= (v_question.answer_key ->> 'targetRadius')::numeric;
    when 'mashup' then
      select array_agg(value) into v_selected from jsonb_array_elements_text(p_answer -> 'memberIds');
      select array_agg(value) into v_correct_ids from jsonb_array_elements_text(v_question.answer_key -> 'correctMemberIds');
      if cardinality(v_selected) <> 2 or v_selected[1] = v_selected[2]
        or (select count(*) from public.roster_members where quiz_id = v_session.quiz_id and active and id::text = any(v_selected)) <> 2
      then raise exception 'Select exactly two different active people'; end if;
      v_correct := v_selected @> v_correct_ids and v_correct_ids @> v_selected;
  end case;

  v_assigned := v_player.competitor_id is not null and v_player.competitor_id = v_question.assigned_competitor_id;
  if v_quiz_type = 'head-to-head' then
    v_points := case when v_assigned and v_correct then 1 else 0 end;
  elsif v_correct then
    v_points := v_question.points;
  end if;
  v_response_ms := greatest(0, floor(extract(epoch from (clock_timestamp() - v_session.question_opened_at)) * 1000)::integer);
  insert into public.player_answers (
    game_session_id, question_id, player_id, answer_payload, resolution_status,
    response_time_ms, correct, points_awarded
  ) values (
    v_session.id, v_question.id, p_player_id, p_answer, 'answered',
    v_response_ms, v_correct, v_points
  );
  update public.players set total_score = total_score + v_points,
    correct_answer_count = correct_answer_count + case when v_correct and (v_quiz_type = 'standard' or v_assigned) then 1 else 0 end,
    total_correct_response_ms = total_correct_response_ms + case when v_correct and v_quiz_type = 'standard' then v_response_ms else 0 end,
    last_seen_at = now() where id = p_player_id;
  if v_quiz_type = 'head-to-head' then perform public.reveal_head_to_head_if_complete(v_session.id, v_question.id); end if;
end;
$$;

create or replace function public.skip_head_to_head_answer(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_expected_question_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_question public.questions; v_player public.players; v_response_ms integer;
begin
  select gs.* into v_session from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id and q.quiz_type = 'head-to-head'
  where gs.room_code = p_room_code and gs.status = 'active' for update of gs;
  if not found then raise exception 'This Head-to-Head room is not active.'; end if;
  if v_session.phase <> 'question' or v_session.current_question_id <> p_expected_question_id then
    raise exception 'That question is no longer open.';
  end if;
  select * into v_player from public.players where id = p_player_id and game_session_id = v_session.id
    and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256');
  if not found then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  select * into v_question from public.questions where id = p_expected_question_id and quiz_id = v_session.quiz_id;
  if v_player.competitor_id = v_question.assigned_competitor_id then
    raise exception 'The assigned competitor must answer this question.';
  end if;
  if exists (select 1 from public.player_answers where player_id = p_player_id and question_id = p_expected_question_id)
  then raise exception 'You have already resolved this question.' using errcode = '23505'; end if;
  v_response_ms := greatest(0, floor(extract(epoch from (clock_timestamp() - v_session.question_opened_at)) * 1000)::integer);
  insert into public.player_answers (
    game_session_id, question_id, player_id, answer_payload, resolution_status,
    response_time_ms, correct, points_awarded
  ) values (
    v_session.id, v_question.id, p_player_id, jsonb_build_object('type', 'skip'), 'skipped',
    v_response_ms, false, 0
  );
  update public.players set last_seen_at = now() where id = p_player_id;
  perform public.reveal_head_to_head_if_complete(v_session.id, v_question.id);
end;
$$;

create or replace function public.continue_head_to_head_game(
  p_room_code text, p_player_id uuid, p_reconnect_token text, p_expected_question_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_next public.questions; v_count integer;
begin
  select gs.* into v_session from public.game_sessions gs
  join public.quizzes q on q.id = gs.quiz_id and q.quiz_type = 'head-to-head'
  where gs.room_code = p_room_code and gs.status = 'active' for update of gs;
  if not found then raise exception 'This Head-to-Head room is not active.'; end if;
  if not exists (select 1 from public.players where id = p_player_id and game_session_id = v_session.id and reconnect_token_hash = extensions.digest(p_reconnect_token, 'sha256'))
  then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if v_session.phase = 'finished' or v_session.current_question_id <> p_expected_question_id then return; end if;
  if v_session.phase <> 'reveal' then raise exception 'Wait for both competitors to resolve the question.'; end if;
  select count(*) into v_count from public.questions where quiz_id = v_session.quiz_id;
  if v_session.current_question_index + 1 >= v_count then
    update public.game_sessions set phase = 'finished', ended_at = now(), question_closes_at = null
    where id = v_session.id;
  else
    select * into v_next from public.questions where quiz_id = v_session.quiz_id
    order by display_order offset v_session.current_question_index + 1 limit 1;
    update public.game_sessions set phase = 'question', current_question_id = v_next.id,
      current_question_index = v_session.current_question_index + 1,
      question_opened_at = now(), question_closes_at = null
    where id = v_session.id;
  end if;
end;
$$;

create or replace function public.host_change_phase(p_session_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_session public.game_sessions; v_question public.questions; v_count integer; v_is_final boolean; v_quiz_type text;
begin
  v_session := public.require_session_owner(p_session_id);
  select quiz_type into v_quiz_type from public.quizzes where id = v_session.quiz_id;
  if v_quiz_type = 'head-to-head' and p_action <> 'close' then
    raise exception 'Head-to-Head progression is controlled by the competitors.';
  end if;
  if v_session.status <> 'active' and p_action <> 'restart' then raise exception 'This room is closed.'; end if;
  select count(*) into v_count from public.questions where quiz_id = v_session.quiz_id;
  v_is_final := v_count > 0 and v_session.current_question_index + 1 >= v_count;
  case p_action
    when 'start' then
      if v_session.phase <> 'lobby' then raise exception 'The game has already started.'; end if;
      select * into v_question from public.questions where quiz_id = v_session.quiz_id order by display_order limit 1;
      if not found then raise exception 'This quiz has no questions.'; end if;
      update public.game_sessions set phase = 'question', current_question_id = v_question.id, current_question_index = 0,
        started_at = coalesce(started_at, now()), question_opened_at = now(),
        question_closes_at = now() + make_interval(secs => v_question.time_limit_seconds) where id = p_session_id;
    when 'lock' then
      if v_session.phase <> 'question' then raise exception 'Answers are not open.'; end if;
      update public.game_sessions set phase = 'locked', question_closes_at = least(coalesce(question_closes_at, now()), now()) where id = p_session_id;
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
      update public.game_sessions set phase = 'question', current_question_id = v_question.id,
        current_question_index = v_session.current_question_index + 1, question_opened_at = now(),
        question_closes_at = now() + make_interval(secs => v_question.time_limit_seconds) where id = p_session_id;
    when 'finish' then
      if v_session.phase = 'reveal' and not v_is_final then raise exception 'Show the leaderboard before continuing.'; end if;
      if v_session.phase not in ('question', 'locked', 'reveal') then raise exception 'The game cannot be finished from this phase.'; end if;
      update public.game_sessions set phase = 'finished', ended_at = now(), question_closes_at = least(coalesce(question_closes_at, now()), now()) where id = p_session_id;
    when 'restart' then
      if v_session.phase <> 'finished' then raise exception 'Finish the game before restarting it.'; end if;
      delete from public.player_answers where game_session_id = p_session_id;
      update public.players set total_score = 0, correct_answer_count = 0, total_correct_response_ms = 0 where game_session_id = p_session_id;
      update public.game_sessions set status = 'active', phase = 'lobby', current_question_id = null,
        current_question_index = 0, question_opened_at = null, question_closes_at = null,
        started_at = null, ended_at = null where id = p_session_id;
    when 'close' then
      update public.game_sessions set status = 'closed', phase = 'finished', ended_at = now() where id = p_session_id;
    else raise exception 'Unknown host action';
  end case;
end;
$$;

create or replace function public.get_player_game_state(p_room_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.game_sessions; v_quiz public.quizzes; v_question public.questions;
  v_safe jsonb := null; v_reveal jsonb := null; v_scores_visible boolean; v_head_to_head boolean;
begin
  select * into v_session from public.game_sessions where room_code = p_room_code;
  if not found then return null; end if;
  select * into v_quiz from public.quizzes where id = v_session.quiz_id;
  v_head_to_head := v_quiz.quiz_type = 'head-to-head';
  if v_session.current_question_id is not null then select * into v_question from public.questions where id = v_session.current_question_id; end if;
  v_scores_visible := v_head_to_head or v_session.phase in ('leaderboard', 'finished');

  if v_question.id is not null then
    v_safe := public.question_to_json(v_question.id, false) - 'quizId' - 'revealCaption' - 'scoringMode'
      || jsonb_build_object('assignedCompetitorId', case when v_head_to_head then v_question.assigned_competitor_id else null end,
        'questionNumber', v_session.current_question_index + 1,
        'totalQuestions', (select count(*) from public.questions where quiz_id = v_session.quiz_id));
  end if;

  if v_session.phase in ('reveal', 'leaderboard', 'finished') and v_question.id is not null then
    v_reveal := jsonb_build_object('type', v_question.question_type, 'caption', v_question.reveal_caption) || v_question.answer_key;
    if v_question.question_type = 'mashup' then
      v_reveal := v_reveal || jsonb_build_object('correctNames', jsonb_build_array(
        (select display_name from public.roster_members where id = (v_question.answer_key -> 'correctMemberIds' ->> 0)::uuid),
        (select display_name from public.roster_members where id = (v_question.answer_key -> 'correctMemberIds' ->> 1)::uuid)));
    elsif v_question.question_type = 'single-choice' then
      v_reveal := v_reveal || jsonb_build_object('optionCounts', coalesce((select jsonb_object_agg(o.id, coalesce(c.total, 0))
        from public.question_options o left join (select (answer_payload ->> 'optionId')::uuid id, count(*) total
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered' group by 1) c on c.id = o.id
        where o.question_id = v_question.id), '{}'::jsonb));
    elsif v_question.question_type = 'multiple-select' then
      v_reveal := v_reveal || jsonb_build_object('scoringMode', v_question.type_config ->> 'scoringMode', 'optionCounts', coalesce((
        select jsonb_object_agg(o.id, coalesce(c.total, 0)) from public.question_options o left join (
          select selected.id::uuid id, count(*) total from public.player_answers a
          cross join lateral jsonb_array_elements_text(a.answer_payload -> 'optionIds') selected(id)
          where a.game_session_id = v_session.id and a.question_id = v_question.id and a.resolution_status = 'answered' group by 1
        ) c on c.id = o.id where o.question_id = v_question.id), '{}'::jsonb));
    elsif v_question.question_type = 'true-false' then
      v_reveal := v_reveal || jsonb_build_object('counts', jsonb_build_object(
        'true', (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered' and (answer_payload ->> 'value')::boolean),
        'false', (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered' and not (answer_payload ->> 'value')::boolean)));
    elsif v_question.question_type = 'slider' then
      v_reveal := v_reveal || jsonb_build_object('values', coalesce((select jsonb_agg((answer_payload ->> 'value')::numeric order by submitted_at)
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered'), '[]'::jsonb));
    elsif v_question.question_type = 'pinpoint' then
      v_reveal := v_reveal || jsonb_build_object('points', coalesce((select jsonb_agg(jsonb_build_object(
        'x', (answer_payload ->> 'x')::numeric, 'y', (answer_payload ->> 'y')::numeric) order by submitted_at)
        from public.player_answers where game_session_id = v_session.id and question_id = v_question.id and resolution_status = 'answered'), '[]'::jsonb));
    end if;
  end if;

  return jsonb_build_object(
    'sessionId', v_session.id, 'quizTitle', v_quiz.title, 'quizType', v_quiz.quiz_type,
    'themeId', v_quiz.theme_id, 'backgroundId', v_quiz.background_id, 'roomCode', v_session.room_code,
    'status', v_session.status, 'phase', v_session.phase, 'currentQuestion', v_safe,
    'roster', case when v_question.question_type = 'mashup' then coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'quizId', r.quiz_id, 'displayName', r.display_name, 'shortName', r.short_name,
      'active', r.active, 'displayOrder', r.display_order) order by r.display_order)
      from public.roster_members r where r.quiz_id = v_session.quiz_id and r.active), '[]'::jsonb) else '[]'::jsonb end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'sessionId', p.game_session_id, 'nickname', p.nickname, 'competitorId', p.competitor_id,
      'connected', p.connected, 'joinedAt', p.joined_at,
      'totalScore', case when v_scores_visible then p.total_score else 0 end,
      'correctAnswerCount', case when v_scores_visible then p.correct_answer_count else 0 end,
      'totalCorrectResponseMs', case when v_scores_visible then p.total_correct_response_ms else 0 end) order by p.joined_at)
      from public.players p where p.game_session_id = v_session.id), '[]'::jsonb),
    'headToHeadCompetitors', case when v_head_to_head then coalesce((select jsonb_agg(jsonb_build_object(
      'competitorId', c.id, 'displayName', c.display_name, 'displayOrder', c.display_order,
      'claimed', p.id is not null, 'connected', coalesce(p.connected, false), 'playerId', p.id,
      'totalScore', coalesce(p.total_score, 0), 'correctAnswerCount', coalesce(p.correct_answer_count, 0)) order by c.display_order)
      from public.quiz_competitors c left join public.players p on p.game_session_id = v_session.id and p.competitor_id = c.id
      where c.quiz_id = v_session.quiz_id), '[]'::jsonb) else '[]'::jsonb end,
    'headToHeadResolutions', case when v_head_to_head and v_question.id is not null then coalesce((select jsonb_agg(jsonb_build_object(
      'playerId', a.player_id, 'competitorId', p.competitor_id, 'status', a.resolution_status) order by p.joined_at)
      from public.player_answers a join public.players p on p.id = a.player_id
      where a.game_session_id = v_session.id and a.question_id = v_question.id), '[]'::jsonb) else '[]'::jsonb end,
    'headToHeadResults', case when v_head_to_head and v_session.phase in ('reveal', 'finished') and v_question.id is not null then coalesce((
      select jsonb_agg(jsonb_build_object('competitorId', p.competitor_id,
        'assigned', p.competitor_id = v_question.assigned_competitor_id,
        'status', case when a.resolution_status = 'skipped' then 'skipped' when a.correct then 'correct' else 'incorrect' end,
        'pointsAwarded', a.points_awarded) order by p.joined_at)
      from public.player_answers a join public.players p on p.id = a.player_id
      where a.game_session_id = v_session.id and a.question_id = v_question.id), '[]'::jsonb) else '[]'::jsonb end,
    'submittedCount', case when v_question.id is null then 0 else (select count(*) from public.player_answers where game_session_id = v_session.id and question_id = v_question.id) end,
    'leaderboard', case when not v_head_to_head and v_scores_visible then coalesce((select jsonb_agg(jsonb_build_object(
      'playerId', ranked.id, 'nickname', ranked.nickname, 'totalScore', ranked.total_score,
      'correctAnswerCount', ranked.correct_answer_count, 'totalCorrectResponseMs', ranked.total_correct_response_ms,
      'rank', ranked.rank) order by ranked.rank) from (select p.*, row_number() over (
        order by p.total_score desc, p.correct_answer_count desc, p.total_correct_response_ms asc, lower(p.nickname) asc) rank
        from public.players p where p.game_session_id = v_session.id) ranked), '[]'::jsonb) else '[]'::jsonb end,
    'reveal', v_reveal, 'questionOpenedAt', v_session.question_opened_at,
    'questionClosesAt', case when v_head_to_head then null else v_session.question_closes_at end
  );
end;
$$;

revoke all on function public.validate_player_competitor() from public, anon, authenticated;
revoke all on function public.reveal_head_to_head_if_complete(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_room_join_info(text) from public;
revoke all on function public.join_head_to_head_room(text, uuid) from public;
revoke all on function public.start_head_to_head_game(text, uuid, text) from public;
revoke all on function public.skip_head_to_head_answer(text, uuid, text, uuid) from public;
revoke all on function public.continue_head_to_head_game(text, uuid, text, uuid) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.reconnect_player(text, uuid, text) from public;
revoke all on function public.submit_answer(text, uuid, text, jsonb) from public;
revoke all on function public.get_player_game_state(text) from public;
revoke all on function public.host_launch_game(uuid) from public, anon;

grant execute on function public.get_room_join_info(text) to anon, authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.join_head_to_head_room(text, uuid) to anon, authenticated;
grant execute on function public.reconnect_player(text, uuid, text) to anon, authenticated;
grant execute on function public.start_head_to_head_game(text, uuid, text) to anon, authenticated;
grant execute on function public.skip_head_to_head_answer(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.continue_head_to_head_game(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.submit_answer(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.get_player_game_state(text) to anon, authenticated;
grant execute on function public.host_launch_game(uuid) to authenticated;
