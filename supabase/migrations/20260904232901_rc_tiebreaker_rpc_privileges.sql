-- Supabase may grant EXECUTE directly to anon through default privileges.
-- Revoking PUBLIC alone does not remove that independent grant. These three
-- host RPCs already check ownership; retain their authenticated-only API surface.
revoke all on function public.host_resolve_tiebreaker(uuid) from public, anon;
revoke all on function public.host_next_tiebreaker(uuid) from public, anon;
revoke all on function public.host_reveal_tiebreaker_final(uuid) from public, anon;
grant execute on function public.host_resolve_tiebreaker(uuid) to authenticated;
grant execute on function public.host_next_tiebreaker(uuid) to authenticated;
grant execute on function public.host_reveal_tiebreaker_final(uuid) to authenticated;
