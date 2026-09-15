# TODO triển khai Phase 1 — Chẩn đoán Search Visibility canonical conflict

> **Trạng thái:** `DONE`
>
> **Mục tiêu:** xác định chính xác nguyên nhân `syncSearchVisibilityAudit()` thất bại trước khi sửa code hoặc dữ liệu production.
>
> **Phạm vi:** chỉ Search Visibility/entity expansion. Không mở rộng sang RAG, News bulk cleanup, phân quyền, monetization hoặc tối ưu performance.

## 1. Mục đích sản phẩm cần bảo toàn

Hệ thống phải tự động sinh Search Visibility URL cho các intent thực tế:

- “mua đất + khu vực”;
- “mua nhà + khu vực”;
- “thuê nhà + khu vực”.

URL phải:

- cho phép người dùng click được;
- có canonical path nội bộ dạng `/...`;
- có canonical audit URL tuyệt đối dạng `https://chonhaviet.com/...`;
- được AIO/AI đọc như kết quả grounded từ dữ liệu thật;
- không tạo duplicate canonical URL;
- không đưa dữ liệu thin, thiếu nguồn hoặc không đủ quality gate vào index.

## 2. Evidence hiện có

- Production có 9 `property_types`.
- Đất nền: 33 active listings, 2 areas, 4 districts — đạt quality gate.
- Nhà phố: 18 active listings, 2 areas, 2 districts — đạt quality gate.
- Production có 2 `news_categories` thực tế: `kien-thuc`, `thi-truong`.
- Registry có 6 row `news_category`, trong đó 5 row `entity_id` null.
- Registry chưa có row `property_type` dù Đất nền và Nhà phố đủ điều kiện.
- Latest sync fail với lỗi generic: “Có hai nguồn đang tạo cùng một URL canonical”.
- Query cũ chỉ tìm thấy 16 row `canonical_url = null`; đây chưa phải bằng chứng duplicate non-null.
- Local candidate test đã xác nhận path `/loai-nha-dat/dat-nen` và URL `https://chonhaviet.com/loai-nha-dat/dat-nen` được sinh đúng.

## 3. Việc cần làm theo thứ tự

### A. Rà soát source change hiện tại

- [ ] Đọc diff hiện tại của `src/lib/server/searchVisibilityService.ts`.
- [ ] Kiểm tra `findCanonicalConflicts()` có đúng semantics không.
- [ ] Kiểm tra việc loại trừ candidate có `canonicalUrl = null`.
- [ ] Kiểm tra cùng `source_key` với canonical URL không đổi không bị báo conflict.
- [ ] Kiểm tra candidate mới có thể xung đột với registry cũ.
- [ ] Kiểm tra duplicate đã tồn tại trong registry có được phát hiện.
- [ ] Đánh giá `existingRows.find()` và cân nhắc Map nếu cần.
- [ ] Đánh giá giới hạn đọc registry `.limit(5000)`; không tự mở rộng query production nếu chưa có evidence.
- [ ] Kiểm tra row stale/row đang được thay thế có bị báo nhầm hay không.

### B. Bổ sung regression tests

Tạo focused tests cho helper và flow liên quan:

- [ ] Hai candidate khác `source_key` có cùng canonical URL non-null → phát hiện conflict.
- [ ] Candidate mới trùng canonical URL với source khác trong registry → phát hiện conflict.
- [ ] Registry có hai source khác nhau cùng canonical URL → phát hiện conflict.
- [ ] Candidate cùng `source_key` và canonical URL không đổi → không phát hiện conflict.
- [ ] Candidate/registry có canonical URL null → không tính là duplicate.
- [ ] Kết quả source keys được sort ổn định để message deterministic.
- [ ] Candidate property type đủ điều kiện vẫn có path relative và audit URL absolute.
- [ ] News category sử dụng đúng `id` source làm `entityId`.

### C. Kiểm thử local

- [ ] Chạy focused Search Visibility tests.
- [ ] Chạy toàn bộ Vitest.
- [ ] Chạy typecheck.
- [ ] Chạy production build với environment hợp lệ hoặc ghi rõ build bị chặn bởi thiếu env.
- [ ] Chạy `git diff --check`.
- [ ] Kiểm tra không còn temporary debug throw.
- [ ] Kiểm tra debug log/metadata không chứa secret, PII hoặc payload không cần thiết.

### D. Cập nhật knowledge graph và verify gate

- [ ] Chạy `graphify update .` sau khi source change hoàn tất.
- [ ] Thực hiện post-implementation review theo requirement và TODO này.
- [ ] Chạy verify-gate selftest nếu cần.
- [ ] Chạy `node .claude/hooks/verify-gate.mjs record "..."` sau khi typecheck, tests và runtime verification đạt.
- [ ] Runtime note phải ghi rõ trang/API đã kiểm tra và phần nào chưa kiểm được.
- [ ] Không sửa source sau khi đã tạo verify receipt.

