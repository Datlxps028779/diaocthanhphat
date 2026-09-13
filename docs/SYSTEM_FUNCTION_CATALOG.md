# Chợ Nhà Việt — System Function Catalog

> Trạng thái: `LIVING DOCUMENT — current repository map`
>
> Cập nhật: 2026-09-11
>
> Mục đích: tra cứu nhanh một chức năng đang nằm ở đâu, làm gì, dữ liệu đi qua
> đâu, cách kiểm tra và cách nâng cấp. Tài liệu này không tự khẳng định
> production đã áp dụng migration/code; production phải có evidence riêng.

## 0. Cách đọc và thứ tự xác minh

Khi hỏi về một chức năng:

1. Đọc tài liệu này để định vị domain và file.
2. Chạy `graphify query` cho câu hỏi cụ thể; dùng `graphify path` khi cần lần
   theo quan hệ giữa route, API, server orchestration và database.
3. Đọc code hiện tại và tests liên quan.
4. Đối chiếu migration/dry-run/verify SQL.
5. Tách kết luận thành `current code`, `local verified`, `production verified`,
   `proposed`, không trộn các trạng thái.
6. Nếu muốn thay đổi, lập options + impact + rollback trước khi code.

`graphify-out/` là bản đồ phụ trợ, không thay thế code hoặc production evidence.

## 1. Luồng tổng hợp hiện tại

```text
Nguồn dữ liệu public/private
  → mutation API / admin UI / user lifecycle
  → canonical eligibility + permission
  → public route + metadata/JSON-LD
  → Next.js cache revalidation
  → sitemap / image sitemap
  → SEO freshness queue
  → Search Visibility registry
  → internal AIO/RAG projection
  → retry/audit/evidence
```

Google Search Console và AIO của bên thứ ba là hệ thống ngoài quyền kiểm soát.
Sitemap, JSON-LD, Search Visibility và RAG chỉ chứng minh khả năng phát hiện,
đủ điều kiện hoặc đồng bộ nội bộ; không được gọi đó là Google/external-AIO đã
index nếu chưa có evidence tương ứng.

## 2. Public routes và presentation

| Chức năng | Vị trí chính | Vai trò |
|---|---|---|
| Trang chủ | `app/page.tsx`, `app/HomeClient.tsx`, `src/LandingPage.tsx` | Render discovery/public sections |
| Chi tiết Product | `app/bat-dong-san/[slug]/page.tsx`, `app/bat-dong-san/[slug]/PropertyDetailClient.tsx`, `src/lib/productDetailPage.tsx` | Canonical detail, metadata, JSON-LD, liên hệ |
| Listing mua bán | `app/mua-ban/page.tsx`, `app/mua-ban/[areaSlug]/[[...rest]]/page.tsx` | Listing index và landing theo khu vực |
| Listing cho thuê | `app/cho-thue/page.tsx`, `app/cho-thue/[areaSlug]/[[...rest]]/page.tsx` | Rental index và landing theo khu vực |
| News index | `app/tin-tuc/page.tsx` | Danh sách bài đã publish |
| News detail | `app/tin-tuc/[slug]/page.tsx`, `NewsDetailClient.tsx` | Bài viết, citation, FAQ, JSON-LD |
| News category | `app/tin-tuc/danh-muc/[slug]/page.tsx` | Category landing |
| Knowledge index | `app/kien-thuc/page.tsx` | Nội dung knowledge public |
| Area landing | `app/khu-vuc/[slug]/page.tsx` | Khu vực và listing liên quan |
| Neighborhood landing | `app/khu-dan-cu/[slug]/page.tsx` | Khu dân cư, listing, giá |
| Managed page | `app/trang/[slug]/page.tsx` | CMS public page |
| Sitemap | `app/sitemap.ts` | XML URL candidates |
| Image sitemap | `app/sitemap-images.xml/route.ts` | Image URL candidates |
| Robots | `app/robots.ts` | Crawler policy và sitemap declaration |
| JSON-LD renderer | `src/components/JsonLdScripts.tsx`, `src/lib/seo.ts` | Structured data render phía public route |
| SEO route data | `src/lib/routeSeo.ts`, `src/lib/areaSeo.ts`, `src/lib/seoAuto.ts` | SEO fields/overrides và route metadata |
| Canonical path | `src/lib/productPath.ts`, `src/lib/areaPath.ts` | Chuẩn hóa URL public |

