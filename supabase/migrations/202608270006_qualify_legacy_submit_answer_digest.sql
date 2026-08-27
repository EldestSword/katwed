-- Production schema lint can retain the earliest unqualified pgcrypto call in a
-- submit_answer body even after later replacements and wrappers. Qualify only
-- that legacy dependency in place, preserving the installed validation/scoring
-- body, ownership, arguments and grants across compatible production histories.

do $$
declare
  v_function regprocedure;
  v_definition text;
begin
  foreach v_function in array array[
    to_regprocedure('public.submit_answer(text,uuid,text,jsonb)'),
    to_regprocedure('public.submit_answer_without_session_prelude(text,uuid,text,jsonb)')
  ] loop
    if v_function is null then continue; end if;
    v_definition := pg_get_functiondef(v_function);
    if position('digest(' in v_definition) > 0
      and position('extensions.digest(' in v_definition) = 0 then
      execute replace(v_definition, 'digest(', 'extensions.digest(');
    end if;
  end loop;
end;
$$;
