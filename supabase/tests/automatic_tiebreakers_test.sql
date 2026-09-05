begin;
select plan(1);

create function pg_temp.tiebreaker_question() returns jsonb language sql as $$
  select jsonb_build_object(
    'id',gen_random_uuid(),'type','typed-answer','prompt','Name the answer','supportingText','',
    'timeLimitSeconds',30,'points',1000,'buzzInEnabled',false,'wagerEnabled',true,
    'progressiveRevealEnabled',false,'speedScoringEnabled',false,'doubleScore',false,'displayOrder',0,
    'media','{"type":"none"}'::jsonb,'mediaVisibility','both','presentationChoiceVisibility','show',
    'correctAnswer','Alex','acceptedAnswers','[]'::jsonb)
$$;

create function pg_temp.tiebreaker_quiz() returns jsonb language sql as $$
  select jsonb_build_object('title','Automatic Tie-Breakers SQL','quizType','standard','roster','[]'::jsonb,
    'headToHeadCompetitors','[]'::jsonb,'questions',jsonb_build_array(pg_temp.tiebreaker_question()))
$$;

do $tiebreakers$
declare
  owner_id uuid:=gen_random_uuid(); quiz jsonb; session jsonb; old_session jsonb; team_session jsonb;
  carol jsonb; roger jsonb; jaki jsonb; safe jsonb; host_state jsonb; reconnect jsonb;
  sid uuid; exact_sid uuid; target numeric; first_id text; first_category text; stats_before jsonb; stats_after jsonb;
  contenders uuid[]; broadcast_count integer; failed boolean;
