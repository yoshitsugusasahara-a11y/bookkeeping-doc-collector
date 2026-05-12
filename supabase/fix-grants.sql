grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.customer_accounts to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert on public.submissions to authenticated;
grant execute on function public.is_admin() to authenticated;
