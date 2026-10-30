"""
System resource monitor.

Polls CPU, RAM, and disk usage via psutil every 2 seconds.
"""

import asyncio
import logging
import os
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

        # The panel may only kill a PID it was just shown. Current + previous
        # snapshot covers the gap between a refresh and a tap.
        self._prev_pids: set[int] = set()
        self._killable_pids: set[int] = set()

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
            "processes": [],
            "ts": 0.0,
        }

    def _collect_processes(self) -> list[dict]:
        """Top processes by CPU and by resident memory, unioned.

        psutil keeps per-Process CPU samples, so calling cpu_percent(None) each
        tick yields the delta since the previous tick. The first sample after
        startup is 0.0 for every process — expected, it settles on the next tick.
        """
        processes: list[dict] = []
        own_pid = os.getpid()

        for proc in psutil.process_iter(["pid", "name", "username"]):
            try:
                info = proc.info
                pid = info["pid"]
                if pid <= 1 or pid == own_pid:
                    continue
                processes.append({
                    "pid": pid,
                    "name": info.get("name") or "?",
                    "cpu": proc.cpu_percent(interval=None),
                    "mem": proc.memory_info().rss,
                    "user": info.get("username") or "",
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        by_cpu = sorted(processes, key=lambda p: p["cpu"], reverse=True)[:10]
        by_mem = sorted(processes, key=lambda p: p["mem"], reverse=True)[:10]
        merged = {p["pid"]: p for p in by_cpu + by_mem}
        snapshot = sorted(merged.values(), key=lambda p: p["cpu"], reverse=True)

        for proc in snapshot:
            proc["cpu"] = round(proc["cpu"], 1)

        current = {p["pid"] for p in snapshot}
        self._killable_pids = current | self._prev_pids
        self._prev_pids = current

        return snapshot

    def kill_process(self, pid: int) -> tuple[bool, str | None]:
        """Terminate a process the panel was just shown, never one it was not.

        The dashboard is served on the loopback interface, but the guards still
        bound the blast radius: the PID must be in the last two snapshots, must
        belong to this user, and can never be init or the server itself.
        """
        if not isinstance(pid, int) or isinstance(pid, bool):
            return False, "invalid_pid"
        if pid <= 1 or pid == os.getpid():
            return False, "not_permitted"
        if pid not in self._killable_pids:
            return False, "not_in_snapshot"

        try:
            process = psutil.Process(pid)
            if process.uids().real != os.getuid():
                return False, "not_permitted"

            process.terminate()
            try:
                process.wait(timeout=2)
            except psutil.TimeoutExpired:
                process.kill()
                try:
                    process.wait(timeout=1)
                except psutil.TimeoutExpired:
                    pass
            return True, None
        except psutil.NoSuchProcess:
            return True, None
        except psutil.AccessDenied:
            return False, "not_permitted"
        except psutil.ZombieProcess:
            return True, None
        except Exception as error:
            logger.warning(f"kill_process({pid}) failed: {error}")
            return False, "failed"

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
                    "processes": await asyncio.to_thread(self._collect_processes),
                    "ts": time.time(),
                }
            except Exception as e:
                logger.warning(f"Monitor poll error: {e}")

            await asyncio.sleep(2)


# Module-level singleton
system_monitor = SystemMonitor()
