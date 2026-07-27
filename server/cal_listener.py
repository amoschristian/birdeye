"""
Calendar listener — queries Evolution Data Server via ECal (GObject Introspection).

Same API GNOME Calendar uses. Gets components as iCal strings, parses DTSTART
with proper timezone handling, expands RRULEs with python-dateutil.
"""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

import gi
gi.require_version('ECal', '2.0')
gi.require_version('EDataServer', '1.2')
from gi.repository import ECal, EDataServer

from dateutil.rrule import rrulestr

logger = logging.getLogger(__name__)

LOOKAHEAD_DAYS = 0.5  # 12 hours


class CalendarListener:
    """Queries EDS for calendar events with proper timezone handling."""

    def __init__(self):
        self._events: list[dict] = []
        self._shutting_down = False

    # ── Public API ──────────────────────────────────────────────────

    async def start(self):
        logger.info("calendar: Scheduling initial EDS poll (background)…")
        asyncio.create_task(self._initial_poll())

    async def stop(self):
        self._shutting_down = True

    def get_upcoming(self, limit: int = 3) -> list[dict]:
        return self._events[:limit]

    async def _initial_poll(self):
        try:
            await self._poll()
            if self._events:
                logger.info(f"calendar: Found {len(self._events)} upcoming event(s)")
            else:
                logger.info("calendar: No upcoming events found")
        except Exception as e:
            logger.error(f"calendar: Initial poll failed: {e}")

    # ── Internal ────────────────────────────────────────────────────

    async def _poll(self):
        now = datetime.now(timezone.utc)
        until_ts = now.timestamp() + LOOKAHEAD_DAYS * 86400

        try:
            sources = await asyncio.wait_for(
                asyncio.to_thread(self._list_calendar_sources), timeout=5
            )
        except asyncio.TimeoutError:
            logger.warning("calendar: listing sources timed out")
            return

        if not sources:
            logger.debug("calendar: no calendar sources found")
            return

        # Query all sources in parallel, capped at 10s total
        tasks_map = {}
        for src in sources:
            task = asyncio.create_task(
                asyncio.to_thread(self._query_source, src, now, until_ts)
            )
            tasks_map[task] = src
        done, pending = await asyncio.wait(tasks_map.keys(), timeout=10)
        for task in pending:
            src = tasks_map[task]
            logger.warning(f"calendar: skipping '{src.get_display_name()}' — timed out")
            task.cancel()

        all_events: list[dict] = []
        seen: set[str] = set()
        for task in done:
            src = tasks_map[task]
            try:
                result = task.result()
                for ev in result:
                    key = f"{ev['id']}|{ev['start']}"
                    if key not in seen:
                        seen.add(key)
                        all_events.append(ev)
            except Exception as e:
                logger.warning(f"calendar: skipping '{src.get_display_name()}' — {e}")

        now_ts = now.timestamp()
        # Keep events that haven't ended yet (includes in-progress events)
        all_events = [e for e in all_events if e.get("end", 0) > now_ts]
        all_events.sort(key=lambda e: e.get("start", 0))
        self._events = all_events
        logger.debug(f"calendar: poll complete — {len(self._events)} event(s) after filter")

    @staticmethod
    def _list_calendar_sources() -> list:
        """Get list of enabled calendar sources."""
        try:
            registry = EDataServer.SourceRegistry.new_sync(None)
        except Exception as e:
            logger.warning(f"calendar: Failed to open EDS registry: {e}")
            return []
        return [
            s for s in registry.list_sources(None)
            if s.has_extension('Calendar') and s.get_enabled()
        ]

    @staticmethod
    def _query_source(src, now: datetime, until_ts: float) -> list[dict]:
        """Query one calendar source for events. Runs in a thread."""
        client = ECal.Client.connect_sync(
            src, ECal.ClientSourceType.EVENTS, 5, None
        )

        # Extend start 24h back so ongoing events that started before "now" are included
        lookback = now - timedelta(hours=24)
        utc_start_str = lookback.strftime("%Y%m%dT%H%M%SZ")
        utc_end_str = datetime.fromtimestamp(
            until_ts, tz=timezone.utc
        ).strftime("%Y%m%dT%H%M%SZ")

        sexp = (
            f'(occur-in-time-range? '
            f'(make-time "{utc_start_str}") '
            f'(make-time "{utc_end_str}"))'
        )
        success, comps = client.get_object_list_as_comps_sync(sexp)

        if not success or not comps:
            return []

        all_events: list[dict] = []
        for comp in comps:
            all_events.extend(CalendarListener._process(comp, now, until_ts))
        return all_events

    @staticmethod
    def _process(comp, now: datetime, until_ts: float) -> list[dict]:
        """Extract events from an ECal component."""
        try:
            # Use iCal string for RRULE parsing (simpler than ICalGLib API)
            ics = comp.get_as_string()
        except Exception:
            return []

        # Parse summary
        m = re.search(r'^SUMMARY:(.+)$', ics, re.MULTILINE)
        if not m:
            return []
        summary = m.group(1).strip()

        # Parse UID
        m = re.search(r'^UID:(.+)$', ics, re.MULTILINE)
        uid = m.group(1).strip() if m else summary

        # Parse DTSTART with timezone
        start_ts, end_ts = CalendarListener._parse_dt_times(comp, ics)

        if start_ts is None:
            return []

        if end_ts is None or end_ts <= start_ts:
            end_ts = start_ts + 3600

        # Has alarm?
        has_alarm = 'BEGIN:VALARM' in ics

        # Description
        m = re.search(r'^DESCRIPTION:(.+?)(?:\n\S|$)', ics, re.MULTILINE | re.DOTALL)
        desc = m.group(1).strip() if m else ''

        # Location
        m = re.search(r'^LOCATION:(.+)$', ics, re.MULTILINE)
        loc = m.group(1).strip() if m else ''

        # Recurrence?
        m_rrule = re.search(r'^RRULE:(.+)$', ics, re.MULTILINE)

        if m_rrule:
            rrule_str = m_rrule.group(1).strip()

            # Check UNTIL
            m_until = re.search(r'UNTIL=(\d{8}T\d{6}Z)', rrule_str)
            if m_until:
                until_dt = datetime.strptime(
                    m_until.group(1), "%Y%m%dT%H%M%SZ"
                ).replace(tzinfo=timezone.utc)
                if until_dt < now:
                    return []  # recurrence ended

            # Build DTSTART in UTC for dateutil
            dtstart_utc = datetime.fromtimestamp(start_ts, tz=timezone.utc)
            dtstart_str = dtstart_utc.strftime("%Y%m%dT%H%M%SZ")

            try:
                rule = rrulestr(
                    f"DTSTART:{dtstart_str}\nRRULE:{rrule_str}",
                    forceset=True,
                )

                duration = end_ts - start_ts
                now_ts = now.timestamp()
                events: list[dict] = []
                count = 0
                for occ in rule:
                    occ_ts = occ.timestamp()
                    occ_end = occ_ts + duration

                    # Include: still in progress OR future within lookahead
                    if occ_end <= now_ts:
                        continue
                    if occ_ts > until_ts or count >= 50:
                        break

                    events.append({
                        "id": f"{uid}_occ{count}",
                        "summary": summary,
                        "start": occ_ts,
                        "end": occ_end,
                        "description": desc,
                        "location": loc,
                        "has_alarm": has_alarm,
                    })
                    count += 1
                return events
            except Exception as e:
                logger.debug(f"calendar: RRULE expand failed: {e}")
                return []

        # Single event
        return [{
            "id": uid,
            "summary": summary,
            "start": start_ts,
            "end": end_ts,
            "description": desc,
            "location": loc,
            "has_alarm": has_alarm,
        }]

    @staticmethod
    def _parse_dt_times(comp, ics: str) -> tuple[float | None, float | None]:
        """Extract DTSTART/DTEND as UTC timestamps using the component's timezone."""
        start_ts = None
        end_ts = None

        try:
            dtstart = comp.get_dtstart()
            if dtstart:
                start_ts = CalendarListener._ecal_dt_to_utc(dtstart)
        except Exception:
            pass

        try:
            dtend = comp.get_dtend()
            if dtend:
                end_ts = CalendarListener._ecal_dt_to_utc(dtend)
        except Exception:
            pass

        return start_ts, end_ts

    @staticmethod
    def _ecal_dt_to_utc(dt) -> float | None:
        """Convert ECal.ComponentDateTime to UTC Unix timestamp."""
        from dateutil import tz as dateutil_tz

        try:
            val = dt.get_value()
            tzid = dt.get_tzid()

            year = val.get_year()
            month = val.get_month()
            day = val.get_day()
            hour = val.get_hour()
            minute = val.get_minute()
            second = val.get_second()

            if tzid:
                try:
                    tz_obj = dateutil_tz.gettz(tzid)
                except Exception:
                    tz_obj = None

                if tz_obj:
                    local_dt = datetime(year, month, day, hour, minute, second, tzinfo=tz_obj)
                    return local_dt.timestamp()
                else:
                    local_dt = datetime(year, month, day, hour, minute, second)
                    return local_dt.timestamp()
            else:
                local_dt = datetime(year, month, day, hour, minute, second)
                return local_dt.timestamp()
        except Exception:
            return None


# Singleton
calendar_listener = CalendarListener()
