begin;
select plan(1);
create function pg_temp.team_quiz(p_type text default 'standard') returns jsonb language plpgsql as $$
declare v_round uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
begin
  return public.host_save_quiz(jsonb_build_object('title','Team SQL quiz','quizType',p_type,'roster','[]'::jsonb,
    'headToHeadCompetitors',case when p_type='head-to-head' then jsonb_build_array(jsonb_build_object('id',c1,'displayName','One','displayOrder',0),jsonb_build_object('id',c2,'displayName','Two','displayOrder',1)) else '[]'::jsonb end,
    'rounds',jsonb_build_array(jsonb_build_object('id',v_round,'title','Opening','subtitle','','displayOrder',0,'introEnabled',true)),
    'questions',(select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'roundId',v_round,'type','true-false','prompt','Team question '||n,
      'correctValue',true,'timeLimitSeconds',60,'points',1000,'speedScoringEnabled',false,'doubleScore',false,'displayOrder',n,'media',jsonb_build_object('type','none'),
      'mediaVisibility','both','presentationChoiceVisibility','show','assignedCompetitorId',case when p_type='head-to-head' then c1 else null end)) from generate_series(0,2) n)));
end;
$$;
do $test$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); q jsonb; s jsonb; other_session jsonb; p jsonb; p2 jsonb; state jsonb;
  t1 uuid; t2 uuid; sid uuid; pid uuid; room text; failed boolean; bad jsonb; mode text; before_events bigint; saved_player jsonb;
