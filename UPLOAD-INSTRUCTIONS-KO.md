# v35 월간 리포트·PDF 영구 아카이브

이 버전은 월간 리포트와 PDF를 생성 시각별 불변 파일로 보존합니다. 같은 달 리포트를 여러 번 생성해도 이전 생성본이 사라지지 않으며, 웹의 `저장된 월간 리포트`에서 각 버전의 전체 분석과 PDF를 다시 확인할 수 있습니다.

1. ZIP을 풀고 `game-industry-hiring-tracker` 폴더 안의 파일과 폴더를 저장소 루트에 모두 덮어씁니다.
2. 예전 `.github/workflows/generate-report.yml`이 남아 있다면 삭제합니다.
3. 커밋 후 `Deploy GitHub Pages`가 자동으로 실행될 때까지 기다립니다.
4. 배포 과정에서 기존 월별 리포트와 PDF도 최초 아카이브 목록에 자동 등록됩니다.
5. 이후 `Actions > Generate GPT Report - OpenAI > Run workflow`를 실행할 때마다 새 버전이 추가되고 이전 파일은 유지됩니다.
6. 이 작업 하나가 GPT 생성, PDF 생성, 저장소 커밋, 웹 빌드, Pages 배포까지 모두 수행합니다.

`OPENAI_API_KEY`는 기존 GitHub Secret을 그대로 사용합니다. ZIP은 저장소에 이미 생성된 `data/reports`와 `reports`를 덮어쓰지 않도록 구성되어 있습니다.

GPT는 뉴스와 공고에서 확인되는 내용만 배경으로 설명하며, 직접 근거가 없으면 원인을 단정하지 않습니다. PDF와 Markdown에도 웹페이지와 동일한 `변화 구성 → 변화 주도 → 확인된 배경 → 다음 의미` 흐름이 적용됩니다.

PDF 버튼은 월간 리포트 상단에 표시됩니다. 저장된 해설이 아직 없다면 통계 PDF 대신 해설 생성 안내를 유지하고, GPT 작업이 성공한 뒤 PDF를 함께 만듭니다.
