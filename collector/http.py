from __future__ import annotations

import logging
import time
import urllib.robotparser
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

LOG = logging.getLogger(__name__)


@dataclass
class RespectfulClient:
    user_agent: str = "GameHiringRadar/1.0 (+public-research; contact via repository issues)"
    delay_seconds: float = 2.0
    timeout: float = 20.0
    _last_request: dict[str, float] = field(default_factory=dict)
    _robots: dict[str, urllib.robotparser.RobotFileParser] = field(default_factory=dict)

    def _robot_parser(self, url: str) -> urllib.robotparser.RobotFileParser:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots:
            parser = urllib.robotparser.RobotFileParser(f"{origin}/robots.txt")
            try:
                parser.read()
            except Exception as exc:  # network/invalid robots => fail closed
                LOG.warning("robots.txt 확인 실패: %s (%s)", origin, exc)
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(["User-agent: *", "Disallow: /"])
            self._robots[origin] = parser
        return self._robots[origin]

    def allowed(self, url: str) -> bool:
        return self._robot_parser(url).can_fetch(self.user_agent, url)

    def get(self, url: str, **kwargs) -> httpx.Response:
        parser = self._robot_parser(url)
        if not parser.can_fetch(self.user_agent, url):
            raise PermissionError(f"robots.txt에서 수집을 허용하지 않는 URL: {url}")
        host = urlparse(url).netloc
        robots_delay = parser.crawl_delay(self.user_agent) or parser.crawl_delay("*") or 0
        effective_delay = max(self.delay_seconds, float(robots_delay))
        elapsed = time.monotonic() - self._last_request.get(host, 0)
        if elapsed < effective_delay:
            time.sleep(effective_delay - elapsed)
        with httpx.Client(
            headers={"User-Agent": self.user_agent},
            timeout=self.timeout,
            follow_redirects=True,
        ) as client:
            response = client.get(url, **kwargs)
            self._last_request[host] = time.monotonic()
            response.raise_for_status()
            return response
