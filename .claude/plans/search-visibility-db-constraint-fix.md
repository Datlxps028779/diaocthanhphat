# Search Visibility Database Constraint Fix

## Confirmed likely root cause

The application now generates deterministic URLs such as `https://chonhaviet.com/...` and validates them before upsert. The remaining production failure is the database CHECK constraint itself:

```sql
canonical_url ~ '^https://chonhaviet\\.com/[A-Za-z0-9/_-]*$'
```

In a normal PostgreSQL string literal with `standard_conforming_strings` enabled, the migration's two backslashes are stored as two backslashes for the regex engine. That pattern does not mean “literal dot” as intended; it expects a backslash before the wildcard portion, so valid `https://chonhaviet.com/...` URLs are rejected. The correct SQL regex literal should contain one backslash before the dot:

```sql
canonical_url ~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$'
```

The existing application-side canonical validation is still useful, but it cannot repair a malformed production constraint.

## Safe implementation sequence

1. Add a read-only production diagnostic SQL file that reports:
   - the exact current `search_visibility_url_absolute_canonical` definition from `pg_constraint`;
   - whether a representative canonical URL and representative invalid origins pass the current constraint;
   - failed/latest Search Visibility runs and their error summaries;
   - no writes, no Google calls, no scheduling.

2. Add an additive repair migration (do not run it locally against production):
   - drop only `search_visibility_url_absolute_canonical`;
   - recreate it with the correctly escaped PostgreSQL regex and the same intended non-www canonical domain policy;
   - notify PostgREST to reload schema;
   - do not alter audit data, RLS, source tables, public URLs, sitemap, or Google integrations.

3. Harden the application error classification:
   - recognize the named constraint as a database-policy mismatch, not a source/schema/owner error;
   - tell the owner that the additive constraint repair SQL must be run once, then retry;
   - keep pre-upsert candidate validation and detailed affected-source diagnostics.

4. Add tests for:
   - exact canonical origin generation;
   - malformed candidates blocked before upsert;
   - mapping the named constraint error to a database-policy repair code/message;
   - route returning the structured repair code.

## Verification

Before asking for production SQL execution:

- run focused and full tests;
- typecheck;
- production build;
- `git diff --check`;
- `graphify update .`;
- run real Chrome against a clean production build on a public route;
- record verify-gate receipt;
- stage only code, dry-run SQL, and additive repair migration; preserve unrelated dirty/untracked files.

The production SQL must be run by the user. After the user reports it ran, request/inspect the read-only diagnostic result to confirm the corrected constraint before asking them to retry the admin sync. Do not push until code verification is complete and obtain separate explicit push permission.
