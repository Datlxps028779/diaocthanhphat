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

1. Run `manual_taxonomy_geo_kontur_review.sql` and confirm current coverage.
2. Run `manual_taxonomy_geo_kontur_seed.sql`. It writes all rows with `is_published = false`.
3. Run the review SQL again and inspect the target path plus counts.
4. Only after review, run `manual_taxonomy_geo_kontur_publish.sql` to publish exactly 702 rows.
5. Reload the browser and verify the target path at `/dang-tin`.

The seed contains bounds and centers, not copied polygons. The map can fit each verified administrative extent without using an external geocoder to invent a boundary. `taxonomy_geo.geojson` remains available for a later licensed polygon publication if needed.
