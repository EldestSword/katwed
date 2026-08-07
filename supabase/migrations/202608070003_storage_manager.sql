-- Allow authenticated hosts to list only their own Katwed image folder and
-- classify bounded cleanup candidates against every quiz reference.

create policy "question_images_host_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.host_classify_media_paths(p_paths text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_paths, 1), 0) > 200 then
    raise exception 'At most 200 media paths can be checked at once.';
  end if;

  return (
    with supplied_paths as (
      select distinct trim(path) as path
      from unnest(coalesce(p_paths, array[]::text[])) as supplied(path)
    ),
    candidates as (
      select supplied.path
      from supplied_paths supplied
      where supplied.path ~* (
        '^' || v_user_id::text ||
        '/[0-9]{4}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      )
    ),
    all_media_references as (
      select q.cover_image_path as reference
      from public.quizzes q
      union all
      select x.media ->> 'path' as reference
      from public.questions x
      where x.media ->> 'type' = 'image'
      union all
      select x.image_path as reference
      from public.questions x
      union all
      select o.image_path as reference
      from public.question_options o
    ),
    classified as (
      select candidate.path, exists (
        select 1
        from all_media_references media
        where nullif(trim(media.reference), '') is not null
          and (
            trim(media.reference) = candidate.path
            or (
              trim(media.reference) like '%/storage/v1/object/public/question-images/%'
              and right(
                split_part(split_part(trim(media.reference), '?', 1), '#', 1),
                length(candidate.path)
              ) = candidate.path
            )
          )
      ) as is_referenced
      from candidates candidate
    )
    select jsonb_build_object(
      'referencedPaths', coalesce((
        select jsonb_agg(classified.path order by classified.path)
        from classified where classified.is_referenced
      ), '[]'::jsonb),
      'unusedPaths', coalesce((
        select jsonb_agg(classified.path order by classified.path)
        from classified where not classified.is_referenced
      ), '[]'::jsonb),
      'ignoredPaths', coalesce((
        select jsonb_agg(supplied.path order by supplied.path)
        from supplied_paths supplied
        where not exists (select 1 from candidates candidate where candidate.path = supplied.path)
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.host_classify_media_paths(text[]) from public, anon;
grant execute on function public.host_classify_media_paths(text[]) to authenticated;
