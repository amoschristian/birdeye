"""
Jev attention ranking — server-side decision model for notifications.

Jev (typesafe/jev-1.14) reads a piece of state and answers typed questions
with calibrated probabilities. We ask two:

  needs_me  (noul)  — does this require a reply, decision, or action from the
                      user personally?
  urgency   (score) — 0..2, how time-sensitive is it?

Those two probabilities are the only facts we persist. The band, the
"Important" chip and the sort score are derived from them at read time, so
the thresholds below can be retuned without re-calling the model or
migrating a single row.

Two transports, chosen at first use (see `transport()`):

  commandcode-api  HTTP to Command Code's Provider API (`v1/systemone`) with
                   CMD_API_KEY — the same subscription, no subprocess, ~1s.
  commandcode      `cmd -p <request> -m typesafe/jev` — reuses the CLI login
                   already on this machine, no key of its own, but pays for a
                   short-lived CLI process (~2s) per notification.

Every failure path (no transport, offline, timeout, malformed answer) leaves
the row unclassified, which falls back to the rule the panel used before the
model existed. A notification is never held back waiting for this.
"""

import asyncio
import datetime
import json
import logging
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from db import db, Notification
from notif_importance import has_direct_mention, has_handle_mention, is_dm_notification

logger = logging.getLogger(__name__)

PROVIDER_ENDPOINT = "https://api.commandcode.ai/provider/v1/systemone"
PROVIDER_TIMEOUT_SECONDS = 8.0
COMMANDCODE_MODEL = "typesafe/jev"
COMMANDCODE_TIMEOUT_SECONDS = 20.0
MAX_MESSAGE_CHARS = 1000

MODEL_BY_TRANSPORT = {
    "commandcode-api": COMMANDCODE_MODEL,
    "commandcode": COMMANDCODE_MODEL,
}

# ── Policy ────────────────────────────────────────────────────────
# Nothing persisted depends on these values; change them and every stored
# decision re-ranks on the next read.

PIN_NEEDS_ME = 0.85       # the model thinks this needs the user
PIN_URGENCY = 1.6         # on the 0..2 score: someone is waiting now
UNCERTAIN_NEEDS_ME = 0.4  # below this the model is saying no, not hesitating

# A DM or a mention of one of the user's handles is addressed to them, and no
# model reading of a single fragment gets to bury that. The floor only lifts a
# row's band and its sort score; the model's probabilities stay as stored, so
# within the addressed rows the ranking is still the model's.
ADDRESSED_FLOOR_SCORE = 0.5

# The same sender and room alerting repeatedly does not need a second
# decision. The notification title carries both on Discord and Google Chat.
DEDUPE_WINDOW_SECONDS = 120

_pending: set[asyncio.Task] = set()
_recent: dict[str, float] = {}
_warned_disabled = False
_cmd_binary: str | None | bool = False  # False = not resolved yet
_cmd_slots: asyncio.Semaphore | None = None


@dataclass(frozen=True)
class Attention:
    score: float
    band: str
    important: bool


def transport() -> str | None:
    """Return the transport name, or None when nothing can answer.

    BIRDEYE_JEV_TRANSPORT forces one ("off" disables ranking). Otherwise a
    subscription key wins over shelling out to the CLI.
    """
    forced = os.environ.get("BIRDEYE_JEV_TRANSPORT", "").strip().lower()
    if forced in ("off", "none", "disabled"):
        return None
    if forced in MODEL_BY_TRANSPORT:
        return forced
    if commandcode_api_key():
        return "commandcode-api"
    if cmd_binary() is not None:
        return "commandcode"
    return None


def commandcode_api_key() -> str | None:
    """The Provider API key — the same one that authenticates the CLI."""
    return os.environ.get("CMD_API_KEY") or os.environ.get("COMMANDCODE_API_KEY")


def enabled() -> bool:
    return transport() is not None


def cmd_binary() -> str | None:
    """Locate the Command Code CLI, or None if this machine has no install."""
    global _cmd_binary
    if _cmd_binary is not False:
        return _cmd_binary

    found = os.environ.get("BIRDEYE_CMD") or shutil.which("cmd")
    if not found:
        # nvm installs into ~/.nvm/versions/node/<version>/bin, which the
        # systemd user PATH does not include.
        installed = sorted(Path.home().glob(".nvm/versions/node/*/bin/cmd"))
        found = str(installed[-1]) if installed else None

    _cmd_binary = found
    return _cmd_binary


