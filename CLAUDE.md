## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Cổng verify (cưỡng chế bằng hook — không lách được)

Hook `PreToolUse` chạy `.claude/hooks/verify-gate.mjs guard` trước mọi lệnh Bash và
**chặn bằng exit code 2** trong 3 trường hợp:

1. `git commit` / `git push` khi chưa có biên nhận verify.
2. `git commit` / `git push` khi mã nguồn đã đổi sau lần verify gần nhất — biên nhận
   gắn với digest nội dung `src/`, `app/`, `supabase/migrations/`, nên sửa một byte là
   hết hiệu lực. Sửa code sau khi verify thì **phải verify lại**.
3. `npm run dev` khi `.next/` là bản build production (có `BUILD_ID`) — chạy dev lên đó
   làm CSS/JS 404 và giao diện local vỡ.

Ghi biên nhận sau khi verify runtime xong:

```
node .claude/hooks/verify-gate.mjs record "<đã mở trang nào, đo được gì, phần nào KHÔNG kiểm được>"
```

Lệnh `record` tự chạy typecheck + vitest và **từ chối ghi nếu fail**. Ghi chú runtime là
bắt buộc — phải nêu cụ thể đã mở trang gì bằng browser thật và nói rõ phần nào không
kiểm được (ví dụ: admin cần đăng nhập).

Tự kiểm cổng: `node .claude/hooks/verify-gate.selftest.mjs`.

## Quy tắc làm việc

- **Kết luận về UI phải bằng browser thật.** Nội dung render phía client không có trong
  HTML của `curl` — dùng `curl` để kết luận "khối X không hiển thị" là sai. Dùng
  playwright-core + Chrome tại `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- **Đo dữ liệu trước khi đưa lựa chọn.** Không hỏi người dùng chọn phương án khi chưa
  truy vấn DB xem dữ liệu thật phân bố thế nào — đã có lần đề xuất sáp nhập tỉnh trước
  khi biết tỉnh đó giữ 12/14 tin đăng.
- **SQL production do người dùng tự chạy.** Viết migration, dry-run, rồi báo — không tự
  áp lên production. Sau khi người dùng báo đã chạy, phải truy vấn DB xác nhận thật.
- **Mỗi lần push xin phép riêng.** Một lần đồng ý không mở rộng sang lần sau.
- Không dùng `--no-verify`, `--force`, `git reset --hard` (đã chặn ở `permissions.deny`).

