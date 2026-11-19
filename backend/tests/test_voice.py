"""Voice endpoint tests against local fakes of the ElevenLabs STT (WebSocket) and TTS (HTTP stream) APIs.

Run from backend/:  python -m unittest tests.test_voice -v
No real ElevenLabs key or network is used.
"""
import asyncio
import base64
import json
import os
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from websockets.asyncio.server import serve  # noqa: E402

from app.api.endpoints import voice  # noqa: E402
from app.core.config import settings  # noqa: E402

settings.ELEVENLABS_API_KEY = "test-key"  # set on the object: other tests may have loaded settings first

TTS_CHUNKS = [b"\x01\x00" * 500 + b"\x01", b"\x02" * 999, b"\x03\x00" * 250]  # odd sizes on purpose


class FakeTTS(BaseHTTPRequestHandler):
    seen: dict = {}

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeTTS.seen = {"path": self.path, "key": self.headers.get("xi-api-key"), "body": body}
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        for c in TTS_CHUNKS:
            self.wfile.write(f"{len(c):x}\r\n".encode() + c + b"\r\n")
            self.wfile.flush()
            time.sleep(0.05)
        self.wfile.write(b"0\r\n\r\n")

    def log_message(self, *a):
        pass


class VoiceEndpointTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tts = ThreadingHTTPServer(("127.0.0.1", 0), FakeTTS)
        threading.Thread(target=cls.tts.serve_forever, daemon=True).start()

        cls.stt_received: list[dict] = []
        cls.stt_headers: dict = {}
        cls.stt_path = ""
        ready = threading.Event()

        async def handler(ws):
            cls.stt_headers = dict(ws.request.headers)
            cls.stt_path = ws.request.path
            n = 0
            async for raw in ws:
                cls.stt_received.append(json.loads(raw))
                n += 1
                if n == 3:
                    await ws.send(json.dumps({"message_type": "partial_transcript", "text": "check oil"}))
                    await ws.send(json.dumps({"message_type": "committed_transcript", "text": "check oil change prices"}))

        def run():
            async def main():
                async with serve(handler, "127.0.0.1", 0) as server:
                    cls.stt_port = server.sockets[0].getsockname()[1]
                    ready.set()
                    await asyncio.Future()
            asyncio.run(main())

        threading.Thread(target=run, daemon=True).start()
        ready.wait(5)

        voice.STT_URL = f"ws://127.0.0.1:{cls.stt_port}/v1/speech-to-text/realtime"
        voice.TTS_BASE_URL = f"http://127.0.0.1:{cls.tts.server_address[1]}/v1/text-to-speech"

        class FakeOrchestrator:
            calls: list = []

            def process_message(self, db, message, history, current_user):
                FakeOrchestrator.calls.append((message, history, current_user))
                return {"reply": "An **oil change** costs Rs. 4500. [Book it](/dashboard) \U0001F697",
                        "branch": "live_backend_tool"}

        cls.orch = FakeOrchestrator
        voice.assistant_orchestrator = FakeOrchestrator()
        app = FastAPI()
        app.include_router(voice.router, prefix="/api/voice")
        cls.client = TestClient(app)

    def test_full_turn_streams_audio(self):
        origin = {"origin": "http://localhost:3000"}
        with self.client.websocket_connect("/api/voice/ws", headers=origin) as ws:
            ws.send_text(json.dumps({"type": "start", "token": None,
                                     "history": [{"role": "assistant", "content": "hi"}]}))
            self.assertEqual(ws.receive_json()["type"], "ready")
            for _ in range(3):
                ws.send_bytes(b"\x00\x00" * 1600)

            events, audio = [], []
            while True:
                msg = ws.receive()
                if msg.get("bytes"):
                    audio.append(msg["bytes"])
                    continue
                ev = json.loads(msg["text"])
                events.append(ev["type"])
                if ev["type"] == "speaking_end":
                    break

        self.assertEqual(events, ["partial", "transcript", "state", "reply", "speaking_start", "speaking_end"])
        # audio arrived as multiple frames, in order, byte-exact (no buffering into one blob)
        self.assertGreaterEqual(len(audio), 3)
        self.assertEqual(b"".join(audio), b"".join(TTS_CHUNKS))

        # STT side: key header, params, and base64 PCM frames
        self.assertEqual(self.stt_headers.get("xi-api-key"), "test-key")
        self.assertIn("commit_strategy=vad", self.stt_path)
        self.assertIn("audio_format=pcm_16000", self.stt_path)
        first = self.stt_received[0]
        self.assertEqual(first["message_type"], "input_audio_chunk")
        self.assertEqual(first["sample_rate"], 16000)
        self.assertEqual(len(base64.b64decode(first["audio_base_64"])), 3200)

        # TTS side: cleaned text (no markdown/url/emoji), flash model, pcm output
        spoken = FakeTTS.seen["body"]["text"]
        self.assertEqual(spoken, "An oil change costs Rupees 4500. Book it")
        self.assertEqual(FakeTTS.seen["body"]["model_id"], "eleven_flash_v2_5")
        self.assertIn("output_format=pcm_24000", FakeTTS.seen["path"])
        self.assertEqual(FakeTTS.seen["key"], "test-key")

        # same orchestrator, with the transcript and seeded history
        msg, history, user = self.orch.calls[-1]
        self.assertEqual(msg, "check oil change prices")
        self.assertIsNone(user)
        self.assertEqual(history[0], {"role": "assistant", "content": "hi"})

    def test_bad_origin_rejected(self):
        from starlette.websockets import WebSocketDisconnect
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/api/voice/ws", headers={"origin": "http://evil.example"}):
                pass

    def test_clean_for_speech_trims_long_replies(self):
        long = "Sentence number one is here. " * 100
        out = voice.clean_for_speech(long)
        self.assertLessEqual(len(out), voice.MAX_SPOKEN_CHARS + 40)
        self.assertTrue(out.endswith("The rest is in the chat."))


if __name__ == "__main__":
    unittest.main()
