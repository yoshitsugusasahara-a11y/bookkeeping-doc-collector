create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('customer', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.ocr_status as enum ('pending', 'completed', 'failed', 'skipped');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.mf_submission_status as enum ('not_ready', 'not_sent', 'sent', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  client_slug text not null unique,
  approval_status public.approval_status not null default 'pending',
  drive_folder_id text,
  drive_folder_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_note text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  drive_file_id text,
  drive_view_url text,
  thumbnail_url text,
  ocr_status public.ocr_status not null default 'pending',
  ocr_error text,
  ocr_raw_response jsonb,
  ocr_processed_at timestamptz,
  ocr_date date,
  ocr_amount integer,
  ocr_store text,
  ocr_summary text,
  ocr_is_credit_card boolean,
  mf_status public.mf_submission_status not null default 'not_ready',
  mf_error text,
  mf_journal_id text,
  mf_voucher_file_id text,
  mf_sent_at timestamptz,
  submitted_at timestamptz not null default now()
);

alter table public.submissions
  add column if not exists ocr_status public.ocr_status not null default 'pending',
  add column if not exists ocr_error text,
  add column if not exists ocr_raw_response jsonb,
  add column if not exists ocr_processed_at timestamptz,
  add column if not exists ocr_date date,
  add column if not exists ocr_amount integer,
  add column if not exists ocr_store text,
  add column if not exists ocr_summary text,
  add column if not exists ocr_is_credit_card boolean,
  add column if not exists mf_status public.mf_submission_status not null default 'not_ready',
  add column if not exists mf_error text,
  add column if not exists mf_journal_id text,
  add column if not exists mf_voucher_file_id text,
  add column if not exists mf_sent_at timestamptz;

create table if not exists public.mf_connections (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null unique references public.customer_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_accounts_user_id_idx
  on public.customer_accounts(user_id);

create index if not exists submissions_customer_account_id_idx
  on public.submissions(customer_account_id);

create index if not exists submissions_submitted_at_idx
  on public.submissions(submitted_at desc);

create index if not exists mf_connections_user_id_idx
  on public.mf_connections(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists customer_accounts_set_updated_at on public.customer_accounts;
create trigger customer_accounts_set_updated_at
before update on public.customer_accounts
for each row execute function public.set_updated_at();

drop trigger if exists mf_connections_set_updated_at on public.mf_connections;
create trigger mf_connections_set_updated_at
before update on public.mf_connections
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.admin_users enable row level security;
alter table public.submissions enable row level security;
alter table public.mf_connections enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.customer_accounts to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update on public.submissions to authenticated;
grant select, insert, update, delete on public.mf_connections to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
       or email = coalesce(
         auth.jwt() ->> 'email',
         auth.jwt() -> 'user_metadata' ->> 'email'
       )
  );
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "customer_accounts_select_own_or_admin" on public.customer_accounts;
create policy "customer_accounts_select_own_or_admin"
on public.customer_accounts for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "customer_accounts_insert_own" on public.customer_accounts;
create policy "customer_accounts_insert_own"
on public.customer_accounts for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "customer_accounts_update_admin" on public.customer_accounts;
create policy "customer_accounts_update_admin"
on public.customer_accounts for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_users_select_admin" on public.admin_users;
create policy "admin_users_select_admin"
on public.admin_users for select
to authenticated
using (public.is_admin());

drop policy if exists "submissions_select_own_or_admin" on public.submissions;
create policy "submissions_select_own_or_admin"
on public.submissions for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.customer_accounts ca
    where ca.id = customer_account_id
      and ca.user_id = auth.uid()
  )
);

drop policy if exists "submissions_insert_approved_customer" on public.submissions;
create policy "submissions_insert_approved_customer"
on public.submissions for insert
to authenticated
with check (
  uploaded_by_user_id = auth.uid()
  and exists (
    select 1
    from public.customer_accounts ca
    where ca.id = customer_account_id
      and ca.user_id = auth.uid()
      and ca.approval_status = 'approved'
  )
);

drop policy if exists "submissions_update_own_or_admin" on public.submissions;
create policy "submissions_update_own_or_admin"
on public.submissions for update
to authenticated
using (uploaded_by_user_id = auth.uid() or public.is_admin())
with check (uploaded_by_user_id = auth.uid() or public.is_admin());

drop policy if exists "mf_connections_select_own_or_admin" on public.mf_connections;
create policy "mf_connections_select_own_or_admin"
on public.mf_connections for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "mf_connections_insert_own_approved_customer" on public.mf_connections;
create policy "mf_connections_insert_own_approved_customer"
on public.mf_connections for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.customer_accounts ca
    where ca.id = customer_account_id
      and ca.user_id = auth.uid()
      and ca.approval_status = 'approved'
  )
);

drop policy if exists "mf_connections_update_own_approved_customer" on public.mf_connections;
create policy "mf_connections_update_own_approved_customer"
on public.mf_connections for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.customer_accounts ca
    where ca.id = customer_account_id
      and ca.user_id = auth.uid()
      and ca.approval_status = 'approved'
  )
);

drop policy if exists "mf_connections_delete_own_or_admin" on public.mf_connections;
create policy "mf_connections_delete_own_or_admin"
on public.mf_connections for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());
