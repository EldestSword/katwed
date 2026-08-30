-- Expand the controlled visual-theme catalogue to Batch 2 without changing quiz data,
-- player-safe state, scoring, phases or any public answer boundary.

create or replace function public.is_quiz_background_compatible(
  p_theme_id text,
  p_background_id text
)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select exists (
    select 1
    from (values
      ('katwed', 'katwed-bubbles'),
      ('katwed', 'katwed-confetti'),
      ('katwed', 'katwed-ribbons'),
      ('midnight', 'midnight-aurora'),
      ('midnight', 'midnight-glow'),
      ('midnight', 'midnight-stars'),
      ('sunset', 'sunset-horizon'),
      ('sunset', 'sunset-lights'),
      ('sunset', 'sunset-ribbons'),
      ('arcade', 'arcade-circuit'),
      ('arcade', 'arcade-grid'),
      ('arcade', 'arcade-neon'),
      ('mint', 'mint-depth'),
      ('mint', 'mint-shapes'),
      ('mint', 'mint-waves'),
      ('paper', 'paper-collage'),
      ('paper', 'paper-geometry'),
      ('paper', 'paper-notebook'),
      ('hard-rock', 'hard-rock-stage-lights'),
      ('hard-rock', 'hard-rock-amps'),
      ('hard-rock', 'hard-rock-electric-storm'),
      ('jazz', 'jazz-blue-note'),
      ('jazz', 'jazz-after-hours'),
      ('jazz', 'jazz-brass'),
      ('disco', 'disco-mirror'),
      ('disco', 'disco-lightfloor'),
      ('disco', 'disco-starburst'),
      ('1980s', '1980s-broadcast'),
      ('1980s', '1980s-chrome'),
      ('1980s', '1980s-motion'),
      ('1990s', '1990s-shapes'),
      ('1990s', '1990s-airwave'),
      ('1990s', '1990s-studio'),
      ('chiptune', 'chiptune-pixels'),
      ('chiptune', 'chiptune-blockworld'),
      ('chiptune', 'chiptune-bitstream'),
      ('synthwave', 'synthwave-horizon'),
      ('synthwave', 'synthwave-laser'),
      ('synthwave', 'synthwave-chrome'),
      ('spy-noir', 'spy-noir-shadows'),
      ('spy-noir', 'spy-noir-venetian'),
      ('spy-noir', 'spy-noir-smoke'),
      ('sci-fi', 'sci-fi-orbit'),
      ('sci-fi', 'sci-fi-nebula'),
      ('sci-fi', 'sci-fi-interface'),
      ('medieval', 'medieval-illuminated'),
      ('medieval', 'medieval-tapestry'),
      ('medieval', 'medieval-candlelight'),
      ('western', 'western-sundown'),
      ('western', 'western-weathered'),
      ('western', 'western-turquoise'),
      ('pirate', 'pirate-chart'),
      ('pirate', 'pirate-deepwater'),
      ('pirate', 'pirate-compass'),
      ('halloween', 'halloween-moonlight'),
      ('halloween', 'halloween-pumpkin-glow'),
      ('halloween', 'halloween-haunted'),
      ('christmas', 'christmas-lights'),
      ('christmas', 'christmas-snow'),
      ('christmas', 'christmas-ribbons'),
      ('retro-game-show', 'retro-game-show-panels'),
      ('retro-game-show', 'retro-game-show-rings'),
      ('retro-game-show', 'retro-game-show-studio'),
      ('blues', 'blues-smoke'),
      ('blues', 'blues-electric'),
      ('blues', 'blues-stage'),
      ('pop', 'pop-gradient'),
      ('pop', 'pop-bubbles'),
      ('pop', 'pop-spotlight'),
      ('ska', 'ska-check'),
      ('ska', 'ska-brass'),
      ('ska', 'ska-sunburst'),
      ('rocksteady', 'rocksteady-sundown'),
      ('rocksteady', 'rocksteady-vinyl'),
      ('rocksteady', 'rocksteady-groove'),
      ('soul', 'soul-velvet'),
      ('soul', 'soul-brass'),
      ('soul', 'soul-studio'),
      ('punk', 'punk-xerox'),
      ('punk', 'punk-torn'),
      ('punk', 'punk-stage'),
      ('1940s', '1940s-deco'),
      ('1940s', '1940s-radio'),
      ('1940s', '1940s-ballroom'),
      ('1950s', '1950s-boomerang'),
      ('1950s', '1950s-chrome'),
      ('1950s', '1950s-jukebox'),
      ('1960s', '1960s-mod'),
      ('1960s', '1960s-op-art'),
      ('1960s', '1960s-pop'),
      ('1970s', '1970s-groove'),
      ('1970s', '1970s-sunburst'),
      ('1970s', '1970s-lounge'),
      ('90s-rave', '90s-rave-lasers'),
      ('90s-rave', '90s-rave-strobe'),
      ('90s-rave', '90s-rave-acid'),
      ('hip-hop', 'hip-hop-vinyl'),
      ('hip-hop', 'hip-hop-blocks'),
      ('hip-hop', 'hip-hop-paint'),
      ('greek', 'greek-aegean'),
      ('greek', 'greek-mosaic'),
      ('greek', 'greek-sun'),
      ('french', 'french-boulevard'),
      ('french', 'french-cinema'),
      ('french', 'french-editorial'),
      ('italian', 'italian-cinema'),
      ('italian', 'italian-marble'),
      ('italian', 'italian-riviera')
    ) as allowed(theme_id, background_id)
    where allowed.theme_id = p_theme_id
      and allowed.background_id = p_background_id
  )
