#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from collector.pipeline import ROOT, read_json, run, write_json
from collector.validate import validate_file
from scripts.generate_existing_report import generate_saved_report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["daily", "monthly"], default="daily")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-report", action="store_true")
    args = parser.parse_args()
    (ROOT / "logs").mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    status = run(args.mode, args.force)
    if not status.get("success"):
        return 1
    errors = validate_file(ROOT / "data" / "latest.json")
    if errors:
        for error in errors:
            logging.error(error)
        return 1
    if args.mode == "monthly" and not args.skip_report:
        month = status["started_at"][:7]
        try:
            generate_saved_report(month)
            status["report_status"] = "complete"
            status["report_error"] = None
        except Exception as exc:
            # Collection succeeded: do not discard its snapshot because GPT/PDF failed.
            logging.exception("월간 통계 수집은 완료됐지만 GPT/PDF 생성이 실패했습니다.")
            print("::warning::월간 통계는 저장합니다. GPT/PDF는 Generate GPT Report - OpenAI에서 다시 생성하세요.")
            status["report_status"] = "failed"
            status["report_error"] = str(exc)
            path = ROOT / "data" / "reports" / f"{month}.json"
            pending = read_json(path, {})
            if pending and pending.get("status") != "complete":
                pending.update({"status": "failed", "error": str(exc)})
                write_json(path, pending)
                write_json(ROOT / "data" / "reports" / "latest.json", pending)
        write_json(ROOT / "data" / "collection-status.json", status)
        summary_path = os.getenv("GITHUB_STEP_SUMMARY")
        if summary_path:
            with Path(summary_path).open("a", encoding="utf-8") as summary:
                summary.write(f"## {month} 월간 처리 결과\n\n- 통계 수집·검증: 완료\n")
                summary.write("- GPT 리포트·PDF·아카이브: 완료\n" if status["report_status"] == "complete" else
                              "- GPT 리포트·PDF: **실패** (통계는 저장·배포됩니다)\n"
                              "- 재시도: **Generate GPT Report - OpenAI** → Run workflow\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
