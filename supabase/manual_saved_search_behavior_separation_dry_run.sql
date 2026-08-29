-- Read-only: đo dữ liệu trước khi tách behavior tracking khỏi saved search.
-- Không chứa INSERT/UPDATE/DELETE và không thay đổi production.

SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE alert_enabled) AS alert_enabled_rows,
  count(*) FILTER (WHERE NOT alert_enabled) AS alert_disabled_rows,
  count(*) FILTER (WHERE last_notified_at IS NOT NULL) AS notified_rows,
  count(*) FILTER (WHERE updated_at > created_at + interval '5 seconds') AS updated_after_create_rows
FROM public.user_saved_searches;

SELECT cadence, alert_enabled, count(*) AS rows
FROM public.user_saved_searches
GROUP BY cadence, alert_enabled
ORDER BY cadence, alert_enabled DESC;

SELECT created_at::date AS created_date, count(*) AS rows
FROM public.user_saved_searches
GROUP BY created_at::date
ORDER BY created_date;

SELECT
  count(*) AS taste_rows,
  count(*) FILTER (WHERE kind = 'search') AS search_rows,
  count(*) FILTER (WHERE kind = 'view') AS view_rows,
  count(*) FILTER (WHERE kind = 'favorite') AS favorite_rows,
  count(*) FILTER (WHERE kind = 'contact') AS contact_rows
FROM public.user_taste_signals;
