# Các bước tiếp theo - Gate 0 Reconciliation

**Ngày:** 2026-09-13  
**Trạng thái:** Ready to measure Gate 0 baseline

---

## ✅ Đã hoàn thành (Bước 1: Housekeeping)

1. Pull origin/main thành công - cập nhật 72 commits
2. Restore Gate 0 docs locally (chưa commit):
   - `docs/SYSTEM_CURRENT_STATE_AUDIT_20260912.md`
   - `docs/SYSTEM_OPERATING_MODEL.md`
   - `docs/SYSTEM_FUNCTION_CATALOG.md`
3. Restore Gate 0 SQL scripts locally:
   - `supabase/manual_unified_indexing_gate0_summary.sql`
   - `supabase/manual_unified_indexing_gate0_inventory.sql`
4. Working tree clean, main branch up-to-date

---

## 🎯 Bước 2: Đo Gate 0 Baseline Production

### Mục tiêu:
Cập nhật baseline production mới nhất để trả lời 9 câu hỏi Gate 0:

1. Function RAG deployed là phiên bản nào và quyền nào?
2. Số source rows eligible của từng domain?
3. Số RAG chunks có khớp không?
4. News published/valid/registry/chunk có lệch không?
5. `property_types`, `news_categories`, `managed_pages` có eligible không?
6. RAG run mới nhất là ngày nào?
7. Freshness queue có pending/failed/dead-letter không?
8. `ai_chat_knowledge` nào được đánh dấu public?
9. Staff có thể mutation ở domain nào?

### SQL cần chạy:

```sql
-- File: supabase/manual_unified_indexing_gate0_summary.sql
-- 
-- SQL read-only, trả về ONE JSON ROW
-- KHÔNG write, rebuild, hoặc thay đổi production
```

### Hành động:

**Bước 2.1:** Mở Supabase SQL Editor production

**Bước 2.2:** Copy nội dung file `supabase/manual_unified_indexing_gate0_summary.sql`

**Bước 2.3:** Paste vào SQL Editor và Run

**Bước 2.4:** Copy JSON result và gửi cho Claude

**Bước 2.5:** Claude sẽ phân tích và đưa ra bước tiếp theo

---

## 🚀 Bước 3: Quyết định tiếp theo (sau khi có Gate 0 results)

Dựa trên Gate 0 baseline, sẽ quyết định:

**A. Nếu Gate 0 PASS (không có gap nghiêm trọng):**
→ Tiếp tục entity expansion (Property Type pages, News Category pages, District pages)

**B. Nếu Gate 0 có gaps:**
→ Fix gaps trước, sau đó mới mở rộng

**C. Nếu News corpus quality cần cải thiện:**
→ Ưu tiên sửa 77 bài thiếu citation/FAQ/internal links

---

## 📝 Ghi chú quan trọng:

- **Không commit docs/SQL** vì verify-gate chặn (cần full test pass)
- **Docs/SQL đã có locally** - đủ để đo Gate 0
- **Mục tiêu**: đóng Gate 0 trước khi mở gate mới
- **Nguyên tắc**: không ảnh hưởng production, đo trước khi quyết định

---

## 📌 Tham khảo:

- Audit doc: `docs/SYSTEM_CURRENT_STATE_AUDIT_20260912.md`
- SQL script: `supabase/manual_unified_indexing_gate0_summary.sql`
- Memory: `project_seo_geo_aio_masterplan.md`
