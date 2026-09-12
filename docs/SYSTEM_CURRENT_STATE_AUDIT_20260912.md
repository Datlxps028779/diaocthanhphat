# Chợ Nhà Việt — Current-State Audit: Public → SEO → AIO/RAG

> Ngày audit: 2026-09-12
>
> Trạng thái: `GATE 0 — LOCAL INVENTORY COMPLETE / PRODUCTION RECONCILIATION PENDING`
>
> Phạm vi: Product, User Listing approval, News, taxonomy, CMS, public routes,
> SEO freshness, Search Visibility và AIO/RAG.

## 1. Evidence đã dùng

- Graphify query ngày 2026-09-12.
- Code hiện tại trong `app/`, `src/`, `supabase/migrations/`.
- Production evidence user đã gửi trước đó.
- `docs/SYSTEM_FUNCTION_CATALOG.md`.
- `docs/SYSTEM_OPERATING_MODEL.md`.

Không dùng migration trong Git để suy ra production state.

## 2. Current flow đang tồn tại

### Product

```text
src/lib/api/properties.ts
  createProperty/updateProperty/deleteProperty
  → src/lib/api/contentRevalidation.ts
  → POST app/api/admin/revalidate-content/route.ts
  → requireOwner()
  → propagatePublicIndexing()
```

User listing đi qua `src/lib/api/userListings.ts`:

```text
submit/approve/reject/expire
→ promote hoặc thay đổi user_listings
→ property snapshot
→ revalidatePropertyContent()
```

### News

```text
src/lib/api/news.ts
  create/update/delete
  → create/update luôn giữ draft boundary
  → revalidateNewsContent()

app/api/admin/news/[id]/publish/route.ts
  → publish_news_article_server()
  → propagatePublicIndexing()
```

Publication boundary production đã có evidence riêng cho News.

### Taxonomy

`src/lib/api/taxonomy.ts` hiện xử lý:

- Area, District, Ward, Neighborhood;
- Property Type;
- News Category.

Các mutation taxonomy gọi revalidation các surface liên quan. Property Type và
News Category còn gọi trực tiếp `adminRefreshRagIndex()` từ client API.

### CMS

`src/lib/api/cms.ts` xử lý:

- Featured sections;
- Managed pages;
- Page blocks;
- Page layout.

`page_blocks` dùng namespace `khu-dan-cu:<slug>` cho một số nội dung pillar;
namespace này được chuyển sang neighborhood revalidation. Managed page public
dùng `/trang/<slug>`.

### Search Visibility

```text
src/lib/server/searchVisibility.ts
  buildSearchVisibilityCandidates()

src/lib/server/searchVisibilityService.ts
  syncSearchVisibilityAudit()
  → search_visibility_urls
  → search_visibility_runs
  → optional Google evidence
```

Admin route: `app/api/admin/search-visibility/route.ts`.

### AIO/RAG

Có hai đường hiện tại:

1. Server propagation:

```text
propagatePublicIndexing()
→ refreshAiIndex()
→ adminClient().rpc('refresh_rag_index', { target })
```

2. Client/Admin UI:

```text
src/lib/api/aiRag.ts
  adminRefreshRagIndex()
  → browser supabase.rpc('refresh_rag_index')
```

Taxonomy hiện còn dùng đường client thứ hai cho `property_types` và
`news_categories`.

## 3. Điểm đã tốt

- Public routes đã có canonical/metadata/JSON-LD/sitemap boundary.
- News publication đã tách server boundary và ghi publication event.
- Search Visibility có candidate builder, canonical registry, stale-row cleanup
  và run evidence.
- Freshness queue đã tồn tại, không cần mặc định tạo queue mới.
- RAG SQL dùng `content_hash`, source table và visibility.
- Private admin documents được tách khỏi public RAG theo policy hiện có.
- User/staff không cần tự nhập JSON-LD hoặc RAG chunk ở tầng form hiện tại.

## 4. Chồng chéo/rủi ro cần xử lý

### R1 — Hai đường gọi RAG

- Server `refreshAiIndex()`.
- Browser `adminRefreshRagIndex()`.

Cần chốt một boundary duy nhất. Khuyến nghị: browser chỉ yêu cầu qua server
route; refresh thực tế dùng service role/worker.

### R2 — Quyền revalidation có thể không khớp role

