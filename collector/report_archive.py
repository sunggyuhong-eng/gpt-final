from __future__ import annotations

import copy
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from collector.pipeline import ROOT, read_json, write_json


def archive_id(report: dict) -> str:
    period = str(report.get("period") or "unknown")
    generated = str(report.get("generated_at") or "")
    try:
        parsed = datetime.fromisoformat(generated.replace("Z", "+00:00")).astimezone(timezone.utc)
        stamp = parsed.strftime("%Y%m%dT%H%M%S%fZ")
    except ValueError:
        stamp = re.sub(r"[^0-9A-Za-z]", "", generated) or "unknown"
    return f"{period}-{stamp}"


def archive_report(report: dict, root: Path = ROOT) -> dict | None:
    """완성된 리포트와 PDF를 생성 시각별 불변 파일로 보존한다."""
    if report.get("status") != "complete" or not report.get("generated_at") or not report.get("period"):
        return None

    period = str(report["period"])
    item_id = archive_id(report)
    data_dir = root / "data" / "reports" / "archive" / period
    file_dir = root / "reports" / "archive" / period
    data_dir.mkdir(parents=True, exist_ok=True)
    file_dir.mkdir(parents=True, exist_ok=True)

    archived = copy.deepcopy(report)
    markdown_source = root / "reports" / f"{period}.md"
    markdown_relative = f"reports/archive/{period}/{item_id}.md"
    if markdown_source.exists():
        shutil.copy2(markdown_source, root / markdown_relative)

    pdf_source_value = str(report.get("pdf_path") or "")
    pdf_source = root / pdf_source_value if pdf_source_value else root / "reports" / f"{period}-game-hiring-summary.pdf"
    pdf_relative = f"reports/archive/{period}/{item_id}-game-hiring-summary.pdf"
    if pdf_source.exists():
        shutil.copy2(pdf_source, root / pdf_relative)
        archived["pdf_path"] = pdf_relative

    json_relative = f"data/reports/archive/{period}/{item_id}.json"
    write_json(root / json_relative, archived)

    manifest_path = root / "data" / "reports" / "archive.json"
    manifest = read_json(manifest_path, {"reports": []})
    reports = manifest.get("reports") if isinstance(manifest, dict) else []
    if not isinstance(reports, list):
        reports = []
    entry = {
        "id": item_id,
        "period": period,
        "generated_at": report.get("generated_at"),
        "model": report.get("model"),
        "json_path": json_relative,
        "markdown_path": markdown_relative if markdown_source.exists() else None,
        "pdf_path": pdf_relative if pdf_source.exists() else None,
    }
    reports = [item for item in reports if isinstance(item, dict) and item.get("id") != item_id]
    reports.append(entry)
    reports.sort(key=lambda item: str(item.get("generated_at") or ""), reverse=True)
    write_json(manifest_path, {"schema_version": 1, "reports": reports})
    return entry


def rebuild_archive(root: Path = ROOT) -> dict:
    """기존 월별 리포트도 최초 아카이브 목록에 포함한다."""
    report_dir = root / "data" / "reports"
    for path in sorted(report_dir.glob("*.json")):
        if path.name in {"latest.json", "archive.json"}:
            continue
        payload = read_json(path, {})
        if isinstance(payload, dict):
            archive_report(payload, root)
    latest = read_json(report_dir / "latest.json", {})
    if isinstance(latest, dict):
        archive_report(latest, root)
    return read_json(report_dir / "archive.json", {"schema_version": 1, "reports": []})
