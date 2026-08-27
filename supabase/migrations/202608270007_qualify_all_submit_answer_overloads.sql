-- Cover any legacy submit_answer overload retained by an older environment. The
-- exact predicate replacement cannot touch already-qualified calls.

do $$
declare
  v_oid oid;
  v_definition text;
  v_repaired text;
begin
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('submit_answer', 'submit_answer_without_session_prelude')
  loop
    v_definition := pg_get_functiondef(v_oid);
    v_repaired := replace(
      v_definition,
      'reconnect_token_hash = digest(',
      'reconnect_token_hash = extensions.digest('
    );
    if v_repaired <> v_definition then execute v_repaired; end if;
  end loop;
end;
$$;
