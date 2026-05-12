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
