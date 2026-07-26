"""
System resource monitor.

Polls CPU, RAM, and disk usage via psutil every 2 seconds.
"""

import asyncio
import logging
import time
from typing import Optional

import psutil

logger = logging.getLogger(__name__)


class SystemMonitor:
    """Poll system resources and expose the latest snapshot."""

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._latest: Optional[dict] = None
        self._running = False
        self._prev_net: Optional[psutil._common.snetio] = None

        # Seed psutil.cpu_percent() with a brief blocking call so
        # subsequent non-blocking calls return meaningful deltas.
        psutil.cpu_percent(interval=0.1)

    @property
    def latest(self) -> Optional[dict]:
        return self._latest

    def get_snapshot(self) -> dict:
        """Return the latest snapshot or a zeroed-out dict if not yet available."""
        if self._latest is not None:
            return self._latest
        return {
            "type": "monitor",
            "cpu": 0.0,
            "ram": {"used": 0, "total": 0, "percent": 0.0},
            "disk": {"used": 0, "total": 0, "percent": 0.0},
            "net": {"dl": 0.0, "ul": 0.0},
            "ts": 0.0,
        }

    async def start(self):
        """Begin polling in the background."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("System monitor started")

    async def stop(self):
        """Stop polling."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("System monitor stopped")

    async def _poll_loop(self):
        """Poll every 2 seconds and store the latest snapshot."""
        while self._running:
            try:
                cpu = psutil.cpu_percent(interval=0)
                ram = psutil.virtual_memory()
                disk = psutil.disk_usage("/")
                net = psutil.net_io_counters()

                # Compute network deltas
                dl_rate = 0.0
                ul_rate = 0.0
                if self._prev_net is not None:
                    elapsed = 2.0  # poll interval
                    dl_rate = (net.bytes_recv - self._prev_net.bytes_recv) / elapsed
                    ul_rate = (net.bytes_sent - self._prev_net.bytes_sent) / elapsed
                self._prev_net = net

                self._latest = {
                    "type": "monitor",
                    "cpu": cpu,
                    "ram": {
                        "used": ram.used,
                        "total": ram.total,
                        "percent": ram.percent,
                    },
                    "disk": {
                        "used": disk.used,
                        "total": disk.total,
                        "percent": disk.percent,
                    },
                    "net": {
                        "dl": dl_rate,
                        "ul": ul_rate,
                    },
                    "ts": time.time(),
                }
            except Exception as e:
                logger.warning(f"Monitor poll error: {e}")

            await asyncio.sleep(2)


# Module-level singleton
system_monitor = SystemMonitor()
