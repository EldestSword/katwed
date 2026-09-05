-- Visual Pinpoint targets. This forward migration is deliberately unreleased.
-- Keep answer keys private, and preserve all existing RPC wrappers and locks.

create function public.pinpoint_cross(a jsonb, b jsonb, p jsonb)
returns numeric language sql immutable set search_path = public as $$
  select ((b->>'x')::numeric - (a->>'x')::numeric) * ((p->>'y')::numeric - (a->>'y')::numeric)
       - ((b->>'y')::numeric - (a->>'y')::numeric) * ((p->>'x')::numeric - (a->>'x')::numeric)
$$;

create function public.pinpoint_on_segment(p jsonb, a jsonb, b jsonb)
returns boolean language sql immutable set search_path = public as $$
  select abs(public.pinpoint_cross(a, b, p)) <= 0.0000000001
    and (p->>'x')::numeric between least((a->>'x')::numeric, (b->>'x')::numeric) - 0.0000000001
                              and greatest((a->>'x')::numeric, (b->>'x')::numeric) + 0.0000000001
    and (p->>'y')::numeric between least((a->>'y')::numeric, (b->>'y')::numeric) - 0.0000000001
                              and greatest((a->>'y')::numeric, (b->>'y')::numeric) + 0.0000000001
$$;