begin
  insert into auth.users(id,email) values(owner_id,'tiebreakers@example.invalid');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);

  assert (select count(*)=200 and count(distinct id)=200 and count(distinct prompt)=200 and
    bool_and(btrim(category)<>'' and btrim(unit)<>'' and btrim(source_title)<>'' and source_url like 'https://%')
    from public.tiebreaker_questions),'Research bank metadata is incomplete';
  assert (select count(*)=200 from generate_series(1,200) n
    where exists(select 1 from public.tiebreaker_questions q where q.id='TB'||lpad(n::text,3,'0'))),'TB001–TB200 are incomplete';
  assert not has_table_privilege('anon','public.tiebreaker_questions','select'),'Anon can select the answer bank';
  assert not has_table_privilege('authenticated','public.tiebreaker_questions','select'),'Players can select the answer bank';
  assert (select count(*)=8 and bool_and(q.answer=e.answer and q.unit='km'
    and q.source_title='JPL Planetary Physical Parameters'
    and q.source_url='https://ssd.jpl.nasa.gov/planets/phys_par.html'
    and q.source_note=$note$JPL equatorial-radius value; distinguished from the planet's mean radius.$note$)
    from (values ('TB009',2440.53),('TB010',6051.8),('TB011',6378.1366),('TB012',3396.19),
      ('TB013',71492),('TB014',60268),('TB015',25559),('TB016',24764)) e(id,answer)
    join public.tiebreaker_questions q using(id)), 'Audited equatorial radii or JPL provenance differ';
  assert (select count(*)=5 and bool_and(q.answer=e.answer and q.prompt=e.prompt and q.source_url=e.url and q.source_note=e.note)
    from (values
      ('TB036',720000,$q$According to NASA's Sun Facts page, about how fast does our solar system move through the Milky Way, in kilometres per hour?$q$,
        'https://science.nasa.gov/sun/facts/', $n$NASA Sun Facts gives an average velocity of 720,000 km/h; another current NASA educational page uses a different rounded orbital-speed figure.$n$),
      ('TB098',7650,'How long is each Golden Gate Bridge main cable, in feet?',
        'https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/', 'Official bridge statistics give 7,650 ft for one main cable.'),
      ('TB198',174,$q$According to Spotify's American Idiot album listing, how long is Green Day's 'American Idiot', in seconds?$q$,
        'https://open.spotify.com/track/45zvStEMsXp8z45OQRhWFJ', $n$Spotify's album listing gives 2:54 for the track.$n$),
      ('TB199',355,$q$According to Spotify's A Night at the Opera album listing, how long is Queen's 'Bohemian Rhapsody', in seconds?$q$,
        'https://open.spotify.com/track/1yslmgUcM2AOkOPS4sl3QV', $n$Spotify's A Night at the Opera album listing gives 5:55.$n$),
      ('TB200',390,$q$According to Spotify's original Hotel California album listing, how long is the Eagles' 'Hotel California', in seconds?$q$,
        'https://open.spotify.com/track/4GkOfUKUqDDgoeiov8Uqyi', $n$Spotify's original Hotel California album listing gives 6:30.$n$)
    ) e(id,answer,prompt,url,note) join public.tiebreaker_questions q using(id)), 'Audited source-specific prompts or answers differ';
  assert (select source_title='NASA Sun Facts' and unit='km/h' from public.tiebreaker_questions where id='TB036');
  assert (select source_title='Golden Gate Bridge official design & construction statistics' and unit='ft' from public.tiebreaker_questions where id='TB098');
  assert (select bool_and(not has_table_privilege(role_name,table_name,'select'))
    from unnest(array['anon','authenticated']) role_name
    cross join unnest(array['public.tiebreaker_questions','public.game_tiebreaker_contenders','public.game_tiebreaker_answers']) table_name),
    'Private tie-breaker tables became directly readable';
  assert (select count(*)=3 and bool_and(relrowsecurity and relforcerowsecurity) from pg_class
    where oid in ('public.tiebreaker_questions'::regclass,'public.game_tiebreaker_contenders'::regclass,'public.game_tiebreaker_answers'::regclass)),
    'Private tie-breaker table RLS changed';
  assert has_function_privilege('anon','public.submit_tiebreaker_answer(text,uuid,text,text)','execute');
  assert not has_function_privilege('anon','public.host_resolve_tiebreaker(uuid)','execute');
  assert not has_function_privilege('anon','public.host_next_tiebreaker(uuid)','execute');
  assert not has_function_privilege('anon','public.host_reveal_tiebreaker_final(uuid)','execute');
  assert has_function_privilege('authenticated','public.host_resolve_tiebreaker(uuid)','execute');
  assert has_function_privilege('authenticated','public.host_next_tiebreaker(uuid)','execute');
  assert has_function_privilege('authenticated','public.host_reveal_tiebreaker_final(uuid)','execute');
  assert not has_function_privilege('authenticated','public.tiebreaker_round_outcome(uuid,integer)','execute');

  quiz:=public.host_save_quiz(pg_temp.tiebreaker_quiz());

  -- Database-first compatibility: omitted capability stays false and a tied
  -- legacy game finishes in the historical phase.
  old_session:=public.host_launch_game((quiz->>'id')::uuid,'{"soundPackId":"none","autoLockWhenAllAnswered":false}'::jsonb);
  assert old_session->'settings'->>'automaticTieBreakersEnabled'='false';
  carol:=public.join_room(old_session->>'roomCode','Old Carol');
  roger:=public.join_room(old_session->>'roomCode','Old Roger');
  perform public.host_start_game((old_session->>'id')::uuid);
  perform public.host_lock_game((old_session->>'id')::uuid); perform public.host_reveal_game((old_session->>'id')::uuid);
  perform public.host_finish_game((old_session->>'id')::uuid);
  assert (select phase='finished' and not automatic_tiebreakers_enabled from public.game_sessions where id=(old_session->>'id')::uuid),
    'Old client entered an unknown phase';
  perform public.host_close_game((old_session->>'id')::uuid);

  -- Unsupported Team sessions force the effective flag off.
  team_session:=public.host_launch_game((quiz->>'id')::uuid,
    '{"playMode":"teams","teamAssignmentMode":"balanced-random","teamNames":["Blue","Red"],"automaticTieBreakersEnabled":true}'::jsonb);
  assert team_session->'settings'->>'automaticTieBreakersEnabled'='false';
  perform public.host_close_game((team_session->>'id')::uuid);

  -- A unique Points leader finishes directly.
  session:=public.host_launch_game((quiz->>'id')::uuid,'{"automaticTieBreakersEnabled":true,"autoLockWhenAllAnswered":false}'::jsonb);
  carol:=public.join_room(session->>'roomCode','No Tie Carol');roger:=public.join_room(session->>'roomCode','No Tie Roger');jaki:=public.join_room(session->>'roomCode','No Tie Jaki');
  sid:=(session->>'id')::uuid;perform public.host_start_game(sid);
  update public.players set total_score=case nickname when 'No Tie Carol' then 8500 when 'No Tie Roger' then 8200 else 7000 end where game_session_id=sid;
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);perform public.host_finish_game(sid);
  assert (select phase='finished' from public.game_sessions where id=sid),'Unique winner entered a tie-breaker';
  perform public.host_close_game(sid);

  -- Visible top score alone defines the Points tie, irrespective of statistics.
  session:=public.host_launch_game((quiz->>'id')::uuid,'{"automaticTieBreakersEnabled":true,"autoLockWhenAllAnswered":false}'::jsonb);
  carol:=public.join_room(session->>'roomCode','Carol');roger:=public.join_room(session->>'roomCode','Roger');jaki:=public.join_room(session->>'roomCode','Jaki');
  sid:=(session->>'id')::uuid;perform public.host_start_game(sid);
  update public.players set total_score=case when nickname='Jaki' then 7000 else 8500 end,
    correct_answer_count=case nickname when 'Carol' then 12 when 'Roger' then 11 else 20 end,
    total_correct_response_ms=case nickname when 'Carol' then 12000 when 'Roger' then 6000 else 1000 end,
    current_correct_streak=case nickname when 'Carol' then 2 else 1 end,
    longest_correct_streak=case nickname when 'Carol' then 4 else 2 end where game_session_id=sid;
  delete from realtime.messages;
  perform public.host_lock_game(sid);perform public.host_reveal_game(sid);delete from realtime.messages;
  perform public.host_finish_game(sid);
  select count(*) into broadcast_count from realtime.messages;
  assert broadcast_count=2,'Entering the tie-breaker did not use one normal two-recipient refresh';
  assert (select phase='tiebreaker' and tiebreaker_round=1 and cardinality(tiebreaker_used_question_ids)=1 from public.game_sessions where id=sid);
  assert (select count(*)=2 from public.game_tiebreaker_contenders where session_id=sid and round_number=1);
  assert (select bool_and(player_id in ((carol->'player'->>'id')::uuid,(roger->'player'->>'id')::uuid))
    from public.game_tiebreaker_contenders where session_id=sid and round_number=1);
  select jsonb_agg(to_jsonb(p)-'connected'-'last_seen_at' order by id) into stats_before from public.players p where game_session_id=sid;
  safe:=public.get_player_game_state(session->>'roomCode');host_state:=public.session_to_json(sid)->'tieBreaker';
  assert safe->>'phase'='tiebreaker' and safe->'currentQuestion'='null'::jsonb and safe->'reveal'='null'::jsonb and safe->'leaderboard'='[]'::jsonb;
  assert not (safe->'tieBreaker' ? 'correctAnswer') and not (safe->'tieBreaker' ? 'sourceUrl') and not (host_state ? 'correctAnswer') and not (host_state ? 'sourceUrl');
  assert (select bool_and((p->>'totalScore')::integer=0) from jsonb_array_elements(safe->'players') p),'Safe tie-breaker leaked totals';

  -- Submission authentication, shape, contender, deadline and uniqueness.
  failed:=false;begin perform public.submit_tiebreaker_answer('000000',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','1');exception when others then failed:=true;end;assert failed;
  failed:=false;begin perform public.submit_tiebreaker_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,'wrong','1');exception when insufficient_privilege then failed:=true;end;assert failed;
  failed:=false;begin perform public.submit_tiebreaker_answer(session->>'roomCode',(jaki->'player'->>'id')::uuid,jaki->>'reconnectToken','1');exception when insufficient_privilege then failed:=true;end;assert failed;
  foreach first_id in array array['','1e3','NaN','Infinity','1,000','1000000000000001'] loop
    failed:=false;begin perform public.submit_tiebreaker_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken',first_id);exception when others then failed:=true;end;
    assert failed,'Malformed numeric value accepted: '||first_id;
  end loop;
  update public.game_sessions set tiebreaker_opened_at=timing.opened_at,tiebreaker_closes_at=timing.opened_at+interval '20 seconds'
    from (select clock_timestamp()-interval '21 seconds' opened_at) timing where id=sid;
  failed:=false;begin perform public.submit_tiebreaker_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken','1');exception when others then failed:=position('closed' in sqlerrm)>0;end;assert failed,'Late answer accepted';
  update public.game_sessions set tiebreaker_opened_at=timing.opened_at,tiebreaker_closes_at=timing.opened_at+interval '20 seconds'
    from (select clock_timestamp() opened_at) timing where id=sid;
  select q.answer into target from public.game_sessions s join public.tiebreaker_questions q on q.id=s.tiebreaker_question_id where s.id=sid;
  perform public.submit_tiebreaker_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken',(target+10)::text);
  assert (select count(*)=broadcast_count from realtime.messages),'Individual answer created a broadcast';
  reconnect:=public.reconnect_player(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken');
  assert reconnect->'tieBreakerSubmission'->>'questionId'=safe->'tieBreaker'->>'questionId';
  failed:=false;begin perform public.submit_tiebreaker_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken',target::text);exception when unique_violation then failed:=true;end;assert failed,'Duplicate answer accepted';
  perform public.submit_tiebreaker_answer(session->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken',target::text);
  assert (select phase='tiebreaker-result' and tiebreaker_winner_player_id=(roger->'player'->>'id')::uuid from public.game_sessions where id=sid);
  assert (select count(*)=broadcast_count+2 from realtime.messages),'Auto-resolution added more than one normal refresh';
  safe:=public.get_player_game_state(session->>'roomCode');host_state:=public.session_to_json(sid)->'tieBreaker';
  assert safe->'tieBreaker'->>'correctAnswer'=target::text and jsonb_array_length(safe->'tieBreaker'->'results')=2;
  assert not (safe->'tieBreaker' ? 'sourceUrl') and host_state->>'sourceUrl' like 'https://%';
  perform public.host_reveal_tiebreaker_final(sid);
  safe:=public.get_player_game_state(session->>'roomCode');
  assert safe->>'phase'='finished' and safe->'leaderboard'->0->>'playerId'=roger->'player'->>'id';
  assert (select count(*)=count(distinct (entry->>'rank')::integer) from jsonb_array_elements(safe->'leaderboard') entry),'Final ranks are not unique';
  select jsonb_agg(to_jsonb(p)-'connected'-'last_seen_at' order by id) into stats_after from public.players p where game_session_id=sid;
  assert stats_after=stats_before,'Tie-breaker changed quiz statistics';
  failed:=false;begin perform public.submit_tiebreaker_answer(session->>'roomCode',(roger->'player'->>'id')::uuid,roger->>'reconnectToken',target::text);exception when others then failed:=true;end;assert failed,'Finished answer accepted';
  perform public.host_restart_game(sid);
  assert (select phase='lobby' and tiebreaker_question_id is null and tiebreaker_round=0 and cardinality(tiebreaker_used_question_ids)=0 and tiebreaker_winner_player_id is null from public.game_sessions where id=sid);
  assert not exists(select 1 from public.game_tiebreaker_contenders where session_id=sid) and not exists(select 1 from public.game_tiebreaker_answers where session_id=sid);
  perform public.host_close_game(sid);

  -- Exact distance plus exact response time stays unresolved. Nobody answering
  -- also carries the same group into a deterministic unused, different-category question.
  session:=public.host_launch_game((quiz->>'id')::uuid,'{"automaticTieBreakersEnabled":true,"autoLockWhenAllAnswered":false}'::jsonb);
  carol:=public.join_room(session->>'roomCode','Exact Carol');roger:=public.join_room(session->>'roomCode','Exact Roger');
  exact_sid:=(session->>'id')::uuid;perform public.host_start_game(exact_sid);perform public.host_lock_game(exact_sid);perform public.host_reveal_game(exact_sid);perform public.host_finish_game(exact_sid);
  select s.tiebreaker_question_id,q.category,q.answer into first_id,first_category,target from public.game_sessions s join public.tiebreaker_questions q on q.id=s.tiebreaker_question_id where s.id=exact_sid;
  insert into public.game_tiebreaker_answers(session_id,round_number,question_id,player_id,value,submitted_at,response_time_ms) values
    (exact_sid,1,first_id,(carol->'player'->>'id')::uuid,target-10,clock_timestamp(),1500),
    (exact_sid,1,first_id,(roger->'player'->>'id')::uuid,target+10,clock_timestamp(),1500);
  perform public.resolve_tiebreaker_state(exact_sid);
  assert (select phase='tiebreaker-result' and tiebreaker_winner_player_id is null from public.game_sessions where id=exact_sid);
  assert public.tiebreaker_round_outcome(exact_sid,1)->'unresolvedPlayerIds' ? (carol->'player'->>'id') and
    public.tiebreaker_round_outcome(exact_sid,1)->'unresolvedPlayerIds' ? (roger->'player'->>'id');
  perform public.host_next_tiebreaker(exact_sid);
  assert (select tiebreaker_question_id<>first_id and q.category<>first_category from public.game_sessions s join public.tiebreaker_questions q on q.id=s.tiebreaker_question_id where s.id=exact_sid);
  perform public.host_resolve_tiebreaker(exact_sid);
  assert (public.tiebreaker_round_outcome(exact_sid,2)->'unresolvedPlayerIds') ? (carol->'player'->>'id') and
    (public.tiebreaker_round_outcome(exact_sid,2)->'unresolvedPlayerIds') ? (roger->'player'->>'id');
  perform public.host_next_tiebreaker(exact_sid);
  select q.answer into target from public.game_sessions s join public.tiebreaker_questions q on q.id=s.tiebreaker_question_id where s.id=exact_sid;
  perform public.submit_tiebreaker_answer(session->>'roomCode',(carol->'player'->>'id')::uuid,carol->>'reconnectToken',target::text);
  perform public.host_resolve_tiebreaker(exact_sid);
  assert (select tiebreaker_winner_player_id=(carol->'player'->>'id')::uuid from public.game_sessions where id=exact_sid),'Sole submitter did not win';

  -- Points three-way/negative ties and every Survivor winning condition ignore score fallbacks.
  update public.players set total_score=-500 where game_session_id=exact_sid;
  assert cardinality(public.tiebreaker_winning_contenders(exact_sid))=2;
  update public.game_sessions set competition_mode='survivor',survivor_starting_lives=3 where id=exact_sid;
  update public.players set survivor_lives_remaining=case when nickname='Exact Carol' then 1 else 0 end,
    survivor_eliminated_at_question=case when nickname='Exact Carol' then null else 10 end where game_session_id=exact_sid;
  assert cardinality(public.tiebreaker_winning_contenders(exact_sid))=0,'Last living Survivor entered a tie';
  update public.players set survivor_lives_remaining=2,survivor_eliminated_at_question=null where game_session_id=exact_sid;
  assert cardinality(public.tiebreaker_winning_contenders(exact_sid))=2,'Equal living Survivors were not tied';
  update public.players set survivor_lives_remaining=0,survivor_eliminated_at_question=case when nickname='Exact Carol' then 12 else 10 end where game_session_id=exact_sid;
  assert cardinality(public.tiebreaker_winning_contenders(exact_sid))=0,'Unique latest wipeout Survivor entered a tie';
  update public.players set survivor_eliminated_at_question=12 where game_session_id=exact_sid;
  contenders:=public.tiebreaker_winning_contenders(exact_sid);
  assert cardinality(contenders)=2,'Equal latest wipeout Survivors were not tied';
end $tiebreakers$;

select pass('Automatic Tie-Breaker bank, compatibility, authority, resolution, ranking, security and mode rules passed');
select * from finish();
rollback;
