from __future__ import annotations

import json
import os

from openai import OpenAI

from collector.pipeline import ROOT, read_json, write_json

SYSTEM = """당신은 게임업계 채용시장 데이터 분석가다. 제공된 JSON에 있는 수치와 기사만 사용한다.
인과관계를 단정하지 않고 관찰, 관련 가능성, 추가 확인 필요를 구분한다. 수치가 없으면 추측하지 않는다.
반드시 한국어 Markdown으로 작성하고 다음 9개 절을 포함한다: 시장 요약, 전체 공고, 직무별 추이,
회사별 추이, 신규·종료 공고, 주요 뉴스, 뉴스와 채용 변동의 연관성, 다음 달 관찰 대상, 데이터 한계.
공고와 뉴스는 제공된 URL을 Markdown 링크로 인용한다. 기사 전문을 재현하지 않는다."""


def generate(month: str) -> dict:
    report_path = ROOT / "data" / "reports" / f"{month}.json"
    payload = read_json(report_path)
    if not payload:
        raise FileNotFoundError(f"분석 데이터 없음: {report_path}")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        payload.update({"status": "pending_api_key", "error": "OPENAI_API_KEY가 없어 AI 리포트를 생성하지 않았습니다.", "markdown": None})
        write_json(report_path, payload)
        write_json(ROOT / "data" / "reports" / "latest.json", payload)
        return payload
    model = os.getenv("OPENAI_MODEL", "gpt-5-mini")
    response = OpenAI(api_key=api_key).responses.create(
        model=model,
        input=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    )
    markdown = response.output_text
    payload.update({"status": "complete", "model": model, "markdown": markdown, "error": None})
    write_json(report_path, payload)
    write_json(ROOT / "data" / "reports" / "latest.json", payload)
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    (reports / f"{month}.md").write_text(markdown, encoding="utf-8")
    return payload
