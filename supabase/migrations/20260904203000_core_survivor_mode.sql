-- Core Survivor Mode is launch/session state. Existing and stale clients remain
-- Points sessions, and saved quiz definitions/portable format stay unchanged.
alter table public.game_sessions
  add column competition_mode text not null default 'points',
  add column survivor_starting_lives smallint,
  add constraint game_sessions_competition_mode_check check (competition_mode in ('points','survivor')),
  add constraint game_sessions_survivor_settings_check check (
    (competition_mode='points' and survivor_starting_lives is null) or
    (competition_mode='survivor' and survivor_starting_lives in (1,3) and play_mode='individual')
  );

alter table public.players
  add column survivor_lives_remaining smallint not null default 0,
  add column survivor_eliminated_at_question integer,
  add constraint players_survivor_state_check check (
    survivor_lives_remaining>=0 and
    (survivor_eliminated_at_question is null or
      (survivor_lives_remaining=0 and survivor_eliminated_at_question>=1))
  );
create index players_session_survivor_alive on public.players(game_session_id,survivor_lives_remaining);

create function public.survivor_player_states(p_players jsonb,p_session_id uuid) returns jsonb
language sql stable set search_path=public as $$
  select coalesce(jsonb_agg(value || jsonb_build_object(
    'survivorLivesRemaining',p.survivor_lives_remaining,
    'survivorEliminatedAtQuestion',p.survivor_eliminated_at_question) order by n),'[]'::jsonb)
  from jsonb_array_elements(p_players) with ordinality source(value,n)
  join public.players p on p.id=(value->>'id')::uuid and p.game_session_id=p_session_id
$$;
revoke all on function public.survivor_player_states(jsonb,uuid) from public,anon,authenticated;

-- One bounded history scan uses authoritative correctness. Buzz questions are
-- removed before damage is counted, while elimination records their real
-- session question position.
create function public.recompute_survivor_state(p_session_id uuid,p_player_id uuid,p_completed_count integer)
returns void language plpgsql set search_path=public as $$
declare v_session public.game_sessions;
begin
  select s.* into strict v_session from public.game_sessions s join public.quizzes q on q.id=s.quiz_id
    where s.id=p_session_id and q.quiz_type='standard' and s.competition_mode='survivor';
  if v_session.phase not in ('reveal','leaderboard') or p_completed_count is null or p_completed_count<0 or
    p_completed_count>least(cardinality(v_session.question_order),v_session.current_question_index+1) then
    raise exception 'Invalid completed-question boundary for Survivor';
  end if;
  with roster as (
    select id from public.players where game_session_id=p_session_id and (p_player_id is null or id=p_player_id)
  ), eligible as (
    select ordered.question_id,ordered.source_position::integer source_position
    from unnest(v_session.question_order) with ordinality ordered(question_id,source_position)
    join public.questions q on q.id=ordered.question_id and q.quiz_id=v_session.quiz_id
    where ordered.source_position<=p_completed_count and not q.buzz_in_enabled
  ), history as (
    select p.id,e.source_position,case when a.correct is true then 0 else 1 end damage
    from roster p cross join eligible e left join public.player_answers a
      on a.game_session_id=p_session_id and a.player_id=p.id and a.question_id=e.question_id
  ), running as (
    select id,source_position,sum(damage) over(partition by id order by source_position) cumulative_damage
    from history
  ), totals as (
    select id,coalesce(max(cumulative_damage),0)::integer damage,
      min(source_position) filter(where cumulative_damage>=v_session.survivor_starting_lives)::integer eliminated_at
    from running group by id
  ), resolved as (
    select r.id,coalesce(t.damage,0) damage,t.eliminated_at from roster r left join totals t on t.id=r.id
  )
  update public.players p set
    survivor_lives_remaining=greatest(v_session.survivor_starting_lives-r.damage,0),
    survivor_eliminated_at_question=case when r.damage>=v_session.survivor_starting_lives then r.eliminated_at else null end
  from resolved r where p.id=r.id and p.game_session_id=p_session_id and
    (p.survivor_lives_remaining,p.survivor_eliminated_at_question) is distinct from
    (greatest(v_session.survivor_starting_lives-r.damage,0),case when r.damage>=v_session.survivor_starting_lives then r.eliminated_at else null end);
end $$;
revoke all on function public.recompute_survivor_state(uuid,uuid,integer) from public,anon,authenticated;