### E. Chuẩn bị diagnostic production, không tự triển khai

Sau khi local verification pass:

- [ ] Chuẩn bị diagnostic read-only trả về toàn bộ candidate:
  - `source_key`;
  - `entity_type`;
  - `entity_id`;
  - `canonical_path`;
  - `canonical_url`;
  - `eligible`;
  - nhóm duplicate chỉ với URL non-null.
- [ ] Chuẩn bị phần đối chiếu candidate mới với registry hiện tại.
- [ ] Kiểm tra riêng candidate `property_type` và `news_category`.
- [ ] Kiểm tra Edge Function còn gọi đúng `/api/admin/search-visibility`, không còn `/api/public-indexing`.
- [ ] Không gọi Google để chẩn đoán database registry.
- [ ] Không tự chạy SQL production.
- [ ] Không tự commit hoặc push.

## 4. Nhánh quyết định sau diagnostic

### Nếu là code defect

- [ ] Viết regression test từ dữ liệu gây lỗi.
- [ ] Sửa tối thiểu canonical/path/conflict logic.
- [ ] Lặp lại test → typecheck → build → graphify → verify-gate.

### Nếu là stale/data registry defect

- [ ] Không xóa hoặc sửa ngay.
- [ ] Viết SQL dry-run hiển thị row bị ảnh hưởng, số lượng và điều kiện rollback.
- [ ] Báo chủ sản phẩm tự chạy SQL production.
- [ ] Sau khi người dùng báo đã chạy, thực hiện read-only verification.

### Nếu là constraint/schema policy defect

- [ ] Chỉ lập phương án migration/dry-run riêng.
- [ ] Không tự đổi unique constraint.
- [ ] Không coi migration trong Git là bằng chứng production đã áp dụng.

### Nếu chỉ là lỗi classify message

- [ ] Sửa classifier để phản ánh đúng nguyên nhân thật.
- [ ] Bổ sung test cho error code/message.
- [ ] Không thay đổi behavior dữ liệu nếu chưa có evidence.

## 5. Hậu kiểm sau khi sync được cho phép chạy

Chỉ thực hiện sau khi diagnostic đã xác định nguyên nhân và người dùng chủ động chạy thao tác production:

- [x] Latest `eligibility_sync` có status `succeeded`.
- [x] Registry có row `property_type` cho các loại đủ quality gate.
- [x] Canonical path và canonical URL của property type đúng policy.
- [x] Registry `news_category` hiện tại có `entity_id` đúng source ID.
- [x] Duplicate non-null canonical URL bằng 0.
- [x] Các row stale/legacy được phân loại, không xóa mù.
- [x] Summary theo entity khớp source production.
- [x] Chỉ cập nhật TODO điều hành sang `DONE` khi có đủ production evidence.

## 6. Không được làm trong TODO này

- Không bulk delete `search_visibility_urls`.
- Không full rebuild production theo suy đoán.
- Không đổi unique constraint chỉ để sync pass.
- Không nới quality gate để tạo thêm URL.
- Không backfill `entity_id` bằng ID tự đoán.
- Không gọi Google Search Console/Google API để xử lý lỗi registry.
- Không mở rộng RAG hoặc tạo queue/table/RPC mới.
- Không sửa các conflict location đang được hoãn.
- Không commit/push nếu chưa được cho phép riêng.
- Nếu được cho phép push: chỉ `origin/main`, tuyệt đối không push preview.

## 7. Acceptance criteria

Phase 1 chỉ được coi là hoàn tất khi:

1. Có test chứng minh conflict detection deterministic và loại trừ null đúng.
2. Local typecheck, Vitest, build/diff check đạt hoặc có blocker môi trường được ghi rõ.
3. Candidate production được kiểm tra ở cấp source key và canonical URL.
4. Nguyên nhân được phân loại thành code defect, data/registry defect, constraint/schema defect hoặc classify defect.
5. Có remediation phù hợp, không mutation mù.
6. Sau sync được phép chạy, production registry và latest run đều PASS.

## 8. Quyền cần phê duyệt riêng

- **Duyệt TODO/phạm vi:** chủ sản phẩm duyệt trước khi triển khai.
- **Cho phép production SQL:** chủ sản phẩm tự chạy; không giao quyền thực thi cho agent.
- **Cho phép commit:** hỏi riêng sau verify gate.
- **Cho phép push:** hỏi riêng sau commit; chỉ push production `origin/main`, không preview.
