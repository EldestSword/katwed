-- Session-only Teams. Requires Visual Pinpoint and Core Rounds; old Individual
-- launch/join signatures stay available for a database-first release.
alter table public.game_sessions
  add column play_mode text not null default 'individual' check (play_mode in ('individual','teams')),
  add column team_assignment_mode text,
  add constraint session_team_mode_check check (
    (play_mode = 'individual' and team_assignment_mode is null) or
    (play_mode = 'teams' and team_assignment_mode is not null and team_assignment_mode in ('player-choice','balanced-random','host')));

create table public.game_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 30),
  display_order integer not null check (display_order between 0 and 7),
  unique(session_id, id), unique(session_id, display_order)
);
create unique index game_teams_session_name on public.game_teams(session_id, lower(name));
alter table public.players add column team_id uuid;
alter table public.players add constraint players_same_session_team
  foreign key (game_session_id, team_id) references public.game_teams(session_id, id);
create index players_session_team on public.players(game_session_id, team_id);
alter table public.game_teams enable row level security;
revoke all on public.game_teams from public, anon, authenticated;
grant select on public.game_teams to authenticated;
create policy game_teams_owner_read on public.game_teams for select to authenticated using (
  exists(select 1 from public.game_sessions s join public.quizzes q on q.id=s.quiz_id
    where s.id=session_id and q.owner_id=(select auth.uid())));

create function public.team_definitions(p_session_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'name',name,'displayOrder',display_order) order by display_order), '[]')
  from public.game_teams where session_id=p_session_id
$$;
create function public.team_memberships(p_players jsonb, p_session_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(value || jsonb_build_object('teamId',p.team_id) order by n), '[]')
  from jsonb_array_elements(p_players) with ordinality a(value,n)
  left join public.players p on p.id=(value->>'id')::uuid and p.game_session_id=p_session_id
$$;
revoke all on function public.team_definitions(uuid), public.team_memberships(jsonb,uuid) from public,anon,authenticated;

