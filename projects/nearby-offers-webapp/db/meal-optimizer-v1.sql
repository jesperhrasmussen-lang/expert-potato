-- Meal Optimizer V1 draft schema
-- Target: Postgres on Hostinger VPS
-- Purpose: move from offer-comparison demo storage to recipe-feasibility and meal-cost storage

create table if not exists chains (
  id text primary key,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stores (
  id text primary key,
  chain_id text not null references chains(id),
  display_name text not null,
  address_text text,
  lat double precision,
  lon double precision,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stores_chain_id on stores(chain_id);
create index if not exists idx_stores_lat_lon on stores(lat, lon);

create table if not exists ingredient_families (
  id text primary key,
  category text not null check (category in ('meat', 'vegetable', 'dairy')),
  display_name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ingredient_families_category on ingredient_families(category);

create table if not exists ingredient_search_terms (
  id bigserial primary key,
  ingredient_family_id text not null references ingredient_families(id) on delete cascade,
  term_text text not null,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_family_id, term_text)
);

create index if not exists idx_ingredient_search_terms_family on ingredient_search_terms(ingredient_family_id);

create table if not exists recipes (
  id text primary key,
  slug text not null unique,
  display_name text not null,
  description text,
  servings_per_batch integer not null check (servings_per_batch > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_slots (
  id bigserial primary key,
  recipe_id text not null references recipes(id) on delete cascade,
  slot_key text not null,
  role text not null check (role in ('protein', 'vegetable', 'dairy', 'other')),
  quantity_value numeric(10,2) not null check (quantity_value > 0),
  quantity_unit text not null,
  required boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, slot_key)
);

create table if not exists recipe_slot_allowed_families (
  id bigserial primary key,
  recipe_slot_id bigint not null references recipe_slots(id) on delete cascade,
  ingredient_family_id text not null references ingredient_families(id),
  quantity_override_value numeric(10,2),
  quantity_override_unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_slot_id, ingredient_family_id)
);

create index if not exists idx_recipe_slots_recipe on recipe_slots(recipe_id);
create index if not exists idx_recipe_slot_allowed_families_slot on recipe_slot_allowed_families(recipe_slot_id);
create index if not exists idx_recipe_slot_allowed_families_family on recipe_slot_allowed_families(ingredient_family_id);

create table if not exists offers (
  id text primary key,
  chain_id text not null references chains(id),
  store_id text references stores(id),
  ingredient_family_id text references ingredient_families(id),
  product_name text not null,
  description text,
  brand text,
  price_dkk numeric(10,2) not null,
  currency text not null default 'DKK',
  size_text text,
  package_quantity numeric(10,2),
  package_unit text,
  package_grams_equivalent numeric(10,2),
  normalized_attributes_json jsonb,
  unit_price_dkk numeric(10,2),
  unit_price_unit text,
  valid_from timestamptz,
  valid_to timestamptz,
  offer_state text,
  source_system text,
  source_kind text,
  source_url text,
  source_offer_id text,
  source_catalog_id text,
  confidence text,
  raw_payload_json jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_offers_chain_family on offers(chain_id, ingredient_family_id);
create index if not exists idx_offers_store_family on offers(store_id, ingredient_family_id);
create index if not exists idx_offers_valid_to on offers(valid_to);
create index if not exists idx_offers_offer_state on offers(offer_state);

create table if not exists ingest_runs (
  id uuid primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  source_scope_json jsonb,
  notes text
);

create table if not exists qa_issues (
  id bigserial primary key,
  issue_type text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  offer_id text references offers(id) on delete cascade,
  recipe_id text references recipes(id) on delete cascade,
  ingredient_family_id text references ingredient_families(id) on delete cascade,
  details_json jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_qa_issues_status on qa_issues(status);
create index if not exists idx_qa_issues_severity on qa_issues(severity);

create table if not exists meal_search_runs (
  id uuid primary key,
  search_address text not null,
  resolved_address text,
  lat double precision,
  lon double precision,
  access_mode text not null,
  radius_km numeric(10,2),
  max_walk_km numeric(10,2),
  include_store_pairs boolean not null default true,
  requested_at timestamptz not null default now(),
  response_summary_json jsonb
);

-- Deliberately omitted from persistence for now:
-- - finalized basket line items
-- - finalized store pairs
-- Those can be computed at query time first and persisted later only if useful.

