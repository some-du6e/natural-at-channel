-- Run this in your Supabase SQL editor
create table if not exists public.slack_installations (
    team_id text not null,
    user_id text not null,
    user_token text not null,
    user_scopes text[] not null default '{}',
    installed_at timestamptz not null default now(),
    primary key (team_id, user_id)
);
