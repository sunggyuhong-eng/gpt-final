from __future__ import annotations

import json
import logging
import os
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from zoneinfo import ZoneInfo

from collector.adapters import GameJobAdapter, NEWS_ADAPTERS
from collector.models import JobPosting, NewsItem
from collector.normalize import career_bucket
from collector.normalize import load_yaml

ROOT = Path(__file__).resolve().parents[1]
SEOUL = ZoneInfo("Asia/Seoul")
LOG = logging.getLogger(__name__)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def dedupe_jobs(jobs: list[JobPosting]) -> list[dict]:
    merged: dict[str, dict] = {}
    for job in jobs:
        current = merged.get(job.id)
        item = job.to_dict()
        if current:
            item["categories"] = sorted(set(current["categories"] + item["categories"]))
            item["original_categories"] = sorted(set(current["original_categories"] + item["original_categories"]))
        merged[job.id] = item
    return sorted(merged.values(), key=lambda x: (x["company"], x["title"], x["id"]))


def _title_key(title: str) -> str:
    return "".join(ch.lower() for ch in title if ch.isalnum())


def dedupe_news(news: list[NewsItem]) -> list[dict]:
    groups: list[dict] = []
    for item in news:
        candidate = item.to_dict()
        if not candidate.get("related_sources"):
            candidate["related_sources"] = [{"source": item.source, "url": item.url}]
        key = _title_key(item.title)
        match = next((g for g in groups if SequenceMatcher(None, key, _title_key(g["title"])).ratio() >= 0.86), None)
        if match:
            sources = match.setdefault("related_sources", [])
            if not any(x["url"] == item.url for x in sources):
                sources.append({"source": item.source, "url": item.url})
        else:
            groups.append(candidate)
    return groups


def _count(jobs: list[dict], key: str, multi: bool = False) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for job in jobs:
        values = job.get(key) if multi else [job.get(key) or "미확인"]
        for value in values or ["미확인"]:
            counter[value] += 1
    return dict(counter.most_common())


def _delta(current: dict[str, int], previous: dict[str, int]) -> list[dict]:
    keys = set(current) | set(previous)
    return sorted(
        [{"name": k, "current": current.get(k, 0), "previous": previous.get(k, 0), "change": current.get(k, 0) - previous.get(k, 0)} for k in keys],
        key=lambda x: (-x["current"], x["name"]),
    )


def _career_counts(jobs: list[dict]) -> dict[str, int]:
    return dict(Counter(career_bucket(job.get("career")) for job in jobs).most_common())


def _fingerprint(job: dict) -> str:
    return "|".join("".join(ch.lower() for ch in (job.get(k) or "") if ch.isalnum()) for k in ("company", "title"))


def compare(current_jobs: list[dict], previous_jobs: list[dict] | None) -> dict:
    current = {x["id"]: x for x in current_jobs}
    if previous_jobs is None:
        return {
            "has_baseline": False, "baseline_message": "기준 데이터 없음",
            "total_open": len(current), "previous_total": None, "change": None, "change_rate": None,
            "new_count": None, "maintained_count": None, "closed_count": None,
            "new_ids": [], "maintained_ids": [], "closed_ids": [],
            "by_company": _delta(_count(current_jobs, "company"), {}),
            "by_category": _delta(_count(current_jobs, "categories", True), {}),
            "by_career": _delta(_career_counts(current_jobs), {}),
            "by_location": _delta(_count(current_jobs, "location"), {}),
            "by_employment_type": _delta(_count(current_jobs, "employment_type"), {}),
            "company_category": cross_delta(current_jobs, []), "reposted": [],
        }
    previous = {x["id"]: x for x in previous_jobs}
    new_ids = sorted(current.keys() - previous.keys())
    maintained_ids = sorted(current.keys() & previous.keys())
    closed_ids = sorted(previous.keys() - current.keys())
    previous_fingerprints = {_fingerprint(previous[x]): x for x in closed_ids}
    reposted = [{"current_id": x, "previous_id": previous_fingerprints[_fingerprint(current[x])]} for x in new_ids if _fingerprint(current[x]) in previous_fingerprints]
    change = len(current) - len(previous)
    return {
        "has_baseline": True, "baseline_message": None,
        "total_open": len(current), "previous_total": len(previous), "change": change,
        "change_rate": round(change / len(previous) * 100, 1) if previous else None,
        "new_count": len(new_ids), "maintained_count": len(maintained_ids), "closed_count": len(closed_ids),
        "new_ids": new_ids, "maintained_ids": maintained_ids, "closed_ids": closed_ids,
        "by_company": _delta(_count(current_jobs, "company"), _count(previous_jobs, "company")),
        "by_category": _delta(_count(current_jobs, "categories", True), _count(previous_jobs, "categories", True)),
        "by_career": _delta(_career_counts(current_jobs), _career_counts(previous_jobs)),
        "by_location": _delta(_count(current_jobs, "location"), _count(previous_jobs, "location")),
        "by_employment_type": _delta(_count(current_jobs, "employment_type"), _count(previous_jobs, "employment_type")),
        "company_category": cross_delta(current_jobs, previous_jobs), "reposted": reposted,
    }