`app/api/admin/revalidate-content/route.ts` đang dùng `requireOwner()`.
Một số client mutation được dùng trong ngữ cảnh staff có thể ghi source trước,
sau đó propagation request bị 403. Cần kiểm tra role/scope thực tế trước khi
mở rộng staff workflow.

### R3 — Entity contract chưa đầy đủ

`src/lib/server/contentRevalidation.ts` hiện có entity:

```text
news | property | area | neighborhood | route
```

Chưa có entity rõ ràng cho:

```text
property_type | news_category | managed_page | page_block
```

Hiện các nhóm này đang piggyback vào `property`, `news` hoặc `route`.

### R4 — Đồng bộ RAG đang nằm trong request

`propagatePublicIndexing()` gọi RAG ngay sau Search Visibility. Nhiều target
được gọi bằng `Promise.all`. Nếu một target lỗi, các target khác có thể đã thành
công. Cần quyết định eventual consistency + retry và ghi evidence theo job.

### R5 — CMS mutation chưa có một event contract riêng

CMS đã revalidate route/neighborhood, nhưng chưa có một event model thống nhất
cho managed page/page block và ảnh hưởng tới Search Visibility/RAG.

### R6 — Production RAG evidence chưa đủ

Production output user gửi có latest chunk `2026-09-03`, trong khi audit ngày
2026-09-12. Chưa đủ bằng chứng về freshness hoặc retry sau 03/09.

## 5. Current vs target decision

| Khu vực | Hiện tại | Target đã duyệt |
|---|---|---|
| Source of truth | Source tables là nguồn chính | Giữ nguyên |
| Public route | Nhiều route canonical | Giữ route, hợp nhất eligibility |
| Revalidation | Boundary chung đã có nhưng owner-gated | Một contract, role/scope rõ |
| Search Visibility | Server service | Giữ làm canonical registry |
| Freshness | Queue theo path | Mở rộng queue hiện có, không tạo queue trùng |
| RAG | Server + browser paths | Server boundary duy nhất |
| Taxonomy | Một phần piggyback | Entity/dependency map rõ |
| Failure | Có degraded result, chưa đủ durable retry | Job status + retry + audit |
| Staff input | Form nghiệp vụ | Không nhập SEO kỹ thuật |

## 6. Gate 0 production questions

Trước khi sửa code tiếp, production read-only phải trả lời:

1. Function RAG deployed là phiên bản nào và quyền nào được cấp?
2. Số source rows eligible của từng domain là bao nhiêu?
3. Số RAG chunks tương ứng có khớp không?
4. Vì sao News published/valid/registry/chunk lệch nhau?
5. `property_types`, `news_categories`, `managed_pages` có rows eligible không?
6. RAG run mới nhất là ngày nào, status gì?
7. Freshness queue có pending/failed/dead-letter không?
8. `ai_chat_knowledge` nào được đánh dấu public?
9. Staff hiện có thể mutation ở domain nào và propagation có bị owner-gated không?

SQL Gate 0 (nhiều result set):

[file:///Users/macbucdatle/Desktop/project/supabase/manual_unified_indexing_gate0_inventory.sql](file:///Users/macbucdatle/Desktop/project/supabase/manual_unified_indexing_gate0_inventory.sql)

Nếu SQL Editor chỉ hiện result set cuối, dùng bản một-row summary:

[file:///Users/macbucdatle/Desktop/project/supabase/manual_unified_indexing_gate0_summary.sql](file:///Users/macbucdatle/Desktop/project/supabase/manual_unified_indexing_gate0_summary.sql)

## 7. Evidence mới nhận ngày 2026-09-12

User đã gửi result set cuối của Gate 0 với hai active knowledge entries:

- `Phí dịch vụ`
- `Vay ngân hàng`

Production chưa có cột `knowledge_type`. Vì vậy hiện chưa thể phân biệt bằng schema
đâu là public FAQ/background và đâu là private knowledge. Đây là blocker policy
cho public AIO; không tự mở rộng public knowledge trước khi có classification
được duyệt.

## 8. Quyết định chưa được phép tự suy ra

- Không tự đổi quyền staff.
- Không tự cho tất cả public content vào AIO.
- Không tự drop client RAG path trước khi có policy approved.
- Không tự tạo outbox/table/worker mới trước khi đo queue hiện có.
- Không tự backfill hoặc full rebuild production.
