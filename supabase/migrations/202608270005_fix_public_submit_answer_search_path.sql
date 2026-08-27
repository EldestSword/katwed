-- pgTAP/plpgsql_check reports the installed public submit_answer entry point
-- against an older unqualified pgcrypto call on this production history. Keep
-- the callable entry point restricted while allowing that dependency to resolve.

alter function public.submit_answer(text, uuid, text, jsonb)
  set search_path = public, extensions;
