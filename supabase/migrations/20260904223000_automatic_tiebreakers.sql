-- Automatic winner tie-breakers are app-owned session endgame state. The
-- researched bank and all submitted estimates remain private behind narrow
-- security-definer RPCs; no quiz/portable-format tables are changed.
create table public.tiebreaker_questions (
  id text primary key check (id ~ '^TB[0-9]{3}$'),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  prompt text not null unique check (char_length(btrim(prompt)) between 1 and 500),
  answer numeric not null check (abs(answer) <= 1000000000000000),
  unit text not null check (char_length(btrim(unit)) between 1 and 80),
  source_title text not null check (char_length(btrim(source_title)) between 1 and 300),
  source_url text not null check (source_url ~ '^https://'),
  source_note text,
  enabled boolean not null default true
);
alter table public.tiebreaker_questions enable row level security;
alter table public.tiebreaker_questions force row level security;
revoke all on table public.tiebreaker_questions from public,anon,authenticated;

alter table public.game_sessions
  add column automatic_tiebreakers_enabled boolean not null default false,
  add column tiebreaker_question_id text references public.tiebreaker_questions(id),
  add column tiebreaker_round integer not null default 0 check (tiebreaker_round >= 0),
  add column tiebreaker_opened_at timestamptz,
  add column tiebreaker_closes_at timestamptz,
  add column tiebreaker_winner_player_id uuid,
  add column tiebreaker_used_question_ids text[] not null default '{}',
  add constraint game_sessions_tiebreaker_winner_same_session
    foreign key (id,tiebreaker_winner_player_id) references public.players(game_session_id,id),
  add constraint game_sessions_tiebreaker_window_check check (
    (tiebreaker_question_id is null and tiebreaker_opened_at is null and tiebreaker_closes_at is null) or
    (tiebreaker_question_id is not null and tiebreaker_round > 0 and tiebreaker_opened_at is not null and
      tiebreaker_closes_at = tiebreaker_opened_at + interval '20 seconds')
  ),
  add constraint game_sessions_tiebreaker_phase_state_check check (
    phase not in ('tiebreaker','tiebreaker-result') or
    (tiebreaker_question_id is not null and current_question_id is null and question_opened_at is null and question_closes_at is null)
  );

alter table public.game_sessions drop constraint game_sessions_phase_check;
alter table public.game_sessions add constraint game_sessions_phase_check
  check (phase in ('lobby','round-intro','question','locked','reveal','leaderboard','tiebreaker','tiebreaker-result','finished'));

create table public.game_tiebreaker_contenders (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  player_id uuid not null,
  primary key (session_id,round_number,player_id),
  foreign key (session_id,player_id) references public.players(game_session_id,id) on delete cascade
);
create index game_tiebreaker_contenders_player on public.game_tiebreaker_contenders(session_id,player_id);
alter table public.game_tiebreaker_contenders enable row level security;
alter table public.game_tiebreaker_contenders force row level security;
revoke all on table public.game_tiebreaker_contenders from public,anon,authenticated;

create table public.game_tiebreaker_answers (
  session_id uuid not null,
  round_number integer not null,
  question_id text not null references public.tiebreaker_questions(id),
  player_id uuid not null,
  value numeric not null check (abs(value) <= 1000000000000000),
  submitted_at timestamptz not null,
  response_time_ms bigint not null check (response_time_ms >= 0),
  primary key (session_id,round_number,player_id),
  foreign key (session_id,round_number,player_id)
    references public.game_tiebreaker_contenders(session_id,round_number,player_id) on delete cascade
);
create index game_tiebreaker_answers_question on public.game_tiebreaker_answers(session_id,question_id);
alter table public.game_tiebreaker_answers enable row level security;
alter table public.game_tiebreaker_answers force row level security;
revoke all on table public.game_tiebreaker_answers from public,anon,authenticated;

