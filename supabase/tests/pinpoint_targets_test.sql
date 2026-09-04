begin;
select plan(1);

-- No persistent data. Exercise the actual question trigger on an isolated row.
create temporary table pinpoint_validation_probe (
  question_type text, media jsonb, type_config jsonb default '{}', answer_key jsonb,
  progressive_reveal_enabled boolean not null default false,
  wager_enabled boolean not null default false, quiz_id uuid
);
create trigger pinpoint_validation_probe_trigger before insert or update on pinpoint_validation_probe
for each row execute function public.validate_question_json();

do $$
declare
  v_circle jsonb := '{"kind":"circle","x":0.5,"y":0.5,"radius":0.1}';
  v_rect jsonb := '{"kind":"rectangle","x":0.2,"y":0.3,"width":0.4,"height":0.3}';
  v_poly jsonb := '{"kind":"polygon","points":[{"x":0.1,"y":0.1},{"x":0.9,"y":0.1},{"x":0.9,"y":0.4},{"x":0.4,"y":0.4},{"x":0.4,"y":0.9},{"x":0.1,"y":0.9}]}';
  v_bad jsonb; v_key jsonb; v_definition text;
begin
  assert public.normalise_pinpoint_target('{"targetX":0.5,"targetY":0.5,"targetRadius":0.1}') = v_circle, 'Legacy circle changed';
  assert public.normalise_pinpoint_target('{"target":null,"targetX":0.5,"targetY":0.5,"targetRadius":0.1}') = 'null'::jsonb, 'Invalid new target fell back';
  assert public.pinpoint_target_valid(v_circle) and public.pinpoint_target_valid(v_rect) and public.pinpoint_target_valid(v_poly), 'Valid shape rejected';
  assert public.pinpoint_contains(v_circle,.6,.5) and not public.pinpoint_contains(v_circle,.61,.5), 'Circle hit/miss';
  assert public.pinpoint_contains(v_rect,.6,.6) and not public.pinpoint_contains(v_rect,.61,.6), 'Rectangle hit/miss';
  assert public.pinpoint_contains(v_poly,.4,.7) and public.pinpoint_contains(v_poly,.2,.7)
    and not public.pinpoint_contains(v_poly,.7,.7), 'Concave polygon hit/miss';
  assert not public.pinpoint_contains(v_poly,null,.5) and not public.pinpoint_contains(v_poly,1.1,.5), 'Invalid answer point';
  for v_bad in select value from jsonb_array_elements('[
    null, {}, {"kind":"circle","x":0.5,"y":0.5,"radius":0},
    {"kind":"circle","x":"0.5","y":0.5,"radius":0.1},
    {"kind":"circle","x":0.5,"y":0.5,"radius":0.1,"extra":true},
    {"kind":"rectangle","x":0.9,"y":0.3,"width":0.4,"height":0.3},
    {"kind":"rectangle","x":0.1,"y":0.3,"width":0,"height":0.3},
    {"kind":"polygon","points":[]},
    {"kind":"polygon","points":[{"x":0,"y":0},{"x":0.5,"y":0.5},{"x":1,"y":1}]},
    {"kind":"polygon","points":[{"x":0,"y":0},{"x":0.001,"y":0},{"x":0,"y":0.001}]},
    {"kind":"polygon","points":[{"x":0,"y":0},{"x":1,"y":1},{"x":0,"y":1},{"x":1,"y":0}]},
    {"kind":"polygon","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1},{"x":0,"y":0}]}
  ]') loop
    assert not public.pinpoint_target_valid(v_bad), 'Malformed target accepted';
    begin
      insert into pinpoint_validation_probe(question_type,media,answer_key)
      values ('pinpoint','{"type":"image"}',jsonb_build_object('target',v_bad));
      raise exception 'Invalid target passed the row trigger';
    exception when raise_exception then
      if sqlerrm <> 'Invalid pinpoint configuration' then raise; end if;
    end;
  end loop;
  insert into pinpoint_validation_probe(question_type,media,answer_key)
  values ('pinpoint','{"type":"image"}','{"targetX":0.5,"targetY":0.5,"targetRadius":0.1}') returning answer_key into v_key;
  assert v_key = jsonb_build_object('target',v_circle), 'Legacy row was not normalised';
  update pinpoint_validation_probe set answer_key = jsonb_build_object('target',v_rect) returning answer_key into v_key;
  assert v_key = jsonb_build_object('target',v_rect), 'Rectangle did not persist';
  update pinpoint_validation_probe set answer_key = jsonb_build_object('target',v_poly) returning answer_key into v_key;
  assert v_key = jsonb_build_object('target',v_poly), 'Polygon did not persist';
  assert not has_function_privilege('anon','public.pinpoint_contains(jsonb,numeric,numeric)','execute'), 'Public scoring helper exposed';
  assert not has_function_privilege('authenticated','public.pinpoint_target_valid(jsonb)','execute'), 'Host geometry helper exposed';
  v_definition := pg_get_functiondef('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure);
  assert position('public.pinpoint_contains' in v_definition) > 0, 'Authoritative scoring not updated';
  assert position('for share' in lower(v_definition)) > 0, 'Shared session lock changed';
  assert position('extensions.digest' in v_definition) > 0, 'Reconnect verification changed';
  assert position('v_now > v_session.question_closes_at' in v_definition) > 0, 'Deadline check changed';
end;
$$;

select pass('Pinpoint normalisation, geometry, row validation and private scoring checks');
select * from finish();
rollback;