$$;

alter table public.quizzes
  drop constraint quizzes_background_theme_check,
  drop constraint quizzes_theme_id_check,
  add constraint quizzes_theme_id_check check (theme_id in (
    'katwed', 'midnight', 'sunset', 'arcade', 'mint', 'paper',
    'hard-rock', 'jazz', 'disco', '1980s', '1990s', 'chiptune', 'synthwave',
    'spy-noir', 'sci-fi', 'medieval', 'western', 'pirate', 'halloween',
    'christmas', 'retro-game-show',
    'blues', 'pop', 'ska', 'rocksteady', 'soul', 'punk', '1940s', '1950s',
    '1960s', '1970s', '90s-rave', 'hip-hop', 'greek', 'french', 'italian'
  )),
  add constraint quizzes_background_theme_check check (
    background_id is null
    or public.is_quiz_background_compatible(theme_id, background_id)
  );

-- Preserve the same stale-client behaviour established by Batch 1 while extending
-- its authoritative compatibility check to every Batch 2 pair.
alter function public.host_save_quiz(jsonb)
  rename to host_save_quiz_without_visual_theme_batch_2;

revoke all on function public.host_save_quiz_without_visual_theme_batch_2(jsonb)
  from public, anon, authenticated;

create or replace function public.host_save_quiz(p_quiz jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forward_quiz jsonb := p_quiz;
  v_existing_background_id text;
begin
  if p_quiz ? 'themeId'
    and not (p_quiz ? 'backgroundId')
    and nullif(p_quiz ->> 'id', '') is not null
  then
    select q.background_id
    into v_existing_background_id
    from public.quizzes q
    where q.id = (p_quiz ->> 'id')::uuid
      and q.owner_id = auth.uid();

    if found then
      if v_existing_background_id is not null
        and public.is_quiz_background_compatible(
          p_quiz ->> 'themeId',
          v_existing_background_id
        )
      then
        v_forward_quiz := jsonb_set(
          p_quiz,
          '{backgroundId}',
          to_jsonb(v_existing_background_id),
          true
        );
      else
        v_forward_quiz := jsonb_set(p_quiz, '{backgroundId}', 'null'::jsonb, true);
      end if;
    end if;
  end if;

  return public.host_save_quiz_without_visual_theme_batch_2(v_forward_quiz);
end;
$$;

revoke all on function public.host_save_quiz(jsonb) from public, anon;
grant execute on function public.host_save_quiz(jsonb) to authenticated;
