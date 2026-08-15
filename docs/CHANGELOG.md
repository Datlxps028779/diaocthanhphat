# Documentation Changelog

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
