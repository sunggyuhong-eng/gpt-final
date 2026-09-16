# v20 전체 업데이트 적용

이 버전은 데이터 집계 규칙, 화면, 리포트 프롬프트와 워크플로가 함께 변경됐으므로 저장소 전체를 덮어씁니다.

1. ZIP을 풀고 `game-industry-hiring-tracker` 폴더 안의 파일과 폴더를 저장소 루트에 모두 덮어씁니다.
2. 예전 `.github/workflows/generate-report.yml`이 남아 있다면 삭제합니다.
3. 커밋 후 `Deploy GitHub Pages` 완료를 확인합니다.
4. 새 형식의 시장 해설이 필요하면 `Actions > Generate GPT Report - OpenAI > Run workflow`를 한 번 실행합니다.
5. GPT 완료 후 Pages는 자동으로 다시 배포됩니다.

`OPENAI_API_KEY`는 기존 GitHub Secret을 그대로 사용합니다. 현재 ZIP의 리포트는 새 집계 기준 적용을 위해 `해설 준비 중` 상태이므로, GPT 워크플로를 실행하기 전에도 통계와 그래프는 정상 표시됩니다.
