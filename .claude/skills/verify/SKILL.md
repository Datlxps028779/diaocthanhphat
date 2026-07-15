---
name: verify
description: Run this Next.js app and verify public UI changes through Chrome/Playwright.
---

# Verify this project

Use this skill for runtime verification of product-source changes.

## Launch

1. Start the app:
   `npm run dev`
2. Wait for `Ready` and open `http://localhost:3000`.
3. Use `playwright-core` with installed Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` for headless driving.

## Useful flows

- AI Advisor: open the floating button labelled `Mở trợ lý AI tìm BĐS`, send a query such as `Nhà Dĩ An dưới 3 tỷ sổ hồng`, observe assistant reply/chips/results or fallback actions, then click `Lọc tất cả kết quả phù hợp` and confirm navigation to `/danh-sach?...`.
- Sensitive AI Advisor query: send `Tôi cần tư vấn pháp lý`; confirm safe copy appears and the lead form fields `Họ tên`, `Số điện thoại`, `Ghi chú thêm` render. Do not submit a real lead unless using safe test data and the user approved writes.
- Admin lead labels/timeline require admin credentials; if not available, verify only the `/quantrihethong` login surface and report that the authenticated lead view was not exercised.

Capture browser console/page errors and at least one screenshot for GUI changes.
