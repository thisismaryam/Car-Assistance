"""
Voice mode for the AI assistant.

One WebSocket per voice session (`/api/voice/ws`):

    browser mic (PCM16 16 kHz, binary frames)
        -> FastAPI -> ElevenLabs Scribe realtime STT (WebSocket, VAD commits)
        <- partial / final transcripts (JSON)
    final transcript -> the SAME assistant_orchestrator used by POST /api/chat
    reply text -> ElevenLabs TTS HTTP stream (raw PCM 24 kHz)
        -> forwarded chunk-by-chunk to the browser (binary frames)

Nothing is written to disk and nothing is buffered into a full file: every audio chunk
is forwarded the moment it arrives, and the browser schedules it for playback immediately.

Protocol (browser <-> server)
  client -> server (text JSON):
      {"type":"start","token":<jwt|null>,"history":[{role,content},...]}   (first message)
      {"type":"interrupt"}   stop speaking now
      {"type":"stop"}        end the session
  client -> server (binary): raw PCM16 mono 16 kHz mic audio
  server -> client (text JSON):
      {"type":"ready"}
      {"type":"partial","text"}                      live transcript while the user speaks
      {"type":"transcript","text"}                   final user utterance
      {"type":"state","value":"thinking"}
      {"type":"reply","reply","branch","booking_id","booking_link"}
      {"type":"speaking_start"} / {"type":"speaking_end"}
      {"type":"interrupt"}                           barge-in: client must flush playback
      {"type":"error","message"}
  server -> client (binary): raw PCM16 mono 24 kHz assistant audio
"""
import asyncio
import base64
import json
import logging
import re
from collections import defaultdict
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, WebSocket
from websockets.asyncio.client import connect as ws_connect

from app.core.config import settings
from app.core.security import decode_token
from app.database import SessionLocal
from app.models.user import User
from app.services.ai.orchestrator import assistant_orchestrator

# child of uvicorn's logger so INFO lines show in the uvicorn terminal
logger = logging.getLogger("uvicorn.error.voice")
router = APIRouter()

# Module-level so tests can point them at a local fake.
STT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
TTS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech"

STT_SAMPLE_RATE = 16000
TTS_OUTPUT_FORMAT = "pcm_24000"
VAD_SILENCE_SECS = 0.9          # how long a pause ends the user's turn
MAX_SESSION_SECONDS = 600       # hard cap per voice session (cost control)
MAX_SESSIONS_PER_IP = 3
MAX_SPOKEN_CHARS = 900          # long replies (price lists) are trimmed when spoken
BARGE_IN_MIN_CHARS = 3          # ignore 1-2 char blips (echo, coughs) when deciding to interrupt

# Upstream errors after which the session cannot continue.
FATAL_UPSTREAM_ERRORS = {
    "auth_error", "quota_exceeded", "unaccepted_terms", "rate_limited",
    "resource_exhausted", "session_time_limit_exceeded", "queue_overflow",
    "invalid_request",
}

_sessions_per_ip: dict[str, int] = defaultdict(int)


def _stt_key() -> str:
    return (settings.ELEVENLABS_STT_API_KEY or settings.ELEVENLABS_API_KEY or "").strip()


def _tts_key() -> str:
    return (settings.ELEVENLABS_TTS_API_KEY or settings.ELEVENLABS_API_KEY or "").strip()


