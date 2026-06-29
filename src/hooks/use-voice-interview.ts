import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice interview v1: push-to-talk mic capture (PCM → WAV) + TTS playback.
 *
 * Records mic audio via Web Audio API, downsamples to 16 kHz mono, encodes
 * a complete WAV blob on stop, uploads to /api/voice/transcribe, returns
 * the transcript. Separately can play a TTS stream from /api/voice/tts.
 */

const TARGET_SAMPLE_RATE = 16000;

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsample(buffer: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return buffer;
  const ratio = inRate / outRate;
  const newLen = Math.floor(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < newLen) {
    const nextOffset = Math.floor((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffset && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffset;
  }
  return result;
}

function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export type VoiceState = "idle" | "recording" | "transcribing" | "speaking" | "error";

export function useVoiceInterview() {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const inRateRef = useRef<number>(48000);

  const playerRef = useRef<HTMLAudioElement | null>(null);

  const cleanupRecording = useCallback(() => {
    procRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    procRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecording();
      ctxRef.current?.close().catch(() => {});
      playerRef.current?.pause();
    };
  }, [cleanupRecording]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      inRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      processor.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(ch));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      sourceRef.current = source;
      procRef.current = processor;
      setState("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone unavailable");
      setState("error");
    }
  }, []);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (state !== "recording") return null;
    const chunks = chunksRef.current;
    const inRate = inRateRef.current;
    cleanupRecording();

    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (total === 0) {
      setState("idle");
      return null;
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const down = downsample(merged, inRate, TARGET_SAMPLE_RATE);
    const pcm = floatTo16BitPCM(down);
    const wav = encodeWav(pcm, TARGET_SAMPLE_RATE);

    if (wav.size < 2048) {
      setState("idle");
      setError("Recording was empty — try again.");
      return null;
    }

    setState("transcribing");
    try {
      const fd = new FormData();
      fd.append("file", wav, "recording.wav");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? `Transcription failed (${res.status})`);
        setState("error");
        return null;
      }
      setState("idle");
      return (json.text ?? "").trim();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
      setState("error");
      return null;
    }
  }, [state, cleanupRecording]);

  const speak = useCallback(async (text: string, voice?: string) => {
    if (!text.trim()) return;
    try {
      playerRef.current?.pause();
      setState("speaking");
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, format: "mp3" }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `TTS failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      playerRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setState("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setState("idle");
      };
      await audio.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
      setState("error");
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    playerRef.current?.pause();
    playerRef.current = null;
    if (state === "speaking") setState("idle");
  }, [state]);

  return {
    state,
    error,
    startRecording,
    stopAndTranscribe,
    speak,
    stopSpeaking,
    clearError: () => setError(null),
  };
}
