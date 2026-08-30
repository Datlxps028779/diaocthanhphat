# Kontur legacy taxonomy bounds seed review

## Source

- Dataset: Kontur Boundaries Vietnam, release `20230628`
- Download source: https://data.humdata.org/dataset/kontur-boundaries-viet-nam
- Coordinate system: EPSG:4326
- License note: ODbL/OpenStreetMap-derived; keep attribution and review share-alike obligations before public use.

## Matching method

The generated seed was matched against the production `areas → districts → wards` hierarchy using:

1. normalized Vietnamese names with administrative prefixes removed;
2. area polygon name match;
3. district name match plus polygon containment in the matched area;
4. ward name match plus polygon containment in the matched district;
5. only a unique candidate was accepted.

No first-result geocoder match, centroid-only guess, or same-name polygon from another parent was accepted.

## Coverage

| Level | Production rows | Safe seed rows |
|---|---:|---:|
| Area | 4 | 4 |
| District | 53 | 53 |
| Ward | 682 | 645 |
| **Total** | **739** | **702** |

Thirty-seven ward rows remain unpublished because the source did not provide a unique name-plus-parent-containment match. They are intentionally not fabricated or assigned to another administrative parent. A later source/review can add them with the same `(entity_type, entity_id)` key.

The acceptance path `Bình Dương → Thủ Dầu Một → Hiệp Thành` is included in the 645 safe ward mappings. Its Kontur polygon bounds are approximately:

- south `10.9815092`
- west `106.6456634`
- north `11.0116994`
- east `106.6735071`

## Run sequence

1. Run `manual_listing_coordinate_taxonomy_dry_run.sql` and save the pre-foundation inventory.
2. Load polygon SQL. The original four province files preserve the reviewed source, but Supabase's linked query endpoint rejects requests above roughly 3–4 MB. For Dashboard/`supabase db query --linked`, run the TP.HCM and Bình Dương originals, then every `manual_taxonomy_geo_polygon_tinh-binh-phuoc_part_*.sql` and `manual_taxonomy_geo_polygon_tinh-dong-nai_part_*.sql` file in numeric order. The seven transport chunks are each below 2 MB and contain geometry byte-for-byte identical to the two large source files.
3. Run `20260914000000_listing_coordinate_taxonomy_foundation.sql`. It enables PostGIS, adds/backfills `ward_id`, and installs the read-only polygon-cover helper without changing historical coordinates.
4. Run `manual_listing_coordinate_taxonomy_repair_dry_run.sql`. The post-foundation production snapshot on 2026-08-30 found 10 active properties and 5 user listings (4 approved + 1 pending) with unprovable coordinates.
5. After reviewing those rows, run `manual_listing_coordinate_taxonomy_repair.sql`. It is separately guarded to update exactly the measured 10 + 5 rows and only clears invalid latitude/longitude; it does not alter taxonomy, addresses, content, or lifecycle status.
6. Deploy the `ward_id`-aware frontend/admin code. Then run `20260914010000_listing_coordinate_taxonomy_enforcement.sql`. It repeats one safe exact-match backfill for rows created by old frontend instances during the rollout window, aborts if any unprovable coordinate remains, and only then installs listing/admin/approval guards.
7. Run `manual_listing_coordinate_taxonomy_verify.sql`; confirm 702 published polygon rows, zero invalid coordinates, and that the reported Lái Thiêu point is not covered by An Phú.
8. Reload `/dang-tin` and verify a mismatched search candidate stays yellow and disabled until it is moved inside the selected ward polygon.

The polygon files are generated deterministically by `scripts/generate-taxonomy-geo-polygons.py`. The generator does not rematch names: it joins every source polygon back to the exact bounds of the same 702 mappings that were already reviewed and published, and aborts on zero or multiple matches. Runtime coordinate validity uses the polygon linked to the selected `ward_id`; geocoder labels and rectangular bounds are never sufficient to confirm a point.