## 3. Admin/user UI theo domain

| Domain | UI | Chức năng chính |
|---|---|---|
| Product admin | `src/components/admin/tabs/PropertiesTab.tsx` | Tạo/sửa/quản trị Product public projection |
| User listing moderation | `src/components/admin/tabs/UserListingsApprovalTab.tsx` | Duyệt/reject/promote listing của user |
| News | `src/components/admin/tabs/NewsTab.tsx` | Soạn, quality gate, publish boundary |
| News category | `src/components/admin/tabs/NewsCategoriesTab.tsx` | Category CRUD/reorder |
| Area/neighborhood | `src/components/admin/tabs/NeighborhoodsTab.tsx`, `src/components/admin/tabs/PagesTab.tsx` | Taxonomy/page data |
| CMS pages | `src/components/admin/tabs/PagesTab.tsx`, `PageBuilderTab.tsx`, `CmsContentTab.tsx` | Managed pages, blocks, layout |
| SEO/Search Visibility | `src/components/admin/tabs/SeoGeoTab.tsx` | Audit, sync, Search Console actions |
| AIO/RAG | `src/components/admin/tabs/AiRagTab.tsx` | Stats, runs, chunk inspection, knowledge management |
| Staff/permissions | `src/components/admin/tabs/StaffTab.tsx` | Role, staff permission, scope |
| Property verification | `src/components/admin/tabs/PropertyVerificationTab.tsx` | Trust/verification workflow |

User/staff form không được yêu cầu họ tự viết JSON-LD, canonical hoặc chunk.
Những trường kỹ thuật phải được hệ thống suy ra; override nâng cao phải có
permission và audit riêng.

## 4. Client API modules

| Module | Vị trí | Chức năng |
|---|---|---|
| Product | `src/lib/api/properties.ts` | Product CRUD, search, images/panoramas và gọi propagation |
| User listing | `src/lib/api/userListings.ts` | User listing lifecycle, submit/approval projection |
| News | `src/lib/api/news.ts` | News CRUD, publication request, revalidation snapshot |
| Taxonomy | `src/lib/api/taxonomy.ts` | Area/district/ward/neighborhood/property type/news category mutations |
| CMS | `src/lib/api/cms.ts` | Managed pages, page blocks, layout và revalidation |
| Revalidation client | `src/lib/api/contentRevalidation.ts` | Gửi snapshot tới server revalidation boundary |
| SEO freshness | `src/lib/api/seoFreshness.ts` | Đọc queue status |
| Search Visibility | `src/lib/api/searchVisibility.ts` | Đọc audit, sync, inspect, submit sitemap |
| AIO/RAG | `src/lib/api/aiRag.ts` | Stats/runs/chunks/retrieval; refresh browser deferred, không gọi RPC trực tiếp |
| AI knowledge | `src/lib/api/aiChatKnowledge.ts` | CRUD knowledge entries, phải phân loại public/private |
| Admin docs | `src/lib/api/adminDocs.ts` | Tài liệu private; không đưa vào public RAG |

## 5. Server orchestration

| Chức năng | Vị trí | Chức năng chính |
|---|---|---|
| Parse/revalidation paths | `src/lib/server/contentRevalidation.ts` | Validate input, allowlist path, tính affected paths cho Product/News/Area/Neighborhood/Route |
| Public propagation | `src/lib/server/publicIndexing.ts` | `revalidatePath`, freshness queue, Search Visibility, AIO result/evidence |
| Search Visibility candidates | `src/lib/server/searchVisibility.ts` | Canonical origin, eligibility, reason codes, candidate builder |
| Search Visibility persistence | `src/lib/server/searchVisibilityService.ts` | Sync registry, dọn stale source keys, sitemap/inspection evidence |
| AIO/RAG indexing | `src/lib/server/aiIndexing.ts` | Adapter xác định target; mặc định deferred, chỉ server explicit opt-in mới gọi RPC |
| Permission boundary | `src/lib/server/requireAdmin.ts` | `requireOwner`, `requireAdminOrStaff`, `requireStaffPermission`, service client |
| News publication | `src/lib/server/newsPublishing.ts`, `app/api/admin/news/[id]/publish/route.ts` | Owner-MFA/server boundary, quality/citation gate, publish event |

