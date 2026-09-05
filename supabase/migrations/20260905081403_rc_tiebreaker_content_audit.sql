-- Content-only corrections from the supplied researched bank v1.3.
-- The original seed and audit copy remain immutable. Check every old content
-- field before updating; an unexpected/missing row aborts the entire migration.
-- IDs, enabled status, RLS, grants and selection/resolution logic are untouched.
do $audit$
declare
  change jsonb;
  previous public.tiebreaker_questions%rowtype;
begin
  for change in select value from jsonb_array_elements($bank$
[
  {
    "before": {
      "id": "TB009",
      "category": "Space & science",
      "prompt": "What is Mercury's equatorial radius, in kilometres?",
      "answer": 2439.7,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB009",
      "category": "Space & science",
      "prompt": "What is Mercury's equatorial radius, in kilometres?",
      "answer": 2440.53,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB010",
      "category": "Space & science",
      "prompt": "What is Venus's equatorial radius, in kilometres?",
      "answer": 6051.8,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB010",
      "category": "Space & science",
      "prompt": "What is Venus's equatorial radius, in kilometres?",
      "answer": 6051.8,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB011",
      "category": "Space & science",
      "prompt": "What is Earth's equatorial radius, in kilometres?",
      "answer": 6371,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB011",
      "category": "Space & science",
      "prompt": "What is Earth's equatorial radius, in kilometres?",
      "answer": 6378.1366,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB012",
      "category": "Space & science",
      "prompt": "What is Mars's equatorial radius, in kilometres?",
      "answer": 3389.5,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB012",
      "category": "Space & science",
      "prompt": "What is Mars's equatorial radius, in kilometres?",
      "answer": 3396.19,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB013",
      "category": "Space & science",
      "prompt": "What is Jupiter's equatorial radius, in kilometres?",
      "answer": 69911,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB013",
      "category": "Space & science",
      "prompt": "What is Jupiter's equatorial radius, in kilometres?",
      "answer": 71492,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB014",
      "category": "Space & science",
      "prompt": "What is Saturn's equatorial radius, in kilometres?",
      "answer": 58232,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB014",
      "category": "Space & science",
      "prompt": "What is Saturn's equatorial radius, in kilometres?",
      "answer": 60268,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB015",
      "category": "Space & science",
      "prompt": "What is Uranus's equatorial radius, in kilometres?",
      "answer": 25362,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB015",
      "category": "Space & science",
      "prompt": "What is Uranus's equatorial radius, in kilometres?",
      "answer": 25559,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB016",
      "category": "Space & science",
      "prompt": "What is Neptune's equatorial radius, in kilometres?",
      "answer": 24622,
      "unit": "km",
      "source_title": "NASA Planet Compare",
      "source_url": "https://solarsystem.nasa.gov/planet-compare/",
      "source_note": ""
    },
    "after": {
      "id": "TB016",
      "category": "Space & science",
      "prompt": "What is Neptune's equatorial radius, in kilometres?",
      "answer": 24764,
      "unit": "km",
      "source_title": "JPL Planetary Physical Parameters",
      "source_url": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
      "source_note": "JPL equatorial-radius value; distinguished from the planet's mean radius."
    }
  },
  {
    "before": {
      "id": "TB036",
      "category": "Space & science",
      "prompt": "About how fast does our solar system move through the Milky Way, in kilometres per hour?",
      "answer": 720000,
      "unit": "km/h",
      "source_title": "NASA Sun Facts",
      "source_url": "https://science.nasa.gov/sun/facts/",
      "source_note": ""
    },
    "after": {
      "id": "TB036",
      "category": "Space & science",
      "prompt": "According to NASA's Sun Facts page, about how fast does our solar system move through the Milky Way, in kilometres per hour?",
      "answer": 720000,
      "unit": "km/h",
      "source_title": "NASA Sun Facts",
      "source_url": "https://science.nasa.gov/sun/facts/",
      "source_note": "NASA Sun Facts gives an average velocity of 720,000 km/h; another current NASA educational page uses a different rounded orbital-speed figure."
    }
  },
  {
    "before": {
      "id": "TB098",
      "category": "Landmarks & geography",
      "prompt": "How long is each Golden Gate Bridge main cable, in feet?",
      "answer": 6800,
      "unit": "ft",
      "source_title": "Golden Gate Bridge official facts",
      "source_url": "https://www.goldengate.org/file.aspx?DocumentId=515",
      "source_note": ""
    },
    "after": {
      "id": "TB098",
      "category": "Landmarks & geography",
      "prompt": "How long is each Golden Gate Bridge main cable, in feet?",
      "answer": 7650,
      "unit": "ft",
      "source_title": "Golden Gate Bridge official design & construction statistics",
      "source_url": "https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/",
      "source_note": "Official bridge statistics give 7,650 ft for one main cable."
    }
  },
  {
    "before": {
      "id": "TB198",
      "category": "Music",
      "prompt": "How long is Green Day's 'American Idiot', in seconds?",
      "answer": 174,
      "unit": "seconds",
      "source_title": "Spotify: American Idiot by Green Day",
      "source_url": "https://open.spotify.com/embed/album/01jrNa9Y7CLWnBMT3Fp5vR",
      "source_note": "Spotify lists the album track at 2:54."
    },
    "after": {
      "id": "TB198",
      "category": "Music",
      "prompt": "According to Spotify's American Idiot album listing, how long is Green Day's 'American Idiot', in seconds?",
      "answer": 174,
      "unit": "seconds",
      "source_title": "Spotify: American Idiot by Green Day",
      "source_url": "https://open.spotify.com/track/45zvStEMsXp8z45OQRhWFJ",
      "source_note": "Spotify's album listing gives 2:54 for the track."
    }
  },
  {
    "before": {
      "id": "TB199",
      "category": "Music",
      "prompt": "How long is Queen's 'Bohemian Rhapsody', in seconds?",
      "answer": 355,
      "unit": "seconds",
      "source_title": "Track listing for Bohemian Rhapsody",
      "source_url": "https://open.spotify.com/track/1yslmgUcM2AOkOPS4sl3QV",
      "source_note": "Published track length: 5:55."
    },
    "after": {
      "id": "TB199",
      "category": "Music",
      "prompt": "According to Spotify's A Night at the Opera album listing, how long is Queen's 'Bohemian Rhapsody', in seconds?",
      "answer": 355,
      "unit": "seconds",
      "source_title": "Track listing for Bohemian Rhapsody",
      "source_url": "https://open.spotify.com/track/1yslmgUcM2AOkOPS4sl3QV",
      "source_note": "Spotify's A Night at the Opera album listing gives 5:55."
    }
  },
  {
    "before": {
      "id": "TB200",
      "category": "Music",
      "prompt": "How long is the Eagles' original album track 'Hotel California', in seconds?",
      "answer": 390,
      "unit": "seconds",
      "source_title": "Track listing for Hotel California (original album track)",
      "source_url": "https://open.spotify.com/track/4GkOfUKUqDDgoeiov8Uqyi",
      "source_note": "Published track length: 6:30."
    },
    "after": {
      "id": "TB200",
      "category": "Music",
      "prompt": "According to Spotify's original Hotel California album listing, how long is the Eagles' 'Hotel California', in seconds?",
      "answer": 390,
      "unit": "seconds",
      "source_title": "Track listing for Hotel California (original album track)",
      "source_url": "https://open.spotify.com/track/4GkOfUKUqDDgoeiov8Uqyi",
      "source_note": "Spotify's original Hotel California album listing gives 6:30."
    }
  }
]
$bank$::jsonb)
  loop
    select * into previous from public.tiebreaker_questions
      where id = change->'before'->>'id' for update;
    if not found or (to_jsonb(previous) - 'enabled') is distinct from change->'before' then
      raise exception 'Tie-breaker content audit: unexpected seeded content for %', change->'before'->>'id';
    end if;
    update public.tiebreaker_questions
      set prompt = change->'after'->>'prompt',
          answer = (change->'after'->>'answer')::numeric,
          source_title = change->'after'->>'source_title',
          source_url = change->'after'->>'source_url',
          source_note = change->'after'->>'source_note'
      where id = previous.id;
  end loop;
end $audit$;
