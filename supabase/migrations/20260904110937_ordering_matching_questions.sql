-- Ordering and Matching: forward-only, database-first support. No new traffic or tables.
alter table public.questions drop constraint questions_type_check;
alter table public.questions add constraint questions_type_check check (question_type in (
  'single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'typed-answer', 'mashup', 'ordering', 'matching'
));

create function public.arrangement_trim(p_text text) returns text
language sql immutable set search_path = public as $$
  -- Match JavaScript trim, including non-breaking and Unicode spacing characters.
  select btrim(p_text, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;

create function public.arrangement_items_valid(p_items jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
begin
  if jsonb_typeof(p_items) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_items) not between 2 and 8 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item where
    jsonb_typeof(item) is distinct from 'object'
    or jsonb_typeof(item->'id') is distinct from 'string'
    or char_length(item->>'id') not between 1 and 128
    or jsonb_typeof(item->'label') is distinct from 'string'
    or char_length(public.arrangement_trim(item->>'label')) not between 1 and 120
    or item - array['id','label'] <> '{}'::jsonb
  ) then return false; end if;
  return (select count(distinct item->>'id') = count(*)
    and count(distinct lower(public.arrangement_trim(item->>'label'))) = count(*)
    from jsonb_array_elements(p_items) item);
end $$;

create function public.arrangement_permutation_valid(p_ids jsonb, p_items jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
begin
  if jsonb_typeof(p_ids) is distinct from 'array' or jsonb_typeof(p_items) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_ids) <> jsonb_array_length(p_items) then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_ids) id where jsonb_typeof(id) <> 'string'
    or not exists (select 1 from jsonb_array_elements(p_items) item where item->'id' = id)) then return false; end if;
  return (select count(distinct id) = count(*) from jsonb_array_elements(p_ids) id);
end $$;

create function public.arrangement_pairs_valid(p_pairs jsonb, p_left jsonb, p_right jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare v_left jsonb; v_right jsonb;
begin
  if jsonb_typeof(p_pairs) is distinct from 'array' then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_pairs) pair where
    jsonb_typeof(pair) is distinct from 'object' or not pair ?& array['leftId','rightId']
    or pair - array['leftId','rightId'] <> '{}'::jsonb) then return false; end if;
  select coalesce(jsonb_agg(pair->'leftId'),'[]'), coalesce(jsonb_agg(pair->'rightId'),'[]')
    into v_left, v_right from jsonb_array_elements(p_pairs) pair;
  return public.arrangement_permutation_valid(v_left,p_left) and public.arrangement_permutation_valid(v_right,p_right);
end $$;