### Hàm quan trọng

- `parseContentRevalidationInput()` — validate payload revalidation.
- `collectContentRevalidationPaths()` — tạo tập path allowlist.
- `propagatePublicIndexing()` — orchestration hiện tại cho public impact.
- `buildSearchVisibilityCandidates()` — tạo registry candidates.
- `syncSearchVisibilityAudit()` — ghi registry và retire stale rows.
- `refreshAiIndex()` — refresh các RAG target phụ thuộc.
- `aiIndexTargetsForContent()` — mapping mutation → RAG sources.
- `requireOwner()` / `requireAdminOrStaff()` / `requireStaffPermission()` — authz.

## 6. API routes server

| Route | Vị trí | Chức năng |
|---|---|---|
| Publish News | `app/api/admin/news/[id]/publish/route.ts` | Server-only publication boundary |
| Revalidate content | `app/api/admin/revalidate-content/route.ts` | Admin/staff-triggered public revalidation |
| Search Visibility | `app/api/admin/search-visibility/route.ts` | Sync/diagnose/submit/inspect |
| SEO freshness | `app/api/admin/seo-freshness/route.ts`, `app/api/internal/seo-freshness-revalidate/route.ts` | Queue status và internal processing |
| Permissions | `app/api/admin/permissions/route.ts` | Staff permission operations |
| Public articles/listings | `app/api/public/articles/route.ts`, `app/api/public/listings/route.ts` | Public data API |

## 7. Database source và projection

### Source nghiệp vụ

- `properties` — Product/listing source.
- `user_listings` — user-owned listing lifecycle trước khi promote/public.
- `news` — News source; `is_published` là public boundary.
- `areas`, `districts`, `wards`, `neighborhoods` — location taxonomy.
- `property_types` — Product taxonomy.
- `news_categories` — News taxonomy.
- `managed_pages`, `page_blocks` — CMS public pages.
- `price_stats` — derived price grounding.
- `ai_chat_knowledge` — knowledge entries; phải có public/private policy.
- `admin_documents` — private documents; không public AIO.

### Projection/audit

- `search_visibility_urls` — canonical/eligibility registry.
- `search_visibility_runs` — audit/sync run evidence.
- `seo_freshness_jobs` — path freshness queue.
- `rag_chunks` — SQL-built AIO/RAG projection.
- `rag_index_runs` — RAG run evidence.
- `news_publication_events` — News publish/unpublish audit.

## 8. Migration và SQL verification liên quan

> Migration chỉ là ý định trong Git cho đến khi user chạy và gửi read-only
> verification. Không tự xem file migration là production state.

