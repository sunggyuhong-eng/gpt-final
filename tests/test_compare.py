from collector.models import JobPosting
from collector.pipeline import compare, dedupe_jobs, dedupe_news
from collector.models import NewsItem


def job(job_id: str, company: str = "A", categories=None):
    return {
        "id": job_id, "company": company, "title": job_id, "url": f"https://example.com/{job_id}",
        "categories": categories or ["프로그래밍"], "career": "경력", "location": "서울", "employment_type": "정규직",
    }


def test_compare_without_baseline():
    result = compare([job("1")], None)
    assert result["has_baseline"] is False
    assert result["baseline_message"] == "기준 데이터 없음"
    assert result["new_count"] is None


def test_compare_new_maintained_closed():
    result = compare([job("2"), job("3")], [job("1"), job("2")])
    assert result["new_ids"] == ["3"]
    assert result["maintained_ids"] == ["2"]
    assert result["closed_ids"] == ["1"]
    assert result["change"] == 0


def test_reposted_job_is_flagged_without_merging_counts():
    old = job("old", company="A")
    old["title"] = "서버 개발자"
    new = job("new", company="A")
    new["title"] = "서버 개발자"
    result = compare([new], [old])
    assert result["reposted"] == [{"current_id": "new", "previous_id": "old"}]


def test_dedupe_job_merges_categories():
    base = dict(company="A", title="T", url="https://example.com/1", original_categories=[], collected_at="now")
    a = JobPosting(id="1", categories=["QA"], **base)
    b = JobPosting(id="1", categories=["프로그래밍"], **base)
    merged = dedupe_jobs([a, b])
    assert len(merged) == 1
    assert merged[0]["categories"] == ["QA", "프로그래밍"]


def test_similar_news_grouped_and_sources_preserved():
    a = NewsItem(id="a", source="A", title="게임사 신작 RPG 출시 계획 공개", url="https://a.example/1")
    b = NewsItem(id="b", source="B", title="게임사, 신작 RPG 출시 계획 공개", url="https://b.example/2")
    result = dedupe_news([a, b])
    assert len(result) == 1
    assert len(result[0]["related_sources"]) == 2
