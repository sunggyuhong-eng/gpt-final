#!/usr/bin/env bash
set -euo pipefail

# GitHub 웹 업로드는 ZIP에 없는 기존 파일을 삭제하지 않는다. 과거에 같은
# 저장소에 올라간 채용 대시보드 파일이 Python/TypeScript 모듈을 가로채지
# 않도록 Actions 실행 환경에서만 격리한다.
quarantine_dir="${RUNNER_TEMP:-/tmp}/gpt-final-foreign-files"
mkdir -p "$quarantine_dir"

foreign_files=(
  "http.py"
  "src/api.ts"
  "src/types.test.ts"
  "scripts/sync_gamejob.py"
  "tests/test_sync_gamejob.py"
  "public/data/dashboard.json"
)

for path in "${foreign_files[@]}"; do
  if [[ -f "$path" ]]; then
    safe_name="${path//\//__}"
    mv "$path" "$quarantine_dir/$safe_name"
    echo "Quarantined unrelated dashboard file: $path"
  fi
done