create function public.pinpoint_target_valid(p_target jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_kind text; v_keys text[]; v_key text; v_value numeric;
  v_points jsonb; a jsonb; b jsonb; c jsonb; d jsonb;
  v_n integer; i integer; j integer; v_area numeric := 0;
begin
  if jsonb_typeof(p_target) is distinct from 'object' then return false; end if;
  v_kind := p_target->>'kind';
  v_keys := case v_kind when 'circle' then array['kind','x','y','radius']
    when 'rectangle' then array['kind','x','y','width','height']
    when 'polygon' then array['kind','points'] else null end;
  if v_keys is null or not (p_target ?& v_keys) or (p_target - v_keys) <> '{}'::jsonb then return false; end if;
  if v_kind in ('circle', 'rectangle') then
    foreach v_key in array v_keys loop
      if v_key = 'kind' then continue; end if;
      if jsonb_typeof(p_target->v_key) is distinct from 'number' then return false; end if;
      v_value := (p_target->>v_key)::numeric;
      if v_value not between 0 and 1 then return false; end if;
    end loop;
    if v_kind = 'circle' then return (p_target->>'radius')::numeric >= 0.000001; end if;
    return (p_target->>'width')::numeric > 0 and (p_target->>'height')::numeric > 0
      and (p_target->>'x')::numeric + (p_target->>'width')::numeric <= 1.0000000001
      and (p_target->>'y')::numeric + (p_target->>'height')::numeric <= 1.0000000001;
  end if;
  v_points := p_target->'points';
  if jsonb_typeof(v_points) is distinct from 'array' then return false; end if;
  v_n := jsonb_array_length(v_points);
  if v_n not between 3 and 64 then return false; end if;
  for i in 0..v_n-1 loop
    a := v_points->i;
    if jsonb_typeof(a) is distinct from 'object' or not (a ?& array['x','y'])
      or (a - array['x','y']) <> '{}'::jsonb then return false; end if;
    foreach v_key in array array['x','y'] loop
      if jsonb_typeof(a->v_key) is distinct from 'number' then return false; end if;
      if (a->>v_key)::numeric not between 0 and 1 then return false; end if;
    end loop;
  end loop;
  for i in 0..v_n-1 loop
    a := v_points->i; b := v_points->((i+1)%v_n); c := v_points->((i+2)%v_n);
    v_area := v_area + (a->>'x')::numeric * (b->>'y')::numeric - (b->>'x')::numeric * (a->>'y')::numeric;
    if abs(public.pinpoint_cross(a,b,c)) <= 0.0000000001 and
      ((b->>'x')::numeric-(a->>'x')::numeric)*((c->>'x')::numeric-(b->>'x')::numeric)
      + ((b->>'y')::numeric-(a->>'y')::numeric)*((c->>'y')::numeric-(b->>'y')::numeric) < 0 then return false; end if;
    for j in i+1..v_n-1 loop
      c := v_points->j; d := v_points->((j+1)%v_n);
      if sqrt(power((a->>'x')::numeric-(c->>'x')::numeric,2) + power((a->>'y')::numeric-(c->>'y')::numeric,2)) < 0.000001 then return false; end if;
      if j = i+1 or (i = 0 and j = v_n-1) then continue; end if;
      if (public.pinpoint_cross(a,b,c)*public.pinpoint_cross(a,b,d) < 0 and public.pinpoint_cross(c,d,a)*public.pinpoint_cross(c,d,b) < 0)
        or public.pinpoint_on_segment(c,a,b) or public.pinpoint_on_segment(d,a,b)
        or public.pinpoint_on_segment(a,c,d) or public.pinpoint_on_segment(b,c,d) then return false; end if;
    end loop;
  end loop;
  return abs(v_area)/2 >= 0.0001;
end;
$$;

-- Normalise only absent legacy targets. Explicit null/malformed targets fail the
-- row trigger rather than falling back to an unrelated old circle.
create function public.normalise_pinpoint_target(p_key jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case when p_key ? 'target' then p_key->'target' else jsonb_build_object(
    'kind','circle','x',p_key->'targetX','y',p_key->'targetY','radius',p_key->'targetRadius') end
$$;

-- Private scoring helper; the row trigger guarantees a validated target.
-- Inclusive boundaries and deterministic even/odd ray casting match the client.
create function public.pinpoint_contains(p_target jsonb, p_x numeric, p_y numeric)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  a jsonb; b jsonb; v_points jsonb; i integer; j integer;
  v_inside boolean := false; v_point jsonb := jsonb_build_object('x',p_x,'y',p_y);
begin
  if p_x is null or p_y is null or p_x not between 0 and 1 or p_y not between 0 and 1 then return false; end if;
  case p_target->>'kind'
    when 'circle' then return sqrt(power(p_x-(p_target->>'x')::numeric,2) + power(p_y-(p_target->>'y')::numeric,2)) <= (p_target->>'radius')::numeric + 0.0000000001;
    when 'rectangle' then return p_x between (p_target->>'x')::numeric - 0.0000000001 and (p_target->>'x')::numeric + (p_target->>'width')::numeric + 0.0000000001
      and p_y between (p_target->>'y')::numeric - 0.0000000001 and (p_target->>'y')::numeric + (p_target->>'height')::numeric + 0.0000000001;
    when 'polygon' then
      v_points := p_target->'points'; j := jsonb_array_length(v_points)-1;
      for i in 0..jsonb_array_length(v_points)-1 loop
        a := v_points->j; b := v_points->i;
        if public.pinpoint_on_segment(v_point,a,b) then return true; end if;
        if ((a->>'y')::numeric > p_y) <> ((b->>'y')::numeric > p_y) then
          if p_x < ((b->>'x')::numeric-(a->>'x')::numeric)*(p_y-(a->>'y')::numeric)/((b->>'y')::numeric-(a->>'y')::numeric)+(a->>'x')::numeric then v_inside := not v_inside; end if;
        end if;
        j := i;
      end loop;
      return v_inside;
    else return false;
  end case;
end;
$$;

revoke all on function public.pinpoint_cross(jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.pinpoint_on_segment(jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.pinpoint_target_valid(jsonb) from public, anon, authenticated;
revoke all on function public.normalise_pinpoint_target(jsonb) from public, anon, authenticated;
revoke all on function public.pinpoint_contains(jsonb,numeric,numeric) from public, anon, authenticated;

-- Change only the Pinpoint cases in the retained implementations. Fail loudly if
-- the expected history is missing, instead of silently releasing partial scoring.
do $migration$
declare
  v_definition text; v_updated text;
  v_old text := $old$when 'pinpoint' then jsonb_build_object('targetX', (v_question ->> 'targetX')::numeric, 'targetY', (v_question ->> 'targetY')::numeric, 'targetRadius', (v_question ->> 'targetRadius')::numeric)$old$;
begin
  v_definition := pg_get_functiondef('public.host_save_quiz_without_standard_scoring(jsonb)'::regprocedure);
  v_updated := replace(v_definition, v_old, $new$when 'pinpoint' then jsonb_build_object('target', public.normalise_pinpoint_target(v_question))$new$);
  if v_updated = v_definition then raise exception 'Expected Pinpoint save implementation was not found'; end if;
  execute v_updated;

  v_definition := pg_get_functiondef('public.validate_question_json()'::regprocedure);
  v_updated := regexp_replace(v_definition, 'when ''pinpoint'' then.*?when ''mashup'' then', $new$when 'pinpoint' then
      if new.media ->> 'type' is distinct from 'image'
        or not public.pinpoint_target_valid(public.normalise_pinpoint_target(new.answer_key))
      then raise exception 'Invalid pinpoint configuration'; end if;
      new.answer_key := jsonb_build_object('target', public.normalise_pinpoint_target(new.answer_key));
    when 'mashup' then$new$, 's');
  if v_updated = v_definition then raise exception 'Expected Pinpoint validation implementation was not found'; end if;
  execute v_updated;

  v_definition := pg_get_functiondef('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure);
  v_updated := regexp_replace(v_definition, 'when ''pinpoint'' then.*?when ''typed-answer'' then', $new$when 'pinpoint' then
      if p_answer ->> 'type' is distinct from 'pinpoint'
        or jsonb_typeof(p_answer -> 'x') is distinct from 'number'
        or jsonb_typeof(p_answer -> 'y') is distinct from 'number'
        or (p_answer - array['type','x','y']) <> '{}'::jsonb
      then raise exception 'A normalised Pinpoint x/y point is required'; end if;
      v_x := (p_answer ->> 'x')::numeric; v_y := (p_answer ->> 'y')::numeric;
      if v_x not between 0 and 1 or v_y not between 0 and 1 then raise exception 'Coordinates must be between 0 and 1'; end if;
      v_correct := public.pinpoint_contains(public.normalise_pinpoint_target(v_question.answer_key), v_x, v_y);
    when 'typed-answer' then$new$, 's');
  if v_updated = v_definition then raise exception 'Expected Pinpoint scoring implementation was not found'; end if;
  execute v_updated;
end;
$migration$;

-- Existing rows become exactly equivalent circles, including edge-clipped ones.
-- Owner serialisation and the existing reveal-gated answer_key merge now carry
-- target automatically. question_to_json(..., false) continues to omit it.
update public.questions
set answer_key = jsonb_build_object('target', public.normalise_pinpoint_target(answer_key))
where question_type = 'pinpoint' and not (answer_key ? 'target');