create function public.arrangement_trim_items(p_items jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_agg(jsonb_build_object('id',item->'id','label',public.arrangement_trim(item->>'label')) order by n)
  from jsonb_array_elements(p_items) with ordinality as items(item,n)
$$;

-- Sort from IDs and a seed only: authored positions and answer keys never influence it.
-- Independent side seeds avoid aligning matching rows. A coincidental correct order is
-- allowed: forcing an incorrect two-item order would reveal its answer by inversion.
create function public.arrangement_display_items(p_items jsonb, p_seed text) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_agg(jsonb_build_object('id',item->'id','label',item->'label')
    order by md5(p_seed || ':' || (item->>'id')), item->>'id')
  from jsonb_array_elements(p_items) item
$$;

create function public.arrangement_safe_config(p_type text, p_config jsonb, p_seed text) returns jsonb
language sql immutable set search_path = public as $$
  select case p_type
    when 'ordering' then jsonb_build_object('items',public.arrangement_display_items(p_config->'items',p_seed||':ordering'))
    when 'matching' then jsonb_build_object(
      'leftItems',public.arrangement_display_items(p_config->'leftItems',p_seed||':left'),
      'rightItems',public.arrangement_display_items(p_config->'rightItems',p_seed||':right'),
      'scoringMode',p_config->'scoringMode')
    else p_config end
$$;

create function public.score_arrangement_answer(p_type text, p_config jsonb, p_key jsonb, p_answer jsonb, p_points integer)
returns table(correct boolean, points integer)
language plpgsql immutable set search_path = public as $$
declare v_count integer; v_total integer;
begin
  if jsonb_typeof(p_answer) is distinct from 'object' or p_answer->>'type' is distinct from p_type then
    raise exception 'Answer type does not match the question';
  end if;
  if p_type = 'ordering' then
    if p_answer - array['type','itemIds'] <> '{}'::jsonb
      or not public.arrangement_permutation_valid(p_answer->'itemIds',p_config->'items') then
      raise exception 'Ordering requires every item exactly once';
    end if;
    correct := p_answer->'itemIds' = p_key->'correctItemIds';
    points := case when correct then p_points else 0 end;
  elsif p_type = 'matching' then
    if p_answer - array['type','pairs'] <> '{}'::jsonb
      or not public.arrangement_pairs_valid(p_answer->'pairs',p_config->'leftItems',p_config->'rightItems') then
      raise exception 'Matching requires every item in exactly one pair';
    end if;
    v_total := jsonb_array_length(p_key->'correctPairs');
    select count(*) into v_count from jsonb_array_elements(p_answer->'pairs') pair
      where p_key->'correctPairs' @> jsonb_build_array(pair);
    correct := v_count = v_total;
    points := case when correct then p_points when p_config->>'scoringMode' = 'partial'
      then floor(p_points::numeric * v_count / v_total)::integer else 0 end;
  else raise exception 'Unsupported arrangement type'; end if;
  return next;
end $$;

-- Patch retained implementations, preserving all existing authentication, deadlines,
-- per-player writes, Team aggregation, Round Intro and H2H progression wrappers.
do $patch$
declare v_definition text; v_old text; v_new text;
begin
  v_definition := pg_get_functiondef('public.validate_question_json()'::regprocedure);
  v_old := 'case new.question_type';
  v_new := $body$case new.question_type
    when 'ordering' then
      if new.type_config - 'items' <> '{}'::jsonb or new.answer_key - 'correctItemIds' <> '{}'::jsonb
        or not public.arrangement_items_valid(new.type_config->'items')
        or not public.arrangement_permutation_valid(new.answer_key->'correctItemIds',new.type_config->'items') then
        raise exception 'Invalid Ordering configuration';
      end if;
      new.type_config := jsonb_build_object('items',public.arrangement_trim_items(new.type_config->'items'));
    when 'matching' then
      if new.type_config - array['leftItems','rightItems','scoringMode'] <> '{}'::jsonb
        or new.answer_key - 'correctPairs' <> '{}'::jsonb
        or not public.arrangement_items_valid(new.type_config->'leftItems')
        or not public.arrangement_items_valid(new.type_config->'rightItems')
        or coalesce(new.type_config->>'scoringMode','') not in ('exact','partial')
        or not public.arrangement_pairs_valid(new.answer_key->'correctPairs',new.type_config->'leftItems',new.type_config->'rightItems') then
        raise exception 'Invalid Matching configuration';
      end if;
      if exists (select 1 from jsonb_array_elements(new.type_config->'leftItems') l
        join jsonb_array_elements(new.type_config->'rightItems') r on l->>'id' = r->>'id') then
        raise exception 'Matching IDs must be unique across both sides';
      end if;
      new.type_config := new.type_config || jsonb_build_object(
        'leftItems',public.arrangement_trim_items(new.type_config->'leftItems'),
        'rightItems',public.arrangement_trim_items(new.type_config->'rightItems'));$body$;
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained question validation'; end if;
  execute replace(v_definition,v_old,v_new);

  v_definition := pg_get_functiondef('public.host_save_quiz_without_standard_scoring(jsonb)'::regprocedure);
  v_old := 'v_config := case v_type';
  v_new := $body$v_config := case v_type
      when 'ordering' then jsonb_build_object('items',v_question->'items')
      when 'matching' then jsonb_build_object('leftItems',v_question->'leftItems','rightItems',v_question->'rightItems','scoringMode',v_question->'scoringMode')$body$;
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained quiz configuration save'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := 'v_answer := case v_type';
  v_new := $body$v_answer := case v_type
      when 'ordering' then jsonb_build_object('correctItemIds',v_question->'correctItemIds')
      when 'matching' then jsonb_build_object('correctPairs',v_question->'correctPairs')$body$;
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained answer-key save'; end if;
  execute replace(v_definition,v_old,v_new);

  v_definition := pg_get_functiondef('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure);
  v_old := 'case v_question.question_type';
  v_new := $body$case v_question.question_type
    when 'ordering', 'matching' then
      select result.correct, result.points into v_correct, v_points from public.score_arrangement_answer(
        v_question.question_type,v_question.type_config,v_question.answer_key,p_answer,v_question.points) result;$body$;
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained answer scoring'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := 'if v_question.speed_scoring_enabled then';
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained speed scoring'; end if;
  execute replace(v_definition,v_old,'if v_question.speed_scoring_enabled and (v_question.question_type <> ''matching'' or v_correct) then');

  v_definition := pg_get_functiondef('public.question_to_json(uuid,boolean)'::regprocedure);
  v_old := '|| x.type_config';
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained question serialisation'; end if;
  execute replace(v_definition,v_old,'|| case when p_include_answer then x.type_config else public.arrangement_safe_config(x.question_type,x.type_config,x.id::text) end');

  -- The original reader strips scoringMode for Multiple Select. Matching's public
  -- rules need it; restore only that type using the question row already loaded.
  v_definition := pg_get_functiondef('public.get_player_game_state_without_answer_palette(text)'::regprocedure);
  v_old := 'public.question_to_json(v_question.id, false) - ''quizId'' - ''revealCaption'' - ''scoringMode''';
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained safe configuration filter'; end if;
  execute replace(v_definition,v_old,v_old || ' || case when v_question.question_type = ''matching'' then jsonb_build_object(''scoringMode'',v_question.type_config->''scoringMode'') else ''{}''::jsonb end');

  v_definition := pg_get_functiondef('public.get_player_game_state(text)'::regprocedure);
  v_old := 'return v_result || jsonb_build_object(''teams'',public.team_definitions(v_session.id),';
  v_new := $body$if v_result->'currentQuestion'->>'type' in ('ordering','matching') then
    v_result := jsonb_set(v_result,'{currentQuestion}',(v_result->'currentQuestion') || public.arrangement_safe_config(
      v_result->'currentQuestion'->>'type',v_result->'currentQuestion',v_session.answer_option_seed || ':' || (v_result->'currentQuestion'->>'id')));
    if v_result->'reveal'->>'type' = 'matching' then
      v_result := jsonb_set(v_result,'{reveal}',(v_result->'reveal') || jsonb_build_object('scoringMode',v_result->'currentQuestion'->'scoringMode'));
    end if;
  end if;
  return v_result || jsonb_build_object('teams',public.team_definitions(v_session.id),$body$;
  if strpos(v_definition,v_old) = 0 then raise exception 'Missing retained Team safe-state serialisation'; end if;
  execute replace(v_definition,v_old,v_new);
end $patch$;

revoke all on function public.arrangement_trim(text), public.arrangement_items_valid(jsonb),
  public.arrangement_permutation_valid(jsonb,jsonb), public.arrangement_pairs_valid(jsonb,jsonb,jsonb),
  public.arrangement_trim_items(jsonb), public.arrangement_display_items(jsonb,text),
  public.arrangement_safe_config(text,jsonb,text), public.score_arrangement_answer(text,jsonb,jsonb,jsonb,integer)
  from public, anon, authenticated;
