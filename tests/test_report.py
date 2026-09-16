import json

import httpx
import pytest

import collector.report as report_module
from collector.report import _compact_payload, _hydrate_saved_news, _response_text, _select_relevant_news


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


def test_empty_report_news_are_restored_from_saved_month(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    news_path = tmp_path / "data" / "news" / "2026-09.json"
    news_path.parent.mkdir(parents=True)
    news_path.write_text(json.dumps({"period": "2026-09", "items": [{"title": "저장된 뉴스"}]}), encoding="utf-8")
    payload = {"period": "2026-09", "news": []}
    assert _hydrate_saved_news(payload, "2026-09") == [{"title": "저장된 뉴스"}]
    assert payload["news"][0]["title"] == "저장된 뉴스"


def test_missing_api_key_fails_instead_of_green_success(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        report_module.generate("2026-09")
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["status"] == "pending_api_key"


def test_responses_api_output_text_is_extracted():
    result = {"output": [{"type": "message", "content": [{"type": "output_text", "text": "# 월간 리포트"}]}]}
    assert _response_text(result) == "# 월간 리포트"


def test_generate_uses_openai_responses_api(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-test")
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")
    captured = {}

    def fake_post(url, **kwargs):
        captured.update({"url": url, **kwargs})
        return httpx.Response(200, json={"output": [{"content": [{"type": "output_text", "text": "# 완료"}]}]})

    monkeypatch.setattr(report_module.httpx, "post", fake_post)
    result = report_module.generate("2026-09")
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["json"]["model"] == "gpt-test"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert result["provider"] == "openai"
    assert result["markdown"] == "# 완료"


def test_incomplete_response_is_not_saved_as_complete(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")

    def fake_post(url, **kwargs):
        return httpx.Response(200, json={"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}, "output": []})

    monkeypatch.setattr(report_module.httpx, "post", fake_post)
    with pytest.raises(RuntimeError, match="max_output_tokens"):
        report_module.generate("2026-09")