def start(notification: Notification, app=None) -> None:
    """Classify in the background. Never blocks the caller."""
    global _warned_disabled
    if not enabled():
        if not _warned_disabled:
            logger.info("Jev disabled: no CMD_API_KEY and no Command Code CLI")
            _warned_disabled = True
        return
    task = asyncio.create_task(classify_and_apply(notification, app))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


# ── Request ───────────────────────────────────────────────────────


def _questions() -> dict:
    return {
        "needs_me": {
            "type": "noul",
            "instructions": (
                "Does `message` require a reply, decision, or action from the "
                "recipient personally? A broadcast that only informs them does "
                "not need them. `title` names the sender and the room it came "
                "from; `mentions_me` says whether the recipient was named."
            ),
        },
        "urgency": {
            "type": "score",
            "instructions": "How time-sensitive is `message` for the recipient?",
            "criteria": [
                "No time pressure; can be handled whenever",
                "Should be handled today; nothing breaks if it waits",
                "A deadline or blocker is named; someone is waiting now",
            ],
        },
    }


def _state(notification: Notification, app, now: datetime.datetime) -> dict:
    return {
        "app": notification.app_name,
        "band": app.group if app is not None else "unknown",
        "title": notification.summary[:200],
        "message": (notification.body or "")[:MAX_MESSAGE_CHARS],
        "is_dm": is_dm_notification(notification.app_id, notification.summary),
        "mentions_me": has_direct_mention(notification.summary, notification.body),
        "now": now.strftime("%Y-%m-%d %H:%M %A %Z"),
    }


async def _ask(state: dict) -> tuple[float | None, float | None, str | None]:
    """Return (needs_me, urgency, model) or Nones when the call did not land."""
    kind = transport()
    if kind == "commandcode-api":
        body = await _ask_commandcode_api(state)
    else:
        body = await _ask_commandcode(state)
    if body is None:
        return None, None, None

    answers = body.get("answers") or {}
    needs_me = _number(answers.get("needs_me"), "noul")
    urgency = _number(answers.get("urgency"), "score")
    model = body.get("model") or MODEL_BY_TRANSPORT.get(kind, COMMANDCODE_MODEL)
    return needs_me, urgency, model


async def _ask_commandcode_api(state: dict) -> dict | None:
    """Provider API: the subscription, over plain HTTP, no subprocess."""
    api_key = commandcode_api_key()
    if not api_key:
        return None
    request = {
        "model": COMMANDCODE_MODEL,
        "state": state,
        "questions": _questions(),
    }
    async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT_SECONDS) as client:
        response = await client.post(
            PROVIDER_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}"},
            json=request,
        )
        response.raise_for_status()
        return response.json()


async def _ask_commandcode(state: dict) -> dict | None:
    """One headless `cmd` run: the prompt is the request JSON, stdout the answer."""
    binary = cmd_binary()
    if binary is None:
        return None

    environment = dict(os.environ)
    # The launcher is `#!/usr/bin/env node`, and node lives beside it.
    environment["PATH"] = str(Path(binary).parent) + os.pathsep + environment.get("PATH", "")

    request = json.dumps({"state": state, "questions": _questions()})
    async with _commandcode_slot():
        process = await asyncio.create_subprocess_exec(
            binary, "-p", request, "-m", COMMANDCODE_MODEL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=environment,
            cwd=str(Path.home()),
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), COMMANDCODE_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise

    if process.returncode != 0:
        raise RuntimeError(
            f"cmd exited {process.returncode}: {stderr.decode(errors='replace')[:300]}"
        )
    # The answer is stdout, but a fresh CLI process can emit a notice before
    # it, so start decoding at the first object rather than at byte zero.
    text = stdout.decode(errors="replace")
    start = text.find("{")
    if start == -1:
        raise RuntimeError(f"cmd printed no JSON: {text[:300]!r}")
    try:
        value = json.JSONDecoder().raw_decode(text, start)[0]
    except json.JSONDecodeError as error:
        raise RuntimeError(f"cmd printed no JSON: {text[:300]!r}") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"cmd printed no JSON object: {text[:300]!r}")
    return value