| Mục đích | Migration / verify |
|---|---|
| RAG foundation | `supabase/migrations/20260814000000_rag_index.sql` |
| Private/owner RAG boundary | `supabase/migrations/20260818000000_owner_access_and_private_rag.sql` |
| Search Visibility | `supabase/migrations/20260906000000_search_visibility_audit_foundation.sql`, `20260907000000_fix_search_visibility_canonical_constraint.sql` |
| SEO freshness | `supabase/migrations/20260909010000_seo_freshness_queue.sql`, `20260909020000_seo_freshness_path_check_fix.sql` |
| News publication boundary | `supabase/migrations/20260909030000_news_publish_boundary.sql`, `20260911010000_harden_news_publication_server_boundary.sql` |
| Unified public → AIO/RAG proposal | `supabase/migrations/20260911020000_unify_public_aio_rag_boundary.sql` |
| News boundary verify | [manual_news_publication_server_boundary_verify.sql](file:///Users/macbucdatle/Desktop/project/supabase/manual_news_publication_server_boundary_verify.sql) |
| Horizon SEO consistency | [manual_horizon4_seo_content_consistency_summary.sql](file:///Users/macbucdatle/Desktop/project/supabase/manual_horizon4_seo_content_consistency_summary.sql) |
| RAG preflight | [manual_public_aio_rag_boundary_dry_run.sql](file:///Users/macbucdatle/Desktop/project/supabase/manual_public_aio_rag_boundary_dry_run.sql) |
| RAG verify | [manual_public_aio_rag_boundary_verify.sql](file:///Users/macbucdatle/Desktop/project/supabase/manual_public_aio_rag_boundary_verify.sql) |
| Freshness verify | [manual_seo_freshness_queue_verify.sql](file:///Users/macbucdatle/Desktop/project/supabase/manual_seo_freshness_queue_verify.sql) |

## 9. Current evidence snapshot — 2026-09-11

### Đã có production evidence từ user

- News server publication boundary: RPC server tồn tại, `SECURITY DEFINER`,
  `search_path = public, pg_temp`, chỉ `service_role` execute; browser roles
  không execute legacy/new RPC.
- Horizon SEO read-only: 79 published News, 1 malformed slug, 0 duplicate
  slug, 0 location issue; 78 valid News có registry canonical phù hợp.
- Search Visibility và freshness evidence trước đó có các run thành công.

### Chưa được coi là đã đóng

- Full JSON object của `manual_public_aio_rag_boundary_verify.sql` chưa được
  lưu trong repo/evidence hiện tại.
- Phân bố RAG user cung cấp có latest index `2026-09-03`, chưa chứng minh
  freshness sau 03/09.
- Chưa giải thích đầy đủ chênh lệch News published/eligible/chunk.
- Chưa xác nhận `property_types`, `news_categories`, `managed_pages` có bao
  nhiêu source rows eligible và vì sao không xuất hiện trong phân bố chunk.
- Chưa chốt quyền gọi `refresh_rag_index` trực tiếp từ browser/Admin UI so với
  server-only route.
- Chưa có production evidence cho toàn bộ user/staff create → review → publish
  → delete/unpublish → retry.

## 10. Hướng nâng cấp không phá hệ thống

1. Không tạo pipeline thứ hai trước khi kiểm kê pipeline hiện có.
2. Giữ source tables và public routes làm nền; thay orchestration ở một boundary.
3. Mở rộng `seo_freshness_jobs` nếu phù hợp thay vì tạo queue trùng.
4. Biến taxonomy thành dependency/entity rõ ràng trước khi thêm target mới.
5. Làm từng vertical slice: Product → News → taxonomy → CMS → knowledge →
   delete/unpublish → retry/observability.
6. Mỗi slice phải có code map, test, browser verify, SQL verify và rollback.

## 11. Tài liệu đào tạo dự kiến

Tài liệu hướng dẫn nhân viên kế thừa sẽ gồm:

- `docs/SYSTEM_FUNCTION_CATALOG.md` — chức năng nằm ở đâu.
- `docs/SYSTEM_OPERATING_MODEL.md` — nguyên tắc vận hành và thay đổi.
- `.claude/plans/unified-public-indexing-rollout-todo.md` — backlog/gates.
- `docs/CHONHAVIET_SOURCE_OF_TRUTH.md` — product/architecture truth.
- Các runbook SQL/verify trong `supabase/` — production evidence.

Khi một module được thay đổi, phải cập nhật catalog hoặc ghi rõ lý do không cần
cập nhật.

## RAG execution boundary — 2026-09-12

- `src/lib/server/aiIndexing.ts`: adapter server giữ mapping source và explicit opt-in `AIO_RAG_MODE=enabled`; mặc định trả `skipped` với lý do RAG deferred.
- `src/lib/api/aiRag.ts`: chỉ đọc stats/runs/chunks/retrieval; refresh browser là no-op có chủ đích, không gọi RPC trực tiếp.
- `supabase/migrations/20260930100000_defer_rag_browser_execution.sql`: revoke `PUBLIC/anon/authenticated`, chỉ grant `service_role` cho `refresh_rag_index(text)`.
- `supabase/manual_rag_deferred_boundary_verify.sql`: verify read-only quyền và security boundary.

## Public route synchronization patch — 2026-09-12

- `src/lib/api/priceStats.ts`: sau khi refresh giá, purge `/du-lieu-gia`, area listing và khu dân cư public.
- `src/lib/api/taxonomy.ts`: taxonomy mutation purge cả route gốc và route động liên quan; giữ historical slug để purge URL cũ.
- `src/lib/server/contentRevalidation.ts`: route allowlist động có kiểm soát cho area/neighborhood/listing surfaces.
