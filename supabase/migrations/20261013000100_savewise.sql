-- All money is integer cents. No service_role key is used by the browser.
create table public.sw_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 started_on date not null, timezone text not null default 'America/Toronto',
 coverage_incomplete boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.sw_requests (
 user_id uuid not null references auth.users(id) on delete cascade, idempotency_key uuid not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,idempotency_key)
);
create table public.sw_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 60),
 kind text not null check (kind in ('asset','liability')), currency text not null check (currency in ('CAD','CNY')),
 balance_cents bigint not null check (abs(balance_cents) <= 1000000000000),
 reserved_cents bigint not null default 0 check (reserved_cents between 0 and 1000000000000),
 opening_cents bigint not null, opening_on date not null,
 checkpoint_on date not null, checkpoint_at timestamptz not null default now(),
 version integer not null default 1, updated_at timestamptz not null default now(),
 unique(user_id,name), unique(user_id,id), check (kind = 'asset' or reserved_cents = 0)
);
create table public.sw_statements (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 account_id uuid not null, statement_cents bigint not null check (statement_cents between 0 and 1000000000000),
 remaining_cents bigint not null check (remaining_cents between 0 and statement_cents),
 due_on date not null, version integer not null default 1, manual_updated_at timestamptz, created_at timestamptz not null default now(),
 foreign key(user_id,account_id) references public.sw_accounts(user_id,id), unique(user_id,id), unique(user_id,account_id,due_on)
);
create table public.sw_transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 kind text not null check (kind in ('expense','income','refund','transfer','repayment','adjustment')),
 source_id uuid not null, target_id uuid,
 amount_cents bigint not null check (amount_cents between 0 and 1000000000000), target_cents bigint,
 currency text not null check (currency in ('CAD','CNY')), target_currency text,
 occurred_on date not null, note text not null default '' check (length(note) <= 500),
 source_effect boolean not null, target_effect boolean not null default false,
 before_cents bigint, after_cents bigint,
 idempotency_key uuid not null, request_payload jsonb not null,
 created_at timestamptz not null default clock_timestamp(), reversed_at timestamptz,
 foreign key(user_id,source_id) references public.sw_accounts(user_id,id),
 foreign key(user_id,target_id) references public.sw_accounts(user_id,id),
 unique(user_id,idempotency_key), unique(user_id,id), check (target_id is null or source_id <> target_id)
);
create table public.sw_payment_allocations (
 user_id uuid not null, transaction_id uuid not null, statement_id uuid not null,
 amount_cents bigint not null check (amount_cents > 0), primary key(transaction_id,statement_id),
 foreign key(user_id,transaction_id) references public.sw_transactions(user_id,id),
 foreign key(user_id,statement_id) references public.sw_statements(user_id,id)
);
create index sw_transactions_history on public.sw_transactions(user_id,occurred_on desc,created_at desc);
create index sw_transactions_stats on public.sw_transactions(user_id,kind,occurred_on) where reversed_at is null;
create index sw_statements_due on public.sw_statements(user_id,due_on) where remaining_cents > 0;

alter table public.sw_requests enable row level security;
revoke all on public.sw_requests from public,anon,authenticated;
alter table public.sw_profiles enable row level security;
alter table public.sw_accounts enable row level security;
alter table public.sw_statements enable row level security;
alter table public.sw_transactions enable row level security;
alter table public.sw_payment_allocations enable row level security;
create policy own_profile on public.sw_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy own_accounts on public.sw_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy own_statements on public.sw_statements for select to authenticated using (user_id = (select auth.uid()));
create policy own_transactions on public.sw_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy own_allocations on public.sw_payment_allocations for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sw_profiles,public.sw_accounts,public.sw_statements,public.sw_transactions,public.sw_payment_allocations from anon,authenticated;
grant select on public.sw_profiles,public.sw_accounts,public.sw_statements,public.sw_transactions,public.sw_payment_allocations to authenticated;

-- RPCs are the only write interface. Definer functions explicitly enforce auth.uid(),
-- use a fixed empty search_path, and serialize mutations per verified user.
create function public.sw_lock_user() returns uuid language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception '请先登录' using errcode = '28000'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 0));
 return u;
end $$;

