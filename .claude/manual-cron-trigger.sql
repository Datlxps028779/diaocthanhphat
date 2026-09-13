-- Trigger search visibility sync manually (bypassing cron schedule)
SELECT refresh_search_visibility_eligibility();
