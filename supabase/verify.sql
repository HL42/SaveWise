-- Schema/privilege metadata only. Never reads financial tables or auth.users.
with tables as (
 select c.relname as table_name, c.relrowsecurity as rls_enabled,
        has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
        has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
        has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') as direct_write
 from pg_catalog.pg_class c
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('sw_profiles','sw_requests','sw_accounts','sw_statements','sw_transactions','sw_payment_allocations')
), functions as (
 select p.proname as function_name, p.prosecdef as security_definer,
        p.provolatile as volatility, p.proconfig as function_settings,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'sw_%'
), policies as (
 select tablename, policyname, roles, cmd, qual
 from pg_catalog.pg_policies
 where schemaname='public' and tablename in ('sw_profiles','sw_accounts','sw_statements','sw_transactions','sw_payment_allocations')
)
select jsonb_build_object(
 'tables',(select jsonb_agg(t order by table_name) from tables t),
 'functions',(select jsonb_agg(f order by function_name) from functions f),
 'policies',(select jsonb_agg(p order by tablename) from policies p)
) as verification;
