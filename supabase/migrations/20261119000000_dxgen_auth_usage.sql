-- DXGen: auth allowlist and monthly usage schema.
--
-- Reconstructed from the only surviving description of this schema: the call
-- sites in apps/cli/src/lib. The hosted Supabase project owns the original
-- implementation and it was never versioned here.
--
-- Call sites this must satisfy:
--   check_allowlist(username)             -> boolean      apps/cli/src/lib/auth/login-flow.ts:32
--   check_and_reset_monthly_usage(user_id) -> usage row    apps/cli/src/lib/usage.ts:27
--   increment_doc_usage(user_id)           -> result row   apps/cli/src/lib/usage.ts:63
--   profiles.monthly_limit                                 apps/cli/src/lib/usage.ts:77
--
-- Parameter names are part of the contract: supabase.rpc() sends named
-- arguments, so `user_id` and `username` cannot be renamed.
--
-- GUESSED, verify against production before trusting:
--   * The reset period is the calendar month.
--   * The default monthly limit is 50 (the client falls back to 50 in usage.ts:77).
--   * The allowlist is keyed by GitHub username (user_metadata.user_name).
--   * A profile row is created by trigger on signup.

-- ---------------------------------------------------------------------------
-- Preflight: refuse to run if the real implementation is already present.
--
-- This migration is a reconstruction. Applying it over the production schema
-- would replace the real limit logic with the guesses above. Diff first:
--   supabase db dump -f prod.sql
-- ---------------------------------------------------------------------------
do $preflight$
declare
  existing text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into existing
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'check_allowlist',
      'check_and_reset_monthly_usage',
      'increment_doc_usage'
    );

  if existing is not null then
    raise exception
      'DXGen usage routines already exist (%). This migration is a reconstruction and will not overwrite them. Dump and diff the existing schema instead.',
      existing;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  github_username text,
  monthly_limit integer not null default 50,
  docs_used integer not null default 0,
  -- First day of the month the current count belongs to.
  usage_period_start date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  constraint profiles_docs_used_non_negative check (docs_used >= 0),
  constraint profiles_monthly_limit_non_negative check (monthly_limit >= 0)
);

create table if not exists public.allowlist (
  github_username text primary key,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.allowlist enable row level security;

-- A user may read only their own profile. Counter writes go through the
-- security-definer functions below, never straight from the client.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  using (auth.uid() = id);

-- No client-facing policy on allowlist: membership is checked only through
-- check_allowlist, so the full list is never readable with the anon key.

-- ---------------------------------------------------------------------------
-- Profile creation on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, github_username)
  values (new.id, new.raw_user_meta_data ->> 'user_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- check_allowlist(username) -> boolean
--
-- The client compares the result with `=== true`, so this must return a plain
-- boolean and never null.
-- ---------------------------------------------------------------------------

create or replace function public.check_allowlist(username text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.allowlist a
    where lower(a.github_username) = lower(check_allowlist.username)
  );
$$;

-- ---------------------------------------------------------------------------
-- check_and_reset_monthly_usage(user_id) -> usage row
--
-- Rolls the counter over when the stored period is older than the current
-- month, then reports the current state. Raises 'Profile not found' because
-- the client turns exactly that text into PROFILE_NOT_FOUND (usage.ts:32).
-- ---------------------------------------------------------------------------

create or replace function public.check_and_reset_monthly_usage(user_id uuid)
returns table (
  can_generate boolean,
  docs_used integer,
  limit_value integer,
  days_until_reset integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_period date := date_trunc('month', now())::date;
  profile public.profiles;
begin
  select * into profile
  from public.profiles p
  where p.id = check_and_reset_monthly_usage.user_id;

  if not found then
    raise exception 'Profile not found for user %', user_id;
  end if;

  if profile.usage_period_start < current_period then
    update public.profiles p
       set docs_used = 0,
           usage_period_start = current_period
     where p.id = profile.id
    returning * into profile;
  end if;

  return query
  select
    profile.docs_used < profile.monthly_limit,
    profile.docs_used,
    profile.monthly_limit,
    greatest(
      0,
      ((current_period + interval '1 month')::date - current_date)
    )::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- increment_doc_usage(user_id) -> result row
--
-- Counts one generated document. Returns success = false when the user is
-- already at the limit, so the caller can tell refusal from failure.
-- ---------------------------------------------------------------------------

create or replace function public.increment_doc_usage(user_id uuid)
returns table (
  success boolean,
  new_count integer,
  limit_reached boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_period date := date_trunc('month', now())::date;
  updated public.profiles;
begin
  update public.profiles p
     set docs_used = case
           when p.usage_period_start < current_period then 1
           else p.docs_used + 1
         end,
         usage_period_start = current_period
   where p.id = increment_doc_usage.user_id
     and case
           when p.usage_period_start < current_period then 0
           else p.docs_used
         end < p.monthly_limit
  returning * into updated;

  if found then
    return query
    select true, updated.docs_used, updated.docs_used >= updated.monthly_limit;
    return;
  end if;

  -- Either the profile is missing or the limit was already reached.
  select * into updated
  from public.profiles p
  where p.id = increment_doc_usage.user_id;

  if not found then
    raise exception 'Profile not found for user %', user_id;
  end if;

  return query
  select false, updated.docs_used, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the CLI calls these with the anon key plus the user's JWT.
-- ---------------------------------------------------------------------------

grant execute on function public.check_allowlist(text) to anon, authenticated;
grant execute on function public.check_and_reset_monthly_usage(uuid) to authenticated;
grant execute on function public.increment_doc_usage(uuid) to authenticated;
