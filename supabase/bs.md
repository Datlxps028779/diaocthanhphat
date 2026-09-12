# QUY TRÌNH BẮT BUỘC KHI AI CODE

## 1. Không được code ngay

Mỗi khi nhận một yêu cầu làm tính năng, sửa lỗi, thay đổi giao diện, database, API hoặc logic hệ thống, AI **không được bắt đầu code ngay**.

Trước tiên phải phân tích và trả lời 5 câu hỏi:

### 1.1. Tính năng này dùng để làm gì?

Mô tả ngắn gọn:

* Vấn đề hiện tại là gì?
* Tính năng này giải quyết vấn đề nào?
* Kết quả cuối cùng người dùng nhận được là gì?

### 1.2. Tính năng này phục vụ cho ai?

Phải xác định rõ từng nhóm bị ảnh hưởng:

* **Quản trị viên**
* **Nhân viên**
* **User/Member**
* **Người dùng website**
* **Hệ thống/AI/Automation** nếu có

Không được trả lời chung chung kiểu "cải thiện trải nghiệm người dùng".

### 1.3. Sau khi triển khai, từng nhóm thay đổi như thế nào?

Phải mô tả cụ thể:

| Đối tượng          | Trước khi làm | Sau khi làm | Lợi ích |
| ------------------ | ------------- | ----------- | ------- |
| Quản trị           | ...           | ...         | ...     |
| Nhân viên          | ...           | ...         | ...     |
| User               | ...           | ...         | ...     |
| Người dùng website | ...           | ...         | ...     |
| Hệ thống           | ...           | ...         | ...     |

Nếu một nhóm không bị ảnh hưởng thì ghi rõ **"Không ảnh hưởng"**.

### 1.4. Có thể kiểm tra tính năng ở đâu?

AI phải chỉ ra vị trí kiểm tra cụ thể:

* URL/page nào
* Admin page nào
* Menu nào
* User flow nào
* API nào
* Database/table nào
* Component nào
* Log nào
* Dashboard nào

Không được trả lời kiểu "có thể kiểm tra trong hệ thống".

### 1.5. Những luồng nào có thể bị ảnh hưởng?

Phải rà soát trước khi code:

* Frontend
* Backend
* API
* Database
* Authentication/Authorization
* Admin
* User
* Listing
* Search
* Notification
* Payment/Ads nếu liên quan
* SEO
* AI/AIO/GEO nếu liên quan
* Automation
* Analytics
* Cache
* Performance
* Security
* Mobile/Responsive

Chỉ liệt kê những phần thực sự liên quan, nhưng **phải kiểm tra các dependency trước khi kết luận**.

---

# 2. Bắt buộc rà soát codebase trước khi triển khai

Trước khi sửa code, AI phải:

1. Tìm các file/component/module liên quan.
2. Tìm database schema/table liên quan.
3. Tìm API liên quan.
4. Tìm authentication/permission liên quan.
5. Tìm các nơi đang sử dụng logic chuẩn bị thay đổi.
6. Kiểm tra các dependency.
7. Kiểm tra các luồng dữ liệu vào → xử lý → dữ liệu ra.
8. Kiểm tra các side effect có thể phát sinh.
9. Kiểm tra xem tính năng tương tự đã tồn tại ở nơi khác chưa.
10. Kiểm tra xem có logic cũ nào sẽ bị phá vỡ không.

### Nguyên tắc

**Không sửa một file chỉ vì file đó chứa đoạn code cần thay đổi.**

Phải hiểu đoạn code đó đang phục vụ những luồng nào trước khi sửa.

---

# 3. Phải lập kế hoạch trước khi code

Sau khi rà soát, AI phải đưa ra:

### Phạm vi thay đổi

* File sẽ thay đổi
* File sẽ tạo mới
* Database thay đổi
* API thay đổi
* UI thay đổi
* Permission thay đổi
* Logic thay đổi

### Luồng trước

Ví dụ:

USER → FORM → API → DATABASE → RESPONSE → UI

### Luồng sau

Ví dụ:

USER → FORM → VALIDATION → API → DATABASE → CACHE → RESPONSE → UI

AI phải chỉ ra chính xác điểm nào được thay đổi.

---

# 4. Chỉ được code sau khi hoàn thành phân tích

AI chỉ bắt đầu triển khai khi đã xác định được:

* Mục tiêu
* Đối tượng sử dụng
* Tác động
* Phạm vi
* Dependency
* Luồng logic
* Điểm kiểm tra
* Cách kiểm thử

Không được "vừa code vừa đoán".

---

# 5. Trong quá trình code

AI phải giữ nguyên nguyên tắc:

### Không phá logic đang chạy

Nếu phát hiện logic cũ có vấn đề nhưng không nằm trong phạm vi yêu cầu:

* Không tự ý sửa lan sang phần khác.
* Ghi nhận vấn đề.
* Báo lại để xử lý riêng.

### Không tạo code dư thừa

Không tạo:

* Component trùng chức năng
* API trùng
* Table trùng
* Utility trùng
* Logic xử lý trùng

Trước khi tạo mới phải kiểm tra hệ thống đã có hay chưa.

### Không tự suy diễn nghiệp vụ

Nếu nghiệp vụ chưa rõ:

* Đánh dấu phần chưa rõ.
* Không tự bịa business rule.
* Chọn phương án ít ảnh hưởng nhất nếu có thể triển khai an toàn.

---

# 6. Sau khi code xong KHÔNG được kết thúc ngay

Đây là bước bắt buộc.

AI phải thực hiện **POST-IMPLEMENTATION REVIEW**.