insert into public.tiebreaker_questions(id,category,prompt,answer,unit,source_title,source_url,source_note) values
  ('TB001','Space & science','What is Mercury''s average orbit distance from the Sun, in million kilometres?',57.909227,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB002','Space & science','What is Venus''s average orbit distance from the Sun, in million kilometres?',108.209475,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB003','Space & science','What is Earth''s average orbit distance from the Sun, in million kilometres?',149.598262,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB004','Space & science','What is Mars''s average orbit distance from the Sun, in million kilometres?',227.943824,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB005','Space & science','What is Jupiter''s average orbit distance from the Sun, in million kilometres?',778.340821,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB006','Space & science','What is Saturn''s average orbit distance from the Sun, in million kilometres?',1426.666422,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB007','Space & science','What is Uranus''s average orbit distance from the Sun, in million kilometres?',2870.658186,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB008','Space & science','What is Neptune''s average orbit distance from the Sun, in million kilometres?',4498.396441,'million km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/','NASA orbit distance converted from km to million km.'),
  ('TB009','Space & science','What is Mercury''s equatorial radius, in kilometres?',2439.7,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB010','Space & science','What is Venus''s equatorial radius, in kilometres?',6051.8,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB011','Space & science','What is Earth''s equatorial radius, in kilometres?',6371,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB012','Space & science','What is Mars''s equatorial radius, in kilometres?',3389.5,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB013','Space & science','What is Jupiter''s equatorial radius, in kilometres?',69911,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB014','Space & science','What is Saturn''s equatorial radius, in kilometres?',58232,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB015','Space & science','What is Uranus''s equatorial radius, in kilometres?',25362,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB016','Space & science','What is Neptune''s equatorial radius, in kilometres?',24622,'km','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB017','Space & science','What is Mercury''s average density, in grams per cubic centimetre?',5.427,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB018','Space & science','What is Venus''s average density, in grams per cubic centimetre?',5.243,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB019','Space & science','What is Earth''s average density, in grams per cubic centimetre?',5.513,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB020','Space & science','What is Mars''s average density, in grams per cubic centimetre?',3.934,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB021','Space & science','What is Jupiter''s average density, in grams per cubic centimetre?',1.326,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB022','Space & science','What is Saturn''s average density, in grams per cubic centimetre?',0.687,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB023','Space & science','What is Uranus''s average density, in grams per cubic centimetre?',1.27,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB024','Space & science','What is Neptune''s average density, in grams per cubic centimetre?',1.638,'g/cm³','NASA Planet Compare','https://solarsystem.nasa.gov/planet-compare/',''),
  ('TB025','Space & science','About how old is the Sun, in billions of years?',4.5,'billion years','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB026','Space & science','About how wide is the Sun, in kilometres?',1400000,'km','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB027','Space & science','About how far is Earth from the Sun on average, in million kilometres?',150,'million km','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB028','Space & science','About how hot is the Sun''s core, in degrees Celsius?',15000000,'°C','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB029','Space & science','About how hot is the Sun''s visible surface, the photosphere, in degrees Celsius?',5500,'°C','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB030','Space & science','About how hot can the Sun''s corona get, in degrees Celsius?',2000000,'°C','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB031','Space & science','Roughly how many Earths would equal the Sun''s mass?',330000,'Earth masses','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB032','Space & science','Roughly how many Earths could fit inside the Sun by volume?',1300000,'Earth volumes','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB033','Space & science','About how many Earth days does the Sun take to rotate at its equator?',25,'days','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB034','Space & science','About how many Earth days does the Sun take to rotate at its poles?',36,'days','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB035','Space & science','About how many million years does the Sun take to orbit the centre of the Milky Way?',230,'million years','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB036','Space & science','About how fast does our solar system move through the Milky Way, in kilometres per hour?',720000,'km/h','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB037','Space & science','What percentage of the solar system''s mass is in the Sun?',99.8,'%','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB038','Space & science','About how thick is the Sun''s core, in kilometres?',138000,'km','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB039','Space & science','About how thick is the Sun''s photosphere, in miles?',250,'miles','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB040','Space & science','About how many years can radiation take to travel through the Sun''s radiative zone?',170000,'years','NASA Sun Facts','https://science.nasa.gov/sun/facts/',''),
  ('TB041','Space & science','Approximately what percentage of the Sun is hydrogen in NASA''s educational fact sheet?',70,'%','NASA Solar Viewer Activity','https://science.nasa.gov/wp-content/uploads/2023/10/Solar-Viewer-Activity.pdf',''),
  ('TB042','Space & science','Approximately what percentage of the Sun is helium in NASA''s educational fact sheet?',28,'%','NASA Solar Viewer Activity','https://science.nasa.gov/wp-content/uploads/2023/10/Solar-Viewer-Activity.pdf',''),
  ('TB043','Space & science','About how fast can the solar wind travel, in kilometres per second, in NASA''s educational fact sheet?',450,'km/s','NASA Solar Viewer Activity','https://science.nasa.gov/wp-content/uploads/2023/10/Solar-Viewer-Activity.pdf',''),
  ('TB044','Space & science','What is the Moon''s average distance from Earth, in kilometres?',384400,'km','NASA Moon Facts','https://science.nasa.gov/moon/facts/',''),
  ('TB045','Space & science','About what is the Moon''s radius, in kilometres?',1740,'km','NASA Moon Facts','https://science.nasa.gov/moon/facts/',''),
  ('TB046','Space & science','About what is the Moon''s equatorial diameter, in kilometres?',3476,'km','NASA StarChild Moon Facts','https://starchild.gsfc.nasa.gov/docs/StarChild/solar_system_level1/moon_facts.html',''),
  ('TB047','Space & science','How many Earth days does the Moon take to revolve around Earth?',27.3,'days','NASA StarChild Moon Facts','https://starchild.gsfc.nasa.gov/docs/StarChild/solar_system_level1/moon_facts.html',''),
  ('TB048','Space & science','The Moon''s gravity is about what percentage of Earth''s?',16,'%','NASA StarChild Moon Facts','https://starchild.gsfc.nasa.gov/docs/StarChild/solar_system_level1/moon_facts.html',''),
  ('TB049','Space & science','Roughly how many inches farther from Earth does the Moon move each year?',1,'inch/year','NASA Moon Facts','https://science.nasa.gov/moon/facts/',''),
  ('TB050','Space & science','About how much does the James Webb Space Telescope payload weigh, in kilograms?',6200,'kg','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB051','Space & science','What is the diameter of Webb''s primary mirror, in metres?',6.5,'m','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB052','Space & science','What is Webb''s primary mirror clear aperture area, in square metres?',25,'m²','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB053','Space & science','About how much does Webb''s primary mirror weigh, in kilograms?',705,'kg','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB054','Space & science','How many primary mirror segments does the James Webb Space Telescope have?',18,'segments','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB055','Space & science','What is Webb''s focal length, in metres?',131.4,'m','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB056','Space & science','About how long is Webb''s sunshield, in metres?',21.197,'m','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB057','Space & science','About how wide is Webb''s sunshield, in metres?',14.162,'m','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB058','Space & science','About how far from Earth is Webb''s L2 orbit, in million kilometres?',1.5,'million km','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB059','Space & science','About how many grams of gold coat Webb''s primary mirror?',48.25,'g','NASA Webb Fact Sheet','https://science.nasa.gov/mission/webb/fact-sheet/',''),
  ('TB060','Space & science','What is the exact speed of light in a vacuum, in metres per second?',299792458,'m/s','NIST CODATA: speed of light in vacuum','https://physics.nist.gov/cuu/Constants/Value/c.html',''),
  ('TB061','Landmarks & geography','How tall is the Eiffel Tower today, in metres?',330,'m','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB062','Landmarks & geography','How tall was the Eiffel Tower initially with its original flagpole, in metres?',312,'m','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB063','Landmarks & geography','How wide is the Eiffel Tower across the ground, in metres?',125,'m','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB064','Landmarks & geography','How wide is one Eiffel Tower pillar at ground level, in metres?',25,'m','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB065','Landmarks & geography','How high is the Eiffel Tower''s first floor, in metres?',57,'m','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB066','Landmarks & geography','How high is the Eiffel Tower''s second floor, in metres?',115,'m','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB067','Landmarks & geography','How high is the Eiffel Tower''s third floor, in metres?',276,'m','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB068','Landmarks & geography','How much does the Eiffel Tower''s metal framework weigh, in tonnes?',7300,'tonnes','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB069','Landmarks & geography','About how much does the Eiffel Tower weigh in total, in tonnes?',10100,'tonnes','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB070','Landmarks & geography','About how many rivets were used in the Eiffel Tower?',2500000,'rivets','Eiffel Tower official key figures','https://www.toureiffel.paris/fr/le-monument/chiffres-cle',''),
  ('TB071','Landmarks & geography','How tall is The Shard, in metres?',309.6,'m','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB072','Landmarks & geography','How many storeys does The Shard have?',95,'storeys','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB073','Landmarks & geography','What is the highest habitable floor level in The Shard?',72,'floor','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB074','Landmarks & geography','How many lifts serve The Shard?',36,'lifts','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB075','Landmarks & geography','About how many glass panels cover The Shard?',11000,'panels','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB076','Landmarks & geography','About how many kilometres of wiring are inside The Shard?',320,'km','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB077','Landmarks & geography','At the busiest point, about how many workers were helping build The Shard?',1450,'workers','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB078','Landmarks & geography','How fast can lifts in The Shard travel, in metres per second?',6,'m/s','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB079','Landmarks & geography','Roughly how many people are allowed inside The Shard at once?',9500,'people','The Shard official facts','https://www.the-shard.com/about/',''),
  ('TB080','Landmarks & geography','How tall is the Empire State Building including its spire and antenna, in metres?',443,'m','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB081','Landmarks & geography','How tall is the Empire State Building to the roof of the 102nd floor, in metres?',380,'m','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB082','Landmarks & geography','How many steps are there from street level to the Empire State Building''s 102nd-floor observatory?',1860,'steps','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB083','Landmarks & geography','How many elevators does the Empire State Building have?',73,'elevators','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB084','Landmarks & geography','How high is the Empire State Building''s 86th-floor observatory, in metres?',320,'m','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB085','Landmarks & geography','How high is its 102nd-floor observation deck, in metres?',381,'m','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB086','Landmarks & geography','About how much does the Empire State Building weigh, in tonnes?',365000,'tonnes','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB087','Landmarks & geography','About how many bricks were used in the Empire State Building?',10000000,'bricks','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB088','Landmarks & geography','How many windows does the Empire State Building have?',6514,'windows','Empire State Building official facts','https://www.esbnyc.com/about/facts-figures',''),
  ('TB089','Landmarks & geography','What is the total length of the Golden Gate Bridge including approaches, in metres?',2737,'m','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB090','Landmarks & geography','How long is the Golden Gate Bridge''s suspension span including side spans, in metres?',1966,'m','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB091','Landmarks & geography','How long is the Golden Gate Bridge''s main span between its towers, in metres?',1280,'m','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB092','Landmarks & geography','How long is one Golden Gate Bridge side span, in metres?',343,'m','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB093','Landmarks & geography','How wide is the Golden Gate Bridge, in metres?',27,'m','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB094','Landmarks & geography','How wide is its roadway between curbs, in metres?',19,'m','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB095','Landmarks & geography','What is the bridge''s clearance above mean higher high water, in metres?',67,'m','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB096','Landmarks & geography','About how many million kilograms does each Golden Gate Bridge anchorage weigh?',54.4,'million kg','Golden Gate Bridge official facts','https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/',''),
  ('TB097','Landmarks & geography','What was the Golden Gate Bridge''s total construction cost in 1930s US dollars, in millions?',35,'million US dollars','Golden Gate Bridge official facts','https://www.goldengate.org/exhibits/facts-and-figures-about-the-bridge/',''),
  ('TB098','Landmarks & geography','How long is each Golden Gate Bridge main cable, in feet?',6800,'ft','Golden Gate Bridge official facts','https://www.goldengate.org/file.aspx?DocumentId=515',''),
  ('TB099','Landmarks & geography','What is the outside diameter of each Golden Gate Bridge main cable, in inches?',36.375,'in','Golden Gate Bridge official facts','https://www.goldengate.org/file.aspx?DocumentId=515',''),
  ('TB100','Landmarks & geography','How long is the Channel Tunnel, in kilometres?',50.5,'km','Eurotunnel: The Channel Tunnel','https://www.getlinkgroup.com/en/our-group/eurotunnel/channel-tunnel/',''),
  ('TB101','Landmarks & geography','How long is the Channel Tunnel''s undersea section, in kilometres?',37,'km','Eurotunnel: The Channel Tunnel','https://www.getlinkgroup.com/en/our-group/eurotunnel/channel-tunnel/',''),
  ('TB102','Landmarks & geography','How many kilometres off the English coast is the Channel Tunnel''s nearer crossover?',7,'km','Eurotunnel: The Channel Tunnel','https://www.getlinkgroup.com/en/our-group/eurotunnel/channel-tunnel/',''),
  ('TB103','Landmarks & geography','How many kilometres off the French coast is the Channel Tunnel''s other crossover?',13,'km','Eurotunnel: The Channel Tunnel','https://www.getlinkgroup.com/en/our-group/eurotunnel/channel-tunnel/',''),
  ('TB104','Landmarks & geography','About how many hectares does the Coquelles Channel Tunnel terminal cover?',650,'hectares','Eurotunnel: The Channel Tunnel','https://www.getlinkgroup.com/en/our-group/eurotunnel/channel-tunnel/',''),
  ('TB105','Landmarks & geography','How tall is the CN Tower, in metres?',553.33,'m','CN Tower official discovery facts','https://www.cntower.ca/media/2216/download?inline=',''),
  ('TB106','Landmarks & geography','How high is ''The Top'' level of the CN Tower, in metres?',447,'m','CN Tower official discovery facts','https://www.cntower.ca/media/2216/download?inline=',''),
  ('TB107','Landmarks & geography','How high is the CN Tower EdgeWalk, in metres?',356,'m','CN Tower official discovery facts','https://www.cntower.ca/media/2216/download?inline=',''),
  ('TB108','Landmarks & geography','How high is the CN Tower''s 360 Restaurant, in metres?',351,'m','CN Tower official discovery facts','https://www.cntower.ca/media/2216/download?inline=',''),
  ('TB109','Landmarks & geography','How high is the CN Tower''s main observation level, in metres?',346,'m','CN Tower official discovery facts','https://www.cntower.ca/media/2216/download?inline=',''),
  ('TB110','Landmarks & geography','How high is the CN Tower''s lower observation level, in metres?',342,'m','CN Tower official discovery facts','https://www.cntower.ca/media/2216/download?inline=',''),
  ('TB111','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Nile, in kilometres?',6650,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB112','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Amazon, in kilometres?',6436,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB113','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Yangtze, in kilometres?',6300,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB114','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Mississippi-Missouri, in kilometres?',6275,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB115','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Yenisey-Angara, in kilometres?',5539,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB116','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Yellow River (Huang He), in kilometres?',5464,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB117','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Ob-Irtysh, in kilometres?',5410,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB118','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Congo, in kilometres?',4700,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB119','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Amur, in kilometres?',4444,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB120','Landmarks & geography','According to the CIA World Factbook''s archived river table, about how long is the Lena, in kilometres?',4400,'km','CIA World Factbook: major rivers by length','https://www.cia.gov/the-world-factbook/about/archives/2023/field/major-rivers-by-length-in-km/',''),
  ('TB121','Sport','How far is a football penalty mark from the midpoint of the goal, in metres?',11,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB122','Sport','How wide is a full-size football goal between the inside of the posts, in metres?',7.32,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB123','Sport','How high is a full-size football goal from ground to crossbar, in metres?',2.44,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB124','Sport','How far does the football penalty area extend from the inside of each goalpost, in metres?',16.5,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB125','Sport','How far does the football goal area extend from the inside of each goalpost, in metres?',5.5,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB126','Sport','What is the maximum permitted width or depth of a football goalpost or crossbar, in centimetres?',12,'cm','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB127','Sport','What is the minimum touchline length for an international football match, in metres?',100,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB128','Sport','What is the maximum touchline length for an international football match, in metres?',110,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB129','Sport','What is the minimum goal-line width for an international football match, in metres?',64,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB130','Sport','What is the maximum goal-line width for an international football match, in metres?',75,'m','IFAB Laws of the Game: Field of Play','https://www.theifab.com/laws/latest/the-field-of-play/?side-menu-category=laws-of-the-game',''),
  ('TB131','Sport','How long is a standard tennis court, in metres?',23.77,'m','ITF Tennis Court Layout','https://www.itftennis.com/en/about-us/organisation/tennis-glossary/',''),
  ('TB132','Sport','How wide is a singles tennis court, in metres?',8.23,'m','ITF Tennis Court Layout','https://www.itftennis.com/en/about-us/organisation/tennis-glossary/',''),
  ('TB133','Sport','How wide is a doubles tennis court, in metres?',10.97,'m','ITF Tennis Court Layout','https://www.itftennis.com/en/about-us/organisation/tennis-glossary/',''),
  ('TB134','Sport','How high are the tennis net posts, in metres?',1.07,'m','ITF Tennis Court Layout','https://www.itftennis.com/en/about-us/organisation/tennis-glossary/',''),
  ('TB135','Sport','How high is a tennis net at the centre, in metres?',0.914,'m','ITF Tennis Court Layout','https://www.itftennis.com/en/about-us/organisation/tennis-glossary/',''),
  ('TB136','Sport','What is the maximum diameter of a tennis net''s cord or metal cable, in centimetres?',0.8,'cm','ITF Tennis Court Layout','https://www.itftennis.com/en/about-us/organisation/tennis-glossary/',''),
  ('TB137','Sport','What is the maximum width of the centre strap holding a tennis net down, in centimetres?',5,'cm','ITF Tennis Court Layout','https://www.itftennis.com/en/about-us/organisation/tennis-glossary/',''),
  ('TB138','Sport','How long is a cricket pitch, in metres?',20.12,'m','ICC cricket playing conditions','https://www.icc-cricket.com/news/mens-odi-match-clause-6-the-pitch',''),
  ('TB139','Sport','How wide is the rectangular cricket pitch area in the ICC ODI clause, in metres?',3.05,'m','ICC cricket playing conditions','https://www.icc-cricket.com/news/mens-odi-match-clause-6-the-pitch',''),
  ('TB140','Sport','What is the radius of the restricted fielding circle in ICC cricket, in metres?',27.5,'m','ICC cricket playing conditions','https://images.icc-cricket.com/image/upload/prd/vsldugyo8ez8ezbaz9e6.pdf',''),
  ('TB141','Sport','What is the minimum distance behind the stumps for certain on-field advertising logos in ICC venue guidance, in metres?',23,'m','ICC cricket playing conditions','https://images.icc-cricket.com/image/upload/prd/vsldugyo8ez8ezbaz9e6.pdf',''),
  ('TB142','Sport','What is the maximum field-of-play length in rugby union, in metres?',100,'m','World Rugby Laws: The Ground','https://passport.world.rugby/laws-of-the-game/laws-by-number/1-the-ground/',''),
  ('TB143','Sport','What is the minimum field-of-play length in rugby union, in metres?',94,'m','World Rugby Laws: The Ground','https://passport.world.rugby/laws-of-the-game/laws-by-number/1-the-ground/',''),
  ('TB144','Sport','What is the maximum rugby union field width, in metres?',70,'m','World Rugby Laws: The Ground','https://passport.world.rugby/laws-of-the-game/laws-by-number/1-the-ground/',''),
  ('TB145','Sport','What is the minimum rugby union field width, in metres?',68,'m','World Rugby Laws: The Ground','https://passport.world.rugby/laws-of-the-game/laws-by-number/1-the-ground/',''),
  ('TB146','Sport','What is the maximum in-goal length in rugby union, in metres?',22,'m','World Rugby Laws: The Ground','https://passport.world.rugby/laws-of-the-game/laws-by-number/1-the-ground/',''),
  ('TB147','Sport','What is the minimum in-goal length in rugby union, in metres?',6,'m','World Rugby Laws: The Ground','https://passport.world.rugby/laws-of-the-game/laws-by-number/1-the-ground/',''),
  ('TB148','Sport','What is the maximum number of players one rugby union team may have on the playing area?',15,'players','World Rugby Laws: Team','https://passport.world.rugby/laws-of-the-game/laws-by-number/3-team/?overridelang=1',''),
  ('TB149','Sport','For an international rugby union match, how many replacements may a union nominate?',8,'replacements','World Rugby Laws: Team','https://passport.world.rugby/laws-of-the-game/laws-by-number/3-team/?overridelang=1',''),
  ('TB150','Sport','How long is a standard marathon, in kilometres?',42.195,'km','World Athletics','https://worldathletics.org/news/news/ultrarunning-introduction',''),
  ('TB151','Sport','What is the official diameter of a PDC-style bristle dartboard, in millimetres?',451,'mm','Darts Regulation Authority Rules','https://www.pdc.tv/sites/default/files/2020-08/DRA-Rules.pdf',''),
  ('TB152','Sport','How high is the centre of the bull on a competition dartboard, in metres?',1.73,'m','Darts Regulation Authority Rules','https://www.pdc.tv/sites/default/files/2020-08/DRA-Rules.pdf',''),
  ('TB153','Sport','How long is a FIBA basketball court, in metres?',28,'m','FIBA Venue Guide','https://www.venueguide.fiba.basketball/vanue-design',''),
  ('TB154','Sport','How wide is a FIBA basketball court, in metres?',15,'m','FIBA Venue Guide','https://www.venueguide.fiba.basketball/vanue-design',''),
  ('TB155','Sport','How far is the pitcher''s plate from the rear point of home plate in Major League Baseball, in feet?',60.5,'ft','MLB official field basics','https://www.mlb.com/official-information/basics/field','60 feet 6 inches = 60.5 feet.'),
  ('TB156','Technology & gaming','In what year was the original iPhone introduced?',2007,'year','Apple: iPhone at ten','https://www.apple.com/newsroom/2017/01/iphone-at-ten-the-revolution-continues/',''),
  ('TB157','Technology & gaming','What was the US starting price of the original 4GB iPhone, in dollars?',499,'US dollars','Apple: iPhone premieres','https://www.apple.com/newsroom/2007/06/28iPhone-Premieres-This-Friday-Night-at-Apple-Retail-Stores/',''),
  ('TB158','Technology & gaming','What was the larger of the two original iPhone storage capacities, in gigabytes?',8,'GB','Apple: iPhone premieres','https://www.apple.com/newsroom/2007/06/28iPhone-Premieres-This-Friday-Night-at-Apple-Retail-Stores/',''),
  ('TB159','Technology & gaming','How large was the original iPhone display, in inches?',3.5,'inches','Apple: iPhone battery and display','https://www.apple.com/newsroom/2007/06/18iPhone-Delivers-Up-to-Eight-Hours-of-Talk-Time/',''),
  ('TB160','Technology & gaming','Apple advertised up to how many hours of talk time for the original iPhone?',8,'hours','Apple: iPhone battery and display','https://www.apple.com/newsroom/2007/06/18iPhone-Delivers-Up-to-Eight-Hours-of-Talk-Time/',''),
  ('TB161','Technology & gaming','Apple advertised up to how many hours of standby time for the original iPhone?',250,'hours','Apple: iPhone battery and display','https://www.apple.com/newsroom/2007/06/18iPhone-Delivers-Up-to-Eight-Hours-of-Talk-Time/',''),
  ('TB162','Technology & gaming','How many days did Apple say it took to sell the one-millionth original iPhone?',74,'days','Apple: one millionth iPhone','https://www.apple.com/newsroom/2007/09/10Apple-Sells-One-Millionth-iPhone/',''),
  ('TB163','Technology & gaming','In what year did Apple introduce the iPad?',2010,'year','Apple launches iPad','https://www.apple.com/newsroom/2010/01/27Apple-Launches-iPad/',''),
  ('TB164','Technology & gaming','How thick was the original iPad, in inches?',0.5,'inches','Apple launches iPad','https://www.apple.com/newsroom/2010/01/27Apple-Launches-iPad/',''),
  ('TB165','Technology & gaming','How much did the original iPad weigh, in pounds?',1.5,'lb','Apple launches iPad','https://www.apple.com/newsroom/2010/01/27Apple-Launches-iPad/',''),
  ('TB166','Technology & gaming','What was the starting US price of the original iPad, in dollars?',499,'US dollars','Apple launches iPad','https://www.apple.com/newsroom/2010/01/27Apple-Launches-iPad/',''),
  ('TB167','Technology & gaming','Apple advertised up to how many hours of battery life for the original iPad?',10,'hours','Apple launches iPad','https://www.apple.com/newsroom/2010/01/27Apple-Launches-iPad/',''),
  ('TB168','Technology & gaming','How many days did Apple say it took to sell the one-millionth iPad?',28,'days','Apple: one million iPads','https://www.apple.com/uk/newsroom/2010/05/03Apple-Sells-One-Million-iPads/',''),
  ('TB169','Technology & gaming','In what year did the Xbox 360 launch?',2005,'year','Xbox 25th Anniversary','https://www.xbox.com/en-GB/xbox-25th-anniversary',''),
  ('TB170','Technology & gaming','In what year did the Xbox One launch?',2013,'year','Xbox 25th Anniversary','https://www.xbox.com/en-GB/xbox-25th-anniversary',''),
  ('TB171','Technology & gaming','In what year did the Xbox Series X|S launch?',2020,'year','Xbox 25th Anniversary','https://www.xbox.com/en-GB/xbox-25th-anniversary',''),
  ('TB172','Technology & gaming','In what year did the original PlayStation launch in Japan?',1994,'year','PlayStation history timeline','https://www.playstation.com/en-us/playstation-history/1994-ps-one/',''),
  ('TB173','Technology & gaming','In what year was the smaller PS one model released?',2000,'year','PlayStation history timeline','https://www.playstation.com/en-us/playstation-history/1994-ps-one/',''),
  ('TB174','Technology & gaming','How many million copies of Windows 95 did Microsoft say sold in its first five weeks?',7,'million copies','Microsoft: Launch of Windows 95','https://news.microsoft.com/announcement/launch-of-windows-95/',''),
  ('TB175','Technology & gaming','In what year was Windows 95 launched?',1995,'year','Microsoft: Launch of Windows 95','https://news.microsoft.com/announcement/launch-of-windows-95/',''),
  ('TB176','Film & TV','According to the BBFC listing, approximately how many minutes long is Oppenheimer?',173,'minutes','BBFC','https://www.bbfc.co.uk/release/oppenheimer-q29sbgvjdglvbjpwwc0xmda2mjm0','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB177','Film & TV','According to the BBFC listing, approximately how many minutes long is Avengers: Endgame?',174,'minutes','BBFC','https://www.bbfc.co.uk/release/avengers-endgame-q29sbgvjdglvbjpwwc00mde4oda','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB178','Film & TV','According to the BBFC listing, approximately how many minutes long is Back to the Future?',111,'minutes','BBFC','https://www.bbfc.co.uk/release/back-to-the-future-q29sbgvjdglvbjpwwc0xmda2mjg5','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB179','Film & TV','According to the BBFC listing, approximately how many minutes long is Jurassic Park?',127,'minutes','BBFC','https://www.bbfc.co.uk/release/jurassic-park-q29sbgvjdglvbjpwwc0yodc1mdu','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB180','Film & TV','According to the BBFC listing, approximately how many minutes long is Titanic?',195,'minutes','BBFC','https://www.bbfc.co.uk/release/titanic-q29sbgvjdglvbjpwwc0zmdu3oty','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB181','Film & TV','According to the BBFC listing, approximately how many minutes long is Pulp Fiction?',154,'minutes','BBFC','https://www.bbfc.co.uk/release/pulp-fiction-q29sbgvjdglvbjpwwc0zmdgwotc','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB182','Film & TV','According to the BBFC listing, approximately how many minutes long is The Matrix?',136,'minutes','BBFC','https://www.bbfc.co.uk/release/the-matrix-q29sbgvjdglvbjpwwc0zmde2mjk','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB183','Film & TV','According to the BBFC listing, approximately how many minutes long is The Dark Knight?',146,'minutes','BBFC','https://www.bbfc.co.uk/release/the-dark-knight-q29sbgvjdglvbjpwwc00ntc5mtc','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB184','Film & TV','According to the BBFC listing, approximately how many minutes long is Barbie?',114,'minutes','BBFC','https://www.bbfc.co.uk/release/barbie-q29sbgvjdglvbjpwwc0xmda5otq3','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB185','Film & TV','According to the BBFC listing, approximately how many minutes long is Toy Story?',81,'minutes','BBFC','https://www.bbfc.co.uk/release/toy-story-q29sbgvjdglvbjpwwc0zndq0mjc','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB186','Film & TV','According to the BBFC listing, approximately how many minutes long is Toy Story 3?',98,'minutes','BBFC','https://www.bbfc.co.uk/release/toy-story-3-q29sbgvjdglvbjpwwc00nzawoty','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB187','Film & TV','According to the BBFC listing, approximately how many minutes long is Toy Story 4?',96,'minutes','BBFC','https://www.bbfc.co.uk/release/toy-story-4-q29sbgvjdglvbjpwwc00mdiwntu','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB188','Film & TV','According to the BBFC listing, approximately how many minutes long is Jaws?',124,'minutes','BBFC','https://www.bbfc.co.uk/release/jaws-q29sbgvjdglvbjpwwc0yodqwmdm','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB189','Film & TV','According to the BBFC listing, approximately how many minutes long is Alien?',112,'minutes','BBFC','https://www.bbfc.co.uk/release/alien-q29sbgvjdglvbjpwwc0yotgxodk','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB190','Film & TV','According to the BBFC listing, approximately how many minutes long is Shrek?',90,'minutes','BBFC','https://www.bbfc.co.uk/release/shrek-q29sbgvjdglvbjpwwc0zndmxnte','Uses the BBFC page''s ''Approx. running minutes'' figure.'),
  ('TB191','Music','How long is the Beatles track ''Hey Jude'', in seconds?',431,'seconds','Track listing for Hey Jude','https://www.thebeatles.com/hey-jude','Published track length: 7:11.'),
  ('TB192','Music','How long is the Beatles track ''Let It Be (7-inch single version)'', in seconds?',230,'seconds','Track listing for Let It Be (7-inch single version)','https://www.thebeatles.com/let-it-be-1','Published track length: 3:50.'),
  ('TB193','Music','How long is the Beatles track ''I Want to Hold Your Hand'', in seconds?',144,'seconds','Track listing for I Want to Hold Your Hand','https://www.thebeatles.com/i-want-hold-your-hand','Published track length: 2:24.'),
  ('TB194','Music','How long is the Beatles track ''This Boy'', in seconds?',133,'seconds','Track listing for This Boy','https://www.thebeatles.com/boy','Published track length: 2:13.'),
  ('TB195','Music','How long is the Beatles track ''Two of Us'', in seconds?',213,'seconds','Track listing for Two of Us','https://www.thebeatles.com/two-us','Published track length: 3:33.'),
  ('TB196','Music','How long is the Beatles track ''Come Together'', in seconds?',258,'seconds','Track listing for Come Together','https://www.thebeatles.com/come-together','Published track length: 4:18.'),
  ('TB197','Music','How long is Green Day''s ''Basket Case'', in seconds?',181,'seconds','Spotify: Basket Case by Green Day','https://open.spotify.com/track/6L89mwZXSOwYl76YXfX13s','Spotify lists the Dookie album track at 3:01.'),
  ('TB198','Music','How long is Green Day''s ''American Idiot'', in seconds?',174,'seconds','Spotify: American Idiot by Green Day','https://open.spotify.com/embed/album/01jrNa9Y7CLWnBMT3Fp5vR','Spotify lists the album track at 2:54.'),
  ('TB199','Music','How long is Queen''s ''Bohemian Rhapsody'', in seconds?',355,'seconds','Track listing for Bohemian Rhapsody','https://open.spotify.com/track/1yslmgUcM2AOkOPS4sl3QV','Published track length: 5:55.'),
  ('TB200','Music','How long is the Eagles'' original album track ''Hotel California'', in seconds?',390,'seconds','Track listing for Hotel California (original album track)','https://open.spotify.com/track/4GkOfUKUqDDgoeiov8Uqyi','Published track length: 6:30.');

create function public.tiebreaker_winning_contenders(p_session_id uuid) returns uuid[]
language plpgsql stable security definer set search_path=public as $$
declare v_session public.game_sessions; v_best integer; v_result uuid[];
begin
  select * into strict v_session from public.game_sessions where id=p_session_id;
  if v_session.play_mode<>'individual' then return '{}'::uuid[]; end if;
  if v_session.competition_mode='points' then
    select max(total_score) into v_best from public.players where game_session_id=p_session_id;
    select coalesce(array_agg(id order by id),'{}') into v_result from public.players
      where game_session_id=p_session_id and total_score=v_best;
  elsif exists(select 1 from public.players where game_session_id=p_session_id and survivor_lives_remaining>0) then
    select max(survivor_lives_remaining) into v_best from public.players
      where game_session_id=p_session_id and survivor_lives_remaining>0;
    select coalesce(array_agg(id order by id),'{}') into v_result from public.players
      where game_session_id=p_session_id and survivor_lives_remaining=v_best;
  else
    select max(coalesce(survivor_eliminated_at_question,0)) into v_best from public.players where game_session_id=p_session_id;
    select coalesce(array_agg(id order by id),'{}') into v_result from public.players
      where game_session_id=p_session_id and coalesce(survivor_eliminated_at_question,0)=v_best;
  end if;
  return case when cardinality(v_result)>=2 then v_result else '{}'::uuid[] end;
end $$;
revoke all on function public.tiebreaker_winning_contenders(uuid) from public,anon,authenticated;

create function public.select_tiebreaker_question(p_session_id uuid,p_round integer) returns text
language plpgsql stable security definer set search_path=public as $$
declare v_session public.game_sessions; v_previous_category text; v_question_id text;
begin
  select * into strict v_session from public.game_sessions where id=p_session_id;
  select category into v_previous_category from public.tiebreaker_questions where id=v_session.tiebreaker_question_id;
  select q.id into v_question_id from public.tiebreaker_questions q
  where q.enabled and not (q.id=any(v_session.tiebreaker_used_question_ids))
  order by (q.category is distinct from v_previous_category) desc,
    encode(extensions.digest(p_session_id::text||':'||p_round::text||':'||q.id,'sha256'),'hex'),q.id
  limit 1;
  if v_question_id is null then raise exception 'The tie-breaker bank is exhausted.'; end if;
  return v_question_id;
end $$;
revoke all on function public.select_tiebreaker_question(uuid,integer) from public,anon,authenticated;

create function public.begin_tiebreaker(p_session_id uuid,p_contender_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions; v_round integer; v_question_id text; v_now timestamptz;
begin
  select * into strict v_session from public.game_sessions where id=p_session_id for update;
  if cardinality(p_contender_ids)<2 or
    (select count(distinct id) from unnest(p_contender_ids) id)<>cardinality(p_contender_ids) or
    exists(select 1 from unnest(p_contender_ids) id where not exists(
      select 1 from public.players p where p.id=id and p.game_session_id=p_session_id)) then
    raise exception 'Invalid tie-breaker contenders.';
  end if;
  v_round:=v_session.tiebreaker_round+1;
  v_question_id:=public.select_tiebreaker_question(p_session_id,v_round);
  insert into public.game_tiebreaker_contenders(session_id,round_number,player_id)
    select p_session_id,v_round,id from unnest(p_contender_ids) id;
  v_now:=clock_timestamp();
  update public.game_sessions set phase='tiebreaker',tiebreaker_round=v_round,
    tiebreaker_question_id=v_question_id,tiebreaker_opened_at=v_now,tiebreaker_closes_at=v_now+interval '20 seconds',
    tiebreaker_winner_player_id=null,tiebreaker_used_question_ids=array_append(tiebreaker_used_question_ids,v_question_id),
    current_question_id=null,question_opened_at=null,question_closes_at=null,current_double_score_variant_index=null,
    connection_clue_count=0,buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null
    where id=p_session_id;
end $$;
revoke all on function public.begin_tiebreaker(uuid,uuid[]) from public,anon,authenticated;

create function public.tiebreaker_round_outcome(p_session_id uuid,p_round integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_question public.tiebreaker_questions; v_submitted integer; v_best_error numeric; v_best_time bigint;
  v_best uuid[]; v_all uuid[]; v_results jsonb;
begin
  select q.* into strict v_question from public.game_sessions s join public.tiebreaker_questions q on q.id=s.tiebreaker_question_id
    where s.id=p_session_id and s.tiebreaker_round=p_round;
  select coalesce(array_agg(c.player_id order by c.player_id),'{}') into v_all
    from public.game_tiebreaker_contenders c where c.session_id=p_session_id and c.round_number=p_round;
  select count(*),min(abs(a.value-v_question.answer)) into v_submitted,v_best_error
    from public.game_tiebreaker_answers a where a.session_id=p_session_id and a.round_number=p_round;
  if v_submitted>0 then
    select min(response_time_ms) into v_best_time from public.game_tiebreaker_answers
      where session_id=p_session_id and round_number=p_round and abs(value-v_question.answer)=v_best_error;
    select array_agg(player_id order by player_id) into v_best from public.game_tiebreaker_answers
      where session_id=p_session_id and round_number=p_round and abs(value-v_question.answer)=v_best_error and response_time_ms=v_best_time;
  else v_best:=v_all;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('playerId',c.player_id,'nickname',p.nickname,
    'value',case when a.value is null then null else a.value::text end,
    'absoluteError',case when a.value is null then null else abs(a.value-v_question.answer)::text end,
    'responseTimeMs',a.response_time_ms) order by c.player_id),'[]'::jsonb) into v_results
  from public.game_tiebreaker_contenders c join public.players p on p.id=c.player_id
  left join public.game_tiebreaker_answers a on a.session_id=c.session_id and a.round_number=c.round_number and a.player_id=c.player_id
  where c.session_id=p_session_id and c.round_number=p_round;
  return jsonb_build_object(
    'winnerPlayerId',case when v_submitted>0 and cardinality(v_best)=1 then v_best[1] else null end,
    'unresolvedPlayerIds',case when v_submitted>0 and cardinality(v_best)=1 then '[]'::jsonb else to_jsonb(v_best) end,
    'results',v_results);
end $$;
revoke all on function public.tiebreaker_round_outcome(uuid,integer) from public,anon,authenticated;

create function public.resolve_tiebreaker_state(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions; v_outcome jsonb; v_winner uuid;
begin
  select * into strict v_session from public.game_sessions where id=p_session_id for update;
  if v_session.phase<>'tiebreaker' then raise exception 'There is no open tie-breaker.'; end if;
  v_outcome:=public.tiebreaker_round_outcome(p_session_id,v_session.tiebreaker_round);
  v_winner:=(v_outcome->>'winnerPlayerId')::uuid;
  update public.game_sessions set phase='tiebreaker-result',tiebreaker_winner_player_id=v_winner where id=p_session_id;
end $$;
revoke all on function public.resolve_tiebreaker_state(uuid) from public,anon,authenticated;

create function public.tiebreaker_safe_state(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_session public.game_sessions; v_question public.tiebreaker_questions; v_contenders jsonb; v_submitted integer;
  v_result jsonb; v_outcome jsonb;
begin
  select * into strict v_session from public.game_sessions where id=p_session_id;
  if v_session.tiebreaker_question_id is null then return null; end if;
  select * into strict v_question from public.tiebreaker_questions where id=v_session.tiebreaker_question_id;
  select coalesce(jsonb_agg(player_id order by player_id),'[]'::jsonb) into v_contenders
    from public.game_tiebreaker_contenders where session_id=p_session_id and round_number=v_session.tiebreaker_round;
  select count(*) into v_submitted from public.game_tiebreaker_answers
    where session_id=p_session_id and round_number=v_session.tiebreaker_round;
  v_result:=jsonb_build_object('round',v_session.tiebreaker_round,
    'status',case when v_session.phase='tiebreaker' then 'question' else 'result' end,
    'questionId',v_question.id,'prompt',v_question.prompt,'category',v_question.category,'unit',v_question.unit,
    'openedAt',v_session.tiebreaker_opened_at,'closesAt',v_session.tiebreaker_closes_at,
    'contenderPlayerIds',v_contenders,'submittedCount',v_submitted);
  if v_session.phase<>'tiebreaker' then
    v_outcome:=public.tiebreaker_round_outcome(p_session_id,v_session.tiebreaker_round);
    v_result:=v_result || jsonb_build_object('correctAnswer',v_question.answer::text) || v_outcome;
  end if;
  return v_result;
end $$;
revoke all on function public.tiebreaker_safe_state(uuid) from public,anon,authenticated;

create function public.tiebreaker_host_state(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_session public.game_sessions; v_question public.tiebreaker_questions; v_result jsonb; v_submitted jsonb;
begin
  select * into strict v_session from public.game_sessions where id=p_session_id;
  v_result:=public.tiebreaker_safe_state(p_session_id);
  if v_result is null then return null; end if;
  select coalesce(jsonb_agg(player_id order by player_id),'[]'::jsonb) into v_submitted
    from public.game_tiebreaker_answers where session_id=p_session_id and round_number=v_session.tiebreaker_round;
  v_result:=v_result || jsonb_build_object('submittedPlayerIds',v_submitted);
  if v_session.phase<>'tiebreaker' then
    select * into strict v_question from public.tiebreaker_questions where id=v_session.tiebreaker_question_id;
    v_result:=v_result || jsonb_build_object('sourceTitle',v_question.source_title,'sourceUrl',v_question.source_url,'sourceNote',v_question.source_note);
  end if;
  return v_result;
end $$;
revoke all on function public.tiebreaker_host_state(uuid) from public,anon,authenticated;

create function public.apply_tiebreaker_winner(p_leaderboard jsonb,p_winner uuid) returns jsonb
language sql immutable set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_set(entry,'{rank}',to_jsonb(new_rank),true) order by new_rank),'[]'::jsonb)
  from (select entry,row_number() over(order by (entry->>'playerId'=p_winner::text) desc,
    coalesce((entry->>'rank')::integer,ordinality::integer),ordinality)::integer new_rank
    from jsonb_array_elements(coalesce(p_leaderboard,'[]'::jsonb)) with ordinality source(entry,ordinality)) ranked
$$;
revoke all on function public.apply_tiebreaker_winner(jsonb,uuid) from public,anon,authenticated;

create function public.submit_tiebreaker_answer(p_room_code text,p_player_id uuid,p_reconnect_token text,p_value text) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare v_received_at timestamptz:=clock_timestamp(); v_session public.game_sessions; v_value numeric; v_response_ms bigint;
begin
  if p_value is null or char_length(p_value)>64 or p_value !~ '^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$' then
    raise exception 'Enter a valid number.';
  end if;
  v_value:=p_value::numeric;
  if abs(v_value)>1000000000000000 then raise exception 'That number is outside the supported range.'; end if;
  select s.* into v_session from public.game_sessions s where s.room_code=p_room_code for update;
  if not found or v_session.status<>'active' or v_session.phase<>'tiebreaker' then raise exception 'Tie-breaker answers are not open.'; end if;
  if v_received_at>v_session.tiebreaker_closes_at then raise exception 'The tie-breaker has closed.'; end if;
  if not exists(select 1 from public.players p where p.id=p_player_id and p.game_session_id=v_session.id
    and p.reconnect_token_hash=extensions.digest(p_reconnect_token,'sha256')) then
    raise exception 'Your player session could not be verified.' using errcode='42501';
  end if;
  if not exists(select 1 from public.game_tiebreaker_contenders c where c.session_id=v_session.id
    and c.round_number=v_session.tiebreaker_round and c.player_id=p_player_id) then
    raise exception 'You are watching this tie-breaker.' using errcode='42501';
  end if;
  v_response_ms:=greatest(0,floor(extract(epoch from (v_received_at-v_session.tiebreaker_opened_at))*1000)::bigint);
  insert into public.game_tiebreaker_answers(session_id,round_number,question_id,player_id,value,submitted_at,response_time_ms)
    values(v_session.id,v_session.tiebreaker_round,v_session.tiebreaker_question_id,p_player_id,v_value,v_received_at,v_response_ms);
  if (select count(*) from public.game_tiebreaker_answers where session_id=v_session.id and round_number=v_session.tiebreaker_round)=
    (select count(*) from public.game_tiebreaker_contenders where session_id=v_session.id and round_number=v_session.tiebreaker_round) then
    perform public.resolve_tiebreaker_state(v_session.id);
  end if;
end $$;
revoke all on function public.submit_tiebreaker_answer(text,uuid,text,text) from public;
grant execute on function public.submit_tiebreaker_answer(text,uuid,text,text) to anon,authenticated;

create function public.host_resolve_tiebreaker(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin perform public.require_session_owner(p_session_id); perform public.resolve_tiebreaker_state(p_session_id); end $$;
revoke all on function public.host_resolve_tiebreaker(uuid) from public;
grant execute on function public.host_resolve_tiebreaker(uuid) to authenticated;

create function public.host_next_tiebreaker(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions; v_outcome jsonb; v_contenders uuid[];
begin
  perform public.require_session_owner(p_session_id);
  select * into strict v_session from public.game_sessions where id=p_session_id for update;
  if v_session.phase<>'tiebreaker-result' or v_session.tiebreaker_winner_player_id is not null then
    raise exception 'Another tie-breaker is not required.';
  end if;
  v_outcome:=public.tiebreaker_round_outcome(p_session_id,v_session.tiebreaker_round);
  select array_agg(value::uuid order by value::uuid) into v_contenders from jsonb_array_elements_text(v_outcome->'unresolvedPlayerIds') value;
  perform public.begin_tiebreaker(p_session_id,v_contenders);
end $$;
revoke all on function public.host_next_tiebreaker(uuid) from public;
grant execute on function public.host_next_tiebreaker(uuid) to authenticated;

create function public.host_reveal_tiebreaker_final(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_session public.game_sessions;
begin
  perform public.require_session_owner(p_session_id);
  select * into strict v_session from public.game_sessions where id=p_session_id for update;
  if v_session.phase<>'tiebreaker-result' or v_session.tiebreaker_winner_player_id is null then
    raise exception 'Resolve the winning tie first.';
  end if;
  update public.game_sessions set phase='finished',ended_at=clock_timestamp() where id=p_session_id;
end $$;
revoke all on function public.host_reveal_tiebreaker_final(uuid) from public;
grant execute on function public.host_reveal_tiebreaker_final(uuid) to authenticated;

-- Replace the final wrappers so every host/player surface receives the same
-- server-owned endgame state, while only the host sees answer sources.
create or replace function public.session_to_json(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb; v_session public.game_sessions;
begin
  v_result:=public.session_to_json_without_teams(p_session_id);
  if v_result is null then return null; end if;
  select * into strict v_session from public.game_sessions where id=p_session_id;
  return v_result || jsonb_build_object('buzz',public.buzz_state_to_json(v_session),'connectionClueCount',v_session.connection_clue_count,
    'tieBreaker',public.tiebreaker_host_state(p_session_id),'teams',public.team_definitions(p_session_id),
    'players',public.survivor_player_states(public.team_memberships(v_result->'players',p_session_id),p_session_id),
    'settings',(v_result->'settings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode,
      'competitionMode',v_session.competition_mode,'survivorStartingLives',v_session.survivor_starting_lives,
      'automaticTieBreakersEnabled',v_session.automatic_tiebreakers_enabled));
end $$;

create or replace function public.get_player_game_state(p_room_code text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb; v_session public.game_sessions; v_players jsonb; v_tie jsonb;
begin
  v_result:=public.get_player_game_state_without_teams(p_room_code);
  if v_result is null then return null; end if;
  select * into strict v_session from public.game_sessions where room_code=p_room_code;
  if v_session.competition_mode='survivor' and v_session.phase in ('leaderboard','finished') then
    v_result:=jsonb_set(v_result,'{leaderboard}',public.survivor_leaderboard(v_session.id));
  end if;
  if v_session.phase='finished' and v_session.tiebreaker_winner_player_id is not null then
    v_result:=jsonb_set(v_result,'{leaderboard}',public.apply_tiebreaker_winner(v_result->'leaderboard',v_session.tiebreaker_winner_player_id));
  end if;
  if v_result->'currentQuestion'->>'type' in ('ordering','matching') then
    v_result:=jsonb_set(v_result,'{currentQuestion}',(v_result->'currentQuestion') || public.arrangement_safe_config(
      v_result->'currentQuestion'->>'type',v_result->'currentQuestion',v_session.answer_option_seed||':'||(v_result->'currentQuestion'->>'id')));
    if v_result->'reveal'->>'type'='matching' then
      v_result:=jsonb_set(v_result,'{reveal}',(v_result->'reveal') || jsonb_build_object('scoringMode',v_result->'currentQuestion'->'scoringMode'));
    end if;
  end if;
  v_players:=public.survivor_player_states(public.team_memberships(v_result->'players',v_session.id),v_session.id);
  v_tie:=public.tiebreaker_safe_state(v_session.id);
  v_result:=v_result || jsonb_build_object('buzz',public.buzz_state_to_json(v_session),'tieBreaker',v_tie,
    'teams',public.team_definitions(v_session.id),'players',v_players,
    'survivorAliveCount',case when v_session.competition_mode='survivor' then
      (select count(*) from public.players where game_session_id=v_session.id and survivor_lives_remaining>0)
      else (select count(*) from public.players where game_session_id=v_session.id) end,
    'eligibleResponderCount',case
      when v_session.phase in ('tiebreaker','tiebreaker-result') then
        (select count(*) from public.game_tiebreaker_contenders where session_id=v_session.id and round_number=v_session.tiebreaker_round)
      when exists(select 1 from public.questions where id=v_session.current_question_id and buzz_in_enabled) then case when v_session.buzz_winner_player_id is null then 0 else 1 end
      when v_session.competition_mode='survivor' then (select count(*) from public.players where game_session_id=v_session.id and survivor_lives_remaining>0)
      else (select count(*) from public.players where game_session_id=v_session.id) end,
    'sessionSettings',(v_result->'sessionSettings') || jsonb_build_object('playMode',v_session.play_mode,'teamAssignmentMode',v_session.team_assignment_mode,
      'competitionMode',v_session.competition_mode,'survivorStartingLives',v_session.survivor_starting_lives,
      'automaticTieBreakersEnabled',v_session.automatic_tiebreakers_enabled));
  if v_session.phase in ('tiebreaker','tiebreaker-result') then
    select coalesce(jsonb_agg(player || jsonb_build_object('totalScore',0,'correctAnswerCount',0,'totalCorrectResponseMs',0) order by n),'[]'::jsonb)
      into v_players from jsonb_array_elements(v_players) with ordinality source(player,n);
    v_result:=v_result || jsonb_build_object('currentQuestion',null,'reveal',null,'leaderboard','[]'::jsonb,'players',v_players,
      'buzz',null,'questionOpenedAt',null,'questionClosesAt',null,'submittedCount',(v_tie->>'submittedCount')::integer);
  end if;
  return v_result;
end $$;

create or replace function public.reconnect_player(p_room_code text,p_player_id uuid,p_reconnect_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_session public.game_sessions; v_submission jsonb;
begin
  v_result:=public.reconnect_player_without_teams(p_room_code,p_player_id,p_reconnect_token);
  if v_result is null then return null; end if;
  select * into strict v_session from public.game_sessions where room_code=p_room_code;
  select jsonb_build_object('round',a.round_number,'questionId',a.question_id) into v_submission
    from public.game_tiebreaker_answers a where a.session_id=v_session.id and a.round_number=v_session.tiebreaker_round and a.player_id=p_player_id;
  return jsonb_set(v_result,'{player}',(v_result->'player') || jsonb_build_object(
    'teamId',(select team_id from public.players where id=p_player_id),
    'survivorLivesRemaining',(select survivor_lives_remaining from public.players where id=p_player_id),
    'survivorEliminatedAtQuestion',(select survivor_eliminated_at_question from public.players where id=p_player_id))) ||
    jsonb_build_object('tieBreakerSubmission',v_submission);
end $$;

create function pg_temp.patch_tiebreaker_function(p_signature text,p_old text,p_new text) returns void language plpgsql as $$
declare definition text;
begin
  definition:=replace(pg_get_functiondef(p_signature::regprocedure),E'\r\n',E'\n');
  if position(p_old in definition)=0 then raise exception 'Missing tie-breaker predecessor in %: %',p_signature,p_old; end if;
  execute replace(definition,p_old,p_new);
end $$;

select pg_temp.patch_tiebreaker_function('public.host_launch_game(uuid,jsonb)',
  $old$v_competition text; v_survivor_lives smallint;$old$,
  $new$v_competition text; v_survivor_lives smallint; v_auto_tie boolean;$new$);
select pg_temp.patch_tiebreaker_function('public.host_launch_game(uuid,jsonb)',
  $old$v_mode := coalesce(p_settings->>'playMode','individual');
  if v_mode not in ('individual','teams') then raise exception 'Invalid play mode'; end if;$old$,
  $new$v_mode := coalesce(p_settings->>'playMode','individual');
  if v_mode not in ('individual','teams') then raise exception 'Invalid play mode'; end if;
  if p_settings ? 'automaticTieBreakersEnabled' and jsonb_typeof(p_settings->'automaticTieBreakersEnabled')<>'boolean' then raise exception 'Invalid automatic tie-breaker setting'; end if;
  v_auto_tie:=coalesce((p_settings->>'automaticTieBreakersEnabled')::boolean,false);
  if v_quiz.quiz_type<>'standard' or v_mode<>'individual' then v_auto_tie:=false; end if;$new$);
select pg_temp.patch_tiebreaker_function('public.host_launch_game(uuid,jsonb)',
  $old$p_settings-'playMode'-'teamAssignmentMode'-'teamNames'-'competitionMode'-'survivorStartingLives'$old$,
  $new$p_settings-'playMode'-'teamAssignmentMode'-'teamNames'-'competitionMode'-'survivorStartingLives'-'automaticTieBreakersEnabled'$new$);
select pg_temp.patch_tiebreaker_function('public.host_launch_game(uuid,jsonb)',
  $old$competition_mode=v_competition,survivor_starting_lives=v_survivor_lives where id=v_session_id;$old$,
  $new$competition_mode=v_competition,survivor_starting_lives=v_survivor_lives,
    automatic_tiebreakers_enabled=v_auto_tie where id=v_session_id;$new$);

select pg_temp.patch_tiebreaker_function('public.get_room_join_info(text)',
  $old$'competitionMode',v_session.competition_mode,'survivorStartingLives',v_session.survivor_starting_lives,$old$,
  $new$'competitionMode',v_session.competition_mode,'survivorStartingLives',v_session.survivor_starting_lives,
    'automaticTieBreakersEnabled',v_session.automatic_tiebreakers_enabled,$new$);

select pg_temp.patch_tiebreaker_function('public.host_change_phase(uuid,text)',
  $old$v_prelude_ms integer; v_variant_index integer;$old$,
  $new$v_prelude_ms integer; v_variant_index integer; v_tie_contenders uuid[];$new$);
select pg_temp.patch_tiebreaker_function('public.host_change_phase(uuid,text)',
  $old$      update public.game_sessions set phase = 'finished', connection_clue_count = 0, buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null, ended_at = v_now,$old$,
  $new$      if v_session.automatic_tiebreakers_enabled and
        ((v_session.phase='reveal' and v_is_final) or (v_session.phase='leaderboard' and v_session.competition_mode='survivor')) then
        v_tie_contenders:=public.tiebreaker_winning_contenders(p_session_id);
        if cardinality(v_tie_contenders)>=2 then perform public.begin_tiebreaker(p_session_id,v_tie_contenders); return; end if;
      end if;
      update public.game_sessions set phase = 'finished', connection_clue_count = 0, buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null, ended_at = v_now,$new$);
select pg_temp.patch_tiebreaker_function('public.host_change_phase(uuid,text)',
  $old$delete from public.player_answers where game_session_id = p_session_id;$old$,
  $new$delete from public.player_answers where game_session_id = p_session_id;
      delete from public.game_tiebreaker_answers where session_id=p_session_id;
      delete from public.game_tiebreaker_contenders where session_id=p_session_id;$new$);
select pg_temp.patch_tiebreaker_function('public.host_change_phase(uuid,text)',
  $old$current_double_score_variant_index = null, started_at = null, ended_at = null where id = p_session_id;$old$,
  $new$current_double_score_variant_index = null, started_at = null, ended_at = null,
        tiebreaker_question_id=null,tiebreaker_round=0,tiebreaker_opened_at=null,tiebreaker_closes_at=null,
        tiebreaker_winner_player_id=null,tiebreaker_used_question_ids='{}' where id = p_session_id;$new$);
select pg_temp.patch_tiebreaker_function('public.host_change_phase(uuid,text)',
  $old$update public.game_sessions set status = 'closed', phase = 'finished', connection_clue_count = 0, buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null, ended_at = v_now where id = p_session_id;$old$,
  $new$update public.game_sessions set status = 'closed', phase = 'finished', connection_clue_count = 0,
        buzz_winner_player_id=null,buzz_claimed_at=null,buzz_answer_deadline_at=null,ended_at=v_now,
        tiebreaker_question_id=null,tiebreaker_opened_at=null,tiebreaker_closes_at=null,tiebreaker_winner_player_id=null where id=p_session_id;$new$);

drop function pg_temp.patch_tiebreaker_function(text,text,text);
