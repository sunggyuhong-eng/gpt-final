#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from collector.pipeline import ROOT, read_json
from collector.report import generate


def main() -> int:
    latest = read_json(ROOT / "data" / "reports" / "latest.json", {})
    month = latest.get("period")
    if not month:
        raise RuntimeError("data/reports/latest.json에 분석할 period가 없습니다.")
    result = generate(month)
    if result.get("status") != "complete" or not result.get("markdown"):
        raise RuntimeError("Claude 리포트가 완성되지 않았습니다.")
    print(json.dumps({
        "period": month,
        "status": result["status"],
        "jobs_analyzed": result.get("methodology", {}).get("evidence", {}).get("job_examples_sent"),
        "news_analyzed": result.get("methodology", {}).get("evidence", {}).get("news_sent_to_model"),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
