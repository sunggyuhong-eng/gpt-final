import json
from pathlib import Path

from collector.report_archive import archive_report, rebuild_archive


def complete_report(generated_at="2026-09-22T06:49:44.056058+00:00"):
    return {
        "period": "2026-09",
        "status": "complete",
        "generated_at": generated_at,
        "model": "gpt-test",
        "analysis": {"outlook": "분석"},
        "markdown": "# 분석\n",
        "pdf_path": "reports/2026-09-game-hiring-summary.pdf",
    }


def test_archive_keeps_multiple_generations_of_same_month(tmp_path: Path):
    reports = tmp_path / "reports"
    reports.mkdir(parents=True)
    (reports / "2026-09.md").write_text("# 첫 리포트", encoding="utf-8")
    (reports / "2026-09-game-hiring-summary.pdf").write_bytes(b"first-pdf")
    first = archive_report(complete_report(), tmp_path)
    (reports / "2026-09.md").write_text("# 두 번째 리포트", encoding="utf-8")
    (reports / "2026-09-game-hiring-summary.pdf").write_bytes(b"second-pdf")
    second = archive_report(complete_report("2026-09-22T07:15:00+00:00"), tmp_path)

    manifest = json.loads((tmp_path / "data/reports/archive.json").read_text(encoding="utf-8"))
    assert len(manifest["reports"]) == 2
    assert first["id"] != second["id"]
    assert (tmp_path / first["pdf_path"]).read_bytes() == b"first-pdf"
    assert (tmp_path / second["pdf_path"]).read_bytes() == b"second-pdf"


def test_rebuild_archive_finds_existing_monthly_reports(tmp_path: Path):
    data_dir = tmp_path / "data/reports"
    report_dir = tmp_path / "reports"
    data_dir.mkdir(parents=True)
    report_dir.mkdir(parents=True)
    payload = complete_report()
    (data_dir / "2026-09.json").write_text(json.dumps(payload), encoding="utf-8")
    (report_dir / "2026-09.md").write_text("# 분석", encoding="utf-8")
    (report_dir / "2026-09-game-hiring-summary.pdf").write_bytes(b"pdf")
    manifest = rebuild_archive(tmp_path)
    assert [item["period"] for item in manifest["reports"]] == ["2026-09"]
