"""Bounded GPT evidence; source data and population statistics are never sampled."""
from __future__ import annotations

import json
from collections import defaultdict, deque

MAX_JOB_EVIDENCE = 150
MAX_NEWS_EVIDENCE = 50
# UTF-8 bytes, NOT an exact token count. Instructions/schema are budgeted separately.
MAX_INPUT_BYTES = 220_000


def encode_input(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def input_bytes(value: object) -> int:
    return len(encode_input(value).encode("utf-8"))


def _text(value: object, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[:limit - 1] + "…"


def compact_statistics(statistics: dict) -> dict:
    stats = {key: value for key, value in statistics.items()
             if key not in {"new_ids", "maintained_ids", "closed_ids"}}
    # Lossless columnar representation for the repetitive cross-table/link rows.
    # All rows, values, and totals survive; only repeated JSON field names disappear.
    for key in ("company_category", "reposted"):
        rows = stats.get(key)
        if isinstance(rows, list) and rows and all(isinstance(row, dict) for row in rows):
            columns = list(dict.fromkeys(k for row in rows for k in row))
            if all(set(row) == set(columns) for row in rows):
                stats[key] = {"columns": columns, "rows": [[row[k] for k in columns] for row in rows]}
    return stats


def select_jobs(jobs: list[dict], stats: dict, limit: int = MAX_JOB_EVIDENCE) -> list[dict]:
    """Round-robin across company/category/movement, with top movers first."""
    changes = {str(row.get("name")): row for row in stats.get("by_company") or []}
    new_ids = {str(value) for value in stats.get("new_ids") or []}
    closed_ids = {str(value) for value in stats.get("closed_ids") or []}
    maintained_ids = {str(value) for value in stats.get("maintained_ids") or []}
    groups: dict[tuple, deque] = defaultdict(deque)
    seen: set[str] = set()
    for job in jobs:
        identity = str(job.get("id") or job.get("url") or encode_input(job))
        if identity in seen:
            continue
        seen.add(identity)
        job_id = str(job.get("id") or "")
        movement = "new" if job_id in new_ids else "closed" if job_id in closed_ids else "maintained" if job_id in maintained_ids else "unknown"
        compact = {key: job[key] for key in ("id", "url", "company") if key in job}
        compact["title"] = _text(job.get("title"), 180)
        for key in ("career", "location", "employment_type"):
            if key in job:
                compact[key] = _text(job[key], 80)
        for key in ("categories", "job_subcategories"):
            if isinstance(job.get(key), list):
                compact[key] = [_text(value, 60) for value in job[key][:12]]
        compact["movement"] = movement
        group = (str(job.get("company") or ""), tuple(compact.get("categories") or []), movement)
        groups[group].append(compact)

    def priority(group: tuple) -> tuple:
        row = changes.get(group[0], {})
        return (-abs(row.get("change") or 0), -int(group[2] in {"new", "closed"}),
                -(row.get("current") or 0), group)

    ordered = sorted(groups, key=priority)
    selected = []
    while ordered and len(selected) < limit:
        for key in ordered:
            selected.append(groups[key].popleft())
            if len(selected) == limit:
                break
        ordered = [key for key in ordered if groups[key]]
    return selected


def compact_news(news: list[dict]) -> list[dict]:
    selected = []
    seen = set()
    for item in news:
        identity = item.get("url") or (item.get("title"), item.get("published_at"))
        if identity in seen:
            continue
        seen.add(identity)
        selected.append({
            "source": _text(item.get("source"), 80),
            "title": _text(item.get("title"), 180),
            "url": item.get("url"),  # Never truncate citation URLs.
            "published_at": item.get("published_at"),
            "summary": _text(item.get("summary"), 400),
            "issue_type": _text(item.get("issue_type"), 80),
        })
        if len(selected) >= MAX_NEWS_EVIDENCE:
            break
    return selected


def fit_input(value: dict, max_bytes: int = MAX_INPUT_BYTES) -> dict:
    """Trim evidence from the low-priority tail, never population aggregates."""
    value["evidence_selection"]["input_budget_bytes"] = max_bytes
    while True:
        meta = value["evidence_selection"]
        meta["jobs_sent"] = len(value["job_examples"])
        meta["news_sent"] = len(value["news"])
        if input_bytes(value) <= max_bytes:
            return value
        options = [(input_bytes(value[key]), key) for key in ("job_examples", "news") if value[key]]
        if not options:
            raise RuntimeError("전체 통계만으로도 GPT 입력 예산을 초과했습니다. 원본은 보존되며 입력 예산 또는 모델 설정을 확인해야 합니다.")
        _, key = max(options)
        value[key].pop()