def clean_for_speech(text: str) -> str:
    """Turn a chat reply (markdown links, bold, emoji, bullets) into something worth reading aloud."""
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)          # [label](url) -> label
    text = re.sub(r"https?://\S+", "", text)
    text = text.replace("**", "").replace("__", "").replace("`", "")
    text = re.sub(r"^\s*[-*•]\s+", "", text, flags=re.M)            # bullets
    text = re.sub(r"[\U00010000-\U0010FFFF☀-➿️]", "", text)  # emoji / symbols
    text = re.sub(r"\bRs\.?\s*(\d)", r"Rupees \1", text)
    text = re.sub(r"\s*\n+\s*", ". ", text)
    text = re.sub(r"\.\s*\.", ".", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    if len(text) > MAX_SPOKEN_CHARS:
        cut = text[:MAX_SPOKEN_CHARS]
        end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
        text = (cut[: end + 1] if end > 200 else cut) + " The rest is in the chat."
    return text


def _origin_allowed(origin: str | None) -> bool:
    allowed = {o.strip() for o in settings.VOICE_ALLOWED_ORIGINS.split(",") if o.strip()}
    return origin in allowed


class VoiceSession:
    def __init__(self, ws: WebSocket, user_id: int | None, history: list[dict]):
        self.ws = ws
        self.user_id = user_id
        self.history = history
        self.turns: asyncio.Queue[str] = asyncio.Queue()
        self.speak_task: asyncio.Task | None = None
        self.http = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0))

    # ---- helpers -------------------------------------------------------
    async def send(self, payload: dict) -> None:
        await self.ws.send_text(json.dumps(payload))

    def is_speaking(self) -> bool:
        return self.speak_task is not None and not self.speak_task.done()

    async def interrupt(self, notify_client: bool = True) -> None:
        if self.is_speaking():
            self.speak_task.cancel()
            await asyncio.wait({self.speak_task})
        if notify_client:
            await self.send({"type": "interrupt"})

    # ---- main loop -----------------------------------------------------
    async def run(self) -> None:
        url = STT_URL + "?" + urlencode({
            "model_id": "scribe_v2_realtime",
            "audio_format": f"pcm_{STT_SAMPLE_RATE}",
            "commit_strategy": "vad",
            "vad_silence_threshold_secs": VAD_SILENCE_SECS,
        })
        try:
            async with ws_connect(url, additional_headers={"xi-api-key": _stt_key()},
                                  max_size=None, open_timeout=8) as upstream:
                await self.send({"type": "ready"})
                tasks = [
                    asyncio.create_task(self._browser_to_stt(upstream)),
                    asyncio.create_task(self._stt_to_browser(upstream)),
                    asyncio.create_task(self._turn_worker()),
                    asyncio.create_task(asyncio.sleep(MAX_SESSION_SECONDS)),
                ]
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for t in pending:
                    t.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                for t in done:
                    if t.exception():
                        logger.warning("Voice task ended with error: %r", t.exception())
        except Exception as exc:  # connection refused, bad key at handshake, etc.
            logger.error("Voice session failed: %r", exc)
            try:
                await self.send({"type": "error",
                                 "message": "Voice service is unavailable right now. Please type your message."})
            except Exception:
                pass
        finally:
            if self.is_speaking():
                self.speak_task.cancel()
            await self.http.aclose()

    async def _browser_to_stt(self, upstream) -> None:
        """Mic frames -> ElevenLabs; plus control messages from the browser."""
        frames = 0
        while True:
            msg = await self.ws.receive()
            if msg["type"] == "websocket.disconnect":
                logger.info("voice: browser disconnected after %d mic frames", frames)
                return
            if msg.get("bytes"):
                frames += 1
                if frames == 1 or frames % 50 == 0:
                    logger.info("voice: %d mic frames received from browser (last %d bytes)", frames, len(msg["bytes"]))
                await upstream.send(json.dumps({
                    "message_type": "input_audio_chunk",
                    "audio_base_64": base64.b64encode(msg["bytes"]).decode("ascii"),
                    "commit": False,
                    "sample_rate": STT_SAMPLE_RATE,
                }))
            elif msg.get("text"):
                try:
                    ctrl = json.loads(msg["text"])
                except ValueError:
                    continue
                if ctrl.get("type") == "stop":
                    return
                if ctrl.get("type") == "interrupt":
                    await self.interrupt()

    async def _stt_to_browser(self, upstream) -> None:
        """Transcripts from ElevenLabs -> browser, and committed utterances -> turn queue."""
        async for raw in upstream:
            try:
                event = json.loads(raw)
            except ValueError:
                continue
            kind = event.get("message_type")
            text = (event.get("text") or "").strip()
            logger.info("voice: STT event %s %s", kind, text[:80])
            if kind == "partial_transcript":
                if text:
                    await self.send({"type": "partial", "text": text})
                    # Barge-in: the user started talking over the assistant.
                    if self.is_speaking() and len(text) >= BARGE_IN_MIN_CHARS:
                        await self.interrupt()
            elif kind == "committed_transcript":
                if text:
                    await self.send({"type": "transcript", "text": text})
                    await self.turns.put(text)
            elif kind in FATAL_UPSTREAM_ERRORS:
                logger.error("ElevenLabs STT fatal: %s", event)
                await self.send({"type": "error", "message": "Voice recognition stopped (%s)." % kind})
                return
            elif kind and (kind.endswith("error") or kind in ("commit_throttled", "chunk_size_exceeded",
                                                             "insufficient_audio_activity", "transcriber_error")):
                logger.warning("ElevenLabs STT event: %s", event)

    # ---- one conversational turn at a time -----------------------------
    async def _turn_worker(self) -> None:
        while True:
            text = await self.turns.get()
            # Anything the assistant was still saying is stale now.
            if self.is_speaking():
                await self.interrupt()
            logger.info("voice: running assistant for: %s", text[:80])
            self.history.append({"role": "user", "content": text})
            await self.send({"type": "state", "value": "thinking"})
            try:
                result = await asyncio.to_thread(self._run_assistant, text)
            except Exception:
                logger.exception("Assistant failed in voice turn")
                result = {"reply": "Sorry, I had trouble with that. Could you say it again?"}
            reply = result.get("reply") or ""
            logger.info("voice: assistant replied (%d chars), starting TTS", len(reply))
            self.history.append({"role": "assistant", "content": reply})
            self.history[:] = self.history[-12:]
            await self.send({
                "type": "reply", "reply": reply, "branch": result.get("branch"),
                "booking_id": result.get("booking_id"), "booking_link": result.get("booking_link"),
            })
            self.speak_task = asyncio.create_task(self._speak(reply))
            # wait() (not await) so a barge-in cancelling the speech doesn't cancel this worker.
            await asyncio.wait({self.speak_task})

    def _run_assistant(self, text: str) -> dict:
        """Runs in a worker thread: the orchestrator and SQLAlchemy session are synchronous."""
        db = SessionLocal()
        try:
            user = db.get(User, self.user_id) if self.user_id else None
            if user is not None and not user.is_active:
                user = None
            return assistant_orchestrator.process_message(
                db=db, message=text, history=self.history[-6:], current_user=user)
        finally:
            db.close()

    # ---- TTS: forward audio chunks the instant they arrive --------------
    async def _speak(self, reply: str) -> None:
        spoken = clean_for_speech(reply)
        if not spoken:
            return
        key = _tts_key()
        url = f"{TTS_BASE_URL}/{settings.ELEVENLABS_VOICE_ID}/stream"
        try:
            await self.send({"type": "speaking_start"})
            async with self.http.stream(
                "POST", url, params={"output_format": TTS_OUTPUT_FORMAT},
                headers={"xi-api-key": key, "Content-Type": "application/json"},
                json={"text": spoken, "model_id": settings.ELEVENLABS_TTS_MODEL},
            ) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread())[:300]
                    logger.error("ElevenLabs TTS %s: %s", resp.status_code, body)
                    await self.send({"type": "error", "message": "Voice reply failed; the text reply is above."})
                    return
                total = 0
                async for chunk in resp.aiter_bytes():
                    if chunk:
                        total += len(chunk)
                        await self.ws.send_bytes(chunk)
                logger.info("voice: TTS finished, %d audio bytes sent", total)
            await self.send({"type": "speaking_end"})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("TTS streaming failed")
            try:
                await self.send({"type": "error", "message": "Voice reply failed; the text reply is above."})
            except Exception:
                pass


