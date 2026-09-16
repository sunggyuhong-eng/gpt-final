# v21 전체 업데이트 적용

이 버전은 저장된 뉴스 복구와 GPT 리포트 배포 워크플로가 함께 변경됐으므로 저장소 전체를 덮어씁니다.

1. ZIP을 풀고 `game-industry-hiring-tracker` 폴더 안의 파일과 폴더를 저장소 루트에 모두 덮어씁니다.
2. 예전 `.github/workflows/generate-report.yml`이 남아 있다면 삭제합니다.
3. 커밋 후 최초 `Deploy GitHub Pages` 완료를 확인합니다.
4. 새 형식의 시장 해설이 필요하면 `Actions > Generate GPT Report - OpenAI > Run workflow`를 한 번 실행합니다.
5. 이 작업 하나가 GPT 생성, 저장소 커밋, 웹 빌드, Pages 배포까지 모두 수행합니다.

`OPENAI_API_KEY`는 기존 GitHub Secret을 그대로 사용합니다. 현재 ZIP에는 저장된 2026년 9월 뉴스 642건이 리포트 입력에 연결되어 있습니다. 리포트는 새 입력 기준 적용을 위해 `해설 준비 중` 상태이므로, 전체 덮어쓰기 후 GPT 워크플로를 새로 한 번 실행해야 합니다.
