# Documentation Changelog

## 2026-08-16 — P3B listing lifecycle audit prepared

- Added an append-only `user_listing_lifecycle_events` table populated only by a database trigger on `user_listings` insert, lifecycle update, expiry change, and delete.
- Internal events derive the actor from the authenticated database context, preserve only controlled status/reason/expiry snapshots, and allow authenticated Admin/staff read access while revoking direct browser writes.
- Added the Admin “Lịch sử” timeline with explicit loading, error, empty-history, transition, actor-role, reason, expiry, and timestamp states; no internal timeline was exposed on user-facing pages.
- Historical events are intentionally not backfilled: the audit boundary begins when migration `20260903010000_user_listing_lifecycle_audit.sql` is installed, because existing timestamps cannot prove actor identity or transition order.
- Production read-only verification confirmed the audit table, Admin/staff SELECT policy, RLS, revoked browser writes, fixed-search-path `SECURITY DEFINER` trigger function, and `INSERT`/`UPDATE`/`DELETE` trigger are installed as designed.
- Production currently has zero lifecycle events, which is valid because existing rows were not backfilled; the one approved listing still has a valid active property link, with zero malformed events and zero current-status mismatches.

## 2026-08-16 — P3A atomic listing approval production verified

- Production function `approve_user_listing(uuid)` was confirmed as a fixed-search-path `SECURITY DEFINER` RPC executable by `authenticated` but not `anon`.
- Read-only production checks found one approved user listing with a valid active property link, no unsafe reapproval candidate, and no duplicate-like property fingerprint group.
- Approval is now one database transaction; optional AI autotagging runs only after committed success and cannot turn a committed lifecycle transition into a client-visible failure.

## 2026-08-13 — P1 location-integrity production verified

- The user ran the P1 read-only dry-run and the `district_id` integrity migration in production.
- Follow-up read-only measurement confirmed `district_id` coverage on all 25 properties (including 23 active) and the one approved user listing; no unresolved, conflicting, ward, or neighborhood hierarchy mismatches were found.
- Added a follow-up migration `20260902010000_protect_referenced_neighborhood_location.sql` to protect a referenced neighborhood's hierarchy and require the audited atomic slug-rename RPC. This follow-up is prepared in the repository and has not been run in production.
- Authenticated Admin/user form and approval-transition runtime checks still require authorized test sessions.

## 2026-08-13 — P1 location-integrity implementation prepared

- Added the deterministic `district_id` backfill and validation migration for `properties` and `user_listings`, plus a separate read-only production dry-run script.
- Updated Admin and user-listing selection flows to store a selected district ID together with its canonical text label, retaining text-only compatibility where taxonomy is absent.
- Fixed approval so structured district identity—and the existing neighborhood slug—survives from a user listing into its approved property.

## 2026-08-13 — Phase 0 audit baseline

- Added the required audit artifacts: current-system, route, database, API, SEO and feature inventories.
- Added a classified gap analysis using `EXISTING`, `PARTIAL`, `MISSING`, `NEEDS_REFACTOR` and `UNKNOWN`.
- Added a proposal-only implementation order aligned with the master specification.
- No product feature, migration, route, production configuration or data was changed as part of this documentation phase.
