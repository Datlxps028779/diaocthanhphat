-- Lột thẻ HTML khỏi properties.meta_description.
--
-- Bối cảnh: useSEOAutofill sinh meta description bằng substring(0,155) trên mô tả
-- HTML nên thẻ lọt thẳng ra Google. Code đã sửa (buildMetaDescription), migration
-- này dọn các dòng CŨ đã lưu sai trong DB.
--
-- Hàm dưới đây phải khớp hành vi stripHtml() + buildMetaDescription() bên JS:
-- lột thẻ → giải mã entity → gộp khoảng trắng → cắt theo ranh giới TỪ → thêm '…'.
-- Lệch nhau thì cùng một tin lại ra hai meta khác nhau giữa DB và app.

create or replace function public.strip_html_meta(raw text, max_len int default 155)
returns text
language plpgsql
immutable
as $$
declare
  txt text;
  cut text;
  last_space int;
begin
  if raw is null then
    return null;
  end if;

  -- Thẻ → khoảng trắng (không phải chuỗi rỗng), nếu không "a<br>b" sẽ dính thành "ab".
  txt := regexp_replace(raw, '<[^>]*>', ' ', 'g');

  -- Giải mã entity. &amp; phải làm CUỐI cùng, nếu không "&amp;lt;" sẽ thành "<".
  txt := replace(txt, '&nbsp;', ' ');
  txt := replace(txt, '&lt;', '<');
  txt := replace(txt, '&gt;', '>');
  txt := replace(txt, '&quot;', '"');
  txt := replace(txt, '&#39;', '''');
  txt := replace(txt, '&amp;', '&');

  txt := btrim(regexp_replace(txt, '\s+', ' ', 'g'));

  if char_length(txt) <= max_len then
    return txt;
  end if;

  cut := substring(txt from 1 for max_len - 1);
  last_space := length(cut) - position(' ' in reverse(cut)) + 1;

  if position(' ' in reverse(cut)) > 0 then
    cut := substring(cut from 1 for last_space - 1);
  end if;

  return rtrim(cut) || U&'\2026';
end;
$$;

-- ─── DRY-RUN: chạy riêng câu này TRƯỚC để xem 4 dòng sẽ đổi thành gì ──────────
-- select id,
--        left(meta_description, 80) as truoc,
--        public.strip_html_meta(coalesce(description, meta_description)) as sau,
--        char_length(public.strip_html_meta(coalesce(description, meta_description))) as do_dai
-- from public.properties
-- where meta_description ~ '<[a-zA-Z/!][^>]*>';

update public.properties
set meta_description = public.strip_html_meta(coalesce(description, meta_description))
where meta_description ~ '<[a-zA-Z/!][^>]*>';