begin
  insert into auth.users(id,email) values(owner_id,'team-owner@example.invalid'),(other_id,'team-other@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  foreach bad in array array['{"teamNames":[]}'::jsonb,'{"teamNames":["One"]}','{"teamNames":[" ","Two"]}',
    '{"teamNames":[" Blue ","blue"]}','{"teamNames":[1,"Two"]}','{"teamNames":null}','{"teamAssignmentMode":"invalid"}',
    jsonb_build_object('teamNames',jsonb_build_array(repeat('x',31),'Two')),
    jsonb_build_object('teamNames',(select jsonb_agg('Team '||i) from generate_series(1,9) i))] loop
    q:=pg_temp.team_quiz(); failed:=false;
    begin perform public.host_launch_game((q->>'id')::uuid,'{"playMode":"teams"}'::jsonb||bad); exception when others then failed:=true; end;
    assert failed,'Malformed Team settings accepted';
    assert not exists(select 1 from public.game_sessions where quiz_id=(q->>'id')::uuid),'Failed launch left a room';
  end loop;
  q:=pg_temp.team_quiz('head-to-head'); failed:=false;
  begin perform public.host_launch_game((q->>'id')::uuid,'{"playMode":"teams"}'); exception when others then failed:=true; end;
  assert failed,'H2H Team launch accepted';

  -- Current production-style signatures after migrating the database first.
  q:=pg_temp.team_quiz(); s:=public.host_launch_game((q->>'id')::uuid);
  assert s->'settings'->>'playMode'='individual','Legacy launch did not default to Individual';
  p:=public.join_room(s->>'roomCode','Legacy player');
  assert p->'player'->'teamId'='null'::jsonb,'Legacy join assigned a team';
  perform public.host_start_game((s->>'id')::uuid); perform public.host_start_round_game((s->>'id')::uuid);
  perform public.submit_answer(s->>'roomCode',(p->'player'->>'id')::uuid,p->>'reconnectToken','{"type":"true-false","value":true}'::jsonb);
  perform public.host_lock_game((s->>'id')::uuid); perform public.host_reveal_game((s->>'id')::uuid); perform public.host_leaderboard_game((s->>'id')::uuid);
  assert (public.get_player_game_state(s->>'roomCode')->'leaderboard'->0->>'totalScore')::int=1000,'Legacy score changed';
  other_session:=public.session_to_json((s->>'id')::uuid);

  foreach mode in array array['player-choice','balanced-random','host'] loop
    q:=pg_temp.team_quiz(); s:=public.host_launch_game((q->>'id')::uuid,jsonb_build_object('playMode','teams','teamAssignmentMode',mode,'teamNames',jsonb_build_array(' Blue Team ','Red Team'),'soundPackId','none'));
    sid:=(s->>'id')::uuid; room:=s->>'roomCode'; t1:=(s->'teams'->0->>'id')::uuid; t2:=(s->'teams'->1->>'id')::uuid;
    assert s->'teams'->0->>'name'='Blue Team','Names not trimmed';
    assert public.host_get_game(sid)->'session'->'teams'=s->'teams','Controller bundle lost canonical teams';
    assert public.host_get_live_session(sid)->'teams'=s->'teams','Controller refresh lost canonical teams';
    assert public.host_get_active_game((q->>'id')::uuid)->'settings'->>'playMode'='teams','Active session read lost Team mode';
    assert not (s->'settings' ? 'teamNames'),'Transient names persisted in session settings';
    assert public.host_launch_game((q->>'id')::uuid,'{"playMode":"teams"}')->>'id'=sid::text,'Repeated launch changed room';
    assert (select count(*) from public.game_teams where session_id=sid)=2,'Repeated launch duplicated teams';
    select count(*) into before_events from realtime.messages;
    if mode='player-choice' then
      failed:=false; begin perform public.join_room(room,'Missing'); exception when others then failed:=true; end; assert failed,'Choice join accepted no team';
      failed:=false; begin perform public.join_team_room(room,'Invalid',gen_random_uuid()); exception when others then failed:=true; end; assert failed,'Invalid team accepted';
      p:=public.join_team_room(room,'Carol',t1); p2:=public.join_team_room(room,'Jaki',t1);
    else
      failed:=false; begin perform public.join_team_room(room,'Forced choice',t1); exception when others then failed:=true; end; assert failed,'Assignment mode bypassed';
      p:=public.join_room(room,'Carol'); p2:=public.join_room(room,'Jaki');
    end if;
    pid:=(p->'player'->>'id')::uuid;
    if mode='host' then
      assert p->'player'->'teamId'='null'::jsonb,'Host-assigned join was assigned early';
      failed:=false; begin perform public.host_start_game(sid); exception when others then failed:=true; end; assert failed,'Started with unassigned player';
    end if;
    if mode='balanced-random' then assert p->'player'->>'teamId'<>p2->'player'->>'teamId','Smallest-team assignment is unbalanced'; end if;
    perform public.host_assign_player_team(sid,pid,t2);
    assert public.reconnect_player(room,pid,p->>'reconnectToken')->'player'->>'teamId'=t2::text,'Reconnect lost authoritative membership';
    assert public.reconnect_player(room,pid,'wrong token') is null,'Reconnect token bypassed';
    saved_player:=public.session_to_json(sid)->'players';
    perform public.host_balance_teams(sid);
    assert (select max(n)-min(n) from (select count(p.id) n from public.game_teams t left join public.players p on p.team_id=t.id where t.session_id=sid group by t.id) counts)<=1,'Host balance uneven';
    assert (select jsonb_agg(x-'teamId' order by x->>'id') from jsonb_array_elements(saved_player) x)=(select jsonb_agg(x-'teamId' order by x->>'id') from jsonb_array_elements(public.session_to_json(sid)->'players') x),'Balance changed identity or scores';
    assert (select count(*) from realtime.messages)=before_events,'Membership emitted room broadcasts';
    assert not (public.get_room_join_info(room)->'teams'->0 ? 'totalScore'),'Join info exposed team totals';
    failed:=false; begin perform public.host_assign_player_team(sid,(other_session->'players'->0->>'id')::uuid,t1); exception when others then failed:=true; end; assert failed,'Cross-session player accepted';
    failed:=false; begin update public.players set game_session_id=(other_session->>'id')::uuid where id=pid; exception when foreign_key_violation then failed:=true; end; assert failed,'Composite membership FK missing';
    perform set_config('request.jwt.claim.sub',other_id::text,true);
    failed:=false; begin perform public.host_balance_teams(sid); exception when insufficient_privilege then failed:=true; end; assert failed,'Unauthorised balance accepted';
    failed:=false; begin perform public.host_assign_player_team(sid,pid,t1); exception when insufficient_privilege then failed:=true; end; assert failed,'Unauthorised assignment accepted';
    execute 'set local role authenticated'; assert not exists(select 1 from public.game_teams where session_id=sid),'Team RLS exposed another owner'; execute 'reset role';
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    perform public.host_start_game(sid);
    state:=public.get_player_game_state(room); assert state->>'phase'='round-intro','Team round intro lost'; assert jsonb_array_length(state->'teams')=2,'Team definitions lost at intro';
    failed:=false; begin perform public.host_balance_teams(sid); exception when others then failed:=true; end; assert failed,'Balance allowed outside lobby';
    failed:=false; begin perform public.host_assign_player_team(sid,pid,t1); exception when others then failed:=true; end; assert failed,'Move allowed outside lobby';
    failed:=false; begin perform public.join_team_room(room,'Late',t1); exception when others then failed:=true; end; assert failed,'Team join bypassed phase';
    perform public.host_start_round_game(sid);
    perform public.submit_answer(room,pid,p->>'reconnectToken','{"type":"true-false","value":true}'::jsonb);
    perform public.host_lock_game(sid); perform public.host_reveal_game(sid);
    state:=public.get_player_game_state(room);
    assert state->'leaderboard'='[]'::jsonb and not exists(select 1 from jsonb_array_elements(state->'players') x where (x->>'totalScore')::int<>0),'Reveal exposed cumulative scores';
    perform public.host_leaderboard_game(sid);
    state:=public.get_player_game_state(room); assert (state->'leaderboard'->0->>'totalScore')::int=1000,'Team Mode altered individual scoring';
    perform public.host_next_game(sid); perform public.host_finish_game(sid);
    state:=public.get_player_game_state(room); assert state->>'phase'='finished' and jsonb_array_length(state->'teams')=2,'Team finish lost definitions';
    perform public.host_restart_game(sid); assert not exists(select 1 from public.players where game_session_id=sid and team_id is null),'Restart lost membership';
    perform public.host_close_game(sid);
    failed:=false; begin perform public.host_balance_teams(sid); exception when others then failed:=true; end; assert failed,'Closed room allowed balance';
  end loop;
  assert not has_function_privilege('anon','public.host_assign_player_team(uuid,uuid,uuid)','execute'),'Anonymous host assignment';
  assert not has_function_privilege('anon','public.host_balance_teams(uuid)','execute'),'Anonymous host balance';
  assert not has_function_privilege('authenticated','public.join_room_without_teams(text,text)','execute'),'Retained join bypass exposed';
  assert not has_function_privilege('anon','public.team_memberships(jsonb,uuid)','execute'),'Membership helper exposed';
  assert not has_table_privilege('authenticated','public.game_teams','INSERT'),'Direct team writes exposed';
  assert not has_table_privilege('anon','public.game_teams','SELECT'),'Anonymous team table exposed';
  assert position('for update' in lower(pg_get_functiondef('public.join_team_room(text,text,uuid)'::regprocedure)))>0,'Balanced join session lock missing';
  assert position('for share' in lower(pg_get_functiondef('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure)))>0,'Submission lock regressed';
end;
$test$;
select pass('Core Teams: legacy compatibility, modes, membership, ownership, scoring and privacy');
select * from finish();
rollback;
