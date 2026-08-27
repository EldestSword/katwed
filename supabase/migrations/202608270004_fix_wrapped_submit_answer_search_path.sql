-- The preflight migration wraps the latest submit_answer function so that it can
-- reject every question type during a server-timed prelude. Some production
-- histories retain an unqualified pgcrypto digest call in that wrapped body.
-- Keep its restricted search path while making the installed extensions schema
-- explicit; the public wrapper and its grants remain unchanged.

alter function public.submit_answer_without_session_prelude(text, uuid, text, jsonb)
  set search_path = public, extensions;
