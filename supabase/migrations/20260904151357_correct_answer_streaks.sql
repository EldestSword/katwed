-- Standard runtime statistics only: no scoring, quiz-definition or transport changes.
alter table public.players
  add column current_correct_streak integer not null default 0,
  add column longest_correct_streak integer not null default 0,
  add constraint players_correct_streaks_check check (current_correct_streak >= 0 and longest_correct_streak >= current_correct_streak);

-- Trusted callers already hold the session lock. One bounded, set-based history
-- scan includes the complete roster, so absent answers break runs too.
create function public.recompute_player_streaks(p_session_id uuid, p_player_id uuid, p_completed_count integer)
returns void language plpgsql set search_path = public as $$
declare v_session public.game_sessions;
begin
  select s.* into strict v_session from public.game_sessions s
    join public.quizzes q on q.id=s.quiz_id where s.id=p_session_id and q.quiz_type='standard';
  if v_session.phase not in ('reveal','leaderboard') or p_completed_count is null or p_completed_count < 0 or
    p_completed_count > least(cardinality(v_session.question_order),v_session.current_question_index+1) then
    raise exception 'Invalid completed-question boundary for streaks';
  end if;
  with roster as (
    select id from public.players where game_session_id=p_session_id and (p_player_id is null or id=p_player_id)
  ), history as (
    select p.id, q.position, coalesce(a.correct,false) correct
    from roster p cross join unnest(v_session.question_order) with ordinality q(question_id,position)
    left join public.player_answers a on a.game_session_id=p_session_id and a.player_id=p.id and a.question_id=q.question_id
    where q.position <= p_completed_count
  ), runs as (
    select id, position, position - coalesce(max(position) filter(where not correct)
      over(partition by id order by position rows between unbounded preceding and current row),0) run
    from history
  ), totals as (
    select id, max(run)::integer longest, max(run) filter(where position=p_completed_count)::integer current
    from runs group by id
  )
  update public.players p set current_correct_streak=coalesce(t.current,0), longest_correct_streak=coalesce(t.longest,0)
  from roster r left join totals t on t.id=r.id
  where p.id=r.id and (p.current_correct_streak,p.longest_correct_streak) is distinct from (coalesce(t.current,0),coalesce(t.longest,0));
end $$;
revoke all on function public.recompute_player_streaks(uuid,uuid,integer) from public,anon,authenticated;

create function pg_temp.patch_streak_function(p_signature text,p_old text,p_new text) returns void language plpgsql as $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in definition)=0 then raise exception 'Missing Streak predecessor in %: %',p_signature,p_old; end if;
  execute replace(definition,p_old,p_new);
end $$;

-- Finalise only on the existing explicit Reveal -> Leaderboard / Finished action.
-- Early Finish from Question/Locked keeps the previous completed statistics.
select pg_temp.patch_streak_function('public.host_change_phase(uuid,text)',
  $old$      update public.game_sessions set phase = 'leaderboard' where id = p_session_id;$old$,
  $new$      perform public.recompute_player_streaks(p_session_id,null,v_session.current_question_index+1);
      update public.game_sessions set phase = 'leaderboard' where id = p_session_id;$new$);
select pg_temp.patch_streak_function('public.host_change_phase(uuid,text)',
  $old$      if v_session.phase not in ('question', 'locked', 'reveal') then raise exception 'The game cannot be finished from this phase.'; end if;$old$,
  $new$      if v_session.phase not in ('question', 'locked', 'reveal') then raise exception 'The game cannot be finished from this phase.'; end if;
      if v_session.phase='reveal' then
        perform public.recompute_player_streaks(p_session_id,null,v_session.current_question_index+1);
      end if;$new$);
select pg_temp.patch_streak_function('public.host_change_phase(uuid,text)',
  $old$update public.players set total_score = 0, correct_answer_count = 0, total_correct_response_ms = 0 where game_session_id = p_session_id;$old$,
  $new$update public.players set total_score = 0, correct_answer_count = 0, total_correct_response_ms = 0,
        current_correct_streak = 0, longest_correct_streak = 0 where game_session_id = p_session_id;$new$);

-- Answer/score/metric changes above this point remain byte-for-byte unchanged.
select pg_temp.patch_streak_function('public.host_set_typed_answer_override(uuid,uuid,boolean)',
  $old$  where id = v_answer.player_id and game_session_id = v_session.id;$old$,
  $new$  where id = v_answer.player_id and game_session_id = v_session.id;
  if v_session.phase='leaderboard' then
    perform public.recompute_player_streaks(v_session.id,v_answer.player_id,v_session.current_question_index+1);
  end if;$new$);

-- Prior completed streaks are safe throughout a question. Totals/answer keys keep
-- their existing gates; no current result reaches these columns before finalisation.
select pg_temp.patch_streak_function('public.session_to_json_without_launch_settings(uuid)',
  $old$'totalCorrectResponseMs', p.total_correct_response_ms$old$,
  $new$'totalCorrectResponseMs', p.total_correct_response_ms,
        'currentCorrectStreak', p.current_correct_streak, 'longestCorrectStreak', p.longest_correct_streak$new$);
select pg_temp.patch_streak_function('public.get_player_game_state_without_answer_palette(text)',
  $old$'totalCorrectResponseMs', case when v_scores_visible then p.total_correct_response_ms else 0 end$old$,
  $new$'currentCorrectStreak', p.current_correct_streak, 'longestCorrectStreak', p.longest_correct_streak,
      'totalCorrectResponseMs', case when v_scores_visible then p.total_correct_response_ms else 0 end$new$);
select pg_temp.patch_streak_function('public.get_player_game_state_without_answer_palette(text)',
  $old$'rank', ranked.rank$old$,
  $new$'currentCorrectStreak', ranked.current_correct_streak, 'longestCorrectStreak', ranked.longest_correct_streak,
      'rank', ranked.rank$new$);
select pg_temp.patch_streak_function('public.reconnect_player_without_teams(text,uuid,text)',
  $old$'totalScore', case when v_scores_visible then v_player.total_score else 0 end$old$,
  $new$'currentCorrectStreak', v_player.current_correct_streak, 'longestCorrectStreak', v_player.longest_correct_streak,
    'totalScore', case when v_scores_visible then v_player.total_score else 0 end$new$);
select pg_temp.patch_streak_function('public.join_room_without_teams(text,text)',
  $old$'totalScore', 0, 'correctAnswerCount', 0, 'totalCorrectResponseMs', 0$old$,
  $new$'totalScore', 0, 'correctAnswerCount', 0, 'totalCorrectResponseMs', 0,
    'currentCorrectStreak', 0, 'longestCorrectStreak', 0$new$);
select pg_temp.patch_streak_function('public.join_head_to_head_room(text,uuid)',
  $old$'totalScore', 0, 'correctAnswerCount', 0, 'totalCorrectResponseMs', 0$old$,
  $new$'totalScore', 0, 'correctAnswerCount', 0, 'totalCorrectResponseMs', 0,
    'currentCorrectStreak', 0, 'longestCorrectStreak', 0$new$);