def cross_analysis(jobs: list[dict]) -> list[dict]:
    matrix: dict[tuple[str, str], int] = defaultdict(int)
    for job in jobs:
        for category in job.get("categories") or ["기타"]:
            matrix[(job["company"], category)] += 1
    return [{"company": c, "category": k, "count": n} for (c, k), n in sorted(matrix.items())]


def cross_delta(current: list[dict], previous: list[dict]) -> list[dict]:
    cur = {(x["company"], x["category"]): x["count"] for x in cross_analysis(current)}
    prev = {(x["company"], x["category"]): x["count"] for x in cross_analysis(previous)}
    return [{"company": c, "category": k, "current": cur.get((c, k), 0), "previous": prev.get((c, k), 0), "change": cur.get((c, k), 0) - prev.get((c, k), 0)} for c, k in sorted(set(cur) | set(prev))]


def previous_month_file(month: str) -> Path | None:
    year, mon = map(int, month.split("-"))
    prev = f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"
    path = ROOT / "data" / "snapshots" / f"{prev}.json"
    return path if path.exists() else None


def collect_all(enrich_companies: bool = False) -> tuple[list[dict], list[dict], dict]:
    status = {"started_at": datetime.now(SEOUL).isoformat(), "sources": [], "is_sample": False}
    policy = load_yaml("source_policy.yml").get("sources", {})
    jobs: list[JobPosting] = []
    if not policy.get("게임잡", {}).get("approved", False):
        status["sources"].append({"name": "게임잡", "status": "disabled", "count": 0, "error": policy.get("게임잡", {}).get("note", "이용약관 검토 필요")})
    else:
        try:
            jobs = GameJobAdapter().collect(enrich_companies=enrich_companies)
            status["sources"].append({"name": "게임잡", "status": "success", "count": len(jobs)})
        except Exception as exc:
            LOG.exception("게임잡 수집 실패")
            status["sources"].append({"name": "게임잡", "status": "failed", "count": 0, "error": str(exc)})

    news: list[NewsItem] = []
    for adapter_class in NEWS_ADAPTERS:
        if not policy.get(adapter_class.name, {}).get("approved", False):
            status["sources"].append({"name": adapter_class.name, "status": "disabled", "count": 0, "error": policy.get(adapter_class.name, {}).get("note", "이용약관 검토 필요")})
            continue
        try:
            items = adapter_class().collect()
            news.extend(items)
            status["sources"].append({"name": adapter_class.name, "status": "success", "count": len(items)})
        except Exception as exc:
            LOG.exception("%s 수집 실패", adapter_class.name)
            status["sources"].append({"name": adapter_class.name, "status": "failed", "count": 0, "error": str(exc)})
    status["finished_at"] = datetime.now(SEOUL).isoformat()
    status["success"] = bool(jobs)
    return dedupe_jobs(jobs), dedupe_news(news), status


def run(mode: str = "daily", force: bool = False, now: datetime | None = None) -> dict:
    now = now or datetime.now(SEOUL)
    day, month = now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")
    jobs, news, status = collect_all(enrich_companies=mode == "monthly")
    if not jobs:
        status["message"] = "채용공고 수집 실패로 기존 정상 데이터를 유지했습니다."
        write_json(ROOT / "data" / "collection-status.json", status)
        return status
    daily_path = ROOT / "data" / "daily" / f"{day}.json"
    if daily_path.exists() and not force:
        status["message"] = "오늘 스냅샷이 이미 존재하여 건너뛰었습니다. force=true로 재수집할 수 있습니다."
        write_json(ROOT / "data" / "collection-status.json", status)
        return status
    snapshot = {"schema_version": 1, "period": day, "collected_at": status["finished_at"], "is_sample": False, "jobs": jobs, "news": news}
    write_json(daily_path, snapshot)
    write_json(ROOT / "data" / "latest.json", snapshot)
    if mode == "monthly":
        monthly_path = ROOT / "data" / "snapshots" / f"{month}.json"
        if monthly_path.exists() and not force:
            status["message"] = "이번 달 공식 스냅샷이 이미 존재하여 보존했습니다. 수동 force=true로 교체할 수 있습니다."
        else:
            monthly = dict(snapshot, period=month)
            write_json(monthly_path, monthly)
            prev_path = previous_month_file(month)
            previous = read_json(prev_path, {}).get("jobs") if prev_path else None
            stats = compare(jobs, previous)
            write_json(ROOT / "data" / "reports" / f"{month}.json", {"period": month, "is_sample": False, "status": "analysis_pending", "statistics": stats, "news": news})
            update_history(month, stats)
    write_json(ROOT / "data" / "collection-status.json", status)
    return status


def update_history(month: str, stats: dict) -> None:
    path = ROOT / "data" / "history-summary.json"
    data = read_json(path, {"months": []})
    row = {"month": month, "total_open": stats["total_open"], "new_count": stats["new_count"], "closed_count": stats["closed_count"]}
    data["months"] = [x for x in data.get("months", []) if x["month"] != month] + [row]
    data["months"].sort(key=lambda x: x["month"])
    write_json(path, data)