## 6.1. Đối chiếu với yêu cầu ban đầu

Lập bảng:

| Yêu cầu       | Đã làm? | Vị trí kiểm tra | Kết quả |
| ------------- | ------- | --------------- | ------- |
| Requirement 1 | ✅       | ...             | PASS    |
| Requirement 2 | ✅       | ...             | PASS    |
| Requirement 3 | ❌       | ...             | FAIL    |

Không được tuyên bố hoàn thành nếu còn requirement chưa đạt.

---

# 7. Kiểm tra toàn bộ luồng logic

Sau khi code phải kiểm tra lại:

### Happy path

Luồng sử dụng bình thường có hoạt động không?

### Error path

* Dữ liệu sai
* Thiếu dữ liệu
* API lỗi
* Database lỗi
* Permission không đủ
* Network lỗi

### Permission

Kiểm tra:

* Admin
* Nhân viên
* User
* Guest

Ai được phép làm gì?

Ai không được phép làm gì?

### Edge cases

Kiểm tra những trường hợp:

* Dữ liệu rỗng
* Dữ liệu lớn
* Trùng dữ liệu
* Dữ liệu không hợp lệ
* Record đã bị xóa
* Record không tồn tại
* Người dùng thao tác nhiều lần
* Refresh page
* Back/forward browser
* Mobile/responsive nếu liên quan

---

# 8. Kiểm tra tác động ngược

AI phải quay lại các luồng cũ và kiểm tra:

> Tính năng mới có làm hỏng tính năng cũ không?

Đặc biệt phải kiểm tra những module có dependency trực tiếp.

Nếu có ảnh hưởng:

* Phải sửa
* Hoặc phải báo rõ chưa xử lý

Không được âm thầm bỏ qua.

---

# 9. Phải chỉ rõ cách người dùng kiểm tra

Sau khi hoàn thành, AI phải đưa ra hướng dẫn kiểm tra thực tế.

Ví dụ:

### Admin

`/admin/...`

→ đăng nhập Admin
→ mở menu ...
→ thực hiện ...
→ kết quả mong đợi: ...

### Nhân viên

`/...`

→ đăng nhập tài khoản nhân viên
→ thực hiện ...
→ kết quả mong đợi: ...

### User

`/...`

→ đăng nhập User
→ thực hiện ...
→ kết quả mong đợi: ...

### Guest

`/...`

→ không đăng nhập
→ thực hiện ...
→ kết quả mong đợi: ...

Nếu tính năng liên quan API/database thì phải chỉ rõ cách kiểm tra tương ứng.

---

# 10. Phải có kết luận cuối cùng

Mỗi task sau khi hoàn thành phải kết thúc bằng báo cáo:

## IMPLEMENTATION REPORT

### 1. Tính năng

Tên tính năng:

### 2. Mục đích

Tính năng giải quyết:

### 3. Đối tượng ảnh hưởng

* Admin:
* Nhân viên:
* User:
* Website visitor:
* System:

### 4. Những gì đã thay đổi

* ...
* ...
* ...

### 5. File/code đã thay đổi

* `...`
* `...`

### 6. Database/API thay đổi

* ...
* ...

### 7. Luồng logic

**Before:**

`A → B → C`

**After:**

`A → B → C → D`

### 8. Kiểm tra

* Build: PASS/FAIL
* Lint: PASS/FAIL
* Type check: PASS/FAIL
* Unit test: PASS/FAIL
* Integration test: PASS/FAIL
* E2E: PASS/FAIL
* Permission test: PASS/FAIL
* Regression test: PASS/FAIL

Chỉ ghi PASS khi thực sự đã kiểm tra.

### 9. Kiểm tra thực tế ở đâu?

* Admin: `...`
* Employee: `...`
* User: `...`
* Website: `...`
* API: `...`

### 10. Đối chiếu requirement

Phải xác nhận từng requirement:

**Đạt:** X/Y

**Chưa đạt:** ...

### 11. Rủi ro còn lại

Nếu không có:

> Không phát hiện rủi ro còn lại trong phạm vi đã kiểm tra.

Nếu có:

> Phát hiện: ...

### 12. Kết luận

Chỉ được kết luận **HOÀN THÀNH** khi:

* Requirement đạt
* Logic đã rà soát
* Test đã chạy
* Regression đã kiểm tra
* Có thể xác minh tính năng thực tế

Nếu chưa đủ:

> CHƯA HOÀN THÀNH – còn các mục cần xử lý: ...

---

# 11. Nguyên tắc quan trọng nhất

AI coding agent phải tuân thủ chu trình:

**HIỂU → RÀ SOÁT → LẬP KẾ HOẠCH → CODE → TEST → ĐỐI CHIẾU → KIỂM TRA REGRESSION → BÁO CÁO**

Không được sử dụng quy trình:

**NHẬN YÊU CẦU → CODE → XONG**

---

# 12. Definition of Done

Một task chỉ được xem là DONE khi AI có thể trả lời rõ ràng:

> **Tính năng này dùng để làm gì?**

> **Ai sử dụng?**

> **Ai bị ảnh hưởng?**

> **Mỗi nhóm thay đổi tích cực như thế nào?**

> **Logic nào đã được rà soát?**

> **Những phần nào của hệ thống bị ảnh hưởng?**

> **Kiểm tra tính năng ở đâu?**

> **Đã test những gì?**

> **Đã đối chiếu lại yêu cầu chưa?**

> **Có regression không?**

> **Còn vấn đề gì chưa giải quyết không?**

Nếu chưa trả lời được các câu hỏi trên thì **không được đánh dấu task là hoàn thành**.
