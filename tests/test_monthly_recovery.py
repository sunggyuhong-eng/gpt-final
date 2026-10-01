import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

import collector.pipeline as pipeline
import scripts.generate_existing_report as generate_script
import scripts.run_pipeline as runner
from collector.pipeline import read_json, write_json


def test_report_failure_keeps_collected_data_and_marks_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "ROOT", tmp_path)
    monkeypatch.setattr(sys, "argv", ["run_pipeline.py", "--mode", "monthly"])
    monkeypatch.setattr(runner, "run", lambda *args: {"success": True, "started_at": "2026-10-01T09:00:00+09:00"})
    monkeypatch.setattr(runner, "validate_file", lambda *args: [])
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(tmp_path / "summary.md"))
    path = tmp_path / "data/reports/2026-10.json"
    write_json(path, {"period": "2026-10", "status": "analysis_pending", "statistics": {"total_open": 123}})
    snapshot = tmp_path / "data/snapshots/2026-10.json"
    write_json(snapshot, {"jobs": [{"id": "job-1"}]})
    before = snapshot.read_bytes()

    def fail(*args):
        raise RuntimeError("test context error")

    monkeypatch.setattr(runner, "generate_saved_report", fail)
    assert runner.main() == 0
    assert snapshot.read_bytes() == before
    assert read_json(path)["status"] == "failed"
    assert read_json(tmp_path / "data/reports/latest.json")["period"] == "2026-10"
    assert read_json(tmp_path / "data/collection-status.json")["report_status"] == "failed"
    assert "실패" in (tmp_path / "summary.md").read_text()


def test_collection_failure_remains_a_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "ROOT", tmp_path)
    monkeypatch.setattr(sys, "argv", ["run_pipeline.py", "--mode", "monthly"])
    monkeypatch.setattr(runner, "run", lambda *args: {"success": False})
    assert runner.main() == 1


def test_monthly_snapshot_not_skipped_by_existing_daily_and_archives_previous(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "ROOT", tmp_path)
    job = {"id": "j1", "company": "A", "title": "개발자", "categories": ["게임제작"], "career": "경력무관"}
    status = {"success": True, "started_at": "2026-10-01T09:00:00+09:00", "finished_at": "2026-10-01T09:10:00+09:00"}
    monkeypatch.setattr(pipeline, "collect_all", lambda **kwargs: ([job], [], status.copy()))
    daily = tmp_path / "data/daily/2026-10-01.json"
    write_json(daily, {"period": "2026-10-01", "jobs": [{"id": "old-daily"}]})
    before_daily = daily.read_bytes()
    write_json(tmp_path / "data/snapshots/2026-09.json", {"period": "2026-09", "jobs": [job], "is_sample": False})
    old_report = {"period": "2026-09", "status": "complete", "generated_at": "2026-09-22T01:00:00Z", "markdown": "기존 해설"}
    write_json(tmp_path / "data/reports/latest.json", old_report)
    previous_pdf = tmp_path / "reports/2026-09-game-hiring-summary.pdf"
    previous_pdf.parent.mkdir(parents=True)
    previous_pdf.write_bytes(b"test-pdf-preservation")
    now = datetime(2026, 10, 1, 9, tzinfo=ZoneInfo("Asia/Seoul"))
    assert pipeline.run("monthly", now=now)["success"]
    assert daily.read_bytes() == before_daily
    assert read_json(tmp_path / "data/snapshots/2026-10.json")["jobs"] == [job]
    latest = read_json(tmp_path / "data/reports/latest.json")
    assert latest["period"] == "2026-10"
    assert latest["baseline_period"] == "2026-09"
    assert latest["status"] == "analysis_pending"
    manifest = read_json(tmp_path / "data/reports/archive.json")
    archived = manifest["reports"][0]
    assert (tmp_path / archived["pdf_path"]).read_bytes() == b"test-pdf-preservation"
    assert "2026-10" in json.dumps(read_json(tmp_path / "data/category-history.json"))


def test_monthly_bundle_uses_requested_month_and_keeps_pdf_archive(tmp_path, monkeypatch):
    monkeypatch.setattr(generate_script, "ROOT", tmp_path)
    result = {"period": "2026-10", "status": "complete", "generated_at": "2026-10-01T01:00:00Z", "markdown": "해설"}
    months = []

    def generate(month):
        months.append(month)
        return result.copy()

    monkeypatch.setattr(generate_script, "generate", generate)
    monkeypatch.setattr(generate_script, "build_report_pdf", lambda result, path: (path.parent.mkdir(parents=True, exist_ok=True), path.write_bytes(b"pdf")))
    saved = generate_script.generate_saved_report("2026-10")
    assert months == ["2026-10"]
    assert saved["pdf_path"] == "reports/2026-10-game-hiring-summary.pdf"
    manifest = read_json(tmp_path / "data/reports/archive.json")
    assert (tmp_path / manifest["reports"][0]["pdf_path"]).read_bytes() == b"pdf"
