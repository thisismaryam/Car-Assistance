"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "off" | "connecting" | "listening" | "thinking" | "speaking";

export interface VoiceReply {
    reply: string;
    branch?: string;
    booking_id?: number;
    booking_link?: string;
}

interface Options {
    url: string;
    getToken: () => string | null;
    getHistory: () => { role: string; content: string }[];
    onUserTranscript: (text: string) => void;
    onReply: (r: VoiceReply) => void;
    onError: (message: string) => void;
}

const TTS_SAMPLE_RATE = 24000; // must match pcm_24000 on the server

/**
 * Full-duplex voice session: mic -> backend (-> ElevenLabs STT) and
 * backend (-> ElevenLabs TTS) -> speaker, played chunk by chunk as it arrives.
 */
export function useVoiceChat(opts: Options) {
    const [state, setState] = useState<VoiceState>("off");
    const [partial, setPartial] = useState("");

    const optsRef = useRef(opts);
    useEffect(() => {
        optsRef.current = opts;
    });

    const wsRef = useRef<WebSocket | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const nodeRef = useRef<AudioWorkletNode | null>(null);
    const readyRef = useRef(false);

    // playback scheduling
    const nextTimeRef = useRef(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const leftoverRef = useRef<Uint8Array | null>(null);
    const serverSpeakingRef = useRef(false);

    const flushPlayback = useCallback(() => {
        sourcesRef.current.forEach((s) => {
            s.onended = null;
            try { s.stop(); } catch { /* already stopped */ }
        });
        sourcesRef.current.clear();
        nextTimeRef.current = 0;
        leftoverRef.current = null;
        serverSpeakingRef.current = false;
    }, []);

    const maybeFinishSpeaking = useCallback(() => {
        if (!serverSpeakingRef.current && sourcesRef.current.size === 0) {
            setState((s) => (s === "speaking" ? "listening" : s));
        }
    }, []);

    const enqueueAudio = useCallback((data: ArrayBuffer) => {
        const ctx = ctxRef.current;
        if (!ctx) return;
        // network chunks can split a 16-bit sample in half: carry the odd byte over
        let bytes = new Uint8Array(data);
        if (leftoverRef.current) {
            const merged = new Uint8Array(leftoverRef.current.length + bytes.length);
            merged.set(leftoverRef.current);
            merged.set(bytes, leftoverRef.current.length);
            bytes = merged;
            leftoverRef.current = null;
        }
        if (bytes.length % 2 === 1) {
            leftoverRef.current = bytes.slice(bytes.length - 1);
            bytes = bytes.slice(0, bytes.length - 1);
        }
        if (bytes.length === 0) return;

        const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
        const buf = ctx.createBuffer(1, pcm.length, TTS_SAMPLE_RATE);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        // gapless: each chunk starts exactly where the previous one ends
        const startAt = Math.max(nextTimeRef.current, ctx.currentTime + 0.04);
        src.start(startAt);
        nextTimeRef.current = startAt + buf.duration;
        sourcesRef.current.add(src);
        src.onended = () => {
            sourcesRef.current.delete(src);
            maybeFinishSpeaking();
        };
        setState("speaking");
    }, [maybeFinishSpeaking]);

    const teardown = useCallback(() => {
        readyRef.current = false;
        flushPlayback();
        nodeRef.current?.port.close();
        nodeRef.current?.disconnect();
        nodeRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        ctxRef.current?.close().catch(() => { });
        ctxRef.current = null;
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws && ws.readyState <= WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: "stop" })); } catch { /* closed */ }
            ws.close();
        }
        setPartial("");
        setState("off");
    }, [flushPlayback]);

    const stop = useCallback(() => teardown(), [teardown]);

    const interrupt = useCallback(() => {
        flushPlayback();
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "interrupt" }));
        setState((s) => (s === "speaking" ? "listening" : s));
    }, [flushPlayback]);

    const start = useCallback(async () => {
        if (wsRef.current) return;
        setState("connecting");
        try {
            // Created inside the click handler so the browser allows audio playback.
            const ctx = new AudioContext();
            await ctx.resume();
            ctxRef.current = ctx;

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            streamRef.current = stream;

            await ctx.audioWorklet.addModule("/pcm-capture-worklet.js");
            const source = ctx.createMediaStreamSource(stream);
            const node = new AudioWorkletNode(ctx, "pcm-capture", { processorOptions: { targetRate: 16000 } });
            nodeRef.current = node;
            // some browsers only run a worklet that reaches the destination; route through a muted gain
            const mute = ctx.createGain();
            mute.gain.value = 0;
            source.connect(node);
            node.connect(mute);
            mute.connect(ctx.destination);

            const ws = new WebSocket(optsRef.current.url);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
                if (readyRef.current && ws.readyState === WebSocket.OPEN) ws.send(e.data);
            };

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: "start",
                    token: optsRef.current.getToken(),
                    history: optsRef.current.getHistory().slice(-6),
                }));
            };

            ws.onmessage = (e) => {
                if (typeof e.data !== "string") {
                    enqueueAudio(e.data as ArrayBuffer);
                    return;
                }
                let m: {
                    type: string; text?: string; value?: string; message?: string; reply?: string;
                    branch?: string; booking_id?: number; booking_link?: string;
                };
                try { m = JSON.parse(e.data); } catch { return; }
                switch (m.type) {
                    case "ready":
                        readyRef.current = true;
                        setState("listening");
                        break;
                    case "partial":
                        setPartial(m.text || "");
                        break;
                    case "transcript":
                        setPartial("");
                        optsRef.current.onUserTranscript(m.text || "");
                        break;
                    case "state":
                        if (m.value === "thinking") setState("thinking");
                        break;
                    case "reply":
                        optsRef.current.onReply({
                            reply: m.reply || "", branch: m.branch,
                            booking_id: m.booking_id, booking_link: m.booking_link,
                        });
                        break;
                    case "speaking_start":
                        serverSpeakingRef.current = true;
                        break;
                    case "speaking_end":
                        serverSpeakingRef.current = false;
                        maybeFinishSpeaking();
                        break;
                    case "interrupt":
                        flushPlayback();
                        setState("listening");
                        break;
                    case "error":
                        optsRef.current.onError(m.message || "Voice error");
                        break;
                }
            };

            ws.onclose = () => {
                if (wsRef.current === ws) teardown();
            };
            ws.onerror = () => {
                optsRef.current.onError("Could not reach the voice service.");
            };
        } catch (err) {
            const denied = err instanceof DOMException && err.name === "NotAllowedError";
            optsRef.current.onError(
                denied ? "Microphone access was blocked. Allow it in your browser to use voice." : "Could not start voice mode."
            );
            teardown();
        }
    }, [enqueueAudio, flushPlayback, maybeFinishSpeaking, teardown]);

    useEffect(() => () => teardown(), [teardown]);

    return { state, partial, start, stop, interrupt };
}
