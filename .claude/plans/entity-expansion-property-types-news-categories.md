# Entity Expansion: Property Type & News Category Pages

**Ngày:** 2026-09-13  
**Trạng thái:** PLAN - chờ duyệt  
**Phụ thuộc:** Gate 0 PASS (foundation ổn định)  
**Không làm:** RAG/AI nội bộ (đã gác theo yêu cũ), district/ward pages (chờ data depth)

---

## Vì sao đây là việc tiếp theo

Gate 0 cho thấy:
- ✅ 9 property_types có slug hợp lệ
- ✅ 5 news_categories có slug hợp lệ (đã seed production)
- ✅ News category pages **đã có** route (`app/tin-tuc/danh-muc/[slug]/page.tsx`)
- ❌ Property type pages **chưa có** route

**Impact:**
- Mở rộng Search Visibility từ 172 → ~220 URLs (9 types + 5 categories)
- SEO landing pages cho intent tìm kiếm theo loại BĐS
- Phân loại nội dung tin tức rõ ràng hơn
- Không đụng RAG (theo yêu cầu gác AI nội bộ)

**Master plan alignment:**
- Horizon 2: Entity pages (Property Type là ưu tiên cao)
- Quality-gated indexing (không index thin content)
- Deterministic content (không AI-generate)

---

## Mục tiêu

### Property Type Pages (`/loai-nha-dat/[slug]`)

1. **Route mới:** `app/loai-nha-dat/[slug]/page.tsx`
2. **generateStaticParams:** Pre-render 9 types từ DB
3. **Quality gate:** Chỉ index khi:
   - ≥5 active listings thuộc type đó
   - ≥2 distinct areas hoặc ≥2 districts
4. **Content:**
   - Hero với tiêu đề loại BĐS
   - Danh sách listings filter theo property_type_id
   - Stats: tổng tin, giá trung bình, khu vực phổ biến
   - SEO metadata từ `route_seo_overrides` hoặc fallback

### News Category Pages (đã có, cần verify)

1. **Route hiện có:** `app/tin-tuc/danh-muc/[slug]/page.tsx` ✅
2. **Verify production:**
   - 5 categories seed đã có trong DB
   - Routes đã render đúng
   - Search Visibility registry có 6 rows (5 seed + fallback?)

---

## Thứ tự bắt buộc

### Phase 1: Property Type Pages

1. ✅ **Khảo sát** - DONE
   - News category pattern đã có
   - Property types: 9 rows, có slug/name/icon
   - Quality gate pattern: `evaluateAreaSeo()` làm mẫu

2. **Tạo route structure**
   ```
   app/loai-nha-dat/[slug]/page.tsx
   app/loai-nha-dat/[slug]/opengraph-image.tsx (optional)
   ```

3. **API helper**
   - `serverGetPropertyTypeBySlug(slug)`
   - `serverGetListingsByPropertyType(typeId, filters)`
   - `serverGetPropertyTypeStats(typeId)` - count, avg price, top areas

4. **Quality gate logic**
   ```typescript
   // src/lib/propertyTypeSeo.ts
   export function evaluatePropertyTypeSeo(input: {
     propertyType: PropertyType;
     activeListings: number;
     distinctAreas: number;
     distinctDistricts: number;
   }): { indexable: boolean; robots: { index: boolean; follow: boolean }; reasons: string[] }
   ```

5. **Search Visibility integration**
   - Thêm property_type candidates vào `buildSearchVisibilityCandidates()`
   - Entity type: `'property_type'`
   - Path: `/loai-nha-dat/{slug}`

6. **Metadata & SEO**
   - Fallback từ property_type.name
   - Route SEO override support
   - JSON-LD: CollectionPage

7. **Tests**
   - Unit: `propertyTypeSeo.test.ts`
   - Integration: page rendering với mock data
   - Search Visibility: quality gate scenarios

8. **Verify local**
   - Typecheck + Vitest
   - Dev server: mở `/loai-nha-dat/nha-pho`
   - Check stats, listings, noindex nếu không đủ data

9. **Verify-gate receipt**
   ```bash
   node .claude/hooks/verify-gate.mjs record "Mở /loai-nha-dat/nha-pho - có listings, stats hiển thị. Không kiểm tra: các type khác (cần data thật production)."
   ```

### Phase 2: News Category Verify (nếu cần)

1. **Production check**
   - Query `news_categories` table → 5 rows
   - Check Search Visibility registry → entity_type='news_category'
   - Browse `/tin-tuc/danh-muc/thi-truong`

2. **Nếu có gap:**
   - Add news_category candidates vào Search Visibility
   - Đảm bảo 5 categories eligible

---

## Scope ngoài plan này

- **District/Ward pages:** Chờ data depth đủ (theo SOT quality gate)
- **Property Type + Area composite:** `/loai-nha-dat/nha-pho/binh-duong` - Phase sau
- **AI-generated content:** Không làm, dùng deterministic từ DB
- **RAG indexing:** Gác theo yêu cầu, không thêm property_type vào RAG chunks
- **Sitemap shard:** 172 URL hiện tại, thêm ~50 URL không cần shard

---

## DoD

### Property Type Pages
- [ ] Route `app/loai-nha-dat/[slug]/page.tsx` render đúng
- [ ] Quality gate: noindex khi không đủ listings/areas
- [ ] Search Visibility có property_type candidates
- [ ] Stats hiển thị: tổng tin, giá TB, top areas
- [ ] Listings filter theo property_type_id
- [ ] Metadata fallback + route_seo_overrides support
- [ ] JSON-LD CollectionPage
- [ ] Tests: unit + integration
- [ ] Verify-gate receipt

### News Category Verify
- [ ] Production có 5 news_categories rows
- [ ] Search Visibility có 5-6 news_category eligible
- [ ] Routes render đúng trên production

---

## Rủi ro & giảm thiểu

**R1:** Property types có listing count = 0 → thin content  
**Giảm thiểu:** Quality gate noindex khi < 5 listings

**R2:** Không có stats đủ dày (giá, khu vực)  
**Giảm thiểu:** Dùng aggregate từ DB, fallback "Đang cập nhật"

**R3:** Property type slug conflict với routes khác  
**Giảm thiểu:** Prefix `/loai-nha-dat/` tách biệt namespace

**R4:** User chỉnh sửa property_type trong admin → ISR lag  
**Giảm thiểu:** revalidate = 1800 (30 phút), gọi revalidation khi mutate

---

## Estimate

- **Phase 1 (Property Type Pages):** ~3-4 hours
  - Route + API: 1h
  - Quality gate + Search Visibility: 1h
  - Tests + verify: 1-2h

- **Phase 2 (News Category Verify):** ~30 min
  - Query production
  - Fix nếu có gap nhỏ

**Total:** ~4-5 hours

---

## Follow-up sau khi DONE

1. **Đo production:** Count visits vào property type pages (GA4)
2. **Đo Search Visibility:** Bao nhiêu types eligible vs excluded
3. **Composite pages:** `/loai-nha-dat/{type}/{area}` nếu có demand
4. **Content depth:** Thêm mô tả chi tiết cho từng type (CMS admin)
