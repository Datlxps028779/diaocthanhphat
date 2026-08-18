# Current API and Integration Surface

## Current integration pattern

The application is not organized as a complete public REST API. Most first-party application operations execute through `src/lib/api/*` with Supabase PostgREST, Storage and RPCs. Next Route Handlers are intentionally limited to privileged server work and external ingestion boundaries.

## Next Route Handlers

| Route | Methods | Responsibility | Guard |
| --- | --- | --- | --- |
| `/api/admin/users` | GET, POST | User/staff administration | Bearer token plus `is_owner_mfa`; server-only service role where required |
| `/api/admin/generate-article` | POST | Generate article draft | Owner-only server operation; never directly publishes |
| `/api/admin/revalidate-content` | POST | Revalidate content cache | Admin operation |
| `/api/public/articles` | POST | Make.com/external article intake | Shared-ingestion authorization, validation, duplicate/quality checks; saves draft |
| `/api/public/listings` | POST | Make.com/external listing intake | Shared-ingestion authorization, taxonomy resolution, pending-review workflow |
| `/hinh-anh/[...path]` | route handler | Private Storage image proxy | Server-side storage boundary/path validation |
| `/sitemap.xml`, `/sitemap-images.xml`, `/robots.txt` | generated | Search-crawler metadata | Public |

The article intake explicitly keeps external content as unpublished draft. The listing intake writes reviewable user-listing data rather than publishing it into the public property catalogue.

## Supabase RPC and Edge Functions

| Surface | Responsibility | Current status |
| --- | --- | --- |
| `search_property_matches` | Organic catalogue search for keyword/relevance paths; active-only, rental-aware and deterministic | Used by [src/lib/api/properties.ts](../src/lib/api/properties.ts) |
| `match_properties_for_advisor` | Intent matching with deterministic reason codes; P5 migration prepared | Used by [src/lib/api/properties.ts](../src/lib/api/properties.ts) |
| `increment_property_views` | Atomic view count increment | Used with compatibility fallback |
| Chat visitor-token RPCs | Start/read/append/link/routing chat operations | Migration-backed public RPC boundary |
| `ai-chat` | RAG-grounded assistant with anti-fabrication rules | Source present; live deployment is `UNKNOWN` |
| `ai-reco` | Recommendation/ranking support | Source present; live deployment is `UNKNOWN` |
| `ai-autotag`, `ai-description` | Listing enrichment/description assistance | Source present; must remain human-reviewable |
| `ai-analytics` | Admin analytics assistance | Source present |
| `crm-webhook` | CRM relay and Zalo notification support | Source present; endpoint/secrets are `UNKNOWN` |
| `nurture-drip` | Lead nurture delivery | Source present; scheduling/secrets are `UNKNOWN` |
| `sitemap` | Edge sitemap support | Source present |

## Search and ranking behavior

Public search has one typed filter contract covering listing type, area/type, city/district/ward, keyword, sale/monthly-rental price, area, bedrooms, direction, legal status, featured/hot state, sort and pagination. Direct PostgREST list queries and map-marker queries apply the same filter operations and always require `is_active = true`; the map additionally requires coordinates and currently caps one response at 1,000 markers. Public keyword input has PostgREST structural characters removed before `.or()` construction. Base-listing SSR explicitly opts its live inventory query out of the Next Data Cache so a prior build's PostgREST count cannot remain as the current total; SSR seed data is accepted by the client only when its listing/filter/sort/page scope matches exactly.

For keyword or relevance sorting, the client calls `search_property_matches`; otherwise it uses direct queries. Both paths use deterministic `id` tie-breakers. Rental filters and price sorting use `price_per_month`, while sale paths use `price`. Ranked-RPC/detail failure is surfaced as a safe retriable error rather than silently falling back to different `ILIKE` semantics; map failure likewise has a distinct retry state instead of appearing as an empty map.

The user confirmed running the P4 read-only SQL Editor audit in `supabase/manual_property_search_audit.sql`. Separately captured production behavior on 2026-08-17 found 23 active and two inactive properties, stable repeated ordering, zero overlap across the first two ten-row pages and zero inactive IDs from representative ranked search. The audit's detailed catalog rows and `EXPLAIN (ANALYZE, BUFFERS)` output were not supplied, so this document does not invent plan timings or index evidence.

P5 is production-installed through `20260903040000_explainable_organic_ranking.sql`. Its organic relevance policy keeps `ts_rank_cd` as the main signal, adds only bounded freshness and public-field completeness signals, and excludes `is_hot`, `is_featured`, views and the unevidenced `is_verified` boolean from relevance. Explicit newest, price and views sorts remain user-selected modes with deterministic ID tie-breakers; editorial flags remain valid filters/badges/curated-section inputs but are not organic boosts.

The production post-run check through the public RPC confirmed 20 organic keyword results, stable repeated ID/rank order, no inactive IDs and zero page-one/page-two overlap. The representative Advisor RPC returned 10 rows of 20, with active-only results and the expanded `intent_score`/`match_reasons` contract. Live reason codes included `area`, `budget`, `keyword`, `loan` and `near_budget`. The supplied Advisor `EXPLAIN (ANALYZE, BUFFERS)` was a `Function Scan` returning 10 rows in approximately 16 ms; it does not by itself establish internal index use. There are no active rentals today, so the monthly-rental branch is protected by migration/tests but lacks a live-row receipt. The user ran the complete audit, but did not retain its owner/ACL/search-path rows, so those markers remain unasserted.

The same installed migration makes Advisor matching explainable: sale budget uses `price`, rental budget uses `price_per_month`, loan support matches only a positive value, the most-specific requested location is evaluated, and ordering ends in `id`. The RPC returns deterministic reason codes in addition to its compatibility score; the client presents reason labels rather than an opaque public score. New outcome telemetry sends only policy/source/position and aggregate criteria/reason/filter counts—never raw query text, result property IDs or contact data. `supabase/manual_property_ranking_audit.sql` is a read-only post-migration verification script.

## External integrations

| Integration | Current use | Operational verification |
| --- | --- | --- |
| Supabase | Auth, database, RLS, Storage, RPCs, Edge Functions | `UNKNOWN` live project state |
| Anthropic / compatible gateway | AI articles, chat and assistance | `UNKNOWN` key/config/provider availability |
| Make.com | Authenticated article/listing ingestion | `UNKNOWN` scenario configuration and E2E receipt |
| CRM webhook / Zalo OA | New-lead relay and nurture messages | `UNKNOWN` webhook/OA secrets and delivery receipts |
| OpenStreetMap | Nominatim geocoding/reverse-geocoding and Overpass POIs | `UNKNOWN` runtime availability/rate limits |
| Pexels | Server-side image search | `UNKNOWN` API key/quota |
| Vercel/Ahrefs/Google | Performance and web analytics | `UNKNOWN` production collection/consent state |

## Gaps and boundary requirements

- **MISSING:** Resource-oriented APIs for entities, verification cases, agents, companies, marketplace packages, orders, payments, invoices and entitlements.
- **PARTIAL:** Current ingestion endpoints are integration-only, not a general marketplace/public API.
- **NEEDS_REFACTOR:** In-memory Edge-function rate limits are not proof of distributed protection. Establish a durable rate-limit/abuse-control design before increasing public automation.
- **UNKNOWN:** Full Edge authentication posture where `verify_jwt = false`; verify each function’s own secret/token validation and production deployment before expansion.
- Never expose the Make key, service-role key, owner credentials or any secret in client code, docs, logs or responses.
