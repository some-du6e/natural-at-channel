-- migrate.sql — bring an old self-hosted database up to the current schema.
--
-- If you've been running Nchannel since an early version, run this in your
-- Supabase SQL editor. Every statement is idempotent, so it's safe to run
-- repeatedly and safe to run against a fresh db too (it just becomes a no-op
-- alongside schema.sql). It covers everything that's been added over time:
--   * row-level security + locked-down privileges on slack_installations
--   * the user_settings table itself
--   * react_to_unauthorized, auto_sub, and name_preference columns
-- Missing pieces are added; existing ones are left untouched.

-- ── slack_installations ──────────────────────────────────────────────
-- Table itself (very old versions had no RLS); create if it somehow is missing.
create table if not exists public.slack_installations (
    team_id text not null,
    user_id text not null,
    user_token text not null,
    user_scopes text[] not null default '{}',
    installed_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

-- OAuth tokens are backend-only secrets. Keep the table inaccessible through
-- Supabase's public Data API; the server uses SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS. (Old versions shipped without this lockdown.)
alter table public.slack_installations enable row level security;

revoke all privileges on table public.slack_installations from public;
revoke all privileges on table public.slack_installations from anon;
revoke all privileges on table public.slack_installations from authenticated;

grant all privileges on table public.slack_installations to service_role;

-- ── user_settings ────────────────────────────────────────────────────
-- The table landed in a later version; very old installs don't have it at all.
create table if not exists public.user_settings (
    team_id text not null,
    user_id text not null,
    react_to_unauthorized boolean not null default true,
    auto_sub boolean not null default true,
    name_preference text not null default 'display_name'
        check (name_preference in ('display_name', 'full_name')),
    updated_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

-- If the table already existed from an even earlier schema, add any columns
-- that landed later one by one. `if not exists` keeps this safe to re-run.
alter table public.user_settings
    add column if not exists react_to_unauthorized boolean not null default true;

alter table public.user_settings
    add column if not exists auto_sub boolean not null default true;

alter table public.user_settings
    add column if not exists name_preference text not null default 'display_name'
    check (name_preference in ('display_name', 'full_name'));

-- Lock down user_settings the same way as slack_installations.
alter table public.user_settings enable row level security;

revoke all privileges on table public.user_settings from public;
revoke all privileges on table public.user_settings from anon;
revoke all privileges on table public.user_settings from authenticated;

grant all privileges on table public.user_settings to service_role;