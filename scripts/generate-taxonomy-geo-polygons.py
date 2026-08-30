#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import geopandas as gpd

SOURCE = "Kontur Boundaries Vietnam 20230628"
LEVELS = {"area": 4, "district": 7, "ward": 10}
ROW_PATTERN = re.compile(
    r"\('(?P<type>area|district|ward)', '(?P<id>[0-9a-f-]+)', "
    r"'\{\"south\": (?P<s>-?[0-9.]+), \"west\": (?P<w>-?[0-9.]+), "
    r"\"north\": (?P<n>-?[0-9.]+), \"east\": (?P<e>-?[0-9.]+)\}'::jsonb"
)


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
    ascii_value = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")


def parse_seed(seed_path: Path) -> list[dict[str, object]]:
    rows = []
    for match in ROW_PATTERN.finditer(seed_path.read_text(encoding="utf-8")):
        rows.append(
            {
                "entity_type": match.group("type"),
                "entity_id": match.group("id"),
                "bounds": tuple(float(match.group(key)) for key in ("s", "w", "n", "e")),
            }
        )
    if len(rows) != 702:
        raise RuntimeError(f"Expected 702 reviewed seed rows, found {len(rows)}")
    return rows


def geometry_bounds(geometry) -> tuple[float, float, float, float]:
    west, south, east, north = geometry.bounds
    return south, west, north, east


def match_reviewed_rows(rows: list[dict[str, object]], frame: gpd.GeoDataFrame) -> list[dict[str, object]]:
    by_level = {
        level: frame[frame["admin_level"].astype(str) == str(admin_level)]
        for level, admin_level in LEVELS.items()
    }
    matched = []
    for row in rows:
        candidates = []
        for index, geometry in by_level[row["entity_type"]].geometry.items():
            if all(abs(actual - expected) < 1e-6 for actual, expected in zip(geometry_bounds(geometry), row["bounds"])):
                candidates.append(index)
        if len(candidates) != 1:
            raise RuntimeError(
                f"{row['entity_type']}:{row['entity_id']} matched {len(candidates)} source geometries"
            )
        source = frame.loc[candidates[0]]
        matched.append({**row, "name": source["name"], "geometry": source.geometry})
    return matched


def group_by_area(rows: list[dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    areas = [row for row in rows if row["entity_type"] == "area"]
    grouped = {row["entity_id"]: [] for row in areas}
    for row in rows:
        point = row["geometry"].representative_point()
        parents = [area for area in areas if area["geometry"].covers(point)]
        if row["entity_type"] == "area":
            parents = [area for area in areas if area["entity_id"] == row["entity_id"]]
        if len(parents) != 1:
            raise RuntimeError(
                f"{row['entity_type']}:{row['entity_id']} belongs to {len(parents)} reviewed areas"
            )
        grouped[parents[0]["entity_id"]].append(row)
    return grouped


def sql_json(geometry) -> str:
    return json.dumps(geometry.__geo_interface__, ensure_ascii=False, separators=(",", ":"))


def write_group(path: Path, area: dict[str, object], rows: list[dict[str, object]]) -> None:
    values = []
    for row in sorted(rows, key=lambda item: (item["entity_type"], item["entity_id"])):
        geometry = sql_json(row["geometry"])
        values.append(
            f"  ('{row['entity_type']}', '{row['entity_id']}'::uuid, $geo${geometry}$geo$::jsonb)"
        )
    expected = len(rows)
    joined_values = ",\n".join(values)
    content = f"""-- Exact reviewed polygons for {area['name']}.
-- Source: {SOURCE}; EPSG:4326; ODbL/OpenStreetMap-derived.
-- Generated from the same 702 unique bounds mappings already reviewed and published.

BEGIN;

DO $seed$
DECLARE
  v_updated integer;
BEGIN
  WITH source_rows(entity_type, entity_id, geojson) AS (
    VALUES
{joined_values}
  )
  UPDATE public.taxonomy_geo target
     SET geojson = source_rows.geojson,
         updated_at = now()
    FROM source_rows
   WHERE target.entity_type = source_rows.entity_type
     AND target.entity_id = source_rows.entity_id
     AND target.source = '{SOURCE}'
     AND target.administrative_vintage = 'legacy_pre_merger';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> {expected} THEN
    RAISE EXCEPTION 'Refusing polygon seed for {area['name']}: expected {expected} reviewed rows, updated %', v_updated;
  END IF;
END
$seed$;

COMMIT;
"""
    path.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", required=True, type=Path)
    parser.add_argument("--seed", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()

    rows = parse_seed(args.seed)
    frame = gpd.read_file(args.gpkg)
    matched = match_reviewed_rows(rows, frame)
    grouped = group_by_area(matched)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    area_by_id = {row["entity_id"]: row for row in matched if row["entity_type"] == "area"}
    total = 0
    for area_id, area_rows in grouped.items():
        area = area_by_id[area_id]
        output = args.out_dir / f"manual_taxonomy_geo_polygon_{slug(area['name'])}.sql"
        write_group(output, area, area_rows)
        total += len(area_rows)
        print(f"{output.name}: {len(area_rows)} rows")
    if total != 702:
        raise RuntimeError(f"Expected 702 generated rows, found {total}")


if __name__ == "__main__":
    main()
