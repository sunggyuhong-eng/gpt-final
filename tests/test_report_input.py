import copy
import json

import httpx
import pytest

import collector.report as report
from collector.report_input import compact_statistics, input_bytes, select_jobs
from test_report import structured_result


def large_payload():
    return {
        "period": "2026-10",
        "statistics": {"total_open": 3000, "previous_total": 2800, "change": 200,
                       "by_company": [{"name": f"회사{i}", "current": 100, "previous": 90, "change": 10} for i in range(30)]},
        "job_examples": [{"id": f"job-{i}", "company": f"회사{i % 30}", "title": "신규 기획자" * 100,
                          "categories": ["게임기획"], "url": f"https://example.com/jobs/{i}"} for i in range(3000)],
        "news": [{"title": f"회사{i % 30} 뉴스 {i}", "summary": "매우 긴 한글 요약" * 3000,
                  "url": f"https://example.com/news/{i}"} for i in range(500)],
    }


def test_large_korean_input_is_bounded_without_mutating_original():
    source = large_payload()
    original = copy.deepcopy(source)
    compact = report._compact_payload(source, max_bytes=85_000)
    assert input_bytes(compact) <= 85_000
    assert compact["statistics"] == source["statistics"]
    assert 0 < len(compact["job_examples"]) <= 150
    assert 0 < len(compact["news"]) <= 50
    assert all(len(item["summary"]) <= 400 for item in compact["news"])
    assert source == original
    assert compact["evidence_selection"]["jobs_available"] == 3000
    assert compact["evidence_selection"]["jobs_sent"] == len(compact["job_examples"])


def test_cross_tables_are_lossless():
    rows = [{"company": f"회사{i}", "category": "기획", "current": i, "previous": i + 3, "change": -3} for i in range(100)]
    stats = {"company_category": rows, "new_ids": ["x"], "new_count": 1}
    table = compact_statistics(stats)["company_category"]
    assert [dict(zip(table["columns"], row)) for row in table["rows"]] == rows
    assert stats["new_ids"] == ["x"]


def test_selection_spreads_across_companies_and_change_types():
    jobs = [{"id": f"a{i}", "company": "A", "title": "기획", "categories": ["기획"]} for i in range(100)]
    jobs += [{"id": "b1", "company": "B", "title": "개발", "categories": ["개발"]}]
    stats = {"by_company": [{"name": "A", "change": 20}, {"name": "B", "change": -10}], "new_ids": ["a0"]}
    selected = select_jobs(jobs, stats, limit=3)
    assert {job["company"] for job in selected} == {"A", "B"}
    assert selected[0]["movement"] == "new"


def test_full_statistics_are_not_silently_dropped_to_fit():
    with pytest.raises(RuntimeError, match="전체 통계"):
        report._compact_payload({"statistics": {"by_company": [{"name": "회사" * 1000}]}}, max_bytes=100)


def prepare_generate(tmp_path, monkeypatch, payload=None):
    monkeypatch.setattr(report, "ROOT", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    path = tmp_path / "data/reports/2026-10.json"
    path.parent.mkdir(parents=True)
    payload = payload or large_payload()
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def test_context_error_retries_smaller_input_and_records_actual_evidence(tmp_path, monkeypatch):
    prepare_generate(tmp_path, monkeypatch)
    calls = []

    def fake_post(url, **kwargs):
        calls.append(copy.deepcopy(kwargs["json"]))
        if len(calls) == 1:
            return httpx.Response(400, json={"error": {"code": "context_length_exceeded", "message": "Your input exceeds the context window of this model."}})
        return httpx.Response(200, json=structured_result())

    monkeypatch.setattr(report.httpx, "post", fake_post)
    result = report.generate("2026-10")
    assert len(calls) == 2
    assert len(calls[1]["input"].encode()) < len(calls[0]["input"].encode())
    assert calls[0]["max_output_tokens"] == calls[1]["max_output_tokens"]
    sent = json.loads(calls[1]["input"])
    assert result["methodology"]["evidence"]["job_examples_sent"] == len(sent["job_examples"])
    assert len(result["job_examples"]) == 3000
    assert len(result["news"]) == 500
    assert result["statistics"]["total_open"] == 3000


@pytest.mark.parametrize("code,message", [(401, "Invalid API key"), (429, "quota exceeded"), (400, "Invalid schema")])
def test_unrelated_api_failures_are_not_retried(tmp_path, monkeypatch, code, message):
    path = prepare_generate(tmp_path, monkeypatch, {"period": "2026-10", "statistics": {}})
    before = path.read_bytes()
    calls = []

    def fake_post(url, **kwargs):
        calls.append(1)
        return httpx.Response(code, json={"error": {"message": message}})

    monkeypatch.setattr(report.httpx, "post", fake_post)
    with pytest.raises(RuntimeError, match=message):
        report.generate("2026-10")
    assert len(calls) == 1
    assert path.read_bytes() == before


def test_context_rejection_is_retried_only_once(tmp_path, monkeypatch):
    prepare_generate(tmp_path, monkeypatch)
    calls = []

    def fake_post(url, **kwargs):
        calls.append(1)
        return httpx.Response(400, json={"error": {"message": "input exceeds context window"}})

    monkeypatch.setattr(report.httpx, "post", fake_post)
    with pytest.raises(RuntimeError, match="context window"):
        report.generate("2026-10")
    assert len(calls) == 2


def test_sanitizer_only_accepts_citations_sent_to_model(tmp_path, monkeypatch):
    payload = large_payload()
    prepare_generate(tmp_path, monkeypatch, payload)
    sent = report._compact_payload(payload)
    excluded = next(job for job in payload["job_examples"] if job["id"] not in {j["id"] for j in sent["job_examples"]})
    response = structured_result(company_insights=[{"name": excluded["company"], "direction": "증가", "comment": "증가",
                                                  "evidence_level": "근거 부족", "job_ids": [excluded["id"]], "news_urls": []}])
    monkeypatch.setattr(report.httpx, "post", lambda *args, **kwargs: httpx.Response(200, json=response))
    assert report.generate("2026-10")["analysis"]["company_insights"][0]["job_ids"] == []
