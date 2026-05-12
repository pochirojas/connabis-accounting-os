#!/usr/bin/env python3
"""Preprocess the Connabis Excel into a normalized cost-history JSON.

Reads /home/user/workspace/Contabilidad-Connabis-Pro-1.xlsx and writes
server/data/material-cost-history.json. Each entry:
  { date, material, unit_cost_cop, qty, currency, fx_rate, source_sheet, description }

Phase 2 read-only mirror uses this JSON as the canonical historical cost source.
Re-run whenever the workbook is updated.
"""
from __future__ import annotations
import datetime
import json
import sys
from pathlib import Path

try:
    import openpyxl  # type: ignore
except ImportError:
    print("openpyxl is required: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

WORKBOOK = Path("/home/user/workspace/Contabilidad-Connabis-Pro-1.xlsx")
OUTPUT = Path(__file__).resolve().parents[1] / "server/data/material-cost-history.json"

# (sheet_name, product_col_idx, unit_cost_col_idx, qty_col_idx)
SHEETS = [
    ("Noids Costos", 11, 14, 10),
    ("Supplement Costos", 9, None, 8),  # unit cost computed below from Costo en COP / Q
    ("Materials Costos", 8, None, 7),
    ("Insumos Costos ", 8, None, 7),
]


def to_iso(value) -> str | None:
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def to_number(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
        if f != f or f == float("inf"):
            return None
        return f
    except (TypeError, ValueError):
        return None


def extract(sheet_name, product_col, unit_cost_col, qty_col):
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    current_date = None
    current_desc = None
    current_currency = None
    current_fx = None
    entries: list[dict] = []

    for row in rows[1:]:
        if len(row) <= max(filter(None, (product_col, unit_cost_col, qty_col, 0))):
            continue
        if row[0] is not None:
            current_date = to_iso(row[0])
            current_desc = str(row[1]).strip() if row[1] else None
            current_currency = str(row[3]).strip().upper() if row[3] else None
            current_fx = to_number(row[4])
        if current_date is None:
            continue

        producto = row[product_col] if product_col < len(row) else None
        if not producto:
            continue
        producto = str(producto).strip()
        if not producto:
            continue

        qty = to_number(row[qty_col]) if qty_col is not None and qty_col < len(row) else None

        if unit_cost_col is not None and unit_cost_col < len(row):
            unit_cost = to_number(row[unit_cost_col])
        else:
            # Fall back to Costo en COP (col 10 in Materials/Insumos) ÷ Q
            costo_cop = None
            for idx in (10, 12):  # Materials/Insumos col 10, Supplement col 12
                if idx < len(row):
                    costo_cop = to_number(row[idx])
                    if costo_cop is not None:
                        break
            if costo_cop is not None and qty and qty > 0:
                unit_cost = costo_cop / qty
            else:
                unit_cost = costo_cop

        if unit_cost is None or unit_cost <= 0:
            continue

        entries.append({
            "date": current_date,
            "material": producto,
            "unit_cost_cop": round(unit_cost, 4),
            "qty": qty,
            "currency": current_currency,
            "fx_rate": current_fx,
            "source_sheet": sheet_name.strip(),
            "description": current_desc,
        })

    return entries


if __name__ == "__main__":
    wb = openpyxl.load_workbook(WORKBOOK, data_only=True, read_only=True)
    all_entries: list[dict] = []
    summary: dict[str, int] = {}
    for sheet, prod_col, unit_col, qty_col in SHEETS:
        rows = extract(sheet, prod_col, unit_col, qty_col)
        all_entries.extend(rows)
        summary[sheet.strip()] = len(rows)

    all_entries.sort(key=lambda r: (r["material"].lower(), r["date"]))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "source": WORKBOOK.name,
        "summary_by_sheet": summary,
        "entries": all_entries,
    }, ensure_ascii=False, indent=2))

    print(f"Wrote {len(all_entries)} entries → {OUTPUT}")
    for sheet, count in summary.items():
        print(f"  {sheet}: {count}")
