-- Dry-run read-only: chuẩn hóa slug hồ sơ Võ Thị Mỹ Nhân.
-- Chỉ chạy truy vấn SELECT trong Supabase SQL Editor.
-- Không tự chạy UPDATE/production mutation.

with source_profile as (
  select id, slug, display_name, status
  from public.agent_profiles
  where slug = 'v-th-m-nh-n-099492adcb47bc16'
), target_slug as (
  select id, slug, display_name, status
  from public.agent_profiles
  where slug = 'vo-thi-my-nhan-id'
), counts as (
  select
    (select count(*) from source_profile) as source_count,
    (select count(*) from target_slug) as target_count
)
select
  counts.source_count,
  counts.target_count,
  (select jsonb_agg(to_jsonb(source_profile)) from source_profile) as source_profiles,
  (select jsonb_agg(to_jsonb(target_slug)) from target_slug) as target_profiles,
  case
    when counts.source_count = 1 and counts.target_count = 0 then 'SAFE_TO_UPDATE_MANUALLY'
    when counts.source_count = 0 then 'SOURCE_NOT_FOUND'
    when counts.source_count > 1 then 'SOURCE_NOT_UNIQUE'
    else 'TARGET_SLUG_ALREADY_EXISTS'
  end as recommendation
from counts;
