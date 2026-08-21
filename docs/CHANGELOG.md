# Documentation Changelog

## 2026-08-17 — Discovery-first browsing and retention UX

- Reorganized public discovery around real user intent rather than adding new conversion CTA work: homepage now offers a local-only “Tiếp tục xem” rail for returning visitors, configured property/area/news sections collapse when no real content is available, and personalized recommendations remain progressive and hidden until sufficient behavior signals exist.
- Standardized discovery rails across homepage, listings and detail with safe-image cards, real property paths, mobile scroll-snap, and distinct purposes: related inventory → broaden filters → recommendations → recently viewed. Detail no longer presents two separate filter-exploration blocks with overlapping purpose.
- Saved-search feedback now remains a truthful retained state rather than an auto-dismissing toast: it appears only after a real saved record returns and has an accessible manual dismissal. It does not enable notifications or make notification promises.
- Added privacy-safe discovery module events for view/click and saved-search notice shown/dismissed. Event payloads permit only surface/module/position/count/filter-presence/listing type/source; no raw search, title, address, PII, or viewer-count social proof is recorded.
- No migration, production SQL, Make.com, AI Search/RAG, AI recommendation contract, chatbot, lead/form flow, or CTA redesign was included in this UI batch.

## 2026-08-17 — P3D/P4 production evidence, P5 production verification, and P6 detail safety

- Measured production read-only before implementation: one approved user listing still has its valid active property; there are no rejected/expired reapproval candidates, dangling links, or current lifecycle inconsistencies. The catalogue has 23 active and two inactive sale properties, with no active rentals.
- Added an additive P3D approval migration: first approval still inserts atomically, while a valid inactive linked property is updated/reactivated in place so its ID, slug, public code, view history, editorial flags, and downstream foreign keys remain intact. Active, missing, or shared links fail closed.
- Added a read-only P3D dry-run covering lifecycle/link integrity, ambiguous references, duplicate fingerprints, downstream references, RPC ACL/config, and trigger attachment. The user installed the P3D migration in production; follow-up read-only verification found one approved/active linked listing, no dangling/shared links or publication inconsistencies, and anonymous RPC execution denied. There is currently no rejected/expired candidate, so production data was not mutated solely to exercise reactivation.
- Completed the typed P4 URL/filter contract, rental monthly-price semantics, deterministic paging, exact SSR seed scoping, live-inventory SSR cache bypass, list/map filter parity, explicit list/map error-and-retry states, area-route count scope, and route-correct collection JSON-LD.
- Production API measurement confirmed the ranked RPC returned stable repeated ordering for a real keyword, no overlap between its first two ten-row pages, and no inactive IDs. The user also confirmed running `supabase/manual_property_search_audit.sql`; its detailed catalog and `EXPLAIN (ANALYZE, BUFFERS)` result sets were not supplied, so no plan timing/index claim is inferred from that execution.
- Installed P5 ranking migration `20260903040000_explainable_organic_ranking.sql`: public read-only RPC verification found 20 stable organic keyword results, zero inactive rows and zero first/second-page overlap. Advisor returned ten active rows from 20 candidates with real `area`, `budget`, `keyword`, `loan` and `near_budget` reasons. The supplied representative Advisor plan was a Function Scan returning ten rows in about 16 ms; no underlying-index claim is inferred from that result alone. There is no active rental row for a live monthly-price receipt.
- P6 detail safety adds a mobile sticky consultation/callback bar, visible retry states for inline/callback submission failure, preview-safe contact/callback/phone interaction including the reusable modal, and explicit POI loading/empty/unavailable/retry UI.
- Removed unsupported unconditional legal/refund, agent-experience and legal-transparency wording from public detail/contact conversion UI. Detail shows only actual legal field values where present and recommends independent document/term review; `is_verified` remains a boolean until P7 provides evidence/review history.
- Added privacy-safe ranking telemetry for result source, policy version, result position, criteria/reason counts and filter count; raw query text, property identifiers and contact details are not sent by the new outcome events.

## 2026-08-16 — P3C listing expiry ownership hardening prepared

- Measured production before implementation: one approved listing expires on 2026-09-15 and has a consistent active property link; 22 other active properties are independent Admin records.
- Confirmed the hourly `expire-due-listings` cron runs as `postgres` and has 821 successful executions, while both internal lifecycle functions still allowed direct `PUBLIC`, `anon`, and `authenticated` execution with an incomplete search path.
- Added an additive migration that preserves current expiry/unpublish behavior while fixing both `SECURITY DEFINER` search paths and revoking browser execution; the existing cron schedule is not changed.
- Added read-only production checks for function ACLs, cron ownership/history, trigger attachment, expiry consistency, independent properties, and P3B audit consistency.
- Migration `20260903020000_harden_listing_expiry_ownership.sql` is production verified: both functions have fixed `public, pg_temp` paths; `PUBLIC`, `anon`, and `authenticated` cannot execute them; the active `postgres` cron job and both lifecycle triggers remain intact.
- Follow-up read-only checks found zero listing/property consistency errors, zero malformed lifecycle events, and no effect on the 22 active independent Admin properties.

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