create function public.survivor_leaderboard(p_session_id uuid) returns jsonb
language sql stable set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId',ranked.id,'nickname',ranked.nickname,'totalScore',ranked.total_score,
    'correctAnswerCount',ranked.correct_answer_count,'totalCorrectResponseMs',ranked.total_correct_response_ms,
    'currentCorrectStreak',ranked.current_correct_streak,'longestCorrectStreak',ranked.longest_correct_streak,
    'survivorLivesRemaining',ranked.survivor_lives_remaining,
    'survivorEliminatedAtQuestion',ranked.survivor_eliminated_at_question,'rank',ranked.rank
  ) order by ranked.rank),'[]'::jsonb)
  from (
    select p.*,row_number() over(order by
      (p.survivor_lives_remaining>0) desc,
      case when p.survivor_lives_remaining>0 then p.survivor_lives_remaining end desc nulls last,
      case when p.survivor_lives_remaining=0 then p.survivor_eliminated_at_question end desc nulls last,
      p.total_score desc,p.correct_answer_count desc,p.total_correct_response_ms asc,
      lower(p.nickname) asc,p.id asc
    ) rank
    from public.players p where p.game_session_id=p_session_id
  ) ranked
$$;
revoke all on function public.survivor_leaderboard(uuid) from public,anon,authenticated;

create function pg_temp.patch_survivor_function(p_signature text,p_old text,p_new text) returns void language plpgsql as $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in definition)=0 then raise exception 'Missing Survivor predecessor in %: %',p_signature,p_old; end if;
  execute replace(definition,p_old,p_new);
end $$;

-- Launch settings are optional for old clients. The public signature remains
-- unchanged and the Team wrapper still owns team creation.
select pg_temp.patch_survivor_function('public.host_launch_game(uuid,jsonb)',
  $old$declare v_quiz public.quizzes; v_result jsonb; v_session_id uuid; v_mode text; v_assignment text; v_names jsonb;$old$,
  $new$declare v_quiz public.quizzes; v_result jsonb; v_session_id uuid; v_mode text; v_assignment text; v_names jsonb;
  v_competition text; v_survivor_lives smallint;$new$);
select pg_temp.patch_survivor_function('public.host_launch_game(uuid,jsonb)',
  $old$v_mode := coalesce(p_settings->>'playMode','individual');
  if v_mode not in ('individual','teams') then raise exception 'Invalid play mode'; end if;$old$,
  $new$v_mode := coalesce(p_settings->>'playMode','individual');
  if v_mode not in ('individual','teams') then raise exception 'Invalid play mode'; end if;
  if p_settings ? 'competitionMode' and jsonb_typeof(p_settings->'competitionMode')<>'string' then raise exception 'Invalid competition mode'; end if;
  v_competition:=coalesce(p_settings->>'competitionMode','points');
  if v_competition not in ('points','survivor') then raise exception 'Invalid competition mode'; end if;
  if v_competition='survivor' then
    if v_quiz.quiz_type<>'standard' then raise exception 'Survivor is only available for Standard quizzes.'; end if;
    if v_mode<>'individual' then raise exception 'Survivor V1 is for individual play.'; end if;
    if p_settings ? 'survivorStartingLives' and jsonb_typeof(p_settings->'survivorStartingLives')<>'number' then raise exception 'Invalid Survivor starting lives'; end if;
    v_survivor_lives:=coalesce((p_settings->>'survivorStartingLives')::smallint,3);
    if v_survivor_lives not in (1,3) then raise exception 'Choose 1 life or 3 lives.'; end if;
  end if;$new$);
select pg_temp.patch_survivor_function('public.host_launch_game(uuid,jsonb)',
  $old$v_result := public.host_launch_game_without_teams(p_quiz_id,p_settings-'playMode'-'teamAssignmentMode'-'teamNames');$old$,
  $new$v_result := public.host_launch_game_without_teams(p_quiz_id,p_settings-'playMode'-'teamAssignmentMode'-'teamNames'-'competitionMode'-'survivorStartingLives');$new$);
select pg_temp.patch_survivor_function('public.host_launch_game(uuid,jsonb)',
  $old$update public.game_sessions set play_mode=v_mode,team_assignment_mode=v_assignment where id=v_session_id;$old$,
  $new$update public.game_sessions set play_mode=v_mode,team_assignment_mode=v_assignment,
    competition_mode=v_competition,survivor_starting_lives=v_survivor_lives where id=v_session_id;$new$);

