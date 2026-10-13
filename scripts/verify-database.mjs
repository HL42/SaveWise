import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const output = execFileSync('./node_modules/.bin/supabase', ['db','query','--linked','--file','supabase/verify.sql','--agent','no','--output','json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']});
const rows = JSON.parse(output);
const result = rows[0]?.verification;
assert.ok(result, 'Missing schema verification result');
const expectedTables=['sw_accounts','sw_payment_allocations','sw_profiles','sw_requests','sw_statements','sw_transactions'];
assert.deepEqual(result.tables.map(t=>t.table_name).sort(),expectedTables);
for (const table of result.tables) {
 assert.equal(table.rls_enabled,true,`${table.table_name}: RLS disabled`);
 assert.equal(table.anon_select,false,`${table.table_name}: anonymous read enabled`);
 assert.equal(table.direct_write,false,`${table.table_name}: direct write enabled`);
 assert.equal(table.authenticated_select,table.table_name!=='sw_requests',`${table.table_name}: wrong SELECT grants`);
}
const publicRPCs=['sw_add_account','sw_dashboard','sw_reconcile','sw_record','sw_reserve','sw_reverse','sw_setup','sw_statement','sw_update_statement'];
const helpers=['sw_lock_user','sw_prior'];
assert.deepEqual(result.functions.map(f=>f.function_name).sort(),[...publicRPCs,...helpers].sort());
for (const fn of result.functions) {
 assert.equal(fn.anon_execute,false,`${fn.function_name}: anonymous execution enabled`);
 assert.equal(fn.authenticated_execute,publicRPCs.includes(fn.function_name),`${fn.function_name}: wrong execute grants`);
 assert.equal(fn.security_definer,publicRPCs.includes(fn.function_name),`${fn.function_name}: wrong security mode`);
 assert.ok(fn.function_settings.includes('search_path=""'),`${fn.function_name}: unsafe search_path`);
}
assert.equal(result.functions.find(f=>f.function_name==='sw_dashboard').volatility,'s','Dashboard must read one stable snapshot');
assert.equal(result.policies.length,5);
for (const policy of result.policies) {
 assert.equal(policy.cmd,'SELECT'); assert.ok(policy.qual.includes('user_id')&&policy.qual.includes('auth.uid()'),`Invalid ownership policy: ${policy.tablename}`);
}
console.log('Cloud schema verified: 6 RLS tables, no anonymous reads/direct client writes, 9 authenticated RPCs, 2 private helpers, stable dashboard snapshot. No user data read.');
