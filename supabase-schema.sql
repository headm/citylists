-- Places table
create table places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  mode text default 'Food & Drink',
  neighborhood text[] default '{}',
  cuisine text[] default '{}',
  category text default '',
  type text default '',
  stars numeric default 0,
  description text default '',
  url text default '',
  address text default '',
  lat double precision,
  lng double precision,
  -- Durable Google place ID (e.g. 'ChIJ41HSUABZwokRhbUqk4qDotA').
  -- NOT a photo resource name: Google rotates photo ids, which silently broke
  -- every image on the site once. Image bytes live in the 'place-photos'
  -- storage bucket instead. See src/lib/server/photos.js.
  photo text default '',
  price_level text default '',
  hours text default '',
  created_at timestamptz default now(),
  google_rating numeric,
  tabelog_rating numeric,
  pinned boolean default false
);

-- Candidates table
create table candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  source text default '',
  source_url text default '',
  status text default 'Pending',
  description text default '',
  address text default '',
  lat double precision,
  lng double precision,
  photo text default '',
  price_level text default '',
  hours text default '',
  created_at timestamptz default now()
);

-- Indexes for common queries
create index idx_places_city on places(city);
create index idx_candidates_city_status on candidates(city, status);

-- Disable RLS (single-user app, using secret key server-side)
alter table places enable row level security;
alter table candidates enable row level security;

-- Allow full access with service/secret key (bypasses RLS)
-- No policies needed since we use the secret key which bypasses RLS

-- ── Storage ──
-- Public bucket 'place-photos' caches the actual image bytes, keyed by
-- '<place_id>/<400|800>.img', plus a '<place_id>/none' marker for places Google
-- has no photo for. Created automatically by scripts/backfill-photos.js
-- (ensureBucket) — no manual setup needed.
--
-- Backfill / re-cache:
--   node scripts/backfill-photos.js            # all places
--   node scripts/backfill-photos.js --dry-run
--   node scripts/backfill-photos.js --force    # re-download existing
