-- Run this in your Supabase SQL editor
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
-- bypasses RLS.
alter table public.slack_installations enable row level security;

revoke all privileges on table public.slack_installations from public;
revoke all privileges on table public.slack_installations from anon;
revoke all privileges on table public.slack_installations from authenticated;

grant all privileges on table public.slack_installations to service_role;

create table if not exists public.user_settings (
    team_id text not null,
    user_id text not null,
    react_to_unauthorized boolean not null default true,
    updated_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

alter table public.user_settings enable row level security;

revoke all privileges on table public.user_settings from public;
revoke all privileges on table public.user_settings from anon;
revoke all privileges on table public.user_settings from authenticated;

grant all privileges on table public.user_settings to service_role;