def _commandcode_slot() -> asyncio.Semaphore:
    """One CLI process at a time — a burst of notifications must not fork a fleet.

    Ranking is not latency-critical: the row is already on screen.
    """
    global _cmd_slots
    if _cmd_slots is None:
        _cmd_slots = asyncio.Semaphore(1)
    return _cmd_slots


def _number(answer: object, field: str) -> float | None:
    if not isinstance(answer, dict):
        return None
    value = answer.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


# ── Flow ──────────────────────────────────────────────────────────


async def classify_and_apply(notification: Notification, app=None) -> None:
    if not enabled():
        return

    if _seen_recently(notification):
        logger.debug(f"Jev skipped (recent duplicate): app={notification.app_id}")
        return

    state = _state(notification, app, datetime.datetime.now().astimezone())
    try:
        needs_me, urgency, model = await _ask(state)
    except Exception as error:
        logger.info(f"Jev skipped ({type(error).__name__}): {error}")
        return

    if needs_me is None or urgency is None:
        logger.info(f"Jev returned no usable answer: app={notification.app_id}")
        return

    updated = db.set_notification_decision(notification.id, needs_me, urgency, model)
    if updated is None:
        return

    attention = attention_of(updated)
    db.log_decision(
        notification_id=updated.id,
        app_id=updated.app_id,
        needs_me=needs_me,
        urgency=urgency,
        model=model,
        band=attention.band,
        pin_needs_me=PIN_NEEDS_ME,
        pin_urgency=PIN_URGENCY,
    )
    _remember(notification)

    logger.info(
        f"Jev → app={updated.app_id} needs_me={needs_me:.2f} "
        f"urgency={urgency:.2f} band={attention.band}"
    )

    from ws import broadcast_state
    await broadcast_state()


def _seen_recently(notification: Notification) -> bool:
    key = f"{notification.app_id}|{notification.summary.lower()}"
    now = time.time()
    for stale_key, seen_at in list(_recent.items()):
        if now - seen_at > DEDUPE_WINDOW_SECONDS:
            del _recent[stale_key]
    return key in _recent


def _remember(notification: Notification) -> None:
    key = f"{notification.app_id}|{notification.summary.lower()}"
    _recent[key] = time.time()


# ── Policy: probabilities → what the panel shows ───────────────────


def addressed_to_me(notification: Notification) -> bool:
    """A 1:1 DM, or one of the user's own handles named in the text."""
    return is_dm_notification(
        notification.app_id, notification.summary
    ) or has_handle_mention(notification.summary, notification.body)


def attention_of(notification: Notification) -> Attention:
    attention = _derived_attention(notification)
    if attention.band == "pinned" or not addressed_to_me(notification):
        return attention
    return Attention(
        score=max(attention.score, ADDRESSED_FLOOR_SCORE),
        band="pinned",
        important=True,
    )


def _derived_attention(notification: Notification) -> Attention:
    needs_me = notification.needs_me
    urgency = notification.urgency

    # Unclassified: no decision (yet, or ever). Keep the rule the panel used
    # before the model existed so the fallback is byte-for-byte today's board.
    if needs_me is None or urgency is None:
        return Attention(
            score=1.0 if notification.is_important else 0.0,
            band="unclassified",
            important=notification.is_important,
        )

    score = needs_me * (urgency / 2.0)

    if needs_me >= PIN_NEEDS_ME and urgency >= PIN_URGENCY:
        return Attention(score=score, band="pinned", important=True)
    if needs_me >= PIN_NEEDS_ME:
        return Attention(score=score, band="top", important=False)
    if needs_me >= UNCERTAIN_NEEDS_ME:
        # The model is torn. Defer to the old rule rather than invent a band.
        return Attention(
            score=1.0 if notification.is_important else 0.0,
            band="unclassified",
            important=notification.is_important,
        )
    if urgency >= PIN_URGENCY:
        return Attention(score=score, band="current", important=False)
    return Attention(score=score, band="quiet", important=False)


def notification_payload(notification: Notification) -> dict:
    """Wire shape: the row plus what the panel needs, all derived here."""
    payload = dict(notification.__dict__)
    attention = attention_of(notification)
    payload["is_important"] = attention.important
    payload["attention_score"] = round(attention.score, 4)
    payload["attention_band"] = attention.band
    return payload
