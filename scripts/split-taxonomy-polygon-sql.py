#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

ROW_PATTERN = re.compile(
    r"  \('(area|district|ward)', '([0-9a-f-]+)'::uuid, \$geo\$(\{\"type\":[\s\S]*?\})\$geo\$::jsonb\)(?:,|\n)"
)


def render_part(source_name: str, part: int, total_parts: int, rows: list[str]) -> str:
    values = ",\n".join(row.rstrip(",\n") for row in rows)
    expected = len(rows)
    return f"""-- Transport-safe polygon chunk {part}/{total_parts} from {source_name}.
-- Geometry is byte-for-byte identical to the reviewed source SQL; only the request is split.

BEGIN;

DO $seed$
DECLARE
  v_updated integer;
BEGIN
  WITH source_rows(entity_type, entity_id, geojson) AS (
    VALUES
{values}
  )
  UPDATE public.taxonomy_geo target
     SET geojson = source_rows.geojson,
         updated_at = now()
    FROM source_rows
   WHERE target.entity_type = source_rows.entity_type
     AND target.entity_id = source_rows.entity_id
     AND target.source = 'Kontur Boundaries Vietnam 20230628'
     AND target.administrative_vintage = 'legacy_pre_merger';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> {expected} THEN
    RAISE EXCEPTION 'Refusing polygon chunk {part}/{total_parts}: expected {expected} reviewed rows, updated %', v_updated;
  END IF;
END
$seed$;

COMMIT;
"""


def split_rows(rows: list[str], max_bytes: int, source_name: str) -> list[list[str]]:
    chunks: list[list[str]] = []
    current: list[str] = []
    for row in rows:
        trial = current + [row]
        estimated = len(render_part(source_name, 1, 1, trial).encode("utf-8"))
        if current and estimated > max_bytes:
            chunks.append(current)
            current = [row]
        else:
            current = trial
        if len(render_part(source_name, 1, 1, current).encode("utf-8")) > max_bytes:
            raise RuntimeError("A single polygon row exceeds the requested chunk size")
    if current:
        chunks.append(current)
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--max-bytes", type=int, default=2_000_000)
    args = parser.parse_args()

    text = args.source.read_text(encoding="utf-8")
    rows = [match.group(0).rstrip(",\n") for match in ROW_PATTERN.finditer(text)]
    if not rows:
        raise RuntimeError(f"No polygon rows found in {args.source}")

    chunks = split_rows(rows, args.max_bytes, args.source.name)
    stem = args.source.stem
    for old in args.source.parent.glob(f"{stem}_part_*.sql"):
        old.unlink()
    for index, chunk in enumerate(chunks, start=1):
        output = args.source.parent / f"{stem}_part_{index:02d}.sql"
        output.write_text(render_part(args.source.name, index, len(chunks), chunk), encoding="utf-8")
        print(f"{output.name}: {len(chunk)} rows, {output.stat().st_size} bytes")

    if sum(len(chunk) for chunk in chunks) != len(rows):
        raise RuntimeError("Chunk row count does not match source row count")


if __name__ == "__main__":
    main()
