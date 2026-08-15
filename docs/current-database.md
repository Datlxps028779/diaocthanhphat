# Current Database

## Source of truth and confidence

Supabase PostgreSQL is the system of record. Schema evolution is tracked through 102 SQL migration files under `supabase/migrations/`. This document describes repository evidence; it does not certify that every migration has been applied in production.

## Core data model

```text
auth.users ── 1:1 ── profiles
areas ──< districts ──< wards ──< neighborhoods
areas / property_types ──< properties
profiles ──< user_listings ── optional approved link ──> properties
properties ──< leads ──< lead_activities
leads ──< lead_assignments >── profiles
chat_sessions ──< chat_messages
chat_sessions ──< chat_assignments >── profiles
```

## Implemented tables/models

| Domain | Repository model coverage | Evidence |
| --- | --- | --- |
| Users/roles | `profiles` linked to `auth.users`; roles `user`, `staff`, `admin` | [src/lib/supabase.ts](../src/lib/supabase.ts#L277-L280), `20260703014602_user_listings_and_profiles.sql` |
| Location taxonomy | `areas`, `districts`, `wards`, `neighborhoods` | [src/lib/supabase.ts](../src/lib/supabase.ts#L14-L33) |
| Property catalogue | `properties`, `property_types`, structured price/location/media/SEO/FAQ/verification fields | [src/lib/supabase.ts](../src/lib/supabase.ts#L45-L70) |
| User submissions | `user_listings` with lifecycle, rejection, expiry, approved `property_id` link | [src/lib/supabase.ts](../src/lib/supabase.ts#L281-L305) |
| Price data | `price_stats` across area/ward/neighborhood scopes | [src/lib/supabase.ts](../src/lib/supabase.ts#L71-L80) |
| Projects | `projects` with inventory, price, text developer, media, coordinates | [src/lib/supabase.ts](../src/lib/supabase.ts#L266-L275) |
| Leads/CRM | `leads`, `lead_activities`, `lead_assignments`, drip models | [src/lib/supabase.ts](../src/lib/supabase.ts#L153-L203) |
| Chat operations | sessions, messages, assignments, staff capacity | [src/lib/supabase.ts](../src/lib/supabase.ts#L205-L232) |
| Personalization | favorites, saved searches, taste signals/recommendation migrations | [src/lib/supabase.ts](../src/lib/supabase.ts#L350-L365) |
| Content/CMS | news/categories, settings/content, menus, banners, featured sections, pages/blocks | [src/lib/supabase.ts](../src/lib/supabase.ts#L37-L43), [src/lib/supabase.ts](../src/lib/supabase.ts#L233-L265), [src/lib/supabase.ts](../src/lib/supabase.ts#L306-L387) |
| AI/RAG | knowledge, RAG chunks/index runs, internal admin documents | [src/lib/supabase.ts](../src/lib/supabase.ts#L94-L147), [src/lib/supabase.ts](../src/lib/supabase.ts#L315-L325) |

## Property and location state

The property row is rich but denormalized in several areas: image arrays, amenities, legal string, coordinates, city/district/ward text and selected foreign keys coexist. The current typed model includes `area_id` and `district_id`; it also retains text `city`, `district`, and `ward` for compatibility ([src/lib/supabase.ts](../src/lib/supabase.ts#L45-L68)).

P1 adds an additive integrity boundary in `20260902000000_location_integrity_district_id.sql`: it backfills only exact `(area_id, district text)` taxonomy matches, then validates contradictory area/district/ward/neighborhood combinations on both listing tables. Exact legacy text writes receive the corresponding `district_id` in the database; unmatched free text remains compatible. A referenced district cannot be renamed or moved in a way that would contradict denormalized listing data; this requires a future explicit atomic cascade. P1 does not make `district_id` globally mandatory or delete text location fields. The matching production SQL is still user-run and requires post-run confirmation.

This has real product value today—existing import, filtering, URLs, maps and SEO work against it—but makes a direct entity-graph conversion dangerous. Any future normalization must be additive, backfilled, dual-read/dual-write where necessary, and measured against existing real data first.

## RLS and database-side protections

- Public/private table access is protected by RLS migrations; do not rely on client hiding alone.
- Staff lead visibility is assignment-scoped in the database, while admins retain broader access.
- Public lead creation is constrained to an intended new/unassigned shape.
- Public chat uses visitor-token guarded `SECURITY DEFINER` RPCs rather than unrestricted anonymous table reads.
- View counting calls `increment_property_views` first, then has a compatibility fallback if the RPC is unavailable ([src/lib/api/properties.ts](../src/lib/api/properties.ts#L255-L263)).

`UNKNOWN`: effective live policies, indexes, grants, extensions, triggers and table cardinalities. Required verification is a read-only production schema/policy query plus targeted query plans using representative real traffic filters.

## Data-model gaps against the master target

| Target capability | Status | Why |
| --- | --- | --- |
| Dedicated property media/features/legal/location/verification records | `PARTIAL` | Current property row carries many inline/array fields; a boolean `is_verified` exists but evidence/review history does not. |
| Generic entities and entity relations | `MISSING` | No evidenced `entities` / `entity_relations` model for road, landmark, industrial park, developer or other relationships. |
| Fully FK-normalized property geography | `NEEDS_REFACTOR` | Current hybrid text + FK geography is intentionally in production-compatible use. |
| Spatial/PostGIS distance model | `UNKNOWN` | Coordinates exist; no repository evidence establishes PostGIS extension/index/distance relationships. |
| Structured developer/company/agent model | `MISSING` | Project `developer` is text; staff role is not an agent/company model. |
| Verification cases/evidence/reviewer decisions | `MISSING` | `is_verified` alone is not an auditable verification workflow. |
| Lead requirements/matches | `PARTIAL` | Filters, saved searches and advisor matching exist; dedicated normalized requirement/match tables were not evidenced. |
| Payments/entitlements/ledger | `MISSING` | No orders, transactions, invoices, subscriptions or package entitlements found. |

## Change safety requirements

1. Production SQL is user-run only; prepare migration and dry-run evidence first.
2. After the user reports execution, query the database to confirm the schema/data result.
3. Do not remove legacy columns/routes/tables until real data coverage, caller usage and rollback path are proven.
4. Use database transactions/RPCs for multi-row lifecycle changes when scaling beyond compensating client-side flows.