-- Internal receipts also make onboarding/settings safe after a lost response.
create function public.sw_prior(p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r public.sw_requests;
begin
 if p_key is null then raise exception '缺少请求编号'; end if;
 select * into r from public.sw_requests where user_id=auth.uid() and idempotency_key=p_key;
 if r.idempotency_key is null then return null; end if;
 if r.payload <> p_payload then raise exception '重试内容变化'; end if;
 return r.result;
end $$;
revoke all on function public.sw_prior(uuid,jsonb) from public,anon,authenticated;

create function public.sw_setup(p_key uuid,p_started_on date, p_timezone text, p_accounts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); a jsonb; aid uuid; b bigint; r bigint; payload jsonb;
begin
 payload := jsonb_build_object('rpc','setup','on',p_started_on,'timezone',p_timezone,'accounts',p_accounts);
 if public.sw_prior(p_key,payload) is not null then return; end if;
 if exists(select 1 from public.sw_profiles where user_id=u) then raise exception '已完成首次设置，请刷新'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception '时区无效'; end if;
 if p_started_on is null or p_started_on > (now() at time zone p_timezone)::date then raise exception '起始日期无效'; end if;
 if p_accounts is null or jsonb_typeof(p_accounts) <> 'array' or jsonb_array_length(p_accounts) not between 1 and 30 then raise exception '请添加 1 至 30 个账户'; end if;
 insert into public.sw_profiles(user_id,started_on,timezone) values(u,p_started_on,p_timezone);
 for a in select value from jsonb_array_elements(p_accounts) loop
  b := (a->>'balance_cents')::bigint; r := coalesce((a->>'reserved_cents')::bigint,0);
  if a->>'kind'='asset' and (b < 0 or r > b) then raise exception '资产起始余额或预留金额无效'; end if;
  insert into public.sw_accounts(user_id,name,kind,currency,balance_cents,reserved_cents,opening_cents,opening_on,checkpoint_on)
  values(u,btrim(a->>'name'),a->>'kind',a->>'currency',b,r,b,p_started_on,p_started_on) returning id into aid;
  if a->>'kind'='liability' and a->>'due_on' is not null then
   insert into public.sw_statements(user_id,account_id,statement_cents,remaining_cents,due_on)
   values(u,aid,(a->>'statement_cents')::bigint,(a->>'remaining_cents')::bigint,(a->>'due_on')::date);
  end if;
 end loop;
 insert into public.sw_requests values(u,p_key,payload,'true'::jsonb,now());
end $$;

create function public.sw_add_account(p_key uuid,p_name text,p_kind text,p_currency text,p_balance bigint,p_reserved bigint,p_on date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); aid uuid; p public.sw_profiles; payload jsonb; receipt jsonb;
begin
 payload := jsonb_build_object('rpc','account','name',p_name,'kind',p_kind,'currency',p_currency,'balance',p_balance,'reserved',p_reserved,'on',p_on);
 receipt := public.sw_prior(p_key,payload);
 if receipt is not null then return (receipt->>'id')::uuid; end if;
 select * into p from public.sw_profiles where user_id=u;
 if p.user_id is null then raise exception '请先完成首次设置'; end if;
 if p_on is null or p_on < p.started_on or p_on > (now() at time zone p.timezone)::date then raise exception '日期无效'; end if;
 if p_kind='asset' and (p_balance < 0 or p_reserved > p_balance) then raise exception '资产余额或预留金额无效'; end if;
 insert into public.sw_accounts(user_id,name,kind,currency,balance_cents,reserved_cents,opening_cents,opening_on,checkpoint_on)
 values(u,btrim(p_name),p_kind,p_currency,p_balance,p_reserved,p_balance,p_on,p_on) returning id into aid;
 insert into public.sw_requests values(u,p_key,payload,jsonb_build_object('id',aid),now());
 return aid;
end $$;

create function public.sw_record(p_key uuid,p_kind text,p_source uuid,p_target uuid,p_amount bigint,p_target_amount bigint,p_on date,p_note text,p_history_only boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); s public.sw_accounts; t public.sw_accounts; prof public.sw_profiles;
 prior public.sw_transactions; payload jsonb; tx public.sw_transactions; se boolean; te boolean := false;
 delta bigint; left_to_allocate bigint; part bigint; bill public.sw_statements;
begin
 payload := jsonb_build_object('kind',p_kind,'source',p_source,'target',p_target,'amount',p_amount,'target_amount',p_target_amount,'on',p_on,'note',p_note,'history_only',p_history_only);
 select * into prior from public.sw_transactions where user_id=u and idempotency_key=p_key;
 if prior.id is not null then
  if prior.request_payload <> payload then raise exception '重试内容变化，请使用新的请求编号'; end if;
  return to_jsonb(prior);
 end if;
 if p_key is null or p_amount is null or p_amount not between 1 and 1000000000000 or p_history_only is null or p_kind not in ('expense','income','refund','transfer','repayment') then raise exception '交易金额或类型无效'; end if;
 select * into prof from public.sw_profiles where user_id=u;
 if prof.user_id is null then raise exception '请先完成首次设置'; end if;
 if p_on is null or p_on > (now() at time zone prof.timezone)::date or p_on < date '1900-01-01' then raise exception '交易日期无效'; end if;
 select * into s from public.sw_accounts where user_id=u and id=p_source for update;
 if s.id is null then raise exception '账户不存在或无权限'; end if;
 if p_kind='income' and s.kind='liability' then raise exception '信用卡退款请使用退款类型，不计收入'; end if;
 se := not p_history_only and p_on >= s.checkpoint_on;
 if p_kind in ('transfer','repayment') then
  if p_target is null or p_target=p_source then raise exception '请选择不同的目标账户'; end if;
  select * into t from public.sw_accounts where user_id=u and id=p_target for update;
  if t.id is null then raise exception '目标账户不存在或无权限'; end if;
  if p_target_amount is null or p_target_amount not between 1 and 1000000000000 then raise exception '到账金额无效'; end if;
  if s.currency=t.currency and p_amount<>p_target_amount then raise exception '同币种转账金额必须相等，费用请单独记账'; end if;
  if p_kind='repayment' and (s.kind<>'asset' or t.kind<>'liability') then raise exception '还款必须从资产账户转入信用卡'; end if;
  -- Credit-card cash advances/card-to-card moves need a dedicated flow; reject them here.
  if p_kind='transfer' and t.kind='liability' then raise exception '向信用卡付款请使用还款类型，以更新账单分配'; end if;
  if s.kind<>'asset' then raise exception '当前仅支持从资产账户转出'; end if;
  te := not p_history_only and p_on >= t.checkpoint_on;
 elsif p_target is not null or p_target_amount is not null then raise exception '收支不能包含目标账户';
 end if;
 delta := case when p_kind='income' then (case when s.kind='asset' then p_amount else -p_amount end)
               when p_kind='refund' then (case when s.kind='asset' then p_amount else -p_amount end)
               when p_kind='expense' then (case when s.kind='asset' then -p_amount else p_amount end) else -p_amount end;
 if se then update public.sw_accounts set balance_cents=balance_cents+delta,version=version+1,updated_at=now() where id=s.id and user_id=u; end if;
 if te then update public.sw_accounts set balance_cents=balance_cents+(case when t.kind='asset' then p_target_amount else -p_target_amount end),version=version+1,updated_at=now() where id=t.id and user_id=u; end if;
 insert into public.sw_transactions(user_id,kind,source_id,target_id,amount_cents,target_cents,currency,target_currency,occurred_on,note,source_effect,target_effect,idempotency_key,request_payload)
 values(u,p_kind,s.id,t.id,p_amount,p_target_amount,s.currency,t.currency,p_on,coalesce(p_note,''),se,te,p_key,payload) returning * into tx;
 if p_kind='repayment' and te then
  left_to_allocate := p_target_amount;
  for bill in select * from public.sw_statements where user_id=u and account_id=t.id and remaining_cents>0 order by due_on,created_at,id for update loop
   part := least(left_to_allocate,bill.remaining_cents);
   exit when part=0;
   update public.sw_statements set remaining_cents=remaining_cents-part,version=version+1 where id=bill.id and user_id=u;
   insert into public.sw_payment_allocations values(u,tx.id,bill.id,part);
   left_to_allocate := left_to_allocate-part;
  end loop;
 end if;
 return to_jsonb(tx);
end $$;

create function public.sw_reconcile(p_key uuid,p_account uuid,p_balance bigint,p_version integer,p_on date,p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); a public.sw_accounts; prof public.sw_profiles; prior public.sw_transactions; tx public.sw_transactions; payload jsonb;
begin
 payload := jsonb_build_object('account',p_account,'balance',p_balance,'version',p_version,'on',p_on,'note',p_note);
 select * into prior from public.sw_transactions where user_id=u and idempotency_key=p_key;
 if prior.id is not null then
  if prior.request_payload<>payload then raise exception '重试内容变化'; end if;
  return to_jsonb(prior);
 end if;
 select * into prof from public.sw_profiles where user_id=u;
 if p_key is null or p_balance is null or abs(p_balance)>1000000000000 or p_on is distinct from (now() at time zone prof.timezone)::date then raise exception '请按今天的实际余额对账'; end if;
 select * into a from public.sw_accounts where user_id=u and id=p_account for update;
 if a.id is null then raise exception '账户不存在或无权限'; end if;
 if a.version is distinct from p_version then raise exception '余额已变化，请刷新后重新核对' using errcode='40001'; end if;
 insert into public.sw_transactions(user_id,kind,source_id,amount_cents,currency,occurred_on,note,source_effect,before_cents,after_cents,idempotency_key,request_payload)
 values(u,'adjustment',a.id,abs(p_balance-a.balance_cents),a.currency,p_on,coalesce(p_note,''),true,a.balance_cents,p_balance,p_key,payload) returning * into tx;
 update public.sw_accounts set balance_cents=p_balance,checkpoint_on=p_on,checkpoint_at=tx.created_at,version=version+1,updated_at=now() where user_id=u and id=a.id;
 update public.sw_profiles set coverage_incomplete=true,updated_at=now() where user_id=u;
 return to_jsonb(tx);
end $$;

create function public.sw_statement(p_key uuid,p_account uuid,p_amount bigint,p_remaining bigint,p_due date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); a public.sw_accounts; payload jsonb; receipt jsonb;
begin
 payload := jsonb_build_object('rpc','statement','account',p_account,'amount',p_amount,'remaining',p_remaining,'due',p_due);
 receipt := public.sw_prior(p_key,payload);
 if receipt is not null then return (receipt->>'id')::uuid; end if;
 select * into a from public.sw_accounts where user_id=u and id=p_account;
 if a.id is null or a.kind<>'liability' then raise exception '信用卡不存在或无权限'; end if;
 if p_key is null or p_due is null then raise exception '请填写实际到期日期'; end if;
 insert into public.sw_statements(id,user_id,account_id,statement_cents,remaining_cents,due_on) values(p_key,u,p_account,p_amount,p_remaining,p_due);
 insert into public.sw_requests values(u,p_key,payload,jsonb_build_object('id',p_key),now());
 return p_key;
end $$;

create function public.sw_update_statement(p_key uuid,p_statement uuid,p_amount bigint,p_remaining bigint,p_due date,p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); b public.sw_statements; payload jsonb;
begin
 payload := jsonb_build_object('rpc','update_statement','statement',p_statement,'amount',p_amount,'remaining',p_remaining,'due',p_due,'version',p_version);
 if public.sw_prior(p_key,payload) is not null then return; end if;
 select * into b from public.sw_statements where user_id=u and id=p_statement for update;
 if b.id is null then raise exception '账单不存在或无权限'; end if;
 if b.version is distinct from p_version then raise exception '账单已变化，请刷新后重新核对' using errcode='40001'; end if;
 if p_due is null then raise exception '请填写实际到期日期'; end if;
 update public.sw_statements set statement_cents=p_amount,remaining_cents=p_remaining,due_on=p_due,version=version+1,manual_updated_at=clock_timestamp() where user_id=u and id=b.id;
 insert into public.sw_requests values(u,p_key,payload,jsonb_build_object('before',to_jsonb(b),'after',jsonb_build_object('amount',p_amount,'remaining',p_remaining,'due',p_due)),now());
end $$;

create function public.sw_reserve(p_key uuid,p_account uuid,p_reserved bigint,p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); a public.sw_accounts; payload jsonb;
begin
 payload := jsonb_build_object('rpc','reserve','account',p_account,'reserved',p_reserved,'version',p_version);
 if public.sw_prior(p_key,payload) is not null then return; end if;
 select * into a from public.sw_accounts where user_id=u and id=p_account for update;
 if a.id is null or a.kind<>'asset' then raise exception '资产账户不存在或无权限'; end if;
 if a.version is distinct from p_version then raise exception '余额已变化，请刷新'; end if;
 if p_reserved is null or p_reserved<0 or p_reserved>greatest(a.balance_cents,0) then raise exception '预留不能超过可用余额'; end if;
 update public.sw_accounts set reserved_cents=p_reserved,version=version+1,updated_at=now() where user_id=u and id=a.id;
 insert into public.sw_requests values(u,p_key,payload,'true'::jsonb,now());
end $$;

create function public.sw_reverse(p_transaction uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.sw_lock_user(); tx public.sw_transactions; s public.sw_accounts; t public.sw_accounts; delta bigint; allocation public.sw_payment_allocations;
begin
 select * into tx from public.sw_transactions where user_id=u and id=p_transaction for update;
 if tx.id is null then raise exception '交易不存在或无权限'; end if;
 if tx.reversed_at is not null then return; end if;
 if exists(select 1 from public.sw_payment_allocations pa join public.sw_statements st on st.user_id=pa.user_id and st.id=pa.statement_id where pa.user_id=u and pa.transaction_id=tx.id and st.manual_updated_at>tx.created_at) then raise exception '还款后账单已手动更正，请先核对账单，不能自动撤销此还款'; end if;
 if tx.kind='adjustment' then raise exception '对账记录不能撤销，请重新对账'; end if;
 select * into s from public.sw_accounts where user_id=u and id=tx.source_id for update;
 delta := case when tx.kind='income' then (case when s.kind='asset' then tx.amount_cents else -tx.amount_cents end)
               when tx.kind='refund' then (case when s.kind='asset' then tx.amount_cents else -tx.amount_cents end)
               when tx.kind='expense' then (case when s.kind='asset' then -tx.amount_cents else tx.amount_cents end) else -tx.amount_cents end;
 if tx.source_effect and tx.created_at>s.checkpoint_at then
  update public.sw_accounts set balance_cents=balance_cents-delta,version=version+1,updated_at=now() where user_id=u and id=s.id;
 end if;
 if tx.target_id is not null then
  select * into t from public.sw_accounts where user_id=u and id=tx.target_id for update;
  if tx.target_effect and tx.created_at>t.checkpoint_at then
   update public.sw_accounts set balance_cents=balance_cents-(case when t.kind='asset' then tx.target_cents else -tx.target_cents end),version=version+1,updated_at=now() where user_id=u and id=t.id;
  end if;
 end if;
 for allocation in select * from public.sw_payment_allocations where user_id=u and transaction_id=tx.id loop
  update public.sw_statements set remaining_cents=remaining_cents+allocation.amount_cents,version=version+1 where user_id=u and id=allocation.statement_id;
 end loop;
 update public.sw_transactions set reversed_at=clock_timestamp() where user_id=u and id=tx.id;
end $$;

create function public.sw_dashboard() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); p public.sw_profiles; today date;
begin
 if u is null then raise exception '请先登录' using errcode='28000'; end if;
 select * into p from public.sw_profiles where user_id=u;
 today := (now() at time zone coalesce(p.timezone,'America/Toronto'))::date;
 return jsonb_build_object('profile',case when p.user_id is null then null else to_jsonb(p) end,'today',today,'as_of',statement_timestamp(),
 'accounts',coalesce((select jsonb_agg(a order by a.kind,a.name) from public.sw_accounts a where a.user_id=u),'[]'::jsonb),
 'statements',coalesce((select jsonb_agg(s order by s.due_on,s.created_at) from public.sw_statements s where s.user_id=u),'[]'::jsonb),
 'transactions',coalesce((select jsonb_agg(t order by t.occurred_on desc,t.created_at desc) from (select * from public.sw_transactions where user_id=u order by occurred_on desc,created_at desc limit 100) t),'[]'::jsonb),
 'monthly',coalesce((select jsonb_agg(m) from (select currency,coalesce(sum(case when kind='expense' then amount_cents when kind='refund' then -amount_cents else 0 end),0) expense_cents,coalesce(sum(amount_cents) filter(where kind='income'),0) income_cents from public.sw_transactions where user_id=u and reversed_at is null and kind in ('expense','income','refund') and occurred_on>=date_trunc('month',today)::date and occurred_on<=today group by currency) m),'[]'::jsonb));
end $$;

revoke all on function public.sw_lock_user() from public,anon,authenticated;
revoke all on function public.sw_setup(uuid,date,text,jsonb), public.sw_add_account(uuid,text,text,text,bigint,bigint,date), public.sw_record(uuid,text,uuid,uuid,bigint,bigint,date,text,boolean), public.sw_reconcile(uuid,uuid,bigint,integer,date,text), public.sw_statement(uuid,uuid,bigint,bigint,date), public.sw_update_statement(uuid,uuid,bigint,bigint,date,integer), public.sw_reserve(uuid,uuid,bigint,integer), public.sw_reverse(uuid), public.sw_dashboard() from public,anon;
grant execute on function public.sw_setup(uuid,date,text,jsonb), public.sw_add_account(uuid,text,text,text,bigint,bigint,date), public.sw_record(uuid,text,uuid,uuid,bigint,bigint,date,text,boolean), public.sw_reconcile(uuid,uuid,bigint,integer,date,text), public.sw_statement(uuid,uuid,bigint,bigint,date), public.sw_update_statement(uuid,uuid,bigint,bigint,date,integer), public.sw_reserve(uuid,uuid,bigint,integer), public.sw_reverse(uuid), public.sw_dashboard() to authenticated;
