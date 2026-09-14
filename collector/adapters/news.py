from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from collector.adapters.base import Adapter
from collector.models import NewsItem
from collector.normalize import normalize_date, stable_id

LOG = logging.getLogger(__name__)

ISSUES = {
    "신작 출시": ["출시", "론칭", "신작"], "투자·인수합병": ["투자", "인수", "합병", "m&a"],
    "실적 발표": ["실적", "매출", "영업이익"], "구조조정·권고사직": ["구조조정", "권고사직", "감원"],
    "조직 개편": ["조직개편", "대표 선임"], "채용 확대": ["채용 확대", "공채"],
    "채용 축소": ["채용 축소", "채용 중단"], "프로젝트 중단": ["개발 중단", "프로젝트 중단"],
    "사업 철수": ["철수", "서비스 종료"], "해외 진출": ["해외 진출", "글로벌 출시"],
    "정책·규제": ["규제", "법안", "정책"],
}


def classify_issue(text: str) -> str:
    lower = text.lower()
    return next((issue for issue, words in ISSUES.items() if any(w in lower for w in words)), "기타")


class GenericNewsAdapter(Adapter):
    name = "news"
    url = ""
    article_selectors = "article a[href], .news-list a[href], .list a[href]"

    def collect(self) -> list[NewsItem]:
        response = self.client.get(self.url)
        soup = BeautifulSoup(response.text, "html.parser")
        items: list[NewsItem] = []
        seen: set[str] = set()
        for link in soup.select(self.article_selectors):
            title = link.get_text(" ", strip=True)
            if len(title) < 8:
                continue
            url = urljoin(response.url, link.get("href", ""))
            item_id = stable_id(url, title)
            if item_id in seen:
                continue
            seen.add(item_id)
            parent_text = link.parent.get_text(" ", strip=True) if link.parent else title
            items.append(NewsItem(
                id=item_id, source=self.name, title=title, url=url,
                published_at=normalize_date(parent_text), summary=None,
                keywords=[], issue_type=classify_issue(title),
                related_sources=[{"source": self.name, "url": url}],
                collected_at=datetime.now(timezone.utc).isoformat(),
            ))
        if not items:
            raise RuntimeError(f"{self.name} 뉴스 선택자와 일치하는 기사가 없습니다.")
        return items[:100]


class GameMecaAdapter(GenericNewsAdapter):
    name, url = "게임메카", "https://www.gamemeca.com/news.php"


class InvenAdapter(GenericNewsAdapter):
    name, url = "인벤", "https://www.inven.co.kr/webzine/news/"


class ThisIsGameAdapter(GenericNewsAdapter):
    name, url = "디스이즈게임", "https://www.thisisgame.com/webzine/news/"


class GameJobNewsAdapter(GenericNewsAdapter):
    name, url = "게임잡 업계뉴스", "https://www.gamejob.co.kr/Community/news?Comm_Stat=0"


class PludiAdapter(GenericNewsAdapter):
    name, url = "PLUDI", "https://pludi.co/trend/dashboard/"


NEWS_ADAPTERS = [GameMecaAdapter, InvenAdapter, ThisIsGameAdapter, GameJobNewsAdapter, PludiAdapter]