alter function public.session_to_json(uuid) rename to session_to_json_without_teams;
revoke all on function public.session_to_json_without_teams(uuid) from public,anon,authenticated;
create function public.session_to_json(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb; v_session public.game_sessions;
begin
  v_result := public.session_to_json_without_teams(p_session_id);
  if v_result is null then return null; end if;
  select * into strict v_session from public.game_sessions where id=p_session_id;
  return v_result || jsonb_build_object('teams',public.team_definitions(p_session_id),
    'players',public.team_memberships(v_result->'players',p_session_id),
    'settings',(v_result->'settings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode));
end;
$$;
revoke all on function public.session_to_json(uuid) from public,anon;
grant execute on function public.session_to_json(uuid) to authenticated;

alter function public.host_launch_game(uuid,jsonb) rename to host_launch_game_without_teams;
revoke all on function public.host_launch_game_without_teams(uuid,jsonb) from public,anon,authenticated;
create function public.host_launch_game(p_quiz_id uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_quiz public.quizzes; v_result jsonb; v_session_id uuid; v_mode text; v_assignment text; v_names jsonb;
begin
  select * into v_quiz from public.quizzes where id=p_quiz_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Quiz not found or unauthorised' using errcode='42501'; end if;
  if p_settings is null then p_settings := '{}'; end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Launch settings must be an object'; end if;
  v_mode := coalesce(p_settings->>'playMode','individual');
  if v_mode not in ('individual','teams') then raise exception 'Invalid play mode'; end if;
  if v_mode='teams' then
    if v_quiz.quiz_type <> 'standard' then raise exception 'Head-to-Head cannot use Teams.'; end if;
    v_assignment := coalesce(p_settings->>'teamAssignmentMode','player-choice');
    if v_assignment not in ('player-choice','balanced-random','host') then raise exception 'Invalid team assignment mode'; end if;
    v_names := coalesce(p_settings->'teamNames','["Team 1","Team 2"]'::jsonb);
    if jsonb_typeof(v_names) <> 'array' then raise exception 'Team names must be an array'; end if;
    if jsonb_array_length(v_names) not between 2 and 8 then raise exception 'Choose between 2 and 8 teams.'; end if;
    if exists(select 1 from jsonb_array_elements(v_names) n where jsonb_typeof(n) <> 'string' or char_length(btrim(n#>>'{}')) not between 1 and 30) then raise exception 'Team names must contain 1–30 characters.'; end if;
    if (select count(distinct lower(btrim(n))) from jsonb_array_elements_text(v_names) n) <> jsonb_array_length(v_names) then raise exception 'Team names must be unique.'; end if;
  end if;
  select id into v_session_id from public.game_sessions where quiz_id=p_quiz_id and status='active';
  if found then return public.session_to_json(v_session_id); end if;
  v_result := public.host_launch_game_without_teams(p_quiz_id,p_settings-'playMode'-'teamAssignmentMode'-'teamNames');
  v_session_id := (v_result->>'id')::uuid;
  update public.game_sessions set play_mode=v_mode,team_assignment_mode=v_assignment where id=v_session_id;
  if v_mode='teams' then
    insert into public.game_teams(session_id,name,display_order)
      select v_session_id,btrim(name),n-1 from jsonb_array_elements_text(v_names) with ordinality a(name,n);
  end if;
  return public.session_to_json(v_session_id);
end;
$$;
revoke all on function public.host_launch_game(uuid,jsonb) from public,anon;
grant execute on function public.host_launch_game(uuid,jsonb) to authenticated;

alter function public.get_room_join_info(text) rename to get_room_join_info_without_teams;
revoke all on function public.get_room_join_info_without_teams(text) from public,anon,authenticated;
create function public.get_room_join_info(p_room_code text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb; v_session public.game_sessions;
begin
  v_result := public.get_room_join_info_without_teams(p_room_code);
  if v_result is null then return null; end if;
  select * into strict v_session from public.game_sessions where room_code=p_room_code;
  return v_result || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode,
    'teams',(select coalesce(jsonb_agg(t || jsonb_build_object('memberCount',(select count(*) from public.players p where p.game_session_id=v_session.id and p.team_id=(t->>'id')::uuid))), '[]') from jsonb_array_elements(public.team_definitions(v_session.id)) t));
end;
$$;
revoke all on function public.get_room_join_info(text) from public;
grant execute on function public.get_room_join_info(text) to anon,authenticated;

alter function public.join_room(text,text) rename to join_room_without_teams;
revoke all on function public.join_room_without_teams(text,text) from public,anon,authenticated;
create function public.join_team_room(p_room_code text,p_nickname text,p_team_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions; v_team_id uuid; v_result jsonb;
begin
  -- Every join/assignment/balance/start locks the same session first. Under READ
  -- COMMITTED the following count sees the previous join after this lock waits.
  select * into v_session from public.game_sessions where room_code=p_room_code for update;
  if not found then raise exception 'We could not find that room.'; end if;
  if v_session.status <> 'active' or v_session.phase <> 'lobby' then raise exception 'Joining is only available in an active lobby.'; end if;
  if v_session.play_mode='teams' then
    if v_session.team_assignment_mode='player-choice' then
      select id into v_team_id from public.game_teams where id=p_team_id and session_id=v_session.id;
      if not found then raise exception 'Choose a team in this room.'; end if;
    else
      if p_team_id is not null then raise exception 'This room assigns teams for you.'; end if;
      if v_session.team_assignment_mode='balanced-random' then
        select t.id into v_team_id from public.game_teams t left join public.players p on p.game_session_id=t.session_id and p.team_id=t.id
          where t.session_id=v_session.id group by t.id order by count(p.id),random() limit 1;
        if v_team_id is null then raise exception 'This room has no teams.'; end if;
      end if;
    end if;
  elsif p_team_id is not null then raise exception 'This room uses Individuals.';
  end if;
  v_result := public.join_room_without_teams(p_room_code,p_nickname);
  update public.players set team_id=v_team_id where id=(v_result->'player'->>'id')::uuid and game_session_id=v_session.id;
  return jsonb_set(v_result,'{player}',(v_result->'player') || jsonb_build_object('teamId',v_team_id));
end;
$$;
create function public.join_room(p_room_code text,p_nickname text) returns jsonb
language sql security definer set search_path=public as $$ select public.join_team_room(p_room_code,p_nickname,null) $$;
revoke all on function public.join_room(text,text),public.join_team_room(text,text,uuid) from public;
grant execute on function public.join_room(text,text),public.join_team_room(text,text,uuid) to anon,authenticated;

alter function public.reconnect_player(text,uuid,text) rename to reconnect_player_without_teams;
revoke all on function public.reconnect_player_without_teams(text,uuid,text) from public,anon,authenticated;
create function public.reconnect_player(p_room_code text,p_player_id uuid,p_reconnect_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
  v_result := public.reconnect_player_without_teams(p_room_code,p_player_id,p_reconnect_token);
  if v_result is null then return null; end if;
  return jsonb_set(v_result,'{player}',(v_result->'player') || jsonb_build_object('teamId',(select team_id from public.players where id=p_player_id)));
end;
$$;
revoke all on function public.reconnect_player(text,uuid,text) from public;
grant execute on function public.reconnect_player(text,uuid,text) to anon,authenticated;

alter function public.get_player_game_state(text) rename to get_player_game_state_without_teams;
revoke all on function public.get_player_game_state_without_teams(text) from public,anon,authenticated;
create function public.get_player_game_state(p_room_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_session public.game_sessions;
begin
  v_result := public.get_player_game_state_without_teams(p_room_code);
  if v_result is null then return null; end if;
  select * into strict v_session from public.game_sessions where room_code=p_room_code;
  return v_result || jsonb_build_object('teams',public.team_definitions(v_session.id),
    'players',public.team_memberships(v_result->'players',v_session.id),
    'sessionSettings',(v_result->'sessionSettings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode));
end;
$$;
revoke all on function public.get_player_game_state(text) from public;
grant execute on function public.get_player_game_state(text) to anon,authenticated;

create function public.require_host_team_lobby(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions;
begin
  select s.* into v_session from public.game_sessions s join public.quizzes q on q.id=s.quiz_id
    where s.id=p_session_id and q.owner_id=auth.uid() and q.quiz_type='standard' for update of s;
  if not found then raise exception 'Game session not found or unauthorised' using errcode='42501'; end if;
  if v_session.status <> 'active' or v_session.phase <> 'lobby' or v_session.play_mode <> 'teams' then raise exception 'Teams can only be changed in an active Team lobby.'; end if;
end;
$$;
revoke all on function public.require_host_team_lobby(uuid) from public,anon,authenticated;
create function public.host_assign_player_team(p_session_id uuid,p_player_id uuid,p_team_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_host_team_lobby(p_session_id);
  if not exists(select 1 from public.game_teams where id=p_team_id and session_id=p_session_id) then raise exception 'Choose a team in this room.'; end if;
  update public.players set team_id=p_team_id where id=p_player_id and game_session_id=p_session_id;
  if not found then raise exception 'Choose a player in this room.'; end if;
end;
$$;
create function public.host_balance_teams(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_teams uuid[];
begin
  perform public.require_host_team_lobby(p_session_id);
  select array_agg(id order by display_order) into v_teams from public.game_teams where session_id=p_session_id;
  if cardinality(v_teams) not between 2 and 8 then raise exception 'Invalid team definitions'; end if;
  perform 1 from public.players where game_session_id=p_session_id order by id for update;
  with shuffled as (select id,row_number() over(order by random())-1 n from public.players where game_session_id=p_session_id)
    update public.players p set team_id=v_teams[(s.n % cardinality(v_teams))::integer+1] from shuffled s where p.id=s.id;
end;
$$;
revoke all on function public.host_assign_player_team(uuid,uuid,uuid),public.host_balance_teams(uuid) from public,anon;
grant execute on function public.host_assign_player_team(uuid,uuid,uuid),public.host_balance_teams(uuid) to authenticated;

-- Preserve all retained phase/submission logic; fail if the hardened starting
-- point is not present. No score functions, triggers or broadcasts are added.
do $$
declare v_definition text; v_old text := $old$when 'start', 'start-round' then$old$;
begin
  v_definition := replace(pg_get_functiondef('public.host_change_phase(uuid,text)'::regprocedure),E'\r\n',E'\n');
  if position(v_old in v_definition)=0 or position('for update' in lower(v_definition))=0 then raise exception 'Expected locked Team start fragment missing'; end if;
  execute replace(v_definition,v_old,v_old || $new$
      if v_session.play_mode='teams' and (not exists(select 1 from public.players where game_session_id=p_session_id) or exists(select 1 from public.players where game_session_id=p_session_id and team_id is null)) then
        raise exception 'Assign every player to a team before starting.';
      end if;$new$);
end;
$$;