def _resolve_user_id(token: str | None) -> int | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if sub is None:
            return None
        db = SessionLocal()
        try:
            user = db.get(User, int(sub))
            return user.id if user and user.is_active else None
        finally:
            db.close()
    except Exception:
        return None


@router.websocket("/ws")
async def voice_ws(ws: WebSocket):
    if not _origin_allowed(ws.headers.get("origin")):
        await ws.close(code=1008)
        return
    ip = ws.client.host if ws.client else "unknown"
    if _sessions_per_ip[ip] >= MAX_SESSIONS_PER_IP:
        await ws.close(code=1013)
        return
    await ws.accept()
    _sessions_per_ip[ip] += 1
    try:
        if not _stt_key() or not _tts_key():
            await ws.send_text(json.dumps({"type": "error", "message": "Voice is not configured on the server."}))
            await ws.close()
            return
        try:
            start = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=10))
        except Exception:
            await ws.close(code=1002)
            return
        if start.get("type") != "start":
            await ws.close(code=1002)
            return
        history = [
            {"role": h["role"], "content": str(h["content"])[:2000]}
            for h in (start.get("history") or [])[-6:]
            if isinstance(h, dict) and h.get("role") in ("user", "assistant") and h.get("content")
        ]
        session = VoiceSession(ws, _resolve_user_id(start.get("token")), history)
        await session.run()
        try:
            await ws.close()
        except Exception:
            pass
    finally:
        _sessions_per_ip[ip] = max(0, _sessions_per_ip[ip] - 1)
