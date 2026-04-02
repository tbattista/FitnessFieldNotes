"""
Demo Account Rate Limiter
Prevents abuse of temporary demo account creation.
In-memory implementation (resets on server restart).
"""

import time
import logging
from collections import defaultdict
from typing import Tuple

logger = logging.getLogger(__name__)

DEMO_ACCOUNTS_PER_IP_PER_HOUR = 20
HOUR_SECONDS = 3600


class DemoRateLimiter:
    """In-memory rate limiter for demo account creation."""

    def __init__(self):
        self._requests: dict = defaultdict(list)

    def check_limit(self, client_ip: str) -> Tuple[bool, int]:
        """Check if IP is within rate limit. Returns (allowed, remaining)."""
        now = time.time()
        cutoff = now - HOUR_SECONDS
        self._requests[client_ip] = [t for t in self._requests[client_ip] if t > cutoff]
        count = len(self._requests[client_ip])
        remaining = max(0, DEMO_ACCOUNTS_PER_IP_PER_HOUR - count)
        return (count < DEMO_ACCOUNTS_PER_IP_PER_HOUR, remaining)

    def record_request(self, client_ip: str):
        """Record a demo account creation."""
        self._requests[client_ip].append(time.time())


# Global instance
demo_rate_limiter = DemoRateLimiter()