-- Add mode and player state to host, join and public-safe serialisation without
-- exposing answer data or changing any predecessor RPC signature.
select pg_temp.patch_survivor_function('public.session_to_json(uuid)',
  $old$'players',public.team_memberships(v_result->'players',p_session_id),
    'settings',(v_result->'settings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode)$old$,
  $new$'players',public.survivor_player_states(public.team_memberships(v_result->'players',p_session_id),p_session_id),
    'settings',(v_result->'settings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode,
      'competitionMode',v_session.competition_mode,'survivorStartingLives',v_session.survivor_starting_lives)$new$);
select pg_temp.patch_survivor_function('public.get_room_join_info(text)',
  $old$return v_result || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode,$old$,
  $new$return v_result || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode,
    'competitionMode',v_session.competition_mode,'survivorStartingLives',v_session.survivor_starting_lives,$new$);
select pg_temp.patch_survivor_function('public.join_team_room(text,text,uuid)',
  $old$update public.players set team_id=v_team_id where id=(v_result->'player'->>'id')::uuid and game_session_id=v_session.id;
  return jsonb_set(v_result,'{player}',(v_result->'player') || jsonb_build_object('teamId',v_team_id));$old$,
  $new$update public.players set team_id=v_team_id,
    survivor_lives_remaining=case when v_session.competition_mode='survivor' then v_session.survivor_starting_lives else 0 end,
    survivor_eliminated_at_question=null
    where id=(v_result->'player'->>'id')::uuid and game_session_id=v_session.id;
  return jsonb_set(v_result,'{player}',(v_result->'player') || jsonb_build_object('teamId',v_team_id,
    'survivorLivesRemaining',(select survivor_lives_remaining from public.players where id=(v_result->'player'->>'id')::uuid),
    'survivorEliminatedAtQuestion',null));$new$);
select pg_temp.patch_survivor_function('public.reconnect_player(text,uuid,text)',
  $old$return jsonb_set(v_result,'{player}',(v_result->'player') || jsonb_build_object('teamId',(select team_id from public.players where id=p_player_id)));$old$,
  $new$return jsonb_set(v_result,'{player}',(v_result->'player') || jsonb_build_object(
    'teamId',(select team_id from public.players where id=p_player_id),
    'survivorLivesRemaining',(select survivor_lives_remaining from public.players where id=p_player_id),
    'survivorEliminatedAtQuestion',(select survivor_eliminated_at_question from public.players where id=p_player_id)));$new$);
select pg_temp.patch_survivor_function('public.get_player_game_state(text)',
  $old$select * into strict v_session from public.game_sessions where room_code=p_room_code;
  if v_result->'currentQuestion'->>'type'$old$,
  $new$select * into strict v_session from public.game_sessions where room_code=p_room_code;
  if v_session.competition_mode='survivor' and v_session.phase in ('leaderboard','finished') then
    v_result:=jsonb_set(v_result,'{leaderboard}',public.survivor_leaderboard(v_session.id));
  end if;
  if v_result->'currentQuestion'->>'type'$new$);
select pg_temp.patch_survivor_function('public.get_player_game_state(text)',
  $old$'players',public.team_memberships(v_result->'players',v_session.id),
    'sessionSettings',(v_result->'sessionSettings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode)$old$,
  $new$'players',public.survivor_player_states(public.team_memberships(v_result->'players',v_session.id),v_session.id),
    'survivorAliveCount',case when v_session.competition_mode='survivor' then
      (select count(*) from public.players where game_session_id=v_session.id and survivor_lives_remaining>0)
      else (select count(*) from public.players where game_session_id=v_session.id) end,
    'eligibleResponderCount',case
      when exists(select 1 from public.questions where id=v_session.current_question_id and buzz_in_enabled) then case when v_session.buzz_winner_player_id is null then 0 else 1 end
      when v_session.competition_mode='survivor' then (select count(*) from public.players where game_session_id=v_session.id and survivor_lives_remaining>0)
      else (select count(*) from public.players where game_session_id=v_session.id) end,
    'sessionSettings',(v_result->'sessionSettings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode,
      'competitionMode',v_session.competition_mode,'survivorStartingLives',v_session.survivor_starting_lives)$new$);

-- Eliminated spectators cannot answer or enter a Buzz race. Identity and all
-- existing phase/deadline/Buzz/Wager checks remain in their current order.
select pg_temp.patch_survivor_function('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)',
  $old$if not found then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if exists (select 1 from public.player_answers$old$,
  $new$if not found then raise exception 'Your player session could not be verified.' using errcode = '42501'; end if;
  if v_quiz_type='standard' and v_session.competition_mode='survivor' and v_player.survivor_lives_remaining<=0 then
    raise exception 'Eliminated players can only spectate.' using errcode='42501';
  end if;
  if exists (select 1 from public.player_answers$new$);
select pg_temp.patch_survivor_function('public.claim_buzz(text,uuid,text)',
  $old$select * into strict v_session from public.game_sessions where id=v_session.id for update;
  select * into v_question$old$,
  $new$select * into strict v_session from public.game_sessions where id=v_session.id for update;
  if v_session.competition_mode='survivor' and not exists(select 1 from public.players where id=p_player_id and game_session_id=v_session.id and survivor_lives_remaining>0) then
    raise exception 'Eliminated players cannot claim the Buzz.' using errcode='42501';
  end if;
  select * into v_question$new$);

-- Finalise only completed questions. Typed Answer corrections on an already
-- revealed board recompute the affected player, including resurrection.
select pg_temp.patch_survivor_function('public.host_change_phase(uuid,text)',
  $old$perform public.recompute_player_streaks(p_session_id,null,v_session.current_question_index+1);$old$,
  $new$perform public.recompute_player_streaks(p_session_id,null,v_session.current_question_index+1);
      if v_session.competition_mode='survivor' then
        perform public.recompute_survivor_state(p_session_id,null,v_session.current_question_index+1);
      end if;$new$);
select pg_temp.patch_survivor_function('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$perform public.recompute_player_streaks(v_session.id,v_answer.player_id,v_session.current_question_index+1);$old$,
  $new$perform public.recompute_player_streaks(v_session.id,v_answer.player_id,v_session.current_question_index+1);
    if v_session.competition_mode='survivor' then
      perform public.recompute_survivor_state(v_session.id,v_answer.player_id,v_session.current_question_index+1);
    end if;$new$);

-- Terminal Survivor boards must show before the final result. Next is rejected,
-- while Finish is admitted only after the authoritative alive count reaches 0/1.
select pg_temp.patch_survivor_function('public.host_change_phase(uuid,text)',
  $old$if v_session.phase <> 'leaderboard' then raise exception 'Show the leaderboard first.'; end if;
      if v_is_final then raise exception 'There is no next question.'; end if;$old$,
  $new$if v_session.phase <> 'leaderboard' then raise exception 'Show the leaderboard first.'; end if;
      if v_session.competition_mode='survivor' and
        (select count(*) from public.players where game_session_id=p_session_id and survivor_lives_remaining>0)<=1 then
        raise exception 'Reveal the final result before continuing.';
      end if;
      if v_is_final then raise exception 'There is no next question.'; end if;$new$);
select pg_temp.patch_survivor_function('public.host_change_phase(uuid,text)',
  $old$if v_session.phase = 'reveal' and not v_is_final then raise exception 'Show the leaderboard before continuing.'; end if;$old$,
  $new$if v_session.phase = 'reveal' and not v_is_final and v_session.competition_mode<>'survivor' then
        raise exception 'Show the leaderboard before continuing.';
      end if;$new$);
select pg_temp.patch_survivor_function('public.host_change_phase(uuid,text)',
  $old$if v_session.phase not in ('question', 'locked', 'reveal') then raise exception 'The game cannot be finished from this phase.'; end if;
      if v_session.phase='reveal' then$old$,
  $new$if v_session.phase='leaderboard' then
        if v_session.competition_mode<>'survivor' or
          (select count(*) from public.players where game_session_id=p_session_id and survivor_lives_remaining>0)>1 then
          raise exception 'The Survivor game is not ready for its final result.';
        end if;
      elsif v_session.phase not in ('question','locked','reveal') then
        raise exception 'The game cannot be finished from this phase.';
      end if;
      if v_session.phase='reveal' then$new$);
select pg_temp.patch_survivor_function('public.host_change_phase(uuid,text)',
  $old$current_correct_streak = 0, longest_correct_streak = 0 where game_session_id = p_session_id;$old$,
  $new$current_correct_streak = 0, longest_correct_streak = 0,
        survivor_lives_remaining=case when v_session.competition_mode='survivor' then v_session.survivor_starting_lives else 0 end,
        survivor_eliminated_at_question=null where game_session_id = p_session_id;$new$);

-- Player updates remain outside the Standard broadcast trigger. The one phase
-- row update continues to produce the existing room/controller refresh only.
do $$declare definition text;
begin
  select pg_get_triggerdef(oid) into strict definition from pg_trigger
    where tgrelid='public.players'::regclass and tgname='head_to_head_players_broadcast_refresh';
  if position('broadcast_head_to_head_player_refresh()' in definition)=0 then raise exception 'Unexpected Survivor player broadcast predecessor'; end if;
end $$;

drop function pg_temp.patch_survivor_function(text,text,text);
