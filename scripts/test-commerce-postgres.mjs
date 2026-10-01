import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const port = 55432;
const database = 'commerce_test';
const tempRoot = mkdtempSync(join(tmpdir(), 'chonhaviet-commerce-pg-'));
const dataDir = join(tempRoot, 'data');
const socketDir = join(tempRoot, 'socket');
const logFile = join(tempRoot, 'postgres.log');
mkdirSync(socketDir);

const pgBinCandidates = [
  process.env.POSTGRES_BIN,
  '/opt/homebrew/opt/postgresql@15/bin',
  '/usr/local/opt/postgresql@15/bin',
].filter(Boolean);
const pgBin = pgBinCandidates.find(candidate => existsSync(join(candidate, 'psql')));
if (!pgBin) {
  throw new Error('PostgreSQL 15 tools not found. Set POSTGRES_BIN or install postgresql@15.');
}

const command = name => join(pgBin, name);
const connectionArgs = ['-h', socketDir, '-p', String(port), '-d', database];

function run(name, args, options = {}) {
  const result = spawnSync(command(name), args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error([
      `${name} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function psqlSql(sql, options = {}) {
  return run('psql', [
    ...connectionArgs,
    '-At',
    '-v', 'ON_ERROR_STOP=1',
    '-c', sql,
  ], options);
}

function psqlFile(path) {
  return run('psql', [
    ...connectionArgs,
    '-At',
    '-v', 'ON_ERROR_STOP=1',
    '-f', resolve(root, path),
  ]);
}

function scalar(sql) {
  return psqlSql(sql).stdout.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactLineCount(output, value) {
  return output.split(/\r?\n/).filter(line => line.trim() === value).length;
}

function concurrentPsql(sql) {
  return new Promise(resolvePromise => {
    const child = spawn(command('psql'), [
      ...connectionArgs,
      '-At',
      '-v', 'ON_ERROR_STOP=1',
      '-c', sql,
    ], { cwd: root });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', status => resolvePromise({ status, stdout, stderr }));
  });
}

async function runPair(sqlA, sqlB = sqlA) {
  return Promise.all([concurrentPsql(sqlA), concurrentPsql(sqlB)]);
}

function serviceTransaction(statement) {
  return [
    'SET ROLE service_role;',
    "SELECT set_config('request.jwt.claim.role','service_role',false);",
    'BEGIN;',
    statement,
    'SELECT pg_sleep(1);',
    'COMMIT;',
  ].join(' ');
}

function authenticatedTransaction(statement) {
  return [
    'SET ROLE authenticated;',
    "SELECT set_config('request.jwt.claim.role','authenticated',false);",
    "SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);",
    'BEGIN;',
    statement,
    'SELECT pg_sleep(1);',
    'COMMIT;',
  ].join(' ');
}

const migrations = [
  'supabase/migrations/20261014000000_commerce_foundation.sql',
  'supabase/migrations/20261014010000_commerce_rpc_foundation.sql',
  'supabase/migrations/20261014020000_commerce_checkout_boundary.sql',
  'supabase/migrations/20261014030000_commerce_webhook_ingress.sql',
  'supabase/migrations/20261014040000_commerce_payment_worker.sql',
  'supabase/migrations/20261014050000_commerce_payment_reconciliation.sql',
  'supabase/migrations/20261014060000_commerce_outbox_delivery.sql',
  'supabase/migrations/20261014070000_commerce_listing_lifecycle_enforcement.sql',
  'supabase/migrations/20261014080000_commerce_account_operations_read_models.sql',
  'supabase/migrations/20261014090000_commerce_support_lookup.sql',
  'supabase/migrations/20261014100000_commerce_email_delivery.sql',
  'supabase/migrations/20261014110000_commerce_catalog_read_model.sql',
  'supabase/migrations/20261014120000_commerce_wallet_foundation.sql',
  'supabase/migrations/20261014130000_commerce_wallet_rpc.sql',
  'supabase/migrations/20261014140000_commerce_wallet_fee_lifecycle.sql',
  'supabase/migrations/20261014150000_commerce_wallet_credit_hardening.sql',
  'supabase/migrations/20261014160000_commerce_wallet_topup_checkout.sql',
  'supabase/migrations/20261014170000_commerce_wallet_webhook_reconciliation.sql',
  'supabase/migrations/20261014180000_commerce_wallet_admin_config.sql',
  'supabase/migrations/20261014190000_commerce_wallet_finance_support.sql',
  'supabase/migrations/20261014200000_commerce_listing_fee_applicability.sql',
  'supabase/migrations/20261014210000_commerce_listing_approval_decisions.sql',
  'supabase/migrations/20261014220000_commerce_listing_fee_decision_lifecycle.sql',
  'supabase/migrations/20261014230000_commerce_listing_approval_rpc.sql',
  'supabase/migrations/20261015000000_commerce_listing_approval_fee_options.sql',
  'supabase/migrations/20261015010000_commerce_listing_approval_rpc_acl.sql',
];

let started = false;
try {
  console.log('commerce-db: starting isolated PostgreSQL 15');
  run('initdb', ['-D', dataDir, '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale']);
  run('pg_ctl', [
    '-D', dataDir,
    '-l', logFile,
    '-o', `-h '' -p ${port} -k ${socketDir}`,
    'start', '-w',
  ]);
  started = true;
  run('createdb', ['-h', socketDir, '-p', String(port), database]);

  console.log('commerce-db: applying bootstrap and migrations');
  psqlFile('supabase/tests/commerce/bootstrap.sql');
  for (const migration of migrations) {
    if (migration.endsWith('20261014070000_commerce_listing_lifecycle_enforcement.sql')) {
      const lifecycleDryRun = psqlFile('supabase/manual_commerce_listing_lifecycle_dry_run.sql').stdout;
      assert(lifecycleDryRun.includes('"preflight_pass": true'), 'Commerce listing lifecycle preflight did not pass.');
    }
    if (migration.endsWith('20261014080000_commerce_account_operations_read_models.sql')) {
      const accountDryRun = psqlFile('supabase/manual_commerce_account_operations_dry_run.sql').stdout;
      assert(accountDryRun.includes('"preflight_pass": true'), 'Commerce account operations preflight did not pass.');
    }
    if (migration.endsWith('20261014090000_commerce_support_lookup.sql')) {
      const supportDryRun = psqlFile('supabase/manual_commerce_support_lookup_dry_run.sql').stdout;
      assert(supportDryRun.includes('"preflight_pass": true'), 'Commerce support lookup preflight did not pass.');
    }
    if (migration.endsWith('20261014100000_commerce_email_delivery.sql')) {
      const emailDryRun = psqlFile('supabase/manual_commerce_email_delivery_dry_run.sql').stdout;
      assert(emailDryRun.includes('"preflight_pass": true'), 'Commerce email delivery preflight did not pass.');
    }
    if (migration.endsWith('20261014120000_commerce_wallet_foundation.sql')) {
      const walletFoundationDryRun = psqlFile('supabase/manual_commerce_wallet_foundation_dry_run.sql').stdout;
      assert(walletFoundationDryRun.includes('"commerce_wallet_foundation_preflight_pass": true'), 'Commerce wallet foundation preflight did not pass.');
    }
    if (migration.endsWith('20261014150000_commerce_wallet_credit_hardening.sql')) {
      const walletCreditDryRun = psqlFile('supabase/manual_commerce_wallet_credit_hardening_dry_run.sql').stdout;
      assert(walletCreditDryRun.includes('"commerce_wallet_credit_hardening_preflight_pass": true'), 'Commerce wallet credit hardening preflight did not pass.');
    }
    if (migration.endsWith('20261014160000_commerce_wallet_topup_checkout.sql')) {
      const walletCheckoutDryRun = psqlFile('supabase/manual_commerce_wallet_topup_checkout_dry_run.sql').stdout;
      assert(walletCheckoutDryRun.includes('"commerce_wallet_topup_checkout_preflight_pass": true'), 'Commerce wallet top-up checkout preflight did not pass.');
    }
    if (migration.endsWith('20261014170000_commerce_wallet_webhook_reconciliation.sql')) {
      const walletWebhookDryRun = psqlFile('supabase/manual_commerce_wallet_webhook_reconciliation_dry_run.sql').stdout;
      assert(walletWebhookDryRun.includes('"commerce_wallet_webhook_reconciliation_preflight_pass": true'), 'Commerce Wallet webhook/reconciliation preflight did not pass.');
    }
    if (migration.endsWith('20261014180000_commerce_wallet_admin_config.sql')) {
      const walletAdminDryRun = psqlFile('supabase/manual_commerce_wallet_admin_config_dry_run.sql').stdout;
      assert(walletAdminDryRun.includes('"commerce_wallet_admin_config_preflight_pass": true'), 'Commerce Wallet admin configuration preflight did not pass.');
    }
    if (migration.endsWith('20261014190000_commerce_wallet_finance_support.sql')) {
      const walletFinanceDryRun = psqlFile('supabase/manual_commerce_wallet_finance_support_dry_run.sql').stdout;
      assert(walletFinanceDryRun.includes('"commerce_wallet_finance_support_preflight_pass": true'), 'Commerce Wallet finance/support preflight did not pass.');
    }
    psqlFile(migration);
    if (migration.endsWith('20261014120000_commerce_wallet_foundation.sql')) {
      const walletFoundationVerify = psqlFile('supabase/manual_commerce_wallet_foundation_verify.sql').stdout;
      assert(walletFoundationVerify.includes('"commerce_wallet_foundation_verify_pass": true'), `Commerce wallet foundation verification did not pass.\n${walletFoundationVerify}`);
    }
  }

  psqlSql(`
    GRANT SELECT ON TABLE
      public.commerce_listing_approval_fee_decisions,
      public.commerce_wallet_accounts,
      public.commerce_wallet_fee_reservations,
      public.commerce_wallet_ledger,
      public.commerce_wallet_receipts,
      public.commerce_audit_events
    TO service_role;
  `);

  const foundationVerify = psqlFile('supabase/manual_commerce_foundation_verify.sql').stdout;
  const foundationPass = foundationVerify.split(/\r?\n/).some(line => {
    const fields = line.split('|');
    return fields.length >= 11 && fields.every(field => field === 't');
  });
  assert(foundationPass, 'Commerce foundation verification did not pass.');

  const rpcVerify = psqlFile('supabase/manual_commerce_rpc_verify.sql').stdout;
  assert(rpcVerify.includes('"commerce_rpc_verify_pass": true'), 'Commerce RPC verification did not pass.');

  const lifecycleVerify = psqlFile('supabase/manual_commerce_listing_lifecycle_verify.sql').stdout;
  const lifecycleVerifyPass = lifecycleVerify.split(/\r?\n/).some(line => {
    const fields = line.split('|');
    return fields.length >= 7 && fields.every(field => field === 't');
  });
  assert(lifecycleVerifyPass, 'Commerce listing lifecycle verification did not pass.');

  const accountVerify = psqlFile('supabase/manual_commerce_account_operations_verify.sql').stdout;
  const accountVerifyPass = accountVerify.split(/\r?\n/).some(line => {
    const fields = line.split('|');
    return fields.length >= 6 && fields.every(field => field === 't');
  });
  assert(accountVerifyPass, 'Commerce account operations verification did not pass.');

  const supportVerify = psqlFile('supabase/manual_commerce_support_lookup_verify.sql').stdout;
  const supportVerifyPass = supportVerify.split(/\r?\n/).some(line => {
    const fields = line.split('|');
    return fields.length >= 4 && fields.every(field => field === 't');
  });
  assert(supportVerifyPass, 'Commerce support lookup verification did not pass.');

  const emailVerify = psqlFile('supabase/manual_commerce_email_delivery_verify.sql').stdout;
  const emailVerifyPass = emailVerify.split(/\r?\n/).some(line => {
    const fields = line.split('|').map(field => field.trim());
    return fields.length >= 8
      && fields.slice(0, 6).every(field => field === 't')
      && fields.at(-1) === 't';
  });
  assert(emailVerifyPass, 'Commerce email delivery verification did not pass.');

  const walletCreditVerify = psqlFile('supabase/manual_commerce_wallet_credit_hardening_verify.sql').stdout;
  assert(walletCreditVerify.includes('"commerce_wallet_credit_hardening_verify_pass": true'), 'Commerce wallet credit hardening verification did not pass.');

  const walletCheckoutVerify = psqlFile('supabase/manual_commerce_wallet_topup_checkout_verify.sql').stdout;
  assert(walletCheckoutVerify.includes('"commerce_wallet_topup_checkout_verify_pass": true'), 'Commerce wallet top-up checkout verification did not pass.');

  const walletWebhookVerify = psqlFile('supabase/manual_commerce_wallet_webhook_reconciliation_verify.sql').stdout;
  assert(walletWebhookVerify.includes('"commerce_wallet_webhook_reconciliation_verify_pass": true'), 'Commerce Wallet webhook/reconciliation verification did not pass.');

  const walletAdminVerify = psqlFile('supabase/manual_commerce_wallet_admin_config_verify.sql').stdout;
  assert(walletAdminVerify.includes('"commerce_wallet_admin_config_verify_pass": true'), `Commerce Wallet admin configuration verification did not pass.\n${walletAdminVerify}`);

  const walletFinanceVerify = psqlFile('supabase/manual_commerce_wallet_finance_support_verify.sql').stdout;
  assert(walletFinanceVerify.split(/\r?\n/).some(line => line.split('|').at(-1) === 't'), `Commerce Wallet finance/support verification did not pass.\n${walletFinanceVerify}`);

  const listingApprovalVerify = psqlFile('supabase/manual_commerce_listing_approval_verify.sql').stdout;
  assert(listingApprovalVerify.includes('"commerce_listing_approval_post_verify_pass": true'), `Commerce listing approval verification did not pass.\n${listingApprovalVerify}`);

  const catalogRows = scalar('SELECT count(*) FROM public.commerce_get_catalog();');
  assert(catalogRows === '0', 'Commerce catalog exposed a package before purchasable approval.');
  psqlFile('supabase/staging_commerce_e2e_seed.sql');

  console.log('commerce-db: running payment, quota, RLS and outbox integration');
  const integration = psqlFile('supabase/tests/commerce/integration.sql').stdout;
  assert(integration.includes('"integration_pass": true'), 'Commerce integration scenario did not pass.');

  console.log('commerce-db: testing listing approval hardening');
  const listingApprovalHardening = psqlFile('supabase/tests/commerce/listing-approval-hardening.sql').stdout;
  assert(listingApprovalHardening.includes('"listing_approval_hardening_pass": true'), 'Commerce listing approval hardening scenario did not pass.');

  console.log('commerce-db: testing wallet top-up and credit');
  const walletTopup = psqlFile('supabase/tests/commerce/wallet-topup.sql').stdout;
  assert(walletTopup.includes('"wallet_topup_pass": true'), 'Commerce wallet top-up scenario did not pass.');

  console.log('commerce-db: testing wallet top-up checkout boundary');
  const walletTopupCheckout = psqlFile('supabase/tests/commerce/wallet-topup-checkout.sql').stdout;
  assert(walletTopupCheckout.includes('"wallet_topup_checkout_pass": true'), 'Commerce wallet top-up checkout scenario did not pass.');

  console.log('commerce-db: testing concurrent wallet checkout claim');
  psqlSql(`
    INSERT INTO auth.users(id,email)
    VALUES ('55555555-5555-4555-8555-555555555555','wallet-claim-race@example.test');
    SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.role','authenticated',false);
    SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
    SELECT * FROM public.commerce_create_wallet_topup_intent(
      NULL,200000,'wallet-topup-claim-race-owner5-001'
    );
    SELECT * FROM public.commerce_start_wallet_topup_checkout(
      (SELECT id FROM public.commerce_wallet_topup_intents WHERE idempotency_key='wallet-topup-claim-race-owner5-001'),
      'payos','wallet-checkout-claim-race-owner5-001'
    );
  `);
  const walletClaimCheckoutId = scalar(`SELECT id FROM public.commerce_wallet_topup_checkouts WHERE idempotency_key='wallet-checkout-claim-race-owner5-001'`);
  assert(/^[0-9a-f-]{36}$/.test(walletClaimCheckoutId), 'Concurrent wallet checkout fixture is invalid.');
  const [walletClaimA, walletClaimB] = await runPair(
    serviceTransaction(`SELECT public.commerce_claim_wallet_topup_checkout(${sqlLiteral(walletClaimCheckoutId)}::uuid,'wallet-claim-race-token-a');`),
    serviceTransaction(`SELECT public.commerce_claim_wallet_topup_checkout(${sqlLiteral(walletClaimCheckoutId)}::uuid,'wallet-claim-race-token-b');`),
  );
  assert(walletClaimA.status === 0 && walletClaimB.status === 0, 'Concurrent wallet checkout claims failed.');
  const walletClaimOutput = walletClaimA.stdout + walletClaimB.stdout;
  assert(exactLineCount(walletClaimOutput, 't') === 1 && exactLineCount(walletClaimOutput, 'f') === 1, 'Wallet checkout claim did not isolate one worker.');

  console.log('commerce-db: testing concurrent wallet credit replay');
  psqlSql(`
    INSERT INTO auth.users(id,email)
    VALUES ('44444444-4444-4444-8444-444444444444','wallet-race@example.test');
    SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.role','authenticated',false);
    SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
    SELECT * FROM public.commerce_create_wallet_topup_intent(
      NULL,250000,'wallet-topup-concurrent-owner4-001'
    );
  `);
  const concurrentTopupId = scalar(`SELECT id FROM public.commerce_wallet_topup_intents WHERE idempotency_key='wallet-topup-concurrent-owner4-001'`);
  assert(/^[0-9a-f-]{36}$/.test(concurrentTopupId), 'Concurrent wallet top-up fixture is invalid.');
  psqlSql(`
    SET ROLE service_role;
    SELECT set_config('request.jwt.claim.role','service_role',false);
    SELECT public.commerce_attach_wallet_topup_payment(
      ${sqlLiteral(concurrentTopupId)}::uuid,'payos','wallet-provider-concurrent-owner4-001'
    );
  `);
  const [walletCreditA, walletCreditB] = await runPair(
    serviceTransaction(`SELECT public.commerce_credit_wallet_topup(${sqlLiteral(concurrentTopupId)}::uuid,250000,'VND','wallet-provider-concurrent-event-a','wallet-provider-concurrent-owner4-001','wallet-credit-concurrent-owner4-a');`),
    serviceTransaction(`SELECT public.commerce_credit_wallet_topup(${sqlLiteral(concurrentTopupId)}::uuid,250000,'VND','wallet-provider-concurrent-event-b','wallet-provider-concurrent-owner4-001','wallet-credit-concurrent-owner4-b');`),
  );
  assert(walletCreditA.status === 0 && walletCreditB.status === 0, 'Concurrent wallet credit replay failed.');
  assert(scalar(`SELECT available_minor FROM public.commerce_wallet_accounts WHERE owner_user_id='44444444-4444-4444-8444-444444444444'`) === '250000', 'Concurrent wallet credit changed balance more than once.');
  assert(scalar(`SELECT count(*) FROM public.commerce_wallet_ledger WHERE operation='topup_credit' AND topup_intent_id=${sqlLiteral(concurrentTopupId)}::uuid`) === '1', 'Concurrent wallet credit created duplicate ledger rows.');
  assert(scalar(`SELECT count(*) FROM public.commerce_wallet_receipts WHERE receipt_kind='wallet_topup' AND topup_intent_id=${sqlLiteral(concurrentTopupId)}::uuid`) === '1', 'Concurrent wallet credit created duplicate receipts.');

  console.log('commerce-db: testing account and operations read models');
  const accountReadModel = psqlFile('supabase/tests/commerce/account-read-model.sql').stdout;
  assert(accountReadModel.includes('"account_read_model_pass": true'), 'Commerce account read model scenario did not pass.');

  console.log('commerce-db: testing email delivery queue');
  const emailDelivery = psqlFile('supabase/tests/commerce/email-delivery.sql').stdout;
  assert(emailDelivery.includes('"email_delivery_pass": true'), 'Commerce email delivery scenario did not pass.');

  console.log('commerce-db: testing concurrent email lease');
  psqlSql(`
    INSERT INTO public.commerce_outbox(id,topic,aggregate_type,aggregate_id,payload,status,sent_at)
    VALUES (
      '76000000-0000-4000-8000-000000000001','commerce.email.fixture','order',
      (SELECT id FROM public.commerce_orders WHERE idempotency_key='order-owner1-00000001'),
      '{}','sent',clock_timestamp()
    );
    INSERT INTO public.commerce_notifications(id,owner_user_id,outbox_id,kind,title,body,action_path)
    VALUES (
      '76000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
      '76000000-0000-4000-8000-000000000001','payment_succeeded',
      'Email lease fixture','Email lease fixture body','/tai-khoan?tab=commerce'
    );
  `);
  const [emailLeaseA, emailLeaseB] = await runPair(serviceTransaction('SELECT count(*) FROM public.commerce_claim_email_deliveries(1);'));
  const emailLeaseOutput = emailLeaseA.stdout + emailLeaseB.stdout;
  assert(emailLeaseA.status === 0 && emailLeaseB.status === 0, 'Concurrent email claims failed.');
  assert(exactLineCount(emailLeaseOutput, '1') === 1 && exactLineCount(emailLeaseOutput, '0') === 1, 'Email lease did not isolate one worker.');
  assert(scalar(`SELECT count(*) FROM public.commerce_email_deliveries WHERE notification_id='76000000-0000-4000-8000-000000000002' AND status='processing' AND processing_token IS NOT NULL`) === '1', 'Email target was not leased.');

  console.log('commerce-db: testing wallet listing fee lifecycle');
  const walletFee = psqlFile('supabase/tests/commerce/wallet-fee-lifecycle.sql').stdout;
  assert(walletFee.includes('"wallet_fee_lifecycle_pass": true'), 'Commerce wallet fee lifecycle scenario did not pass.');
  psqlSql(`
    UPDATE public.commerce_entitlements
    SET quantity_remaining = 1, status = 'active'
    WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
      AND benefit_kind = 'listing_quota';
  `);

  console.log('commerce-db: testing wallet top-up webhook and reconciliation');
  const walletWebhookReconciliation = psqlFile('supabase/tests/commerce/wallet-webhook-reconciliation.sql').stdout;
  assert(walletWebhookReconciliation.includes('"wallet_webhook_reconciliation_pass": true'), 'Commerce wallet webhook/reconciliation scenario did not pass.');

  console.log('commerce-db: testing listing lifecycle enforcement');
  const listingLifecycle = psqlFile('supabase/tests/commerce/listing-lifecycle.sql').stdout;
  assert(listingLifecycle.includes('"listing_lifecycle_pass": true'), 'Commerce listing lifecycle scenario did not pass.');

  console.log('commerce-db: testing concurrent quota reservation');
  const quotaEntitlement = `(
    SELECT id FROM public.commerce_entitlements
    WHERE owner_user_id='11111111-1111-4111-8111-111111111111'
      AND benefit_kind='listing_quota'
  )`;
  const [quotaA, quotaB] = await runPair(
    authenticatedTransaction(`SELECT public.commerce_reserve_listing_quota(${quotaEntitlement},'60000000-0000-4000-8000-000000000003',1,'concurrent-reserve-a-001',now()+interval '1 hour');`),
    authenticatedTransaction(`SELECT public.commerce_reserve_listing_quota(${quotaEntitlement},'60000000-0000-4000-8000-000000000004',1,'concurrent-reserve-b-001',now()+interval '1 hour');`),
  );
  assert([quotaA.status, quotaB.status].filter(status => status === 0).length === 1, 'Exactly one concurrent quota reservation must succeed.');
  assert(scalar(`SELECT quantity_remaining FROM public.commerce_entitlements WHERE owner_user_id='11111111-1111-4111-8111-111111111111' AND benefit_kind='listing_quota'`) === '0', 'Concurrent quota balance is not zero.');
  assert(scalar(`SELECT count(*) FROM public.commerce_quota_reservations WHERE idempotency_key IN ('concurrent-reserve-a-001','concurrent-reserve-b-001')`) === '1', 'Concurrent quota created more than one reservation.');

  console.log('commerce-db: testing worker rollback and reconciliation');
  const rollback = psqlFile('supabase/tests/commerce/rollback.sql').stdout;
  assert(rollback.includes('"rollback_pass": true'), 'Payment worker rollback scenario did not pass.');
  const reconciliation = psqlFile('supabase/tests/commerce/reconciliation.sql').stdout;
  assert(reconciliation.includes('"reconciliation_pass": true'), 'Payment reconciliation scenario did not pass.');

  console.log('commerce-db: testing concurrent checkout claim');
  psqlSql(`
    SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.role','authenticated',false);
    SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
    SELECT * FROM public.commerce_create_order('40000000-0000-4000-8000-000000000001',1,'checkout-claim-race-order-01');
    SELECT * FROM public.commerce_start_payment_attempt(
      (SELECT id FROM public.commerce_orders WHERE idempotency_key='checkout-claim-race-order-01'),
      'payos','checkout-claim-race-payment-01'
    );
  `);
  const claimAttemptId = scalar(`SELECT id FROM public.commerce_payment_attempts WHERE idempotency_key='checkout-claim-race-payment-01'`);
  assert(/^[0-9a-f-]{36}$/.test(claimAttemptId), 'Checkout claim fixture attempt is invalid.');
  const [claimA, claimB] = await runPair(
    serviceTransaction(`SELECT public.commerce_claim_payment_checkout(${sqlLiteral(claimAttemptId)}::uuid,'checkout-race-token-a-001');`),
    serviceTransaction(`SELECT public.commerce_claim_payment_checkout(${sqlLiteral(claimAttemptId)}::uuid,'checkout-race-token-b-001');`),
  );
  assert(claimA.status === 0 && claimB.status === 0, 'Concurrent checkout claim calls failed.');
  const claimOutput = claimA.stdout + claimB.stdout;
  assert(exactLineCount(claimOutput, 't') === 1 && exactLineCount(claimOutput, 'f') === 1, 'Checkout claim did not produce one winner and one loser.');

  console.log('commerce-db: testing webhook lease');
  psqlSql(`
    UPDATE public.commerce_webhook_inbox
    SET next_attempt_at=clock_timestamp()+interval '1 hour'
    WHERE status IN ('pending','retry','processing');
    INSERT INTO public.commerce_webhook_inbox(
      id,provider,provider_event_id,status,headers,payload,payload_hash,
      verification_method,signed_data_hash,attempts,next_attempt_at
    ) VALUES (
      '71000000-0000-4000-8000-000000000001','lease_test','lease-event-001','pending',
      '{}','{}',repeat('1',64),'webhook_signature',repeat('2',64),0,clock_timestamp()
    );
  `);
  const [webhookA, webhookB] = await runPair(serviceTransaction('SELECT count(*) FROM public.commerce_claim_payment_webhooks(1);'));
  const webhookOutput = webhookA.stdout + webhookB.stdout;
  assert(webhookA.status === 0 && webhookB.status === 0, 'Concurrent webhook claims failed.');
  assert(exactLineCount(webhookOutput, '1') === 1 && exactLineCount(webhookOutput, '0') === 1, 'Webhook lease did not isolate one worker.');
  assert(scalar(`SELECT count(*) FROM public.commerce_webhook_inbox WHERE id='71000000-0000-4000-8000-000000000001' AND status='processing' AND processing_token IS NOT NULL`) === '1', 'Webhook target was not leased.');

  console.log('commerce-db: testing reconciliation lease');
  const claimExpiresAt = scalar(`SELECT expires_at FROM public.commerce_payment_attempts WHERE id=${sqlLiteral(claimAttemptId)}::uuid`);
  psqlSql(`
    SET ROLE service_role;
    SELECT set_config('request.jwt.claim.role','service_role',false);
    SELECT public.commerce_attach_payment_checkout(
      ${sqlLiteral(claimAttemptId)}::uuid,
      'payos-link-claim-race-001',
      'https://pay.payos.vn/web/claim-race',
      ${sqlLiteral(claimExpiresAt)}::timestamptz
    );
  `);
  psqlSql(`
    UPDATE public.commerce_payment_reconciliation_jobs
    SET next_attempt_at=clock_timestamp()+interval '1 hour'
    WHERE status IN ('pending','retry','processing');
    UPDATE public.commerce_payment_reconciliation_jobs
    SET status='pending',processing_token=NULL,next_attempt_at=clock_timestamp()
    WHERE payment_attempt_id=${sqlLiteral(claimAttemptId)}::uuid;
  `);
  const [reconciliationA, reconciliationB] = await runPair(serviceTransaction('SELECT count(*) FROM public.commerce_claim_payment_reconciliations(1);'));
  const reconciliationOutput = reconciliationA.stdout + reconciliationB.stdout;
  assert(reconciliationA.status === 0 && reconciliationB.status === 0, 'Concurrent reconciliation claims failed.');
  assert(exactLineCount(reconciliationOutput, '1') === 1 && exactLineCount(reconciliationOutput, '0') === 1, 'Reconciliation lease did not isolate one worker.');
  assert(scalar(`SELECT count(*) FROM public.commerce_payment_reconciliation_jobs WHERE payment_attempt_id=${sqlLiteral(claimAttemptId)}::uuid AND status='processing' AND processing_token IS NOT NULL`) === '1', 'Reconciliation target was not leased.');

  console.log('commerce-db: testing outbox lease');
  psqlSql(`
    UPDATE public.commerce_outbox
    SET next_attempt_at=clock_timestamp()+interval '1 hour'
    WHERE status IN ('pending','retry','processing');
    INSERT INTO public.commerce_outbox(
      id,topic,aggregate_type,aggregate_id,payload,status,next_attempt_at
    ) VALUES (
      '72000000-0000-4000-8000-000000000001','lease.test','test',
      '72000000-0000-4000-8000-000000000002','{}','pending',clock_timestamp()
    );
  `);
  const [outboxA, outboxB] = await runPair(serviceTransaction('SELECT count(*) FROM public.commerce_claim_outbox(1);'));
  const outboxOutput = outboxA.stdout + outboxB.stdout;
  assert(outboxA.status === 0 && outboxB.status === 0, 'Concurrent outbox claims failed.');
  assert(exactLineCount(outboxOutput, '1') === 1 && exactLineCount(outboxOutput, '0') === 1, 'Outbox lease did not isolate one worker.');
  assert(scalar(`SELECT count(*) FROM public.commerce_outbox WHERE id='72000000-0000-4000-8000-000000000001' AND status='processing' AND processing_token IS NOT NULL`) === '1', 'Outbox target was not leased.');

  console.log('commerce-db: testing staging E2E seed and cleanup');
  const stagingE2e = psqlFile('supabase/tests/commerce/staging-e2e-seed.sql').stdout;
  assert(stagingE2e.includes('"staging_e2e_seed_pass": true'), 'Commerce staging E2E seed scenario did not pass.');

  console.log('commerce-db: testing wallet finance adjustments, chargeback and support lookup');
  const walletFinanceSupport = psqlFile('supabase/tests/commerce/wallet-finance-support.sql').stdout;
  assert(walletFinanceSupport.includes('"wallet_finance_support_pass": true'), 'Commerce wallet finance/support scenario did not pass.');

  console.log('commerce-db: PASS');
} catch (error) {
  if (existsSync(logFile)) {
    error.message += `\nPostgreSQL log:\n${readFileSync(logFile, 'utf8').slice(-4000)}`;
  }
  throw error;
} finally {
  if (started) {
    run('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast', '-w'], { allowFailure: true });
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
