from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def workflow(name):
    # BaseLoader keeps GitHub's 'on' key instead of YAML 1.1's boolean True.
    return yaml.load((ROOT / ".github/workflows" / name).read_text(), Loader=yaml.BaseLoader)


def test_standalone_report_completion_triggers_pages_deploy():
    config = workflow("deploy-pages.yml")
    assert "Generate GPT Report - OpenAI" in config["on"]["workflow_run"]["workflows"]


def test_monthly_schedule_and_shared_writer_lock():
    monthly = workflow("monthly-collection.yml")
    standalone = workflow("openai-gpt-report.yml")
    assert monthly["on"]["schedule"][0]["cron"] == "0 0 1 * *"
    assert monthly["concurrency"]["group"] == standalone["concurrency"]["group"]
