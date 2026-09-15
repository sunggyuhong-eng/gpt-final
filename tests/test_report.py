import json

import pytest

import collector.report as report_module
from collector.report import _compact_payload, _select_relevant_news


def test_report_payload_removes_large_id_lists():
    jobs = [{"title": f"공고 {i}", "url": f"https://example.com/{i}", "company": "A"} for i in range(155)]
    compact = _compact_payload({
        "period": "2026-09",
        "statistics": {"total_open": 2, "new_ids": ["a", "b"], "by_company": [{"name": str(i)} for i in range(110)]},
        "job_examples": jobs,
    })
    assert "new_ids" not in compact["statistics"]
    assert len(compact["statistics"]["by_company"]) == 110
    assert len(compact["job_examples"]) == 155


def test_company_related_news_is_prioritized():
    stats = {"by_company": [{"name": "테스트게임즈", "change": 12}]}
    news = [
        {"title": "일반 게임 행사 개최", "summary": "", "published_at": "2026-09-15", "issue_type": "기타"},
        {"title": "테스트게임즈 신작 출시", "summary": "프로젝트 공개", "published_at": "2026-09-14", "issue_type": "신작 출시"},
    ]
    assert _select_relevant_news(news, stats)[0]["title"] == "테스트게임즈 신작 출시"


def test_all_news_are_preserved_after_prioritizing():
    stats = {"by_company": []}
    news = [{"title": f"뉴스 {i}", "published_at": "2026-09-15", "issue_type": "기타"} for i in range(135)]
    assert len(_select_relevant_news(news, stats)) == 135


def test_missing_api_key_fails_instead_of_green_success(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        report_module.generate("2026-09")
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["status"] == "pending_api_key"
