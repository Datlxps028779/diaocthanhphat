# Current Feature Coverage

## Property catalogue, search, and detail

- Public purchase/rental/listing routes, canonical product paths, legacy redirect support and true 404 handling exist.
- Search supports location, catalogue, price, area, room, direction, legal, featured/hot and deterministic sort/pagination filters.
- Relevance search and advisor-style matching call database RPCs.
- The public detail page includes gallery/lightbox, safe video/VR, map, nearby POI, price-per-area calculation, FAQ, share, favorites, lead/contact/callback, loan calculator, comparable/related inventory, recently viewed and recommendation modules.
- Public discovery follows a data-aware journey: homepage category/search entry points, local-only “Tiếp tục xem” for returning visitors, configured featured/area content only when it has real items, personalized recommendations only after enough behavior signals, URL-persistent listing filters, and distinct detail rails for related inventory, filter exploration, recommendations and recent views. Empty discovery rails hide unless CMS explicitly configures an empty state.
- Discovery telemetry measures module exposure/click and saved-search notice lifecycle with a scalar allowlist; it excludes raw queries, listing titles, addresses, contact information and viewer-count social proof.
- Preview mode uses supplied form data and suppresses the main read/view/taste/favorite/related effects ([PropertyDetailPage.tsx](../src/screens/PropertyDetailPage.tsx#L45-L79)). Future detail work still needs a full audit of all child-component side effects before declaring preview isolation complete.

## Listing marketplace foundation

- Users can submit, edit, delete, renew and view their own listings.
- Admin/staff moderation can approve, reject and set expiry.
- Approval links a user listing to public property data; unpublish/delete/reject behavior hides linked public inventory.
- Make.com listing intake uses the pending-review workflow instead of direct publication.
- Admin property management already has server-paginated filtering, including active state, listing type, area/type, hot/featured/verified flags, price/view/update sorts and sanitized keyword/public code search ([src/lib/api/properties.ts](../src/lib/api/properties.ts#L283-L358)).

## Content, CMS, media, SEO

- Database-backed settings/content, menus, banners, featured sections, testimonials, managed pages and page blocks.
- News with dynamic categories, rich editor, SEO/GEO fields, FAQ/citations, public article/category pages and draft-only external/AI writing paths.
- Rich text supports sanitized images, strict YouTube or trusted uploaded video markers, local preview and guarded upload in allowed admin contexts.
- Sitemap, robots, route metadata/schema overrides and quality-gated area/neighborhood indexation are present.

## CRM, chat, growth automation

- Lead pipeline, activities, status/follow-up fields and database-enforced assignment visibility.
- Internal chat operations: session routing, visitor token access, staff assignment and capacity data.
- Configurable nurture drip steps/logs plus function/cron foundation.
- CRM webhook and Zalo notification paths exist in source.

## AI and personalization

- AI chat with RAG/knowledge sources and anti-fabrication guardrails.
- AI recommendations, listing assistance/autotagging, article-draft generation and analytics assistance.
- Favorites, saved searches, recent views and taste signals provide a non-AI personalization foundation.
- AI remains non-critical: human review and deterministic/database fallback are required.

## Master-plan coverage

| Phase | Status | Current evidence | Primary gap |
| --- | --- | --- | --- |
| P1 Database | `PARTIAL` | Broad Supabase schema, migrations, RLS, CMS, CRM and search RPCs | Target normalized property/entity/agent/payment models absent |
| P2 Location / Entity | `NEEDS_REFACTOR` | Area → district → ward → neighborhood hierarchy, coordinates, price stats | No generic entities/relations; geography is hybrid text plus FK |
| P3 Property | `PARTIAL` | Rich property rows, user submissions, review/publication, media/SEO/detail | Need additive normalization, lifecycle/audit strengthening and structured project/developer links |
| P4 Search | `PRODUCTION VERIFIED` | Typed catalogue/list-map filters, active-only relevance RPC, rental semantics, stable pagination, exact live SSR counts, error/retry states; user ran read-only SQL audit | Generic master entities and durable server-side search-log model remain deferred; detailed EXPLAIN output was not shared |
| P5 Ranking | `PRODUCTION-BEHAVIOR VERIFIED` | Versioned organic policy and explainable Advisor RPC are installed; public RPC checks confirmed stable organic pages, active-only results, expanded Advisor reason contract and real reason codes | Rental branch has no active production inventory yet; owner/ACL/search-path audit output was run but not retained in the supplied result |
| P6 Property Detail | `PARTIAL` | SSR-first detail path with canonical metadata, safe gallery/map popup, media, FAQ, related inventory, mobile sticky consultation/callback CTA, explicit POI loading/empty/unavailable states and preview-safe conversion controls | Authenticated Admin preview and a real persisted-lead retry still need a safe authorized E2E receipt; evidence-backed verification and live market-context thresholds remain P7/later work |
| P7 Verification | `PARTIAL` | `is_verified`, admin filter/bulk patch, verified badge | No evidence/case/reviewer/reason/audit workflow |
| P8 SEO/GEO/AIO | `PARTIAL` | Metadata/schema/sitemap/quality gates/GEO fields/RAG | Production crawl evidence, entity pages, and only-real-data market context remain needed |
| P9 AI Search | `PARTIAL` | AI chat and RAG exist | Property-context resolution, transparent citations/fallback and outcome measurement need verification |
| P10 AI Listing | `PARTIAL` | Description/autotag assistance and draft flows | Human review, evidence provenance, operation monitoring must remain enforced |
| P11 AI Verification | `MISSING` | No decision/evidence workflow to attach recommendations to | Build only after P7 verification source-of-truth model |
| P12 CRM | `EXISTING` | Leads, activities, assignment RLS, chat ops, nurture source | Requirements/matches/scoring/delivery observability are partial |
| P13 Agent / Company | `MISSING` | Staff operational role is not an agent/company domain model | Add separate profiles, membership, ownership and RBAC design |
| P14 Marketplace | `PARTIAL` | Submission/moderation/favorites/saved search/feature flags | No package, inventory, entitlement, promotion ledger or paid-vs-organic boundary |
| P15 Payment | `MISSING` | No payment records/provider integration located | Requires package/entitlement model first |
| P16 Performance | `PARTIAL` | Vercel telemetry, image workaround, local build/browser checks | Need production Core Web Vitals, cache, bundle and query-plan evidence |
| P17 Security | `PARTIAL` | RLS, private-route hiding, server role boundary, input hardening, media sanitization | Need deployed policy/secret/function/rate-limit audit and security test plan |

## Explicit non-goals for the next implementation phase

- Do not duplicate the already implemented secure rich-video feature.
- Do not clone another website’s code, media, branding or content; only learn from information hierarchy and interaction patterns.
- Do not add synthetic properties, market figures, legal claims, distances or trust scores.
- Do not re-enable viewer-count/social-proof toast behavior.
